"""Photo-to-form filler: a Cloudflare Workers AI vision model reads the cleaned photo and returns the category,
a short description and hazard flags for the report form. The resident reviews and edits all of it.

Opt-in: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_WORKERS_AI_TOKEN (the chatbot's account). The free tier gives
10,000 neurons a day and never bills; when it runs out, or on any error, this returns None and the checker
(checker.py) or the resident fills the form instead.
"""

import base64
import json
import logging
import os
import re
from dataclasses import dataclass

import httpx

from .models import CATEGORIES

log = logging.getLogger(__name__)
# Mistral Small 3.1: works on a Workers Free account (Gemma 3 is not allowed there) and is Apache-2.0.
DEFAULT_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct"
HAZARDS = ("electrical_hazard", "blocks_road", "risk_to_people")
LANGUAGES = {"en": "English", "fil": "Filipino", "taglish": "Taglish"}
UNSAFE_TEXT = re.compile(r"https?://|www\.|\b\+?\d[\d -]{6,}\d\b|@\w", re.I)
# Starts the description when nothing in the photo looks broken, so the resident knows to check it.
UNCERTAIN = {
    "en": "The AI is uncertain whether this photo shows a problem. Please check.",
    "fil": "Hindi tiyak ang AI kung may problema sa larawang ito. Pakisuri.",
    "taglish": "Hindi sure ang AI kung may problema sa photo na ito. Paki-check.",
}


@dataclass(frozen=True)
class VisionResult:
    category: str | None  # None when the photo shows no barangay concern
    description: str | None
    hazards: tuple[str, ...]
    model: str
    problem_seen: bool = True  # False when nothing in the photo looks broken; the category is then a guess


def configured():
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_WORKERS_AI_TOKEN", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account) or not token:
        return None
    return account, token, os.environ.get("CLOUDFLARE_VISION_MODEL", DEFAULT_MODEL)


def instructions(language: str) -> str:
    return (
        "You help residents of a Philippine barangay report community problems from one photo. "
        "Decide whether a problem is clearly visible: damage, breakage, a blockage, a spill, flooding or danger. "
        "Objects that look intact or working are not problems: a standing streetlight with no visible damage, a "
        "readable undamaged sign, a healthy standing tree, a smooth road or a tidy closed bin. Set problem_visible "
        "to true only when a problem is clearly visible. "
        f"Always choose the one closest category from: {', '.join(CATEGORIES)}, even when no problem is visible. "
        f"Write a factual description in {LANGUAGES.get(language, 'English')}, one or two short sentences, about what is "
        "visible: the problem, its size and what it affects. Give size or depth only as a rough everyday estimate "
        "that something visible supports, such as a tyre, curb, step, car or person (for example ankle-deep or "
        "knee-deep water, a pothole about a tyre wide), say 'about', and leave it out when nothing gives a sense of "
        "scale. Never give measurements in centimetres or metres. Never identify or describe people's faces, names, plate "
        "numbers, addresses, phone numbers or other personal details, and do not guess the location. "
        f"List any hazards that clearly apply from: {', '.join(HAZARDS)}. "
        'Reply with JSON only: {"category": "...", "problem_visible": true, "description": "...", "hazards": ["..."]}'
    )


def request_body(model: str, image: bytes, language: str) -> tuple[str, dict]:
    """Native Workers AI endpoint. Most vision models take the image as a data URI inside the message;
    Llama 3.2 Vision uses its own `image` field (and needs a one-time licence "agree" call first)."""
    encoded = base64.b64encode(image).decode()
    if "llama-3.2" in model:
        return f"ai/run/{model}", {
            "messages": [{"role": "user", "content": instructions(language)}],
            "image": encoded,
            "max_tokens": 220,
            "temperature": 0.2,
        }
    return f"ai/run/{model}", {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instructions(language)},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}},
                ],
            }
        ],
        "max_tokens": 220,
        "temperature": 0.2,
    }


def reply_text(data) -> str | None:
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("choices"), list) and data["choices"]:
        content = data["choices"][0].get("message", {}).get("content")
        return content if isinstance(content, str) else None
    result = data.get("result")
    if data.get("success") is not True or not isinstance(result, dict):
        return None
    response = result.get("response")
    # Some models return the JSON already parsed; turn it back into text for parse().
    if isinstance(response, dict):
        return json.dumps(response)
    if isinstance(response, str):
        return response
    choices = result.get("choices")
    if isinstance(choices, list) and choices:
        content = choices[0].get("message", {}).get("content")
        return content if isinstance(content, str) else None
    return None


def parse(text: str, model: str, language: str = "en") -> VisionResult | None:
    """Accept only the agreed shape; anything else counts as no answer."""
    match = re.search(r"\{.*\}", text, re.S)
    try:
        data = json.loads(match.group(0)) if match else None
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    category = data.get("category")
    category = category.strip().lower() if isinstance(category, str) else None
    # Nothing looks broken (or the model answered "none"): keep its closest category as a guess to check.
    problem_seen = data.get("problem_visible") is not False and category not in {"none", "no_problem", "null"}
    if category not in CATEGORIES:
        category = None
    description = data.get("description")
    description = " ".join(description.split())[:400] if isinstance(description, str) else None
    if not description or UNSAFE_TEXT.search(description):
        description = None
    raw_hazards = data.get("hazards") if isinstance(data.get("hazards"), list) else []
    hazards = tuple(h for h in HAZARDS if h in {str(item).strip().lower() for item in raw_hazards})
    if not problem_seen:
        note = UNCERTAIN.get(language, UNCERTAIN["en"])
        description = f"{note} {description}" if description else note
        hazards = ()
    if category is None and not description:
        return None
    return VisionResult(category, description, hazards, model, problem_seen)


def shrink(image: bytes, longest: int = 1024) -> bytes:
    """A smaller copy for the model: fewer image tokens means fewer neurons per report."""
    import io

    from PIL import Image

    with Image.open(io.BytesIO(image)) as picture:
        if max(picture.size) <= longest:
            return image
        picture.thumbnail((longest, longest), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        picture.convert("RGB").save(output, format="JPEG", quality=82)
        return output.getvalue()


def cloudflare_error(response: httpx.Response) -> str:
    """Cloudflare's own error text (never the request or its token), so failures are obvious in the log."""
    try:
        errors = response.json().get("errors") or []
        return (
            "; ".join(str(error.get("message", ""))[:200] for error in errors if isinstance(error, dict)) or "no detail"
        )
    except (ValueError, AttributeError):
        return "no detail"


def describe(sanitized_image: bytes, language: str = "en", model: str | None = None) -> VisionResult | None:
    settings = configured()
    if not settings:
        return None
    account, token, default_model = settings
    model = model or default_model
    path, body = request_body(model, shrink(sanitized_image), language)
    try:
        response = httpx.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/{path}",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
            timeout=float(os.environ.get("CLOUDFLARE_VISION_TIMEOUT", "20")),
        )
        if response.status_code != 200:
            log.warning(
                "Vision model %s answered %s (%s); the form falls back to the checker",
                model,
                response.status_code,
                cloudflare_error(response),
            )
            return None
        text = reply_text(response.json())
    except (httpx.HTTPError, ValueError):
        log.warning("Vision model %s unavailable; the form falls back to the checker", model)
        return None
    return parse(text, model, language) if text else None
