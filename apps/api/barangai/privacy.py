"""Best-effort face blurring before a photo is stored or sent to the vision model.

Uses OpenCV's bundled frontal-face Haar cascade when `opencv-python-headless` is installed (the Render image has
it); without it, photos pass through unchanged, so local tests and setups need nothing extra. Haar cascades miss
side-on, small or partly hidden faces and sometimes blur a face-like patch, so the form still asks residents to keep
faces and plate numbers out. Licence plates are not detected. Set FACE_BLUR=off to disable.
"""

import logging
import os
import threading
from functools import lru_cache

from PIL import Image, ImageFilter

log = logging.getLogger(__name__)
DETECT_EDGE = 640  # faces are found on a small copy (one 640 px detection took ~0.25 s in a dev container)
_lock = threading.Lock()


@lru_cache(maxsize=1)
def detector():
    if os.environ.get("FACE_BLUR", "on").lower() == "off":
        return None
    try:
        import cv2
    except ImportError:
        return None
    cv2.setNumThreads(1)
    cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    if cascade.empty():
        log.warning("OpenCV face cascade missing; photos are stored without face blurring")
        return None
    return cascade


def enabled() -> bool:
    return detector() is not None


def find_faces(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Face boxes (left, top, width, height) in the image's own pixels."""
    cascade = detector()
    if cascade is None:
        return []
    import numpy

    scale = min(1.0, DETECT_EDGE / max(image.size))
    small = image.convert("L")
    if scale < 1:
        small = small.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))))
    with _lock:  # OpenCV classifiers are not documented as thread-safe
        boxes = cascade.detectMultiScale(numpy.asarray(small), scaleFactor=1.15, minNeighbors=6, minSize=(20, 20))
    return [tuple(round(value / scale) for value in box) for box in boxes]


def blur_faces(image: Image.Image) -> tuple[Image.Image, int]:
    """The image with every detected face blurred beyond recognition, and how many were blurred."""
    try:
        boxes = find_faces(image)
    except Exception:
        log.exception("Face detection failed; the photo is kept unblurred")
        return image, 0
    for left, top, width, height in boxes:
        # A margin covers hair and the edge of the jaw; the radius scales with the face so large faces blur too.
        pad_x, pad_y = width // 4, height // 4
        box = (max(0, left - pad_x), max(0, top - pad_y),
               min(image.width, left + width + pad_x), min(image.height, top + height + pad_y))
        region = image.crop(box)
        image.paste(region.filter(ImageFilter.GaussianBlur(max(8, width // 5))), box)
    return image, len(boxes)
