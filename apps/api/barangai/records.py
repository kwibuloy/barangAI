"""What a barangay secretary needs for reporting upward: counted from the records, within the caller's barangay.

Every figure is computed from stored reports and status events, never estimated. Exports leave the app's access
control, so they carry no resident identities, photos, descriptions, staff notes or AI output.
"""

import csv
import io
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import barangays
from .auth import get_current_user, rate_limit, require_role
from .db import demo_mode, get_db
from .models import CATEGORIES, Barangay, Report, ReportEvent, User
from .usage import MANILA

router = APIRouter(prefix="/staff/records", tags=["records"])
fixed_router = APIRouter(prefix="/barangays", tags=["records"])

OPEN = {"Pending", "Under Verification", "Accepted", "In Progress"}
OUTSIDE = "outside"
MAX_DAYS = 366
DEMO_LABEL = "Demo data: synthetic records only"
# Below this many fixed incidents in a month, residents see no figures: one household's report must not be readable
# from a barangay's total.
MIN_INCIDENTS_SHOWN = 3
ROLLUP_COLUMNS = (
    "Barangay",
    "Reports received",
    "Incidents received",
    "Reports resolved",
    "Incidents resolved",
    "Typical days to resolve",
    "Reports open over 30 days",
)
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


def previous_period(start: date, end: date, today: date) -> tuple[date, date]:
    """What a period is compared with: the month before a whole month, or else the same length just before it. A
    month still running only has so many days to count, so the month before is cut to the same day of the month."""
    month_end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if start.day == 1 and end == month_end:
        last = start - timedelta(days=1)
        first = last.replace(day=1)
        if start <= today <= end:
            return first, min(last, first + timedelta(days=today.day - 1))
        return first, last
    return start - (end - start) - timedelta(days=1), start - timedelta(days=1)


def counted(items) -> dict:
    return {"reports": len(items), "incidents": len({incident(item) for item in items})}


def figures(reports: list[Report], steps: dict, low: datetime, high: datetime) -> dict:
    """The period's counts and typical times. One definition, so a month and the month it is compared with agree."""
    moved = {
        status: [report for report in reports if in_period(steps.get(report.id, {}).get(status), low, high)]
        for status in ("Accepted", "Resolved", "Rejected")
    }

    def typical(status):
        waits = [hours(report.created_at, steps[report.id][status].created_at) for report in moved[status]]
        return round(median(waits), 1) if waits else None

    return {
        "received": counted([report for report in reports if low <= as_utc(report.created_at) < high]),
        "accepted": counted(moved["Accepted"]),
        "resolved": counted(moved["Resolved"]),
        "rejected": counted(moved["Rejected"]),
        "median_hours_to_accept": typical("Accepted"),
        "median_hours_to_resolve": typical("Resolved"),
    }


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
    rejected = [report for report in reports if in_period(steps.get(report.id, {}).get("Rejected"), low, high)]
    by_category = Counter(report.verified_category for report in received if report.verified_category)
    today = datetime.now(UTC)
    ages = Counter()
    for report in reports:
        if report.status in OPEN:
            age = (today - as_utc(report.created_at)).days
            ages["up_to_7_days" if age <= 7 else "8_to_30_days" if age <= 30 else "over_30_days"] += 1
    earlier_start, earlier_end = previous_period(start, end, today.astimezone(MANILA).date())
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "barangay": area_name(db, user, barangay),
        # With barangays loaded, a staff account without one sees nothing: not the same as seeing all of them.
        "unassigned": user.role == "staff" and not user.barangay_id and barangays.active(db),
        **figures(reports, steps, low, high),
        "previous": {
            "from": earlier_start.isoformat(),
            "to": earlier_end.isoformat(),
            **figures(reports, steps, *period(earlier_start, earlier_end)),
        },
        "verified_categories": [
            {"category": name, "reports": by_category[name]} for name in CATEGORIES if by_category[name]
        ],
        "not_yet_verified": sum(1 for report in received if not report.verified_category and report.status != "Rejected"),
        "rejection_reasons": [
            {"reason": reason, "reports": total}
            for reason, total in Counter(steps[report.id]["Rejected"].rejection_reason for report in rejected).most_common()
        ],
        "open_now": {
            "up_to_7_days": ages["up_to_7_days"],
            "8_to_30_days": ages["8_to_30_days"],
            "over_30_days": ages["over_30_days"],
            "total": sum(ages.values()),
        },
    }


def rollup_rows(db: Session, user: User, low: datetime, high: datetime) -> tuple[list[dict], dict]:
    """One row per barangay holding a report, in name order, with the reports outside every boundary last; and the total."""
    rows, steps = load(db, user, None)
    today = datetime.now(UTC)
    groups: dict[str | None, list[Report]] = {}
    for report, name in rows:
        groups.setdefault(name, []).append(report)

    def row(name, reports):
        counts = figures(reports, steps, low, high)
        return {
            "barangay": name,
            "received": counts["received"],
            "resolved": counts["resolved"],
            "median_hours_to_resolve": counts["median_hours_to_resolve"],
            "open_over_30_days": sum(
                1 for report in reports if report.status in OPEN and (today - as_utc(report.created_at)).days > 30
            ),
        }

    named = [row(name, groups[name]) for name in sorted(name for name in groups if name)]
    outside = [row(None, groups[None])] if None in groups else []
    return named + outside, row(None, [report for report, _ in rows])


