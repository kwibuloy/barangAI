import base64
import logging
import os
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from . import ai, barangays, geo, priority, trust
from .auth import get_current_user, rate_limit, require_csrf, require_role, within_address_cap
from .conditional import conditional_json
from .db import get_db
from .media import delete_image, image_response, sanitize_image, save_image
from .models import (
    CATEGORIES,
    Case,
    DeletionRequest,
    Report,
    ReportAddendum,
    ReportEvent,
    ReportPhotoView,
    User,
    now,
    uid,
    utc_iso,
)
from .notifications import notify_staff
from .usage import limit_setting, period_key, take

router = APIRouter(prefix="/reports")
CASE_STEP_NOTE = "Updated with case #"


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
        # Residents see what was done, not who did it, and not outside coordination or automatic grouping logs.
        result["events"] = [
            {
                "id": event.id,
                "from_status": event.from_status,
                "to_status": event.to_status,
                # A case's automatic step note is for staff; residents still see the step itself.
                "note": event.note if staff or not (event.note or "").startswith(CASE_STEP_NOTE) else None,
                "rejection_reason": event.rejection_reason,
                "created_at": utc_iso(event.created_at),
                **({"actor_id": event.actor_id} if staff else {}),
            }
            for event in report.events
        ]
        result["actions"] = [
            {
                "id": action.id,
                "kind": action.kind,
                "note": action.note,
                "created_at": utc_iso(action.created_at),
                **({"actor_id": action.actor_id} if staff else {}),
            }
            for action in report.actions
            if staff or action.kind == "action"
        ]
    return result


def deletion_request_data(db: Session, report_id: str):
    item = db.scalar(select(DeletionRequest).where(DeletionRequest.report_id == report_id)
                     .order_by(DeletionRequest.created_at.desc()).limit(1))
    if not item:
        return None
    return {"id": item.id, "status": item.status, "reason": item.reason, "note": item.note,
            "created_at": utc_iso(item.created_at)}


def authorized_report(report_id: str, db: Session, user: User):
    report = db.get(Report, report_id)
    if not report or (user.role == "resident" and report.resident_id != user.id) or not barangays.may_see(db, user, report):
        raise HTTPException(404, "Report not found")
    return report


def read_upload(image: UploadFile) -> bytes:
    return image.file.read(int(os.environ.get("MAX_IMAGE_BYTES", 5_000_000)) + 1)


def sanitized_upload(image: UploadFile):
    return sanitize_image(read_upload(image))


def within_daily_cap(db: Session, model, author_column, user_id: str, name: str, default: int,
                     message="Daily report limit reached"):
    """Counted in the database, so a restart or a second device does not reset it."""
    since = now() - timedelta(days=1)
    sent = db.scalar(select(func.count()).select_from(model).where(author_column == user_id, model.created_at >= since))
    if sent >= limit_setting(name, default):
        raise HTTPException(429, message)


