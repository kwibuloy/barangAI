"""Best-effort face blurring before a photo is stored or sent to the vision model.

Uses the YuNet face model (232 KB, MIT, models/yunet) through OpenCV when `opencv-python-headless` is installed (the
Render image has it); without it, photos pass through unchanged, so local tests and setups need nothing extra. YuNet
replaced a Haar cascade that missed tilted and small faces and fired on the straight lines of wires and poles, which
staff need sharp. It can still miss a face that is side-on, strongly tilted, hidden or very small, so the form still
asks residents to keep faces and plate numbers out. Licence plates are not detected. Set FACE_BLUR=off to disable.
"""

import logging
import math
import os
import threading
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageFilter

log = logging.getLogger(__name__)
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "yunet" / "face_detection_yunet_2023mar.onnx"
DETECT_EDGE = 1280  # large enough to keep small faces; docs/feature-status.md has the measurements
SIDEWAYS_EDGE = 640  # faces turned 90 degrees are rare (photos arrive upright), so those two passes stay cheap
MIN_SCORE = 0.75  # lower blurs wiring and foliage; higher misses small and turned faces
_lock = threading.Lock()


@lru_cache(maxsize=1)
def detector():
    if os.environ.get("FACE_BLUR", "on").lower() == "off":
        return None
    try:
        import cv2
    except ImportError:
        log.warning("OpenCV is not installed; photos are stored without face blurring")
        return None
    cv2.setNumThreads(1)
    path = os.environ.get("FACE_MODEL_PATH") or str(MODEL_PATH)
    if not os.path.isfile(path):
        log.warning("Face model missing; photos are stored without face blurring")
        return None
    try:
        return cv2.FaceDetectorYN.create(path, "", (320, 320), MIN_SCORE, 0.3, 200)
    except cv2.error:
        log.exception("Face model unreadable; photos are stored without face blurring")
        return None


def enabled() -> bool:
    return detector() is not None


def _shrunk(image: Image.Image, edge: int) -> Image.Image:
    scale = min(1.0, edge / max(image.size))
    if scale == 1:
        return image
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.BILINEAR
    )


def _detect(model, image: Image.Image) -> list[tuple[float, float, float, float]]:
    """Boxes (left, top, width, height) in this image's pixels, or none if this pass fails. The model reads
    blue-green-red. One failed pass must not cost the faces another pass finds."""
    import numpy

    try:
        model.setInputSize(image.size)
        _, found = model.detect(numpy.asarray(image)[:, :, ::-1].copy())
    except Exception:
        log.exception("A face detection pass failed")
        return []
    if found is None:
        return []
    boxes = [tuple(float(value) for value in row[:4]) for row in found]
    # Very narrow images can produce empty or non-finite boxes.
    return [box for box in boxes if all(map(math.isfinite, box)) and box[2] > 0 and box[3] > 0]


def _add(boxes: list[tuple[int, int, int, int]], box: tuple[int, int, int, int]) -> None:
    """Adds a box, growing an existing one instead when both are the same face, so no part of either stays sharp."""
    for index, other in enumerate(boxes):
        if _middle_inside(box, other) or _middle_inside(other, box):
            left, top = min(box[0], other[0]), min(box[1], other[1])
            right, bottom = max(box[0] + box[2], other[0] + other[2]), max(box[1] + box[3], other[1] + other[3])
            boxes[index] = left, top, right - left, bottom - top
            return
    boxes.append(box)


def _middle_inside(box: tuple[int, int, int, int], other: tuple[int, int, int, int]) -> bool:
    middle_x, middle_y = box[0] + box[2] / 2, box[1] + box[3] / 2
    return other[0] <= middle_x <= other[0] + other[2] and other[1] <= middle_y <= other[1] + other[3]


def find_faces(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Face boxes (left, top, width, height) in the image's own pixels."""
    model = detector()
    if model is None:
        return []
    image = image.convert("RGB")
    upright = _shrunk(image, DETECT_EDGE)
    sideways = _shrunk(image, SIDEWAYS_EDGE)
    with _lock:  # one model, and setInputSize changes it
        found = _detect(model, upright)
        turned_left = _detect(model, sideways.transpose(Image.Transpose.ROTATE_90))
        turned_right = _detect(model, sideways.transpose(Image.Transpose.ROTATE_270))
    boxes: list[tuple[int, int, int, int]] = []
    scale = image.width / upright.width
    for box in found:
        _add(boxes, tuple(round(value * scale) for value in box))
    scale = image.width / sideways.width
    # Back from the turned copy to the upright one: a turned box's width is the upright box's height.
    for x, y, width, height in turned_left:
        _add(boxes, tuple(round(value * scale) for value in (sideways.width - y - height, x, height, width)))
    for x, y, width, height in turned_right:
        _add(boxes, tuple(round(value * scale) for value in (y, sideways.height - x - width, height, width)))
    return boxes


def blur_faces(image: Image.Image) -> tuple[Image.Image, int]:
    """The image with every detected face blurred beyond recognition, and how many were blurred."""
    try:
        boxes = find_faces(image)
    except Exception:
        log.exception("Face detection failed; the photo is kept unblurred")
        return image, 0
    blurred = 0
    for left, top, width, height in boxes:
        # A margin covers hair and the edge of the jaw; the radius scales with the face so large faces blur too.
        pad_x, pad_y = width // 4, height // 4
        box = (
            max(0, left - pad_x),
            max(0, top - pad_y),
            min(image.width, left + width + pad_x),
            min(image.height, top + height + pad_y),
        )
        if box[0] >= box[2] or box[1] >= box[3]:
            continue
        region = image.crop(box)
        image.paste(region.filter(ImageFilter.GaussianBlur(max(8, width // 5))), box)
        blurred += 1
    return image, blurred
