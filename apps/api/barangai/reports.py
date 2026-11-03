import logging
import os
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ai, barangays, geo, priority, trust
from .auth import get_current_user, rate_limit, require_csrf, require_role
from .db import get_db
from .media import delete_image, image_response, sanitize_image, save_image
from .models import CATEGORIES, Report, ReportAddendum, ReportEvent, User, now, utc_iso
from .notifications import notify_staff

router = APIRouter(prefix="/reports")


def serialize_addendum(report, addendum):
    return {"id": addendum.id, "note": addendum.note, "created_at": utc_iso(addendum.created_at),
            "image_url": f"/api/reports/{report.id}/addenda/{addendum.id}/image" if addendum.image_path else None}


def serialize_report(report, detail=False, staff=False):
    result = {
        "id": report.id,
        "resident_id": report.resident_id,
        "description": report.description,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "resident_category": report.resident_category,
        "model_category": report.model_category,
        "verified_category": report.verified_category,
        "prediction_available": bool(report.embedding_model_version),
        "location_label": report.location_label,
        "hazards": report.hazards or [],
        "status": report.status,
        "case_id": report.case_id,
        "case_confirmed": report.case_confirmed,
        "location_source": report.location_source,
        "created_at": utc_iso(report.created_at),
        "updated_at": utc_iso(report.updated_at),
        "image_url": f"/api/reports/{report.id}/image",
    }
    if staff:
        # Signals for staff to look closer; residents never see them (trust.py).
        result["trust_flags"] = report.trust_flags or []
        result["barangay"] = report.barangay.name if report.barangay_id else None
    if detail:
        result["addenda"] = [serialize_addendum(report, item) for item in report.addenda]
        result["events"] = [
            {
                "id": event.id,
                "from_status": event.from_status,
                "to_status": event.to_status,
                "actor_id": event.actor_id,
                "note": event.note,
                "created_at": utc_iso(event.created_at),
            }
            for event in report.events
        ]
        result["actions"] = [
            {
                "id": action.id,
                "actor_id": action.actor_id,
                "kind": action.kind,
                "note": action.note,
                "created_at": utc_iso(action.created_at),
            }
            for action in report.actions
        ]
    return result


def authorized_report(report_id: str, db: Session, user: User):
    report = db.get(Report, report_id)
    if not report or (user.role == "resident" and report.resident_id != user.id) or not barangays.may_see(db, user, report):
        raise HTTPException(404, "Report not found")
    return report


def read_upload(image: UploadFile) -> bytes:
    return image.file.read(int(os.environ.get("MAX_IMAGE_BYTES", 5_000_000)) + 1)


def sanitized_upload(image: UploadFile):
    return sanitize_image(read_upload(image))


def daily_limit(name, default):
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


def within_daily_cap(db: Session, model, author_column, user_id: str, name: str, default: int,
                     message="Daily report limit reached"):
    """Counted in the database, so a restart or a second device does not reset it."""
    since = now() - timedelta(days=1)
    sent = db.scalar(select(func.count()).select_from(model).where(author_column == user_id, model.created_at >= since))
    if sent >= daily_limit(name, default):
        raise HTTPException(429, message)


@router.post("/predict")
def preview_prediction(
    request: Request, image: UploadFile = File(...), language: str = Form("en"), user: User = Depends(require_csrf)
):
    """What the AI can fill in from the photo; the resident reviews and edits all of it."""
    require_role(user, {"resident"})
    rate_limit(request, "preview", 20, key=user.id)
    result = ai.analyze(sanitized_upload(image), language if language in {"en", "fil", "taglish"} else "en")
    return {
        "prediction_available": result.available,
        "model_category": result.category,
        "confidence": result.confidence,
        "category_source": result.source,
        "needs_check": result.needs_check,
        "problem_seen": result.problem_seen,
        "suggested_description": result.description,
        "hazards": list(result.hazards),
    }