@router.post("/photo-preview")
def photo_preview(
    request: Request,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    """The copy that gets stored, with any faces it found blurred, so the form never shows a sharp face. Sent apart
    from the slower AI answer; /predict and the submission then reuse this result."""
    require_role(user, {"resident"})
    rate_limit(request, "photo-preview", 30, key=user.id)
    db.commit()  # The face check is slow, and a few uploads must not use up the small connection pool.
    return {"preview_image": f"data:image/jpeg;base64,{base64.b64encode(sanitized_upload(image)).decode()}"}


@router.post("/predict")
def preview_prediction(
    request: Request,
    image: UploadFile = File(...),
    language: str = Form("en"),
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    """What the AI can fill in from the photo; the resident reviews and edits all of it."""
    require_role(user, {"resident"})
    rate_limit(request, "preview", 20, key=user.id)
    resident_id = user.id
    db.commit()  # The face check is slow, and a few uploads must not use up the small connection pool.
    # Checked first, so invalid uploads use up no allowance.
    sanitized = sanitized_upload(image)
    if not take(db, period_key(f"preview:{resident_id}"), limit_setting("MAX_PREVIEWS_PER_DAY", 40)):
        raise HTTPException(429, "Daily limit for photo suggestions reached")
    # About 5 neurons each, so the default leaves room for the chatbot in Cloudflare's 10,000 a day. Past it, the
    # local checker answers alone.
    vision_allowed = take(db, period_key("preview_vision"), limit_setting("MAX_SITE_VISION_PER_DAY", 1500))
    db.commit()  # No database connection waits on the models.
    result = ai.analyze(sanitized, language if language in {"en", "fil", "taglish"} else "en",
                        use_vision=vision_allowed)
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
    # AI hazard flags the resident removed from the suggestion; the flags themselves stay server-side.
    dismissed_hazards: list[str] | None = Form(None),
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

    resident_id = user.id
    raw = read_upload(image)
    db.commit()  # The face check is slow, and a few uploads must not use up the small connection pool.
    sanitized = sanitize_image(raw)
    case = cases.open_case_for_evidence(db, case_id) if case_id else None
    # The upload's own details win; the browser's reading fills in what shrinking removed.
    facts = {**trust.client_facts(photo_taken_at, photo_camera, photo_latitude, photo_longitude),
             **trust.photo_facts(raw)}
    barangay_id = barangays.barangay_id_for(db, latitude, longitude)
    # A case stays in one barangay. Across a border the report stands alone, and its own barangay's staff review it.
    if case and cases.barangay_of(db, case) != barangay_id:
        case = None
    joined_case = case.id if case else None
    if not within_address_cap(request, db, "reports_ip", "MAX_REPORTS_PER_ADDRESS_PER_DAY", 100):
        raise HTTPException(429, "Too many reports from this network today. Please try again tomorrow.")
    # Accounts need no email check, so a cap per resident alone would not protect the 1 GB photo bucket. Counted only
    # now, so one resident's invalid uploads cannot use up the whole site's allowance.
    if not take(db, period_key("reports"), limit_setting("MAX_SITE_REPORTS_PER_DAY", 300)):
        raise HTTPException(429, "The service has reached today's report limit. Please try again tomorrow.")
    db.commit()  # The slow steps below hold no database connection, so a few uploads cannot use up the small pool.
    # The model's category, hazards, embedding and street name come from the server, never the client.
    analysis = ai.for_submission(sanitized)
    location_label = geo.lookup(latitude, longitude) if geo.enabled() else None
    hazards = [hazard for hazard in analysis.hazards if hazard not in (dismissed_hazards or [])]
    # The case may have been deleted during the slow steps above; then the report simply stands alone.
    if joined_case and not db.get(Case, joined_case):
        joined_case = None
    report_id = uid()
    location = save_image(report_id, sanitized)
    report = Report(
        id=report_id,
        resident_id=resident_id,
        latitude=latitude,
        longitude=longitude,
        resident_category=resident_category,
        description=description or None,
        image_path=location,
        location_label=location_label,
        model_category=analysis.category,
        hazards=hazards or None,
        image_embedding=analysis.embedding,
        embedding_model_version=analysis.embedding_version,
        # "I see this too": linked to the case, counted only after staff confirm it.
        case_id=joined_case,
        location_source=location_source if location_source in trust.SOURCES else None,
        trust_flags=trust.flags(facts, latitude, longitude) or None,
        barangay_id=barangay_id,
    )
    try:
        db.add(report)
        db.flush()
        db.add(ReportEvent(report_id=report_id, from_status=None, to_status="Pending", actor_id=resident_id))
        notify_staff(db, report, "new_report")
        db.commit()
    except Exception:
        db.rollback()
        try:
            delete_image(location)
        except Exception:
            logging.getLogger(__name__).error("Could not clean up image for rolled-back report %s", report_id)
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
def list_reports(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # The newest 2,000: the website filters and maps this list, and the Render instance has 512 MB.
    query = select(Report).order_by(Report.created_at.desc()).limit(2000)
    if user.role == "resident":
        query = query.where(Report.resident_id == user.id)
        return conditional_json(request, [serialize_report(report) for report in db.scalars(query)], user.id)
    reports = db.scalars(query.options(joinedload(Report.barangay)).where(barangays.report_filter(db, user))).all()
    # Staff only: a suggested priority with its reasons, never shown to residents.
    scores = priority.for_reports(db, reports)
    data = [{**serialize_report(report, staff=True), "priority": scores[report.id]} for report in reports]
    return conditional_json(request, data, user.id)


@router.get("/{report_id}")
def report_detail(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = authorized_report(report_id, db, user)
    deletion = deletion_request_data(db, report.id)
    if user.role == "resident":
        return {**serialize_report(report, detail=True), "deletion_request": deletion}
    return {**serialize_report(report, detail=True, staff=True), "deletion_request": deletion,
            "priority": priority.for_reports(db, [report])[report.id]}


def log_photo_view(db: Session, report_id: str, user: User):
    """Staff and administrators leave a trace when a photo reaches their screen, as a queue thumbnail or opened in
    full (the two look the same here); residents reading their own do not. One row per
    person, report and hour, because a screen can load the same photo many times, so most views write nothing."""
    if user.role == "resident":
        return
    actor_id = user.id
    if not db.scalar(
        select(ReportPhotoView.id)
        .where(
            ReportPhotoView.report_id == report_id,
            ReportPhotoView.actor_id == actor_id,
            ReportPhotoView.created_at >= now() - timedelta(hours=1),
        )
        .limit(1)
    ):
        db.add(ReportPhotoView(report_id=report_id, actor_id=actor_id))
        db.commit()


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
    author_id, addendum_id = user.id, uid()
    db.commit()  # No database connection waits on the face check or the photo upload.
    sanitized = sanitized_upload(image) if image is not None and image.filename else None
    location = save_image(addendum_id, sanitized) if sanitized else None
    # The report may have been closed or deleted during the upload.
    report = db.get(Report, report_id)
    if not report or report.status in CLOSED:
        if location:
            delete_image(location)
        raise HTTPException(409 if report else 404, "This report is closed" if report else "Report not found")
    addendum = ReportAddendum(id=addendum_id, report_id=report_id, author_id=author_id, note=note, image_path=location)
    try:
        db.add(addendum)
        db.flush()
        notify_staff(db, report, "addendum")
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
    location = addendum.image_path
    log_photo_view(db, report_id, user)
    db.rollback()  # Read only; the database connection goes back while the photo downloads.
    return image_response(location)


@router.get("/{report_id}/image")
def report_image(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    location = authorized_report(report_id, db, user).image_path
    log_photo_view(db, report_id, user)
    db.rollback()  # Read only; the database connection goes back while the photo downloads.
    return image_response(location)
