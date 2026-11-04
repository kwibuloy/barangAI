"""Notes about the app from anyone signed in, read by administrators. No email service and no ticket system: this is a
list someone reads. Kept to the account id and the words, and erased with the account."""

from datetime import UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import get_current_user, rate_limit, require_csrf, require_role
from .db import get_db
from .models import Feedback, User, now, utc_iso

router = APIRouter()
MAX_MESSAGE = 1000
# One note per person in this long: enough to add something later, and no use for filling the table.
GAP = timedelta(minutes=5)


class FeedbackInput(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE)


@router.post("/feedback", status_code=201)
def send_feedback(
    body: FeedbackInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    rate_limit(request, "feedback", 5, key=user.id)
    message = body.message.strip()
    if not message:
        raise HTTPException(422, "Write your feedback first")
    last = db.scalar(select(func.max(Feedback.created_at)).where(Feedback.user_id == user.id))
    if last and (last if last.tzinfo else last.replace(tzinfo=UTC)) > now() - GAP:
        raise HTTPException(429, "You sent feedback a moment ago. Try again in a few minutes.")
    item = Feedback(user_id=user.id, message=message)
    db.add(item)
    db.commit()
    return {"id": item.id, "created_at": utc_iso(item.created_at)}


@router.get("/admin/feedback")
def read_feedback(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, {"administrator"})
    items = db.scalars(select(Feedback).order_by(Feedback.created_at.desc()).limit(limit))
    return [
        {"id": item.id, "user_id": item.user_id, "message": item.message, "created_at": utc_iso(item.created_at)}
        for item in items
    ]
