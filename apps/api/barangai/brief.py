"""Kap's daily brief for staff: today's numbers from the database, optionally put into words by the LLM.

The facts are counted here, never by the model. When Cloudflare Workers AI is configured, the model only rewrites
those facts as a short paragraph, and the answer is thrown away unless every number in it is one of the facts' own
numbers; otherwise, and without Cloudflare, a fixed template says the same thing. Staff only.
"""

import hashlib
import json
import os
import re
import threading
import time
from collections import Counter
from datetime import UTC, timedelta

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, true
from sqlalchemy.orm import Session

from . import barangays, priority
from .auth import get_current_user, require_role
from .chat import MODEL
from .db import get_db
from .models import Report, ReportEvent, User, now

router = APIRouter()
OPEN = ("Pending", "Under Verification", "Accepted", "In Progress")
LANGUAGES = {"en": "English", "fil": "Filipino"}
NAMES = {
    "en": {"flooding": "flooding", "potholes": "pothole", "fallen_trees": "fallen tree",
           "fire_hazard": "fire or fire hazard", "uncollected_garbage": "uncollected garbage", "damaged_signage": "damaged sign",
           "broken_streetlights": "broken streetlight", "exposed_wiring": "exposed wiring", "other": "other concern"},
    "fil": {"flooding": "baha", "potholes": "lubak", "fallen_trees": "natumbang puno",
            "fire_hazard": "sunog o panganib ng sunog", "uncollected_garbage": "basurang hindi nakolekta", "damaged_signage": "sirang karatula",
            "broken_streetlights": "sirang ilaw sa kalye", "exposed_wiring": "nakalantad na kable",
            "other": "ibang problema"},
}
CACHE_SECONDS = 10 * 60
_cache: dict[str, tuple[float, str]] = {}
_lock = threading.Lock()


def aware(value):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def facts(db: Session, visible=true()):
    """Numbers staff can check against the queue themselves."""
    current = now()
    day_ago = current - timedelta(days=1)
    reports = db.scalars(select(Report).where(visible)).all()
    open_reports = [report for report in reports if report.status in OPEN]
    scores = priority.for_reports(db, open_reports)
    high, seen_cases = [], set()
    for report in sorted(open_reports, key=lambda item: -(scores[item.id] or {}).get("score", 0)):
        score = scores[report.id]
        if not score or score["level"] != "high":
            continue
        group = report.case_id if report.case_confirmed and report.case_id else report.id
        if group in seen_cases:
            continue
        seen_cases.add(group)
        high.append({"id": report.id, "category": report.verified_category or report.resident_category,
                     "place": report.location_label, "score": score["score"]})
    places = Counter(report.location_label for report in open_reports if report.location_label)
    hotspot = next(((place, count) for place, count in places.most_common(1) if count >= 2), None)
    resolved = db.scalars(select(ReportEvent.report_id).where(
        ReportEvent.to_status == "Resolved", ReportEvent.created_at >= day_ago,
        ReportEvent.report_id.in_(select(Report.id).where(visible)))).all()
    return {
        "open": len(open_reports),
        "waiting": sum(report.status in ("Pending", "Under Verification") for report in open_reports),
        "new_today": sum(aware(report.created_at) >= day_ago for report in reports),
        "resolved_today": len(set(resolved)),
        "waiting_over_a_day": sum(report.status == "Pending" and aware(report.created_at) < day_ago
                                  for report in open_reports),
        "high_priority": high[:3],
        "high_priority_count": len(high),
        "hotspot": {"place": hotspot[0], "open": hotspot[1]} if hotspot else None,
    }


def count(number, noun):
    return f"{number} {noun}{'' if number == 1 else 's'}"


