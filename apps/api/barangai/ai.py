"""Combines the vision model (vision.py) and the checker (checker.py) into one form suggestion.

The vision model leads: it is the only one that can write a description. The checker confirms its category
(both agree: filled with no warning), stands in when the vision model is unavailable, and always supplies the
duplicate-review embedding. Results are kept briefly by photo hash so submitting a previewed photo neither
spends Cloudflare neurons again nor lets the client choose the model's category.
"""

import hashlib
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from . import checker, vision

log = logging.getLogger(__name__)
CACHE_SECONDS, CACHE_SIZE = 30 * 60, 128
_cache: dict[str, tuple[float, "Analysis"]] = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai")


@dataclass(frozen=True)
class Analysis:
    category: str | None
    confidence: float | None  # the checker's, when it ran; the vision model gives no usable confidence
    source: str | None  # "agreed", "vision", "checker" or None
    needs_check: bool  # the form asks the resident to look again (see combine)
    problem_seen: bool  # False when nothing in the photo looks broken; the category is then only a guess
    description: str | None
    hazards: tuple[str, ...]
    embedding: list[float] | None
    embedding_version: str | None

    @property
    def available(self) -> bool:
        return self.source is not None or self.embedding is not None or not self.problem_seen


# A daytime photo cannot show whether a streetlight works, so this category is always confirmed by the resident.
ALWAYS_CHECK = {"broken_streetlights"}


def combine(seen: vision.VisionResult | None, checked: checker.CheckerResult | None) -> Analysis:
    vision_category = seen.category if seen else None
    checker_category = checked.category if checked else None
    uncertain = bool(seen and not seen.problem_seen)
    if vision_category:
        category = vision_category
        source = "agreed" if checker_category == vision_category else "vision"
        # Nothing looks broken, or the two models disagree: keep the guess but ask the resident to verify it.
        needs_check = uncertain or (checker_category is not None and checker_category != vision_category)
    elif checker_category:
        # The checker alone is the weaker model: its guess is always shown as one to check.
        category, source, needs_check = checker_category, "checker", True
    else:
        category, source, needs_check = None, None, False
    return Analysis(
        category=category,
        confidence=checked.confidence if checked else None,
        source=source,
        needs_check=needs_check or category in ALWAYS_CHECK,
        problem_seen=not uncertain,
        description=seen.description if seen else None,
        hazards=seen.hazards if seen else (),
        embedding=checked.embedding if checked else None,
        embedding_version=checked.model_version if checked else None,
    )


def photo_key(sanitized_image: bytes) -> str:
    return hashlib.sha256(sanitized_image).hexdigest()


def safely(model, *args):
    """A model's answer, or None if it failed unexpectedly: a broken suggestion never blocks a report."""
    try:
        return model(*args)
    except Exception:
        log.exception("%s.%s failed; the form continues without it", model.__module__, model.__name__)
        return None


def analyze(sanitized_image: bytes, language: str = "en") -> Analysis:
    """Preview: both models run side by side; the result waits in the cache for submission."""
    seen = _pool.submit(safely, vision.describe, sanitized_image, language)
    checked = _pool.submit(safely, checker.check, sanitized_image)
    result = combine(seen.result(), checked.result())
    with _lock:
        now = time.monotonic()
        for key in [key for key, (stamp, _) in _cache.items() if now - stamp > CACHE_SECONDS]:
            del _cache[key]
        if len(_cache) >= CACHE_SIZE:
            del _cache[min(_cache, key=lambda key: _cache[key][0])]
        _cache[photo_key(sanitized_image)] = (now, result)
    return result


def for_submission(sanitized_image: bytes) -> Analysis:
    """Submission: reuse the preview's analysis; without one, run only the free local checker."""
    with _lock:
        cached = _cache.get(photo_key(sanitized_image))
    if cached and time.monotonic() - cached[0] <= CACHE_SECONDS:
        return cached[1]
    return combine(None, safely(checker.check, sanitized_image))


def clear_cache() -> None:
    with _lock:
        _cache.clear()
