"""Grouped cases: reports of one incident from different residents, grouped only by staff.

Duplicate suggestions are made automatically when a report arrives (reusing duplicates.candidate_score) but
grouping always needs a staff decision. The reports in a confirmed case keep their own photos, categories and
history and always share one status: a report that joins walks the required status path step by step, and a
status change on any of them moves the rest. Residents see accepted cases on a shared map without photos,
descriptions or names, and can add their own report to an open case; staff confirm that link too.
"""

import math
import os
from datetime import UTC, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session, undefer

from . import barangays, duplicates
from .auth import get_current_user, rate_limit, require_csrf, require_role
from .db import get_db
from .duplicates import candidate_score
from .models import (
    Case,
    DeletionRequest,
    DuplicateSuggestion,
    Notification,
    Report,
    ReportEvent,
    StaffAction,
    User,
    now,
    utc_iso,
)
from .reports import CASE_STEP_NOTE, authorized_report, serialize_report

router = APIRouter()
PATH = ("Pending", "Under Verification", "Accepted", "In Progress", "Resolved")
# Statuses residents see on the shared map; only staff-accepted incidents are public.
PUBLIC = ("Accepted", "In Progress", "Resolved")
# Grouping is not a decision about the concern, so residents get this rather than a description from staff.
GROUPED_NOTE = "Your report was grouped with others about the same concern, so it now shares their status."
# Residents may add evidence while the barangay is still working on it.
OPEN_FOR_EVIDENCE = ("Accepted", "In Progress")
# Search radius (metres) for automatic suggestions. Small fixtures stand close together (neighbouring street
# lights are separate faults); floods and garbage spread. Untuned starting values: check them on real reports.
MANILA = timezone(timedelta(hours=8))
RADIUS_M = {"broken_streetlights": 50, "damaged_signage": 50, "exposed_wiring": 50, "potholes": 50,
            "fallen_trees": 100, "fire_hazard": 100, "uncollected_garbage": 100, "flooding": 300, "other": 300}
# Categories two residents may pick for one incident: garbage clogging a drain floods the street; a fallen tree
# brings down wires and lights. Such pairs are suggested too, with a lower score, and staff still decide.
RELATED = {"flooding": {"uncollected_garbage"}, "uncollected_garbage": {"flooding"},
           "fallen_trees": {"exposed_wiring", "broken_streetlights"},
           "exposed_wiring": {"fallen_trees", "broken_streetlights"},
           "broken_streetlights": {"fallen_trees", "exposed_wiring"}}
RELATED_SCORE = 0.9


def distance_m(lat_a, lon_a, lat_b, lon_b):
    arc = (math.sin(math.radians(lat_b - lat_a) / 2) ** 2 + math.cos(math.radians(lat_a))
           * math.cos(math.radians(lat_b)) * math.sin(math.radians(lon_b - lon_a) / 2) ** 2)
    return 2 * 6_371_000 * math.asin(min(1.0, math.sqrt(arc)))


def suggest_duplicates(db: Session, report: Report):
    """Queue duplicate suggestions for a new report against open nearby reports, for staff to decide."""
    version = os.environ.get("VALIDATED_EMBEDDING_MODEL_VERSION")
    if report.case_id or not version or report.embedding_model_version != version or not report.image_embedding:
        return
    radius = RADIUS_M.get(report.resident_category, 300)
    lat_span = radius / 111_320
    lon_span = radius / (111_320 * max(math.cos(math.radians(report.latitude)), 0.01))
    nearby = db.scalars(select(Report).options(undefer(Report.image_embedding)).where(
        Report.id != report.id, Report.embedding_model_version == version,
        # Same barangay only, since grouped reports share one status. Before barangays are loaded, all ids are empty.
        Report.barangay_id == report.barangay_id,
        Report.status.not_in(("Resolved", "Rejected")),
        Report.latitude.between(report.latitude - lat_span, report.latitude + lat_span),
        Report.longitude.between(report.longitude - lon_span, report.longitude + lon_span)))
    for candidate in nearby:
        if distance_m(report.latitude, report.longitude, candidate.latitude, candidate.longitude) > radius:
            continue
        other = candidate.verified_category or candidate.resident_category
        related = other in RELATED.get(report.resident_category, ())
        # candidate_score (frozen duplicates.py) only compares like with like, so a related pair is scored as one
        # category and then marked down.
        score = candidate_score(report.resident_category, report.latitude, report.longitude, report.image_embedding,
                                report.resident_category if related else other,
                                candidate.latitude, candidate.longitude, candidate.image_embedding)
        if score is not None and related:
            score = round(score * RELATED_SCORE, 4)
        if score is not None:
            db.add(DuplicateSuggestion(report_id=report.id, candidate_report_id=candidate.id,
                                       model_version=version, score=score, decision="pending"))
    db.commit()


