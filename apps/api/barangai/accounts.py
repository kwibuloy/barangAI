"""What residents can do about their own data: change their password, ask for a report to be deleted, or delete their
account, plus who runs the service for the legal pages. Barangay staff and administrators decide deletion requests."""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from . import barangays, points
from . import delete_report as deletion
from .auth import (
    MAX_PASSWORD,
    check_password,
    csrf_user,
    current_session,
    get_current_user,
    hash_password,
    password_matches,
    rate_limit,
    require_csrf,
    require_role,
    user_data,
)
from .db import demo_mode, get_db, scrub_deleted
from .media import delete_image
from .models import DeletionRequest, Feedback, LoginSession, Notification, Report, User, now, utc_iso
from .reports import authorized_report, deletion_request_data, serialize_report
from .usage import limit_setting, period_key, take

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/legal/operator")
def operator():
    """Named in the terms and privacy notice. Empty until set, and the pages then say so instead of guessing."""
    return {
        "name": os.environ.get("OPERATOR_NAME", "").strip() or None,
        "contact": os.environ.get("PRIVACY_CONTACT", "").strip() or None,
        # A public fact, so the app can label synthetic data on every screen.
        "demo_mode": demo_mode(),
    }


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=MAX_PASSWORD)


@router.post("/auth/password", status_code=204)
def change_password(
    body: PasswordChange, request: Request, db: Session = Depends(get_db), user: User = Depends(csrf_user)
):
    """Signs out the account's other devices too, in case someone else had the old password. This is the one way out
    of a temporary password, so it stays open to an account that also uses Google once an administrator has reset it."""
    rate_limit(request, "password", key=user.id)
    temporary = user.must_change_password
    if user.identities and not temporary:
        raise HTTPException(409, "This account signs in with Google")
    stored = user.password_hash
    db.rollback()
    if not password_matches(stored, body.current_password):
        raise HTTPException(403, "Current password is incorrect")
    check_password(body.new_password, user.email)
    if temporary and body.new_password == body.current_password:
        raise HTTPException(422, "Choose a new password, not the temporary one")
    keep = current_session(request, db).token_hash
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
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
    images = deletion.erase_account(db, user.id)
    db.flush()  # Holds the write lock, so the commit below cannot fail on a busy database after the photos are gone.
    # The rows are still uncommitted if storage refuses, so the resident can simply try again.
    for location in images:
        delete_image(location)
    db.commit()
    scrub_deleted(db)
    log.info("A resident deleted their account (%d photos removed)", len(images))
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")


@router.get("/auth/export")
def export_my_data(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """A resident's own data as JSON, using what they already see on screen: no staff ids, coordination notes,
    automatic logs or photo checks. Photos aren't included: `report_ids` says which reports have one to open."""
    require_role(user, {"resident"})
    rate_limit(request, "export", 5, key=user.id)
    user_id = user.id
    points.expire_due(db, user_id)
    # The temporary-password flag is about this session, not the person's data.
    account = {
        **{key: value for key, value in user_data(user).items() if key != "must_change_password"},
        "terms_accepted_at": utc_iso(user.terms_accepted_at) if user.terms_accepted_at else None,
        "terms_version": user.terms_version,
    }
    reports = db.scalars(
        select(Report)
        .options(joinedload(Report.barangay))
        .where(Report.resident_id == user_id)
        .order_by(Report.created_at)
    ).all()
    data = {
        "exported_at": utc_iso(now()),
        "account": account,
        "report_ids": [report.id for report in reports],
        "reports": [
            {**serialize_report(report, detail=True), "deletion_request": deletion_request_data(db, report.id)}
            for report in reports
        ],
        "points": points.my_ledger(db, user_id),
        "vouchers": points.my_vouchers_data(db, user_id),
        "feedback": [
            {"message": item.message, "created_at": utc_iso(item.created_at)}
            for item in db.scalars(select(Feedback).where(Feedback.user_id == user_id).order_by(Feedback.created_at))
        ],
    }
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="barangai-my-data.json"'})


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
