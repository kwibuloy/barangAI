"""Street names for report pins, via OpenStreetMap's Nominatim reverse geocoder.

Server-side so the browser does not send pins to Nominatim (map images do come from OpenStreetMap's tile servers,
loaded by the browser), and so Nominatim's usage policy holds: an
identifying user agent, at most one request a second, cached answers. Coordinates are rounded to about 11 m
before they leave the server. Opt-in with GEOCODER=nominatim; set GEOCODER_CONTACT to an email address for the
user agent. Without it, residents and staff see coordinates only.
"""

import os
import threading
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .auth import get_current_user, rate_limit
from .models import User

router = APIRouter(prefix="/geo")
_lock = threading.Lock()
_next_slot = 0.0
_cache: dict[tuple[float, float], str] = {}
CACHE_SIZE = 2048


def enabled() -> bool:
    return os.environ.get("GEOCODER") == "nominatim"


def label_from(address: dict) -> str | None:
    """'Mabini Street, Zone 1, Dasmariñas' from Nominatim's address parts; the most specific first."""
    street = address.get("road") or address.get("pedestrian") or address.get("footway")
    area = (
        address.get("neighbourhood")
        or address.get("quarter")
        or address.get("suburb")
        or address.get("village")
        or address.get("hamlet")
    )
    town = address.get("city") or address.get("town") or address.get("municipality")
    parts = [part for part in (street, area, town) if isinstance(part, str) and part.strip()]
    return ", ".join(dict.fromkeys(parts))[:200] or None


def lookup(lat: float, lng: float) -> str | None:
    """Street name near a point, or None. Only successful answers are cached, so a timeout is retried later."""
    global _next_slot
    key = (round(lat, 4), round(lng, 4))
    # The lock only hands out one-second slots; the wait and the request happen outside it, so a slow
    # Nominatim never holds other requests' threads.
    with _lock:
        if key in _cache:
            return _cache[key]
        slot = max(time.monotonic(), _next_slot)
        if slot - time.monotonic() > 3:
            return None  # a queue is building up; skip without claiming a slot, so the queue can drain
        _next_slot = slot + 1.0
    wait = slot - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    contact = os.environ.get("GEOCODER_CONTACT", "")
    agent = f"BarangAI ({contact})" if contact else "BarangAI"
    try:
        response = httpx.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"format": "jsonv2", "lat": key[0], "lon": key[1], "zoom": 18, "addressdetails": 1},
            headers={"User-Agent": agent, "Accept-Language": "en"},
            timeout=4.0,
        )
        data = response.json() if response.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None
    address = data.get("address") if isinstance(data, dict) else None
    label = label_from(address) if isinstance(address, dict) else None
    if label:
        with _lock:
            if len(_cache) >= CACHE_SIZE:
                _cache.pop(next(iter(_cache)))
            _cache[key] = label
    return label


def clear_cache() -> None:
    with _lock:
        _cache.clear()


@router.get("/reverse")
def reverse(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    user: User = Depends(get_current_user),
):
    if not enabled():
        raise HTTPException(503, "Street names unavailable")
    rate_limit(request, "geocode", 30, key=user.id)
    return {"label": lookup(lat, lng)}
