"""What residents can do about their own data: change their password, ask for a report to be deleted, or delete their
account, plus who runs the service for the legal pages. Barangay staff and administrators decide deletion requests."""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import barangays, points
from . import delete_report as deletion
from .auth import MAX_PASSWORD, current_session, hash_password, password_matches, rate_limit, require_csrf, require_role
from .db import get_db, scrub_deleted
from .media import delete_image
from .models import DeletionRequest, LoginSession, Notification, OAuthIdentity, Report, Usage, User, now
from .reports import authorized_report, deletion_request_data
from .usage import limit_setting, period_key, take

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/legal/operator")
def operator():
    """Named in the terms and privacy notice. Empty until set, and the pages then say so instead of guessing."""
    return {
        "name": os.environ.get("OPERATOR_NAME", "").strip() or None,
        "contact": os.environ.get("PRIVACY_CONTACT", "").strip() or None,
    }


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=MAX_PASSWORD)


@router.post("/auth/password", status_code=204)
def change_password(
    body: PasswordChange, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    """Signs out the account's other devices too, in case someone else had the old password."""
    rate_limit(request, "password", key=user.id)
    if user.identities:
        raise HTTPException(409, "This account signs in with Google")
    stored = user.password_hash
    db.rollback()
    if not password_matches(stored, body.current_password):
        raise HTTPException(403, "Current password is incorrect")
    keep = current_session(request, db).token_hash
    user.password_hash = hash_password(body.new_password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id, LoginSession.token_hash != keep))
    db.commit()


class AccountDeletion(BaseModel):
    email: str
    password: str | None = None


@router.post("/auth/delete-account", status_code=204)
def delete_account(
    body: AccountDeletion,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    """A resident removes their account and every report of theirs, at once and for good. Staff and administrator
    accounts are managed by the operator, because they appear in other people's report histories."""
    require_role(user, {"resident"})
    rate_limit(request, "delete_account", key=user.id)
    if body.email.strip().lower() != user.email:
        raise HTTPException(422, "Type your email address to confirm")
    if not user.identities:
        stored = user.password_hash
        db.rollback()
        if not password_matches(stored, body.password or ""):
            raise HTTPException(403, "Current password is incorrect")
    user_id = user.id
    images = []
    for report in db.scalars(select(Report).where(Report.resident_id == user_id)).all():
        images += deletion.erase_rows(db, report)
    points.erase_account(db, user_id)
    for model, column in (
        (Notification, Notification.user_id),
        (DeletionRequest, DeletionRequest.requester_id),
        (OAuthIdentity, OAuthIdentity.user_id),
        (LoginSession, LoginSession.user_id),
    ):
        db.execute(delete(model).where(column == user_id))
    for name in ("deletion", "preview"):
        db.execute(delete(Usage).where(Usage.key.like(f"{name}:{user_id}:%")))
    db.execute(delete(User).where(User.id == user_id))
    db.flush()  # Holds the write lock, so the commit below cannot fail on a busy database after the photos are gone.
    # The rows are still uncommitted if storage refuses, so the resident can simply try again.
    for location in images:
        delete_image(location)
    db.commit()
    scrub_deleted(db)
    log.info("A resident deleted their account (%d photos removed)", len(images))
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")


class DeletionInput(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class DeletionDecision(BaseModel):
    decision: str
    note: str | None = Field(default=None, max_length=500)


@router.post("/reports/{report_id}/deletion-request", status_code=201)
def request_deletion(
    report_id: str, body: DeletionInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    require_role(user, {"resident"})
    authorized_report(report_id, db, user)
    current = deletion_request_data(db, report_id)
    if current and current["status"] == "pending":
        raise HTTPException(409, "Deletion was already requested")
    if not take(db, period_key(f"deletion:{user.id}"), limit_setting("MAX_DELETION_REQUESTS_PER_DAY", 20)):
        raise HTTPException(429, "Daily limit for deletion requests reached")
    report = db.get(Report, report_id)
    db.add(DeletionRequest(report_id=report_id, requester_id=user.id, reason=(body.reason or "").strip() or None))
    for decider in db.scalars(select(User.id).where(barangays.staff_audience(db, report))):
        db.add(Notification(user_id=decider, report_id=report_id, status=report.status, kind="deletion_request"))
    db.commit()
    return deletion_request_data(db, report_id)


@router.post("/reports/{report_id}/deletion-request/decision")
def decide_deletion(
    report_id: str, body: DeletionDecision, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    # authorized_report limits staff to their own barangay.
    require_role(user, {"staff", "administrator"})
    if body.decision not in {"approved", "declined"}:
        raise HTTPException(422, "Invalid decision")
    report = authorized_report(report_id, db, user)
    item = db.scalar(
        select(DeletionRequest).where(DeletionRequest.report_id == report.id, DeletionRequest.status == "pending")
    )
    if not item:
        raise HTTPException(409, "No deletion request to decide")
    item.status, item.decided_by, item.decided_at = body.decision, user.id, now()
    if body.decision == "declined":
        item.note = (body.note or "").strip() or None
        db.add(
            Notification(user_id=item.requester_id, report_id=report.id, status=report.status, kind="deletion_declined")
        )
        db.commit()
        return {"status": "declined"}
    images = deletion.erase_rows(db, report)
    db.flush()  # Holds the write lock, so the commit below cannot fail on a busy database after the photos are gone.
    # The rows are still uncommitted if storage refuses, so whoever decided can try again.
    for location in images:
        delete_image(location)
    db.commit()
    scrub_deleted(db)
    return {"status": "approved"}