def rank(status):
    return PATH.index(status) if status in PATH else -1


def bring_to(
    db: Session,
    report: Report,
    target: str,
    actor_id: str,
    case: Case,
    verified: str | None,
    description: str | None = None,
):
    """Walk a report forward along the required path to the case's status, logging each step. Never moves back.

    The last step carries what staff wrote about this change, if they wrote anything, so its resident sees it too.
    """
    if target == "Rejected":
        steps = {"Pending": ["Under Verification", "Rejected"], "Under Verification": ["Rejected"]}.get(report.status, [])
    else:
        steps = list(PATH[rank(report.status) + 1:rank(target) + 1]) if 0 <= rank(report.status) < rank(target) else []
    if not steps:
        return
    note = f"{CASE_STEP_NOTE}{case.id[:8].upper()}"
    start = now()
    for index, step in enumerate(steps):
        # Distinct times keep the history in order.
        db.add(ReportEvent(report_id=report.id, from_status=report.status, to_status=step, actor_id=actor_id,
                           note=description if description and index == len(steps) - 1 else note,
                           created_at=start + timedelta(microseconds=index)))
        report.status = step
    # Only a category staff verified on another report of the case; never a resident's or the model's.
    if rank(report.status) >= rank("Accepted") and not report.verified_category and verified:
        report.verified_category = verified
    report.updated_at = start
    db.add(Notification(user_id=report.resident_id, report_id=report.id, status=report.status))


def members(db: Session, case_id: str, confirmed_only=True, lock=False):
    query = select(Report).where(Report.case_id == case_id)
    if confirmed_only:
        query = query.where(Report.case_confirmed.is_(True))
    if lock:
        # Two staff moving two reports of one case at once must not both walk the rest (PostgreSQL row locks).
        query = query.with_for_update()
    return db.scalars(query.order_by(Report.created_at)).all()


def barangay_of(db: Session, case: Case):
    """A case stays in one barangay, so any of its reports answers."""
    return members(db, case.id, confirmed_only=False)[0].barangay_id


def shared_status(reports):
    """The case's status: its confirmed reports share one, so this only guards against stale rows."""
    statuses = [report.status for report in reports]
    if not statuses:
        return None
    return "Rejected" if all(status == "Rejected" for status in statuses) else max(statuses, key=rank)


def verified_category(reports):
    """The staff-verified category of the case's furthest-along report, if staff have accepted any of them."""
    verified = [report for report in reports if report.verified_category and rank(report.status) >= rank("Accepted")]
    return max(verified, key=lambda report: rank(report.status)).verified_category if verified else None


def sync(db: Session, case: Case, actor_id: str):
    reports = members(db, case.id, lock=True)
    target = shared_status(reports)
    verified = verified_category(reports)
    if verified:
        case.category = verified
    for report in reports:
        bring_to(db, report, target, actor_id, case, verified, GROUPED_NOTE)


def new_case(report: Report, actor_id: str):
    return Case(category=report.verified_category or report.resident_category, latitude=report.latitude,
                longitude=report.longitude, location_label=report.location_label, created_by=actor_id)


def after_status_change(db: Session, report: Report, actor_id: str, description: str):
    """Called by the workflow after a staff status change: open a case on acceptance, move the rest of the case."""
    if report.status == "Accepted" and not report.case_id:
        case = new_case(report, actor_id)
        db.add(case)
        db.flush()
        report.case_id, report.case_confirmed = case.id, True
        return
    if report.case_id and report.case_confirmed:
        case = db.get(Case, report.case_id)
        if report.status == "Accepted" and report.verified_category:
            case.category = report.verified_category
        for other in members(db, case.id, lock=True):
            if other.id != report.id:
                bring_to(db, other, report.status, actor_id, case, verified_category([report]), description)


def case_data(db: Session, report: Report, user: User):
    if not report.case_id:
        return {"case": None}
    case = db.get(Case, report.case_id)
    everyone = members(db, case.id, confirmed_only=False)
    confirmed = [item for item in everyone if item.case_confirmed]
    status = shared_status(confirmed)
    data = {"id": case.id, "category": case.category, "location_label": case.location_label,
            "status": status, "confirmed": report.case_confirmed, "reports": len(confirmed),
            "contributors": len({item.resident_id for item in confirmed})}
    if user.role == "resident" and status not in PUBLIC:
        # Before staff accept the case, a resident learns nothing about other residents' reports.
        data.update(reports=None, contributors=None)
    if user.role != "resident":
        data["members"] = [{"id": item.id, "status": item.status, "resident_category": item.resident_category,
                            "created_at": utc_iso(item.created_at), "confirmed": item.case_confirmed}
                           for item in everyone]
    return {"case": data}