@router.post("", status_code=201)
def submit_report(
    request: Request,
    image: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    resident_category: str = Form(...),
    description: str | None = Form(None),
    case_id: str | None = Form(None),
    location_source: str | None = Form(None),
    # Read by the browser from the original photo, before it shrank it and dropped these details (trust.py).
    photo_taken_at: str | None = Form(None),
    photo_camera: str | None = Form(None),
    photo_latitude: str | None = Form(None),
    photo_longitude: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    require_role(user, {"resident"})
    rate_limit(request, "upload", key=user.id)
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or resident_category not in CATEGORIES:
        raise HTTPException(422, "Invalid location or category")
    description = description.strip() if description else None
    if description and len(description) > 1000:
        raise HTTPException(422, "Description is too long")
    within_daily_cap(db, Report, Report.resident_id, user.id, "MAX_REPORTS_PER_DAY", 10)
    from . import cases  # Imported here: cases.py builds on this module.

    case = cases.open_case_for_evidence(db, case_id) if case_id else None
    raw = read_upload(image)
    sanitized = sanitize_image(raw)
    # The upload's own details win; the browser's reading fills in what shrinking removed.
    facts = {**trust.client_facts(photo_taken_at, photo_camera, photo_latitude, photo_longitude),
             **trust.photo_facts(raw)}
    # The model's category, hazards, embedding and street name come from the server, never the client.
    analysis = ai.for_submission(sanitized)
    barangay_id = barangays.barangay_id_for(db, latitude, longitude)
    # A case stays in one barangay. Across a border the report stands alone, and its own barangay's staff review it.
    if case and cases.barangay_of(db, case) != barangay_id:
        case = None
    report = Report(
        resident_id=user.id,
        latitude=latitude,
        longitude=longitude,
        resident_category=resident_category,
        description=description or None,
        image_path="",
        location_label=geo.lookup(latitude, longitude) if geo.enabled() else None,
        model_category=analysis.category,
        hazards=list(analysis.hazards) or None,
        image_embedding=analysis.embedding,
        embedding_model_version=analysis.embedding_version,
        # "I see this too": linked to the case, counted only after staff confirm it.
        case_id=case.id if case else None,
        location_source=location_source if location_source in trust.SOURCES else None,
        trust_flags=trust.flags(facts, latitude, longitude) or None,
        barangay_id=barangay_id,
    )
    db.add(report)
    db.flush()
    db.add(ReportEvent(report_id=report.id, from_status=None, to_status="Pending", actor_id=user.id))
    notify_staff(db, report, "new_report")
    location = None
    try:
        location = save_image(report.id, sanitized)
        report.image_path = location
        db.commit()
    except Exception:
        db.rollback()
        if location:
            try:
                delete_image(location)
            except Exception:
                logging.getLogger(__name__).error("Could not clean up image for rolled-back report %s", report.id)
        raise
    db.refresh(report)
    try:
        cases.suggest_duplicates(db, report)
    except Exception:
        # Suggestions are a convenience for staff; the report is already saved.
        db.rollback()
        logging.getLogger(__name__).exception("Could not queue duplicate suggestions for report %s", report.id)
    return serialize_report(report, detail=True)


@router.get("")
def list_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Report).order_by(Report.created_at.desc())
    if user.role == "resident":
        query = query.where(Report.resident_id == user.id)
        return [serialize_report(report) for report in db.scalars(query)]
    reports = db.scalars(query.where(barangays.report_filter(db, user))).all()
    # Staff only: a suggested priority with its reasons, never shown to residents.
    scores = priority.for_reports(db, reports)
    return [{**serialize_report(report, staff=True), "priority": scores[report.id]} for report in reports]


@router.get("/{report_id}")
def report_detail(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = authorized_report(report_id, db, user)
    if user.role == "resident":
        return serialize_report(report, detail=True)
    return {**serialize_report(report, detail=True, staff=True),
            "priority": priority.for_reports(db, [report])[report.id]}


# Residents may add to a report until it is closed; afterwards a new report is the right place.
CLOSED = ("Resolved", "Rejected")


@router.post("/{report_id}/addenda", status_code=201)
def add_details(
    report_id: str,
    request: Request,
    note: str = Form(...),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    """A resident adds details (and optionally another photo) to their own open report. Staff are notified."""
    require_role(user, {"resident"})
    report = authorized_report(report_id, db, user)
    if report.status in CLOSED:
        raise HTTPException(409, "This report is closed")
    note = note.strip()
    if not note or len(note) > 1000:
        raise HTTPException(422, "Add a note of up to 1000 characters")
    rate_limit(request, "addendum", key=user.id)
    within_daily_cap(db, ReportAddendum, ReportAddendum.author_id, user.id, "MAX_ADDENDA_PER_DAY", 20,
                     "Daily limit for added details reached")
    sanitized = sanitized_upload(image) if image is not None and image.filename else None
    addendum = ReportAddendum(report_id=report.id, author_id=user.id, note=note)
    db.add(addendum)
    db.flush()
    notify_staff(db, report, "addendum")
    location = None
    try:
        if sanitized:
            location = save_image(addendum.id, sanitized)
            addendum.image_path = location
        db.commit()
    except Exception:
        db.rollback()
        if location:
            try:
                delete_image(location)
            except Exception:
                logging.getLogger(__name__).error("Could not clean up image for rolled-back addendum %s", addendum.id)
        raise
    db.refresh(addendum)
    return serialize_addendum(report, addendum)


@router.get("/{report_id}/addenda/{addendum_id}/image")
def addendum_image(report_id: str, addendum_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    report = authorized_report(report_id, db, user)
    addendum = db.get(ReportAddendum, addendum_id)
    if not addendum or addendum.report_id != report.id or not addendum.image_path:
        raise HTTPException(404, "Image not found")
    return image_response(addendum.image_path)


@router.get("/{report_id}/image")
def report_image(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = authorized_report(report_id, db, user)
    return image_response(report.image_path)
