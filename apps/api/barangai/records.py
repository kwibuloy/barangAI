"""What a barangay secretary needs for reporting upward: counted from the records, within the caller's barangay.

Every figure is computed from stored reports and status events, never estimated. Exports leave the app's access
control, so they carry no resident identities, photos, descriptions, staff notes or AI output.
"""

import csv
import io
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import barangays
from .auth import get_current_user, require_role
from .db import get_db
from .models import CATEGORIES, Barangay, Report, ReportEvent, User
from .usage import MANILA

router = APIRouter(prefix="/staff/records", tags=["records"])

OPEN = {"Pending", "Under Verification", "Accepted", "In Progress"}
OUTSIDE = "outside"
MAX_DAYS = 366
COLUMNS = (
    "Reference",
    "Submitted",
    "Barangay",
    "Street",
    "Resident category",
    "Verified category",
    "Status",
    "Accepted",
    "Resolved",
    "Rejected",
    "Rejection reason",
    "Grouped case",
)


def as_utc(value: datetime) -> datetime:
    # SQLite drops timezone data on read; stored naive values still represent UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def manila_day(value: datetime | None) -> str:
    # Days only, as on the shared map: exact times could single out a neighbour once this file leaves the app.
    return as_utc(value).astimezone(MANILA).strftime("%Y-%m-%d") if value else ""


def period(start: date, end: date) -> tuple[datetime, datetime]:
    """UTC bounds of whole Manila days, end exclusive."""
    if end < start or (end - start).days >= MAX_DAYS:
        raise HTTPException(422, "Choose a period of up to one year")
    return (
        datetime.combine(start, time.min, MANILA).astimezone(UTC),
        datetime.combine(end + timedelta(days=1), time.min, MANILA).astimezone(UTC),
    )


def hours(start: datetime, end: datetime) -> float:
    return (as_utc(end) - as_utc(start)).total_seconds() / 3600


def incident(report: Report) -> str:
    """Reports staff confirmed as one incident count once."""
    return report.case_id if report.case_id and report.case_confirmed else report.id


def load(db: Session, user: User, barangay: str | None):
    """The caller's reports with their barangay names, and each report's latest step into each milestone status."""
    query = (
        select(Report, Barangay.name)
        .outerjoin(Barangay, Report.barangay_id == Barangay.id)
        .where(barangays.report_filter(db, user))
    )
    # Only administrators choose; staff are held to their own barangay by the filter above.
    if user.role == "administrator" and barangay:
        query = query.where(Report.barangay_id.is_(None) if barangay == OUTSIDE else Barangay.name == barangay)
    rows = db.execute(query.order_by(Report.created_at)).all()
    ids = {report.id for report, _ in rows}
    steps: dict[str, dict] = {}
    events = select(ReportEvent).join(Report, ReportEvent.report_id == Report.id).where(
        barangays.report_filter(db, user), ReportEvent.to_status.in_(("Accepted", "Resolved", "Rejected"))
    ).order_by(ReportEvent.created_at)
    for event in db.scalars(events):
        if event.report_id in ids:
            steps.setdefault(event.report_id, {})[event.to_status] = event
    return rows, steps


def area_name(db: Session, user: User, barangay: str | None) -> str | None:
    if user.role == "staff":
        return user.barangay.name if user.barangay_id else None
    return barangay or None


def in_period(event, start, end) -> bool:
    return event is not None and start <= as_utc(event.created_at) < end


@router.get("")
def summary(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    barangay: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, {"staff", "administrator"})
    low, high = period(start, end)
    rows, steps = load(db, user, barangay)
    reports = [report for report, _ in rows]
    received = [report for report in reports if low <= as_utc(report.created_at) < high]
    moved = {
        status: [report for report in reports if in_period(steps.get(report.id, {}).get(status), low, high)]
        for status in ("Accepted", "Resolved", "Rejected")
    }

    def count(items):
        return {"reports": len(items), "incidents": len({incident(item) for item in items})}

    def typical(status):
        waits = [hours(report.created_at, steps[report.id][status].created_at) for report in moved[status]]
        return round(median(waits), 1) if waits else None

    by_category = Counter(report.verified_category for report in received if report.verified_category)
    today = datetime.now(UTC)
    ages = Counter()
    for report in reports:
        if report.status in OPEN:
            age = (today - as_utc(report.created_at)).days
            ages["up_to_7_days" if age <= 7 else "8_to_30_days" if age <= 30 else "over_30_days"] += 1
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "barangay": area_name(db, user, barangay),
        # With barangays loaded, a staff account without one sees nothing: not the same as seeing all of them.
        "unassigned": user.role == "staff" and not user.barangay_id and barangays.active(db),
        "received": count(received),
        "accepted": count(moved["Accepted"]),
        "resolved": count(moved["Resolved"]),
        "rejected": count(moved["Rejected"]),
        "median_hours_to_accept": typical("Accepted"),
        "median_hours_to_resolve": typical("Resolved"),
        "verified_categories": [
            {"category": name, "reports": by_category[name]} for name in CATEGORIES if by_category[name]
        ],
        "not_yet_verified": sum(1 for report in received if not report.verified_category and report.status != "Rejected"),
        "rejection_reasons": [
            {"reason": reason, "reports": total}
            for reason, total in Counter(
                steps[report.id]["Rejected"].rejection_reason for report in moved["Rejected"]
            ).most_common()
        ],
        "open_now": {
            "up_to_7_days": ages["up_to_7_days"],
            "8_to_30_days": ages["8_to_30_days"],
            "over_30_days": ages["over_30_days"],
            "total": sum(ages.values()),
        },
    }


def cell(value) -> str:
    """Spreadsheets run a cell starting with these as a formula, and street names come from outside the app."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@", "\t", "\r"} else text


@router.get(".csv")
def spreadsheet(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    barangay: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_role(user, {"staff", "administrator"})
    low, high = period(start, end)
    rows, steps = load(db, user, barangay)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(COLUMNS)
    for report, name in rows:
        if not low <= as_utc(report.created_at) < high:
            continue
        step = steps.get(report.id, {})
        rejected = step.get("Rejected")
        writer.writerow(
            [
                cell(value)
                for value in (
                    f"#{report.id[:8].upper()}",
                    manila_day(report.created_at),
                    name,
                    report.location_label,
                    report.resident_category,
                    report.verified_category,
                    report.status,
                    manila_day(step["Accepted"].created_at) if "Accepted" in step else "",
                    manila_day(step["Resolved"].created_at) if "Resolved" in step else "",
                    manila_day(rejected.created_at) if rejected else "",
                    rejected.rejection_reason if rejected else "",
                    f"#{report.case_id[:8].upper()}" if report.case_id and report.case_confirmed else "",
                )
            ]
        )
    filename = f"barangai-reports-{start.isoformat()}-to-{end.isoformat()}.csv"
    # The byte-order mark makes Excel read ñ correctly.
    return Response(
        "﻿" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
