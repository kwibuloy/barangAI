import math
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .auth import get_current_user, require_csrf, require_role
from .db import get_db
from .models import DuplicateSuggestion, Report, User, now, uid, utc_iso
from .reports import authorized_report

router = APIRouter()


def candidate_score(category_a, lat_a, lon_a, vector_a, category_b, lat_b, lon_b, vector_b):
    if category_a != category_b or not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return None
    try:
        values = [float(v) for v in vector_a + vector_b]
        if not all(math.isfinite(v) for v in values):
            return None
        a, b = values[:len(vector_a)], values[len(vector_a):]
        norm = math.sqrt(sum(v * v for v in a) * sum(v * v for v in b))
        if norm == 0:
            return None
        similarity = sum(x * y for x, y in zip(a, b)) / norm
        lat_delta = math.radians(lat_b - lat_a)
        lon_delta = math.radians(lon_b - lon_a)
        arc = math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(lat_a)) * math.cos(math.radians(lat_b)) * math.sin(lon_delta / 2) ** 2
        distance = 2 * 6_371_000 * math.asin(min(1.0, math.sqrt(arc)))
    except (TypeError, ValueError, OverflowError):
        return None
    if distance > 500 or similarity < 0.85:
        return None
    return round(0.5 * similarity + 0.5 * (1 - distance / 500), 4)


def suggestion_data(item):
    return {"id": item.id, "candidate_report_id": item.candidate_report_id, "score": item.score,
            "model_version": item.model_version, "decision": item.decision, "actor_id": item.actor_id,
            "note": item.note, "created_at": utc_iso(item.created_at),
            "decided_at": utc_iso(item.decided_at) if item.decided_at else None}


@router.get("/reports/{report_id}/duplicates")
def duplicate_candidates(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_role(user, {"staff", "administrator"})
    report = authorized_report(report_id, db, user)
    version = os.environ.get("VALIDATED_EMBEDDING_MODEL_VERSION")
    if not version or report.embedding_model_version != version or not report.image_embedding:
        return {"embedding_available": False, "suggestions": [], "manual_review_required": True}
    return saved_suggestions(db, report_id, version)


def saved_suggestions(db, report_id, version):
    items = db.scalars(select(DuplicateSuggestion).where(
        DuplicateSuggestion.report_id == report_id, DuplicateSuggestion.model_version == version)
        .order_by(DuplicateSuggestion.created_at)).all()
    return {"embedding_available": True, "suggestions": [suggestion_data(item) for item in items],
            "manual_review_required": True}


@router.post("/reports/{report_id}/duplicates/generate")
def generate_duplicates(report_id: str, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"staff", "administrator"})
    report = authorized_report(report_id, db, user)
    version = os.environ.get("VALIDATED_EMBEDDING_MODEL_VERSION")
    if not version or report.embedding_model_version != version or not report.image_embedding:
        return {"embedding_available": False, "suggestions": [], "manual_review_required": True}
    for candidate in db.scalars(select(Report).where(Report.id != report_id)):
        if candidate.embedding_model_version != version:
            continue
        score = candidate_score(report.verified_category or report.resident_category, report.latitude, report.longitude,
                                report.image_embedding, candidate.verified_category or candidate.resident_category,
                                candidate.latitude, candidate.longitude, candidate.image_embedding)
        if score is not None:
            values = {"id": uid(), "report_id": report_id, "candidate_report_id": candidate.id,
                      "model_version": version, "score": score, "decision": "pending", "created_at": now()}
            dialect = db.bind.dialect.name
            if dialect == "postgresql":
                statement = postgres_insert(DuplicateSuggestion).values(**values)
            elif dialect == "sqlite":
                statement = sqlite_insert(DuplicateSuggestion).values(**values)
            else:
                raise RuntimeError("Duplicate generation requires PostgreSQL or SQLite")
            db.execute(statement.on_conflict_do_nothing(index_elements=["report_id", "candidate_report_id", "model_version"]))
    db.commit()
    return saved_suggestions(db, report_id, version)


class DecisionInput(BaseModel):
    decision: str
    note: str | None = Field(default=None, max_length=2000)


@router.post("/duplicates/{suggestion_id}/decision")
def decide_duplicate(suggestion_id: str, body: DecisionInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"staff", "administrator"})
    if body.decision not in {"confirmed", "rejected"}:
        raise HTTPException(422, "Invalid decision")
    item = db.get(DuplicateSuggestion, suggestion_id)
    if not item:
        raise HTTPException(404, "Suggestion not found")
    changed = db.execute(update(DuplicateSuggestion).where(DuplicateSuggestion.id == suggestion_id,
                                                            DuplicateSuggestion.decision == "pending")
                         .values(decision=body.decision, actor_id=user.id, note=body.note, decided_at=now()))
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Suggestion already decided")
    db.commit()
    db.refresh(item)
    return suggestion_data(item)
