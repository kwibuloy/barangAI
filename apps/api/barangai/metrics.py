"""Product figures from the database, with no third-party analytics. Prints counts and times only, never who.

    python -m barangai.metrics [--days 30] [--include-demo]

Signup time comes from when an account accepted the terms, so accounts older than that record aren't counted for
activation. Demo accounts (@demo.test) are left out unless asked for.
"""

import argparse
from datetime import UTC, datetime, timedelta
from statistics import median

from sqlalchemy import select

from .db import session_for_url
from .models import Report, ReportEvent, StaffAction, User


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def hours(start: datetime, end: datetime) -> float:
    return (aware(end) - aware(start)).total_seconds() / 3600


def typical(values: list[float]) -> dict:
    return {"measured": len(values), "median_hours": round(median(values), 1) if values else None}


def share(hits: int, total: int) -> dict:
    return {"count": hits, "of": total, "percent": round(100 * hits / total) if total else None}


def compute(db, days: int = 30, at: datetime | None = None, include_demo: bool = False) -> dict:
    at = at or datetime.now(UTC)
    since = at - timedelta(days=days)
    residents = db.execute(select(User.id, User.email, User.terms_accepted_at).where(User.role == "resident")).all()
    residents = [row for row in residents if include_demo or not row.email.endswith("@demo.test")]
    resident_ids = {row.id for row in residents}
    reports = [
        row
        for row in db.execute(select(Report.id, Report.resident_id, Report.created_at)).all()
        if row.resident_id in resident_ids
    ]
    by_resident = {}
    for row in sorted(reports, key=lambda item: aware(item.created_at)):
        by_resident.setdefault(row.resident_id, []).append(aware(row.created_at))

    # The first thing staff did on each report: a status change, or a note other than an automatic one.
    first_response, accepted, resolved = {}, {}, {}
    for report_id, to_status, created_at in db.execute(
        select(ReportEvent.report_id, ReportEvent.to_status, ReportEvent.created_at)
        .where(ReportEvent.from_status.is_not(None))
        .order_by(ReportEvent.created_at)
    ):
        first_response.setdefault(report_id, created_at)
        if to_status == "Accepted":
            accepted.setdefault(report_id, created_at)
        elif to_status == "Resolved":
            resolved.setdefault(report_id, created_at)
    for report_id, created_at in db.execute(
        select(StaffAction.report_id, StaffAction.created_at).where(StaffAction.kind != "system")
    ):
        if report_id not in first_response or aware(created_at) < aware(first_response[report_id]):
            first_response[report_id] = created_at

    recent = [row for row in reports if aware(row.created_at) >= since]
    # Only reports that have had a full week, so new ones don't count as ignored.
    week_old = [row for row in recent if aware(row.created_at) <= at - timedelta(days=7)]
    answered = [
        row for row in week_old if row.id in first_response and hours(row.created_at, first_response[row.id]) <= 7 * 24
    ]
    signed_up = [
        row
        for row in residents
        if row.terms_accepted_at and since <= aware(row.terms_accepted_at) <= at - timedelta(days=7)
    ]
    activated = [
        row
        for row in signed_up
        if row.id in by_resident and by_resident[row.id][0] <= aware(row.terms_accepted_at) + timedelta(days=7)
    ]
    # Everyone whose first report has had 60 days, whenever it was, so this doesn't follow --days.
    settled = [dates for dates in by_resident.values() if dates[0] <= at - timedelta(days=60)]
    returned = [dates for dates in settled if len(dates) > 1 and dates[1] <= dates[0] + timedelta(days=60)]
    return {
        "days": days,
        "reports": len(recent),
        "first_response": typical(
            [hours(row.created_at, first_response[row.id]) for row in recent if row.id in first_response]
        ),
        "response_within_7_days": share(len(answered), len(week_old)),
        "time_to_accept": typical([hours(row.created_at, accepted[row.id]) for row in recent if row.id in accepted]),
        "time_to_resolve": typical([hours(row.created_at, resolved[row.id]) for row in recent if row.id in resolved]),
        "activation_7_days": share(len(activated), len(signed_up)),
        "second_report_60_days": share(len(returned), len(settled)),
    }


def describe(result: dict) -> str:
    def times(item):
        return (
            f"{item['median_hours']} h median, {item['measured']} measured" if item["measured"] else "nothing measured"
        )

    def part(item):
        return f"{item['percent']}% ({item['count']} of {item['of']})" if item["of"] else "no one to measure yet"

    return "\n".join(
        (
            f"Reports received in the last {result['days']} days: {result['reports']}",
            f"First staff response: {times(result['first_response'])}",
            f"Reports with a staff response within 7 days (reports over a week old): {part(result['response_within_7_days'])}",
            f"Time to accept: {times(result['time_to_accept'])}",
            f"Time to resolve: {times(result['time_to_resolve'])}",
            f"Residents who reported within 7 days of signing up: {part(result['activation_7_days'])}",
            f"Second report within 60 days of the first, all time: {part(result['second_report_60_days'])}",
            "Monthly report use: not tracked. Nothing records who opens or downloads it.",
        )
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--include-demo", action="store_true")
    args = parser.parse_args(argv)
    with session_for_url() as db:
        print(describe(compute(db, args.days, include_demo=args.include_demo)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
