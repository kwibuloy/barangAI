"""Best-effort face blurring before a photo is stored or sent to the vision model.

Uses the YuNet face model (232 KB, MIT, models/yunet) through OpenCV (`opencv-python-headless`, in the API's ai extra).
If a blur that is on can't run, photos are refused; see check_ready. YuNet replaced a Haar cascade that missed tilted and small faces and fired on the straight lines of wires and poles, which
staff need sharp. It can still miss a face that is side-on, strongly tilted, hidden or very small, so the form still
asks residents to keep faces and plate numbers out. Set FACE_BLUR=off to disable.

Licence plates use LPD-YuNet from OpenCV's model zoo (4 MB, Apache 2.0, models/lpd_yunet) in the same way. It was trained
on Chinese plates, so it can miss some Philippine ones, and the form's request stands. Set PLATE_BLUR=off to disable.
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
PLATE_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "lpd_yunet" / "license_plate_detection_lpd_yunet_2023mar.onnx"
PLATE_EDGE = 960
# The model's false boxes are huge or badly shaped, and blurring a sign or wires would spoil a report, so a box must
# look like a plate: confident, plate-shaped, inside the photo, and not most of its width. Tuned on drawn plates only.
PLATE_MIN_SCORE = 0.35
PLATE_MAX_WIDTH = 0.5
PLATE_SHAPE = (1.6, 7.0)
PLATE_ANCHORS = ((10, 16, 24), (32, 48), (64, 96), (128, 192, 256))
PLATE_STEPS = (8, 16, 32, 64)
_lock = threading.Lock()


@lru_cache(maxsize=1)
def detector():
    if os.environ.get("FACE_BLUR", "on").lower() == "off":
        return None
    try:
        import cv2
    except ImportError:
        log.warning("OpenCV is not installed; photos will be refused")
        return None
    cv2.setNumThreads(1)
    path = os.environ.get("FACE_MODEL_PATH") or str(MODEL_PATH)
    if not os.path.isfile(path):
        log.warning("Face model missing; photos will be refused")
        return None
    try:
        return cv2.FaceDetectorYN.create(path, "", (320, 320), MIN_SCORE, 0.3, 200)
    except cv2.error:
        log.exception("Face model unreadable; photos will be refused")
        return None


def enabled() -> bool:
    return detector() is not None


class BlurUnavailable(RuntimeError):
    """A blur that is switched on cannot run. Photos are refused rather than stored or sent on sharp."""


def check_ready() -> None:
    """A broken install must stop reports, not quietly keep every face sharp. FACE_BLUR=off and PLATE_BLUR=off are
    the only ways to run without a blur."""
    if os.environ.get("FACE_BLUR", "on").lower() != "off" and detector() is None:
        raise BlurUnavailable("Face blurring cannot run: install the API's ai extra, or set FACE_BLUR=off on purpose")
    if os.environ.get("PLATE_BLUR", "on").lower() != "off" and plate_detector() is None:
        raise BlurUnavailable("Plate blurring cannot run: install the API's ai extra, or set PLATE_BLUR=off on purpose")


def _shrunk(image: Image.Image, edge: int) -> Image.Image:
    scale = min(1.0, edge / max(image.size))
    if scale == 1:
        return image
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.BILINEAR
    )


def _detect(model, image: Image.Image) -> list[tuple[float, float, float, float]] | None:
    """Boxes (left, top, width, height) in this image's pixels, or None if this pass fails. The model reads
    blue-green-red."""
    import numpy

    try:
        model.setInputSize(image.size)
        _, found = model.detect(numpy.asarray(image)[:, :, ::-1].copy())
    except Exception:
        log.exception("A face detection pass failed")
        return None
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
    # Each pass finds faces the others miss, so a photo checked only in part could keep a face sharp.
    if found is None or turned_left is None or turned_right is None:
        raise RuntimeError("A face detection pass failed")
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
        log.exception("Face detection failed; the photo is refused")
        raise BlurUnavailable("Face detection failed") from None
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


@lru_cache(maxsize=1)
def plate_detector():
    if os.environ.get("PLATE_BLUR", "on").lower() == "off":
        return None
    try:
        import cv2
    except ImportError:
        log.warning("OpenCV is not installed; photos will be refused")
        return None
    if not PLATE_MODEL_PATH.is_file():
        log.warning("Plate model missing; photos will be refused")
        return None
    try:
        return cv2.dnn.readNet(str(PLATE_MODEL_PATH))
    except cv2.error:
        log.exception("Plate model unreadable; photos will be refused")
        return None


def _plate_priors(width: int, height: int):
    """The model's anchor boxes for this input size, as (centre x, centre y, width, height) fractions."""
    import numpy

    rows = []
    rows_high, columns = (height + 1) // 2 // 2, (width + 1) // 2 // 2
    for sizes, step in zip(PLATE_ANCHORS, PLATE_STEPS, strict=True):
        rows_high, columns = rows_high // 2, columns // 2
        for row in range(rows_high):
            for column in range(columns):
                rows += [
                    [(column + 0.5) * step / width, (row + 0.5) * step / height, size / width, size / height]
                    for size in sizes
                ]
    return numpy.array(rows, dtype=numpy.float32)


