"""Suggested priority for staff: severity, recency and the number of independent residents, with its reasons.

A suggestion only. It never reorders the queue by itself, never changes a status and is never shown to residents.
The weights are untuned starting values chosen for clarity, not measured; staff judge every report themselves.
A grouped case is scored as a whole from its confirmed reports, so every report in it shows the same priority.
"""

from collections import Counter
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Report

# How serious each category usually is: live wires and floods endanger people, signs and garbage rarely do.
SEVERITY = {
    "exposed_wiring": 3,
    "fire_hazard": 3,
    "flooding": 3,
    "fallen_trees": 2,
    "potholes": 2,
    "broken_streetlights": 1,
    "uncollected_garbage": 1,
    "damaged_signage": 1,
    "other": 1,
}
# Safety flags from the vision model's look at the photos.
HAZARD = {"electrical_hazard": 2, "risk_to_people": 2, "blocks_road": 1}
# Each extra resident adds a point, up to three: a crowd confirms the issue, it does not make it endless.
MAX_RESIDENT_POINTS = 3
RECENT_DAYS = 3
LEVELS = ((6, "high"), (3, "medium"), (0, "low"))
CLOSED = ("Resolved", "Rejected")


def aware(value: datetime):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def score(reports: list[Report], today: datetime | None = None):
    """Priority of one incident from its reports (a lone report, or a case's confirmed reports)."""
    if not reports or all(report.status in CLOSED for report in reports):
        return None
    today = today or datetime.now(UTC)
    # Staff's verified category when there is one (the most common; on a tie the more severe), otherwise what the
    # first resident chose. Never the model's guess.
    verified = Counter(report.verified_category for report in reports if report.verified_category)
    if verified:
        category = max(verified, key=lambda name: (verified[name], SEVERITY.get(name, 1)))
    else:
        category = min(reports, key=lambda report: aware(report.created_at)).resident_category
    reasons = [{"code": "category", "detail": category, "points": SEVERITY.get(category, 1)}]
    for hazard in sorted({hazard for report in reports for hazard in report.hazards or []}):
        if hazard in HAZARD:
            reasons.append({"code": "hazard", "detail": hazard, "points": HAZARD[hazard]})
    residents = len({report.resident_id for report in reports})
    if residents > 1:
        reasons.append({"code": "residents", "detail": residents, "points": min(residents - 1, MAX_RESIDENT_POINTS)})
    days = (today - max(aware(report.created_at) for report in reports)).days
    if days <= RECENT_DAYS:
        reasons.append({"code": "recent", "detail": days, "points": 1})
    total = sum(reason["points"] for reason in reasons)
    level = next(name for floor, name in LEVELS if total >= floor)
    return {"level": level, "score": total, "reasons": reasons}


def for_reports(db: Session, reports: list[Report]):
    """Priority for each report id, scoring a grouped case once from all its confirmed reports."""
    case_ids = {report.case_id for report in reports if report.case_id and report.case_confirmed}
    members = {}
    if case_ids:
        for member in db.scalars(select(Report).where(Report.case_id.in_(case_ids), Report.case_confirmed.is_(True))):
            members.setdefault(member.case_id, []).append(member)
    scores = {case_id: score(group) for case_id, group in members.items()}
    return {
        report.id: scores[report.case_id] if report.case_id in scores and report.case_confirmed else score([report])
        for report in reports
    }
