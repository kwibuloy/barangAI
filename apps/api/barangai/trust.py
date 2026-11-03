"""Staff-only checks of a report's photo against its pin and date: signals to look closer, never proof.

The photo's own details (capture time, camera, GPS) are read from the uploaded bytes before metadata is stripped.
The resident's browser shrinks photos before upload, which drops those details, so it also sends what it read from
the original file; the server's own reading wins when both exist. Either can be edited by a determined person, so
a clean result proves nothing and a flag only asks staff to look again. Residents never see these flags.
"""

import io
import math
import os
from datetime import UTC, datetime, timedelta, timezone

from PIL import Image, UnidentifiedImageError

MANILA = timezone(timedelta(hours=8))
EXIF_IFD, GPS_IFD = 0x8769, 0x8825
DATE_TIME_ORIGINAL, MAKE, MODEL = 36867, 271, 272
SOURCES = ("photo", "device", "manual")


def setting(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


def parse_taken_at(value):
    """EXIF time ("2026:11:02 09:41:07", camera local time, taken as Philippine time) or None."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip()[:19], "%Y:%m:%d %H:%M:%S").replace(tzinfo=MANILA)
    except ValueError:
        return None


def coordinate(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def gps_degrees(parts, ref):
    try:
        degrees, minutes, seconds = (float(part) for part in parts)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    value = degrees + minutes / 60 + seconds / 3600
    return -value if ref in {"S", "W"} else value


def photo_facts(data: bytes) -> dict:
    """Capture time, camera presence and GPS from the original upload; empty when it carries none."""
    try:
        return read_facts(data)
    except Exception:
        return {}  # odd or broken EXIF: the checks are hints, so they never fail a report


def read_facts(data: bytes) -> dict:
    facts = {}
    try:
        with Image.open(io.BytesIO(data)) as image:
            exif = image.getexif()
            details = exif.get_ifd(EXIF_IFD)
            gps = exif.get_ifd(GPS_IFD)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return facts
    taken = parse_taken_at(details.get(DATE_TIME_ORIGINAL))
    if taken:
        facts["taken_at"] = taken
    if exif.get(MAKE) or exif.get(MODEL):
        facts["camera"] = True
    latitude = gps_degrees(gps.get(2), gps.get(1)) if gps else None
    longitude = gps_degrees(gps.get(4), gps.get(3)) if gps else None
    if latitude is not None and longitude is not None and (latitude, longitude) != (0, 0) \
            and abs(latitude) <= 90 and abs(longitude) <= 180:
        facts["latitude"], facts["longitude"] = latitude, longitude
    return facts


def client_facts(taken_at=None, camera=None, latitude=None, longitude=None) -> dict:
    """What the browser read from the original file before shrinking it."""
    facts = {}
    taken = parse_taken_at(taken_at)
    if taken:
        facts["taken_at"] = taken
    if camera in {"1", "true", True}:
        facts["camera"] = True
    latitude, longitude = coordinate(latitude), coordinate(longitude)
    if latitude is not None and longitude is not None and abs(latitude) <= 90 and abs(longitude) <= 180 \
            and (latitude, longitude) != (0, 0):
        facts["latitude"], facts["longitude"] = latitude, longitude
    return facts


def distance_m(lat_a, lon_a, lat_b, lon_b):
    arc = (math.sin(math.radians(lat_b - lat_a) / 2) ** 2 + math.cos(math.radians(lat_a))
           * math.cos(math.radians(lat_b)) * math.sin(math.radians(lon_b - lon_a) / 2) ** 2)
    return 2 * 6_371_000 * math.asin(min(1.0, math.sqrt(arc)))


def flags(facts: dict, latitude: float, longitude: float, today: datetime | None = None) -> list[dict]:
    """The checks that failed, each with a code staff see translated and a number for the detail."""
    today = today or datetime.now(UTC)
    result = []
    if "latitude" in facts:
        apart = distance_m(facts["latitude"], facts["longitude"], latitude, longitude)
        if apart > setting("LOCATION_MISMATCH_M", 150):
            result.append({"code": "pin_far_from_photo", "detail": round(apart)})
    taken = facts.get("taken_at")
    if taken:
        days = (today - taken).total_seconds() / 86_400
        if days > setting("PHOTO_MAX_AGE_DAYS", 7):
            result.append({"code": "old_photo", "detail": int(days)})
        elif days < -1:
            # More than a day ahead: the camera clock is wrong, so the age check cannot be trusted.
            result.append({"code": "photo_date_ahead", "detail": int(-days)})
    if not taken and not facts.get("camera"):
        result.append({"code": "no_photo_details", "detail": None})
    return result