def find_plates(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Licence plate boxes (left, top, width, height) in the image's own pixels."""
    model = plate_detector()
    if model is None:
        return []
    import cv2
    import numpy

    image = image.convert("RGB")
    small = _shrunk(image, PLATE_EDGE)
    # The model's layers halve the picture repeatedly, so it needs whole multiples of 32, and at least 64.
    width, height = max(64, small.width // 32 * 32), max(64, small.height // 32 * 32)
    pixels = numpy.asarray(small.resize((width, height)))[:, :, ::-1].copy()
    with _lock:  # one model, and setInput changes it
        model.setInput(cv2.dnn.blobFromImage(pixels))
        location, confidence, overlap = model.forward(["loc", "conf", "iou"])
    priors = _plate_priors(width, height)
    scores = numpy.sqrt(confidence[:, 1] * numpy.clip(overlap[:, 0], 0, 1))
    size = numpy.array((width, height), dtype=numpy.float32)
    # Four corners, as the model can see a plate at an angle.
    corners = numpy.stack(
        [(priors[:, :2] + location[:, start : start + 2] * 0.1 * priors[:, 2:4]) * size for start in (4, 6, 10, 12)],
        axis=1,
    )
    lows, highs = corners.min(axis=1), corners.max(axis=1)
    spans = highs - lows
    keep = (
        (scores >= PLATE_MIN_SCORE)
        & (lows[:, 0] >= -0.02 * width)
        & (lows[:, 1] >= -0.02 * height)
        & (highs[:, 0] <= 1.02 * width)
        & (highs[:, 1] <= 1.02 * height)
        & (spans[:, 0] <= PLATE_MAX_WIDTH * width)
        & (spans[:, 1] > 0)
    )
    keep &= (spans[:, 0] >= PLATE_SHAPE[0] * spans[:, 1]) & (spans[:, 0] <= PLATE_SHAPE[1] * spans[:, 1])
    kept = numpy.flatnonzero(keep)
    if not len(kept):
        return []
    boxes = numpy.hstack((lows[kept], spans[kept]))
    chosen = cv2.dnn.NMSBoxes(boxes.tolist(), scores[kept].tolist(), PLATE_MIN_SCORE, 0.3)
    scale_x, scale_y = image.width / width, image.height / height
    return [
        (
            round(float(boxes[index][0]) * scale_x),
            round(float(boxes[index][1]) * scale_y),
            round(float(boxes[index][2]) * scale_x),
            round(float(boxes[index][3]) * scale_y),
        )
        for index in numpy.array(chosen).reshape(-1)
    ]


def blur_plates(image: Image.Image) -> tuple[Image.Image, int]:
    """The image with every detected licence plate blurred past reading, and how many were blurred."""
    try:
        boxes = find_plates(image)
    except Exception:
        log.exception("Plate detection failed; the photo is refused")
        raise BlurUnavailable("Plate detection failed") from None
    blurred = 0
    for left, top, width, height in boxes:
        pad_x, pad_y = max(2, width // 10), max(2, height // 5)
        box = (
            max(0, left - pad_x),
            max(0, top - pad_y),
            min(image.width, left + width + pad_x),
            min(image.height, top + height + pad_y),
        )
        if box[0] >= box[2] or box[1] >= box[3]:
            continue
        region = image.crop(box)
        image.paste(region.filter(ImageFilter.GaussianBlur(max(6, height // 3))), box)
        blurred += 1
    return image, blurred
