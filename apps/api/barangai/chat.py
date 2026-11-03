"""Resident chatbot: report-status answers from the database, and general guidance from a Cloudflare Workers AI
model when configured, with fixed guidance in three languages whenever it is not."""

import os
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import rate_limit, require_csrf, require_role
from .db import get_db
from .models import User
from .reports import authorized_report

router = APIRouter()

# The photo-description model (vision.py), confirmed to work on Workers Free. The earlier SEA-LION model is
# built on Gemma, and Gemma 3 is not allowed on that plan.
MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct"
LANGUAGES = {"en": "English", "fil": "Filipino", "taglish": "Taglish"}
TOPICS = (
    ("flooding", ("flood", "baha")),
    ("potholes", ("pothole", "lubak")),
    ("fallen trees", ("fallen tree", "natumbang puno")),
    ("uncollected garbage", ("garbage", "basura", "trash")),
    ("damaged signage", ("signage", "damaged sign", "karatula")),
    ("broken streetlights", ("streetlight", "street light", "ilaw sa kalye", "poste")),
    ("exposed wiring", ("wiring", "exposed wire", "live wire", "kawad", "kable", "kuryente")),
)


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    language: str = "en"
    report_id: str | None = None


GUIDANCE = {
    "en": "To report a concern, add a clear photo, pin the location, choose a category, and submit it. Keep away from immediate danger and contact local emergency services if needed.",
    "fil": "Para mag-ulat ng problema, magdagdag ng malinaw na larawan, ituro ang lokasyon, pumili ng kategorya, at isumite. Lumayo sa agarang panganib at tumawag sa lokal na serbisyong pang-emerhensiya kung kailangan.",
    "taglish": "Para mag-report, add a clear photo, i-pin ang location, piliin ang category, at i-submit. Lumayo sa danger at contact local emergency services kung kailangan.",
}

FILIPINO_STATUSES = {"Pending": "Naghihintay", "Under Verification": "Sinusuri", "Accepted": "Tinanggap",
                     "In Progress": "Isinasagawa", "Resolved": "Nalutas", "Rejected": "Tinanggihan"}

STATUS = {
    "en": "Your report is currently {status}.",
    "fil": "Ang katayuan ng iyong ulat ay {status}.",
    "taglish": "Ang status ng report mo ay {status}.",
}


def guidance_topic(message: str) -> str:
    lower = message.casefold()
    for topic, terms in TOPICS:
        if any(term in lower for term in terms):
            return topic
    return "barangay concern reporting"


def workers_ai_guidance(message: str, language: str) -> str | None:
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_WORKERS_AI_TOKEN", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account) or not token:
        return None
    topic = guidance_topic(message)
    prompt = (f"Give brief, general {LANGUAGES[language]} safety and reporting guidance about {topic}. "
              "Do not state any specific report status, local contact details, addresses, or phone numbers.")
    try:
        response = httpx.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{MODEL}",
            headers={"Authorization": f"Bearer {token}"},
            json={"messages": [
                {"role": "system", "content": "You give cautious general guidance for a Philippine barangay. Keep it concise and do not invent case details."},
                {"role": "user", "content": prompt},
            ], "max_tokens": 160, "temperature": 0.3},
            timeout=8.0,
        )
        if response.status_code != 200:
            return None
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("success") is not True or not isinstance(data.get("result"), dict):
        return None
    answer = data["result"].get("response")
    if not isinstance(answer, str):
        return None
    answer = answer.strip()
    if not answer or len(answer) > 800 or re.search(r"https?://|www\.|\b\+?\d[\d -]{6,}\d\b", answer, re.I):
        return None
    return answer


@router.post("/chat")
def chat(body: ChatInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"resident"})
    rate_limit(request, "chat", count=30, key=user.id)
    if body.language not in GUIDANCE:
        raise HTTPException(422, "Unsupported language")
    reply = GUIDANCE[body.language]
    source = "deterministic"
    if body.report_id is not None:
        report = authorized_report(body.report_id, db, user)
        status = FILIPINO_STATUSES.get(report.status, report.status) if body.language == "fil" else report.status
        reply = STATUS[body.language].format(status=status)
    else:
        generated = workers_ai_guidance(body.message, body.language)
        if generated is not None:
            reply = generated
            source = "workers_ai"
    return {"reply": reply, "language": body.language, "llm_available": source == "workers_ai",
            "source": source, "report_id": body.report_id}