def template(data, language):
    names = NAMES[language]
    if language == "fil":
        lines = [f"{data['open']} bukas na ulat; {data['waiting']} ang naghihintay ng pagsusuri. "
                 f"{data['new_today']} bago at {data['resolved_today']} nalutas sa nakaraang 24 oras."]
        if data["high_priority"]:
            top = data["high_priority"][0]
            lines.append(f"Unahin: {names.get(top['category'], top['category'])}"
                         + (f" sa {top['place']}" if top["place"] else "") + ".")
        if data["waiting_over_a_day"]:
            lines.append(f"{data['waiting_over_a_day']} ulat ang naghihintay nang higit sa isang araw.")
        if data["hotspot"]:
            lines.append(f"Maraming ulat sa {data['hotspot']['place']} ({data['hotspot']['open']}).")
        return " ".join(lines)
    lines = [f"{count(data['open'], 'open report')}, {data['waiting']} waiting for review. "
             f"{data['new_today']} new and {data['resolved_today']} resolved in the last 24 hours."]
    if data["high_priority"]:
        top = data["high_priority"][0]
        lines.append(f"Look first at the {names.get(top['category'], top['category'])} report"
                     + (f" on {top['place']}" if top["place"] else "") + ".")
    if data["waiting_over_a_day"]:
        waited = data["waiting_over_a_day"]
        lines.append(f"{count(waited, 'report')} {'has' if waited == 1 else 'have'} waited more than a day.")
    if data["hotspot"]:
        lines.append(f"Most open reports are around {data['hotspot']['place']} ({data['hotspot']['open']}).")
    return " ".join(lines)


# Spelled-out counts are checked too, so "three reports" cannot slip past the digit check.
NUMBER_WORDS = {
    word: value
    for value, words in enumerate([
        ("zero", "wala"), ("one", "isa", "isang"), ("two", "dalawa", "dalawang"), ("three", "tatlo", "tatlong"),
        ("four", "apat", "apat na"), ("five", "lima", "limang"), ("six", "anim", "anim na"), ("seven", "pito", "pitong"),
        ("eight", "walo", "walong"), ("nine", "siyam", "siyam na"), ("ten", "sampu", "sampung"),
        ("eleven", "labing-isa"), ("twelve", "labindalawa"), ("thirteen",), ("fourteen",), ("fifteen",),
        ("sixteen",), ("seventeen",), ("eighteen",), ("nineteen",), ("twenty", "dalawampu"),
    ])
    for word in words
}
WORD_PATTERN = re.compile(r"\b(" + "|".join(sorted((re.escape(w) for w in NUMBER_WORDS), key=len, reverse=True))
                          + r")\b", re.IGNORECASE)


def numbers_in(text):
    found = {int(value) for value in re.findall(r"\d+", text)}
    return found | {NUMBER_WORDS[match.lower()] for match in WORD_PATTERN.findall(text)}


def allowed_numbers(data):
    found = numbers_in(json.dumps(data))
    return found | {24, 1}  # "24 hours", "one day"


def written(data, language):
    """The model's paragraph, or None. Any number the facts do not contain discards the answer."""
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_WORKERS_AI_TOKEN", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account) or not token:
        return None
    shown = {**data, "high_priority": [{key: item[key] for key in ("category", "place")} for item in data["high_priority"]]}
    key = hashlib.sha256(json.dumps([shown, language], sort_keys=True).encode()).hexdigest()
    with _lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
            return cached[1]
    prompt = (f"Write a morning brief in {LANGUAGES[language]} for barangay staff, at most 3 short sentences, from "
              f"these facts only: {json.dumps(shown, ensure_ascii=False)}. Say what to look at first. Use only numbers "
              "that appear in the facts. No greetings, names, phone numbers or advice beyond the facts.")
    try:
        response = httpx.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{MODEL}",
            headers={"Authorization": f"Bearer {token}"},
            json={"messages": [
                {"role": "system", "content": "You summarise a barangay's open incident reports. Never invent facts."},
                {"role": "user", "content": prompt},
            ], "max_tokens": 160, "temperature": 0.2},
            timeout=8.0,
        )
        body = response.json() if response.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None
    result = body.get("result") if isinstance(body, dict) and body.get("success") else None
    answer = result.get("response") if isinstance(result, dict) else None
    if not isinstance(answer, str):
        return None
    answer = answer.strip()
    if not answer or len(answer) > 600 or re.search(r"https?://|www\.", answer) \
            or not numbers_in(answer) <= allowed_numbers(shown):
        return None
    with _lock:
        if len(_cache) > 64:
            _cache.clear()
        _cache[key] = (time.monotonic(), answer)
    return answer


def clear_cache():
    with _lock:
        _cache.clear()


@router.get("/staff/brief")
def daily_brief(language: str = Query("en"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_role(user, {"staff", "administrator"})
    language = language if language in LANGUAGES else "en"
    data = facts(db, barangays.report_filter(db, user))
    text = written(data, language)
    return {"summary": text or template(data, language), "source": "workers_ai" if text else "template",
            "facts": data, "generated_at": now().isoformat()}