def has_activity(row: dict) -> bool:
    return bool(row["received"]["reports"] or row["resolved"]["reports"] or row["open_over_30_days"])


@router.get("/rollup")
def rollup(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Every barangay side by side, for administrators: counts only, nothing about any one report."""
    require_role(user, {"administrator"})
    low, high = period(start, end)
    rows, total = rollup_rows(db, user, low, high)
    shown = [row for row in rows if has_activity(row)]
    named = len([row for row in shown if row["barangay"]])
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "rows": shown,
        "total": total,
        "quiet_barangays": max(0, len(barangays.all_barangays(db)) - named),
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
    if demo_mode():
        writer.writerow([DEMO_LABEL])
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


@router.get("/rollup.csv")
def rollup_spreadsheet(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The rollup with every barangay, including those with nothing to count, so a blank is never mistaken for one
    left out. The same export rules as the monthly file: counts and names of places only."""
    require_role(user, {"administrator"})
    low, high = period(start, end)
    rows, total = rollup_rows(db, user, low, high)
    seen = {row["barangay"] for row in rows}
    empty = {"received": {"reports": 0, "incidents": 0}, "resolved": {"reports": 0, "incidents": 0},
             "median_hours_to_resolve": None, "open_over_30_days": 0}
    quiet = [{"barangay": area.name, **empty} for area in barangays.all_barangays(db) if area.name not in seen]
    named = sorted([row for row in [*rows, *quiet] if row["barangay"]], key=lambda row: row["barangay"])
    outside = [{**row, "barangay": "Outside every boundary"} for row in rows if not row["barangay"]]
    output = io.StringIO()
    writer = csv.writer(output)
    if demo_mode():
        writer.writerow([DEMO_LABEL])
    writer.writerow(ROLLUP_COLUMNS)
    for row in [*named, *outside, {**total, "barangay": "All barangays"}]:
        writer.writerow(
            [
                cell(value)
                for value in (
                    row["barangay"],
                    row["received"]["reports"],
                    row["received"]["incidents"],
                    row["resolved"]["reports"],
                    row["resolved"]["incidents"],
                    # A file leaves access control: no time for a single report, and half days otherwise.
                    round(row["median_hours_to_resolve"] / 12) / 2
                    if row["resolved"]["incidents"] >= MIN_INCIDENTS_SHOWN and row["median_hours_to_resolve"] is not None
                    else "",
                    row["open_over_30_days"],
                )
            ]
        )
    filename = f"barangai-rollup-{start.isoformat()}-to-{end.isoformat()}.csv"
    return Response(
        "\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@fixed_router.get("/fixed")
def fixed_this_month(
    request: Request,
    barangay: str | None = Query(None, max_length=120),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """What a barangay fixed this month, for anyone signed in: counts only, per incident, from staff-verified reports.

    No reports, staff, places or AI flags, and no figures at all below MIN_INCIDENTS_SHOWN, nor for a category below it.
    """
    rate_limit(request, "barangay-fixed", 60, key=user.id)
    if barangay:
        area = db.scalar(select(Barangay).where(Barangay.name == barangay))
    elif lat is not None and lng is not None:
        found = barangays.barangay_id_for(db, lat, lng)
        area = db.get(Barangay, found) if found else None
    else:
        raise HTTPException(422, "Choose a barangay")
    today = datetime.now(UTC).astimezone(MANILA).date()
    answer = {"barangay": area.name if area else None, "month": today.strftime("%Y-%m"), "enough": False,
              "resolved_incidents": None, "typical_days": None, "categories": []}
    if not area:
        return answer
    low = datetime.combine(today.replace(day=1), time.min, MANILA).astimezone(UTC)
    high = datetime.combine(today + timedelta(days=1), time.min, MANILA).astimezone(UTC)
    rows = db.execute(
        select(Report, ReportEvent.created_at)
        .join(ReportEvent, ReportEvent.report_id == Report.id)
        .where(
            Report.barangay_id == area.id,
            Report.status == "Resolved",
            Report.verified_category.is_not(None),
            ReportEvent.to_status == "Resolved",
        )
    ).all()
    incidents: dict[str, dict] = {}
    for report, resolved_at in rows:
        item = incidents.setdefault(incident(report), {"category": report.verified_category, "starts": [], "ends": []})
        item["starts"].append(as_utc(report.created_at))
        item["ends"].append(as_utc(resolved_at))
    done = [item for item in incidents.values() if low <= max(item["ends"]) < high]
    if len(done) < MIN_INCIDENTS_SHOWN:
        return answer
    waits = [hours(min(item["starts"]), max(item["ends"])) / 24 for item in done]
    by_category = Counter(item["category"] for item in done)
    return {
        **answer,
        "enough": True,
        "resolved_incidents": len(done),
        # To the nearest half day: enough to set expectations, and no exact time to read one case from.
        "typical_days": round(median(waits) * 2) / 2,
        "categories": [
            {"category": name, "incidents": total}
            for name, total in by_category.most_common()
            if total >= MIN_INCIDENTS_SHOWN
        ],
    }
