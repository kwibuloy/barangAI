import hashlib
import io
import logging
import os
import re
import threading
from collections import OrderedDict
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageOps, UnidentifiedImageError

from . import privacy


class StorageRequestUncertain(HTTPException):
    """The remote operation may have completed before its response failed."""


def media_dir():
    path = Path(os.environ.get("PRIVATE_MEDIA_DIR", str(Path(__file__).resolve().parents[1] / "private_media")))
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_storage_config():
    backend = os.environ.get("MEDIA_STORAGE", "local")
    if backend not in {"local", "supabase"}:
        raise ValueError("MEDIA_STORAGE must be local or supabase")
    if backend == "supabase":
        parsed = urlsplit(os.environ.get("SUPABASE_URL", ""))
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
            raise ValueError("SUPABASE_URL must be the HTTPS project origin")
        if not os.environ.get("SUPABASE_SECRET_KEY", "").startswith("sb_secret_"):
            raise ValueError("SUPABASE_SECRET_KEY must be a server-only secret key")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", os.environ.get("SUPABASE_STORAGE_BUCKET", "incident-photos")):
            raise ValueError("Invalid SUPABASE_STORAGE_BUCKET")


def storage_client():
    return httpx.Client(timeout=20, follow_redirects=False)


def storage_request(method, path, **kwargs):
    validate_storage_config()
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1/" + path
    headers = {"apikey": os.environ["SUPABASE_SECRET_KEY"], **kwargs.pop("headers", {})}
    try:
        with storage_client() as client:
            response = client.request(method, url, headers=headers, **kwargs)
        if not response.is_success:
            error = StorageRequestUncertain if response.status_code >= 500 else HTTPException
            raise error(503, "Private image storage unavailable. Please try again.")
        return response
    except httpx.HTTPError:
        raise StorageRequestUncertain(503, "Private image storage unavailable. Please try again.") from None


def private_bucket():
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "incident-photos")
    try:
        metadata = storage_request("GET", f"bucket/{bucket}").json()
    except ValueError:
        raise HTTPException(503, "Private image storage unavailable. Please try again.") from None
    if not isinstance(metadata, dict) or metadata.get("public") is not False:
        raise HTTPException(503, "Incident photo storage must be private")
    return bucket


def save_image(report_id, data):
    name = f"{report_id}.jpg"
    if os.environ.get("MEDIA_STORAGE", "local") == "supabase":
        bucket = private_bucket()
        try:
            storage_request("POST", f"object/{bucket}/{name}", content=data,
                            headers={"Content-Type": "image/jpeg", "x-upsert": "false", "Cache-Control": "private, no-store"})
        except StorageRequestUncertain:
            try:
                delete_image(f"supabase:{name}")
            except Exception:
                logging.getLogger(__name__).error("Could not clean up uncertain upload for report %s", report_id)
            raise
        return f"supabase:{name}"
    path = media_dir() / name
    path.write_bytes(data)
    return str(path)


def object_name(location):
    name = location.removeprefix("supabase:")
    if not re.fullmatch(r"[0-9a-f-]{36}\.jpg", name):
        raise HTTPException(503, "Invalid stored image reference")
    return name


def delete_image(location):
    if location.startswith("supabase:"):
        name = object_name(location)
        bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "incident-photos")
        storage_request("DELETE", f"object/{bucket}", json={"prefixes": [name]})
    else:
        Path(location).unlink(missing_ok=True)


def image_response(location):
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    if location.startswith("supabase:"):
        name = object_name(location)
        bucket = private_bucket()
        data = storage_request("GET", f"object/authenticated/{bucket}/{name}").content
        return Response(data, media_type="image/jpeg", headers=headers)
    if not Path(location).is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(location, media_type="image/jpeg", headers=headers)


# Stored photos: longest side 1600 px (MAX_IMAGE_EDGE), JPEG quality 80, no metadata. About 200-500 KB for a phone
# photo, so the Supabase Free bucket (1 GB) holds a few thousand reports, while signs, wiring and potholes stay
# readable. The browser shrinks to the same size first; this is the guarantee for any client that did not.
PHOTO_LONGEST_SIDE = int(os.environ.get("MAX_IMAGE_EDGE", 1600))
PHOTO_QUALITY = 80
_sanitized: "OrderedDict[str, bytes]" = OrderedDict()
_sanitized_lock = threading.Lock()


def sanitize_image(data: bytes) -> bytes:
    """Rotated upright, at most MAX_IMAGE_EDGE pixels on the long side, faces blurred, every metadata field dropped.

    The AI preview and the submission upload the same photo, so the result is kept briefly by the upload's hash and
    the second call skips the face check.
    """
    if len(data) > int(os.environ.get("MAX_IMAGE_BYTES", 5_000_000)):
        raise HTTPException(413, "Image too large")
    key = hashlib.sha256(data).hexdigest()
    with _sanitized_lock:
        if key in _sanitized:
            _sanitized.move_to_end(key)
            return _sanitized[key]
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 20_000_000:
                raise HTTPException(422, "Unsupported image")
            # JPEGs can decode at 1/2, 1/4 or 1/8 scale, which saves memory on the small Render instance.
            image.draft("RGB", (PHOTO_LONGEST_SIDE, PHOTO_LONGEST_SIDE))
            image.load()
            picture = ImageOps.exif_transpose(image)
            # Shrink first, so flattening, face blurring and converting work on the small copy.
            picture.thumbnail((PHOTO_LONGEST_SIDE, PHOTO_LONGEST_SIDE), Image.Resampling.LANCZOS, reducing_gap=3.0)
            if picture.mode in {"RGBA", "LA", "P", "PA"}:
                picture = picture.convert("RGBA")
                flat = Image.new("RGB", picture.size, "white")
                flat.paste(picture, mask=picture.getchannel("A"))
                picture = flat
            # Pixels only: Pillow would otherwise copy the original's JPEG comment, EXIF or ICC profile across.
            picture = Image.frombytes("RGB", picture.size, picture.convert("RGB").tobytes())
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "Invalid image") from None
    picture, _ = privacy.blur_faces(picture)
    output = io.BytesIO()
    picture.save(output, format="JPEG", quality=PHOTO_QUALITY, optimize=True, progressive=True)
    result = output.getvalue()
    with _sanitized_lock:
        _sanitized[key] = result
        while len(_sanitized) > 16:
            _sanitized.popitem(last=False)
    return result


def clear_sanitized_cache():
    with _sanitized_lock:
        _sanitized.clear()