def open_case_for_evidence(db: Session, case_id: str):
    """The case a resident's "I see this too" report may join, or an error a resident can act on."""
    case = db.get(Case, case_id)
    status = shared_status(members(db, case_id)) if case else None
    if status not in PUBLIC:
        raise HTTPException(404, "Case not found")
    if status not in OPEN_FOR_EVIDENCE:
        raise HTTPException(409, "This issue is already resolved")
    return case


def log(db, report_id, actor_id, note):
    db.add(StaffAction(report_id=report_id, actor_id=actor_id, kind="system", note=note))


@router.get("/reports/{report_id}/case")
def report_case(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return case_data(db, authorized_report(report_id, db, user), user)


def in_jurisdiction(db: Session, user: User, result: dict):
    """duplicates.py is frozen and compares across barangays; staff only get suggestions they could open."""
    return {**result, "suggestions": [
        item for item in result["suggestions"]
        if barangays.may_see(db, user, db.get(Report, item["candidate_report_id"]))]}


@router.get("/reports/{report_id}/duplicates")
def duplicate_candidates(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return in_jurisdiction(db, user, duplicates.duplicate_candidates(report_id, db, user))


@router.post("/reports/{report_id}/duplicates/generate")
def generate_duplicates(report_id: str, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    return in_jurisdiction(db, user, duplicates.generate_duplicates(report_id, db, user))


class LinkInput(BaseModel):
    report_id: str
    other_report_id: str


@router.post("/cases/link")
def link_reports(body: LinkInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    """Staff decision that two reports describe one incident. Merges their cases if both already have one."""
    require_role(user, {"staff", "administrator"})
    if body.report_id == body.other_report_id:
        raise HTTPException(422, "Choose two different reports")
    pair = [authorized_report(report_id, db, user) for report_id in (body.report_id, body.other_report_id)]
    if pair[0].barangay_id != pair[1].barangay_id:
        raise HTTPException(409, "Reports from different barangays cannot be grouped")
    for report in pair:
        if report.status == "Rejected":
            raise HTTPException(409, "Rejected reports cannot be grouped")
        if report.case_id and not report.case_confirmed:
            raise HTTPException(409, "Confirm or reject the case link first")
    existing = [db.get(Case, report.case_id) for report in pair if report.case_id]
    statuses = [report.status for report in pair] + [shared_status(members(db, case.id)) for case in existing]
    if "Resolved" in statuses:
        # Grouping would close the other report with nobody reviewing it; review it on its own instead.
        raise HTTPException(409, "This issue is already resolved")
    if len(existing) == 2 and existing[0].id == existing[1].id:
        return case_data(db, pair[0], user)
    if existing:
        # Keep the case with more reports (then the older one); the other's reports move across.
        existing.sort(key=lambda case: (-len(members(db, case.id, confirmed_only=False)), case.created_at))
        case = existing[0]
        for other in existing[1:]:
            db.execute(update(Report).where(Report.case_id == other.id).values(case_id=case.id))
            db.flush()
            db.delete(other)
    else:
        case = new_case(min(pair, key=lambda report: report.created_at), user.id)
        db.add(case)
    db.flush()
    db.expire_all()
    pair = [db.get(Report, report.id) for report in pair]
    for report in pair:
        report.case_id, report.case_confirmed = case.id, True
    reference = f"case #{case.id[:8].upper()}"
    log(db, pair[0].id, user.id, f"Grouped with report #{pair[1].id[:8].upper()} in {reference}.")
    log(db, pair[1].id, user.id, f"Grouped with report #{pair[0].id[:8].upper()} in {reference}.")
    db.flush()
    sync(db, case, user.id)
    db.commit()
    return case_data(db, db.get(Report, body.report_id), user)


class CaseDecision(BaseModel):
    decision: str
    note: str | None = Field(default=None, max_length=2000)


@router.post("/reports/{report_id}/case/decision")
def decide_evidence(report_id: str, body: CaseDecision, db: Session = Depends(get_db),
                    user: User = Depends(require_csrf)):
    """Staff check of a resident's "I see this too" report: same incident (joins the case) or not (stands alone)."""
    require_role(user, {"staff", "administrator"})
    if body.decision not in {"confirmed", "rejected"}:
        raise HTTPException(422, "Invalid decision")
    report = authorized_report(report_id, db, user)
    if not report.case_id or report.case_confirmed:
        raise HTTPException(409, "No case link to decide")
    case = db.get(Case, report.case_id)
    reference = f"case #{case.id[:8].upper()}"
    note = f" {body.note.strip()}" if body.note and body.note.strip() else ""
    if body.decision == "confirmed":
        report.case_confirmed = True
        log(db, report.id, user.id, f"Confirmed as the same incident as {reference}.{note}")
        db.flush()
        sync(db, case, user.id)
    else:
        report.case_id = None
        # Boundaries loaded while it was linked placed it with the case; on its own, its pin decides.
        moved_from = report.barangay_id
        report.barangay_id = barangays.barangay_id_for(db, report.latitude, report.longitude)
        if report.barangay_id and report.barangay_id != moved_from and db.scalar(
            select(DeletionRequest.id).where(DeletionRequest.report_id == report.id, DeletionRequest.status == "pending")
        ):
            # Its new barangay's staff now decide this request, and administrators were told already.
            for decider in db.scalars(
                select(User.id).where(User.role == "staff", User.barangay_id == report.barangay_id)
            ):
                db.add(Notification(user_id=decider, report_id=report.id, status=report.status, kind="deletion_request"))
        log(db, report.id, user.id, f"Not the same incident as {reference}; reviewed on its own.{note}")
    db.commit()
    return case_data(db, report, user)


@router.get("/cases/map")
def community_map(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Accepted cases for the shared map. No photos, descriptions or names; pins rounded to about 10 metres. No AI
    hazard flags either: no person has confirmed them."""
    rows = db.execute(select(Report.case_id, Report.status, Report.resident_id, Report.created_at,
                             Report.case_confirmed).where(Report.case_id.is_not(None))).all()
    grouped = {}
    for row in rows:
        grouped.setdefault(row.case_id, []).append(row)
    result = []
    cases = {case.id: case for case in db.scalars(select(Case).where(Case.id.in_(grouped)))}
    for case_id, items in grouped.items():
        confirmed = [item for item in items if item.case_confirmed]
        status = shared_status(confirmed)
        if status not in PUBLIC:
            continue
        case = cases[case_id]
        dates = [item.created_at for item in confirmed]
        result.append({
            "id": case.id, "category": case.category, "status": status,
            "latitude": round(case.latitude, 4), "longitude": round(case.longitude, 4),
            "location_label": case.location_label,
            # Days only (Philippine time): exact times could single out a neighbour.
            "first_reported_on": day(min(dates)), "last_reported_on": day(max(dates)),
            "contributors": len({item.resident_id for item in confirmed}),
            "open_for_evidence": status in OPEN_FOR_EVIDENCE,
            # Includes an "I see this too" report staff have not checked yet.
            "contributed": any(item.resident_id == user.id for item in items),
        })
    return sorted(result, key=lambda item: item["last_reported_on"], reverse=True)


def day(value):
    value = value if value.tzinfo else value.replace(tzinfo=UTC)
    return value.astimezone(MANILA).date().isoformat()


# How far back a resident's own open report still counts as "already reported".
OWN_REPORT_DAYS = 30


@router.get("/nearby")
def nearby(request: Request, category: str, latitude: float = Query(..., ge=-90, le=90),
           longitude: float = Query(..., ge=-180, le=180), db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    """Before submitting: the resident's own open reports of this issue, and neighbours' open accepted cases.

    Same or related category within the category's search radius. Only the resident's own reports and the already
    public map cases are returned, so nothing private about other residents is revealed.
    """
    require_role(user, {"resident"})
    rate_limit(request, "nearby", 60, key=user.id)
    if category not in RADIUS_M:
        raise HTTPException(422, "Invalid location or category")
    wanted = {category} | RELATED.get(category, set())
    radius = max(RADIUS_M[category], *(RADIUS_M[name] for name in wanted))
    since = now() - timedelta(days=OWN_REPORT_DAYS)
    own = []
    for report in db.scalars(select(Report).where(
            Report.resident_id == user.id, Report.status.not_in(("Resolved", "Rejected")), Report.created_at >= since)
            .order_by(Report.created_at.desc())):
        if (report.verified_category or report.resident_category) not in wanted:
            continue
        apart = distance_m(latitude, longitude, report.latitude, report.longitude)
        if apart <= radius:
            own.append({**serialize_report(report), "distance_m": round(apart)})
    cases = []
    for item in community_map(db, user):
        if item["category"] not in wanted or not item["open_for_evidence"] or item["contributed"]:
            continue
        apart = distance_m(latitude, longitude, item["latitude"], item["longitude"])
        if apart <= radius:
            cases.append({**item, "distance_m": round(apart)})
    return {"own": own[:3], "cases": sorted(cases, key=lambda item: item["distance_m"])[:3]}
