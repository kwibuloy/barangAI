from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import cases
from .auth import require_csrf, require_role
from .db import get_db
from .models import Notification, Report, ReportEvent, StaffAction, User, now, utc_iso
from .reports import CASE_STEP_NOTE, CATEGORIES, authorized_report, serialize_report

router = APIRouter(prefix="/reports")
NEXT = {"Pending": {"Under Verification"},
        "Under Verification": {"Accepted", "Rejected"},
        "Accepted": {"In Progress"}, "In Progress": {"Resolved"},
        "Rejected": set(), "Resolved": set()}
# Residents see the reason, and the note that every status change needs.
REJECTION_REASONS = {"not_barangay_concern", "already_reported", "not_enough_details", "no_problem_found",
                     "outside_area", "false_or_inappropriate", "other"}


# A status change writes its copies across a grouped case within one request.
SAME_CHANGE_SECONDS = 5


class StatusInput(BaseModel):
    status: str
    verified_category: str | None = None
    note: str | None = Field(default=None, max_length=2000)
    rejection_reason: str | None = None


class DescriptionInput(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class ActionInput(BaseModel):
    kind: str
    note: str = Field(min_length=1, max_length=2000)


@router.post("/{report_id}/status")
def change_status(report_id: str, body: StatusInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"staff", "administrator"})
    report = authorized_report(report_id, db, user)
    previous = report.status
    if report.case_id and not report.case_confirmed:
        raise HTTPException(409, "Confirm or reject the case link first")
    if body.status not in NEXT.get(previous, set()):
        raise HTTPException(409, "Invalid status transition")
    note = (body.note or "").strip()
    # A note starting like an automatic one would be hidden from residents.
    if not note or note.startswith(CASE_STEP_NOTE):
        raise HTTPException(422, "Describe the reason for this status change")
    if body.status == "Accepted" and body.verified_category not in CATEGORIES:
        raise HTTPException(422, "Verified category required")
    if body.verified_category is not None and body.status != "Accepted":
        raise HTTPException(422, "Verified category only allowed on acceptance")
    if body.status == "Rejected" and body.rejection_reason not in REJECTION_REASONS:
        raise HTTPException(422, "Rejection reason required")
    # Rejection moves the whole case, so this would also reject the report it duplicates.
    if (
        body.rejection_reason == "already_reported"
        and report.case_id
        and report.case_confirmed
        and len(cases.members(db, report.case_id)) > 1
    ):
        raise HTTPException(409, "This report is grouped with others, so rejecting it as already reported would reject them all")
    if body.rejection_reason is not None and body.status != "Rejected":
        raise HTTPException(422, "Rejection reason only allowed on rejection")
    values = {"status": body.status, "updated_at": now()}
    if body.status == "Accepted":
        values["verified_category"] = body.verified_category
    changed = db.execute(update(Report).where(Report.id == report_id, Report.status == previous).values(**values))
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Report changed; refresh and retry")
    db.add(ReportEvent(report_id=report_id, from_status=previous, to_status=body.status,
                       actor_id=user.id, note=note, rejection_reason=body.rejection_reason))
    db.add(Notification(user_id=report.resident_id, report_id=report_id, status=body.status))
    db.flush()
    db.refresh(report)
    # The other reports of a grouped case move with this one.
    cases.after_status_change(db, report, user.id, note)
    if body.status == "Rejected" and report.case_id:
        # Every resident of the case is told why.
        db.execute(
            update(ReportEvent)
            .where(
                ReportEvent.to_status == "Rejected",
                ReportEvent.rejection_reason.is_(None),
                ReportEvent.report_id.in_(select(Report.id).where(Report.case_id == report.case_id)),
            )
            .values(rejection_reason=body.rejection_reason)
        )
    db.commit()
    db.expire_all()
    return serialize_report(db.get(Report, report_id), detail=True, staff=True)


@router.put("/{report_id}/events/{event_id}/note")
def correct_description(
    report_id: str, event_id: str, body: DescriptionInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    """Replace what staff wrote about a status change, everywhere residents see it. The old text stays staff-only."""
    require_role(user, {"staff", "administrator"})
    report = authorized_report(report_id, db, user)
    event = db.get(ReportEvent, event_id)
    if not event or event.report_id != report.id:
        raise HTTPException(404, "Status change not found")
    old = event.note
    if not event.from_status or not old or old.startswith(CASE_STEP_NOTE) or old == cases.GROUPED_NOTE:
        raise HTTPException(409, "This status change has no description from staff")
    note = body.note.strip()
    if not note or note.startswith(CASE_STEP_NOTE):
        raise HTTPException(422, "Describe the reason for this status change")
    copies = [event]
    if report.case_id:
        # Only the copies from this one change: an earlier decision on another report may have used the same words.
        matches = db.scalars(
            select(ReportEvent).where(
                ReportEvent.to_status == event.to_status,
                ReportEvent.note == old,
                ReportEvent.actor_id == event.actor_id,
                ReportEvent.report_id.in_(select(Report.id).where(Report.case_id == report.case_id)),
            )
        ).all()
        copies = [item for item in matches if abs((item.created_at - event.created_at).total_seconds()) < SAME_CHANGE_SECONDS]
    for copy in copies:
        copy.note = note
        db.add(
            StaffAction(
                report_id=copy.report_id,
                actor_id=user.id,
                kind="system",
                note=f"Status description for {event.to_status} corrected. It read: {old}",
            )
        )
    db.commit()
    db.expire_all()
    return serialize_report(db.get(Report, report_id), detail=True, staff=True)


@router.post("/{report_id}/actions", status_code=201)
def add_action(report_id: str, body: ActionInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"staff", "administrator"})
    authorized_report(report_id, db, user)
    if body.kind not in {"action", "coordination"}:
        raise HTTPException(422, "Invalid action kind")
    action = StaffAction(report_id=report_id, actor_id=user.id, kind=body.kind, note=body.note)
    db.add(action)
    db.commit()
    db.refresh(action)
    return {"id": action.id, "actor_id": action.actor_id, "kind": action.kind,
            "note": action.note, "created_at": utc_iso(action.created_at)}
