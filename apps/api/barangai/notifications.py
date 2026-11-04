from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import barangays
from .auth import get_current_user, require_csrf
from .conditional import conditional_json
from .db import get_db
from .models import Notification, Report, User, now, utc_iso

router = APIRouter(prefix="/notifications")


def notify_staff(db: Session, report: Report, kind: str):
    """Tell the report's barangay staff and every administrator that a report arrived or a resident added to one."""
    for staff_id in db.scalars(select(User.id).where(barangays.staff_audience(db, report))):
        db.add(Notification(user_id=staff_id, report_id=report.id, status=report.status, kind=kind))


def serialize(item: Notification):
    return {"id": item.id, "report_id": item.report_id, "status": item.status, "kind": item.kind,
            "created_at": utc_iso(item.created_at), "read_at": utc_iso(item.read_at) if item.read_at else None}


@router.get("")
def list_notifications(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Staff moved to another barangay stop seeing notifications for reports they can no longer open.
    visible = select(Report.id).where(barangays.report_filter(db, user))
    items = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.report_id.in_(visible))
                       .order_by(Notification.created_at.desc()).limit(100)).all()
    return conditional_json(request, [serialize(item) for item in items], user.id)


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    if item.read_at is None:
        item.read_at = now()
        db.commit()
        db.refresh(item)
    return serialize(item)
