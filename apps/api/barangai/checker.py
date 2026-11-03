"""Category checker and duplicate embeddings: MobileCLIP2-S0's image encoder (ONNX) against category prompts.

It backs up and cross-checks the vision model (vision.py) and supplies the image embedding used for duplicate
review. Opt-in with CHECKER_MODEL_DIR (a folder from tools/export_checker.py); without it the API runs with no
checker and residents choose the category themselves.
"""

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from .models import CATEGORIES

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CheckerResult:
    category: str | None  # None when the photo looks like no concern, or the checker is unsure
    confidence: float
    embedding: list[float]
    model_version: str


def threshold() -> float:
    value = float(os.environ.get("CHECKER_CONFIDENCE_THRESHOLD", "0.5"))
    if not 0 < value <= 1:
        raise ValueError("CHECKER_CONFIDENCE_THRESHOLD must be in (0, 1]")
    return value


@lru_cache(maxsize=1)
def load_runtime(folder: str):
    import onnxruntime

    path = Path(folder)
    meta = json.loads((path / "checker.json").read_text(encoding="utf-8"))
    model = path / "visual.onnx"
    if hashlib.sha256(model.read_bytes()).hexdigest() != meta["onnx_sha256"]:
        raise ValueError("Checker model does not match its recorded SHA-256")
    keys = [item["key"] for item in meta["classes"]]
    if set(keys) - {"background"} != set(CATEGORIES):
        raise ValueError("Checker classes differ from the API categories")
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = int(os.environ.get("CHECKER_THREADS", "1"))
    options.inter_op_num_threads = 1
    session = onnxruntime.InferenceSession(str(model), options, providers=["CPUExecutionProvider"])
    classes = np.asarray([item["embedding"] for item in meta["classes"]], dtype=np.float32)
    return session, meta, keys, classes


def validate_configured_checker() -> None:
    folder = os.environ.get("CHECKER_MODEL_DIR")
    if folder:
        load_runtime(folder)
        threshold()


def pixels(image_bytes: bytes, size: int, mean, std) -> np.ndarray:
    import io

    with Image.open(io.BytesIO(image_bytes)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        # Resize the short side, then centre-crop: the preprocessing MobileCLIP2 was trained with.
        scale = size / min(image.size)
        resized = image.resize(
            (max(size, round(image.width * scale)), max(size, round(image.height * scale))), Image.Resampling.BILINEAR
        )
        left, top = (resized.width - size) // 2, (resized.height - size) // 2
        crop = np.asarray(resized.crop((left, top, left + size, top + size)), dtype=np.float32) / 255.0
    crop = (crop - np.asarray(mean, dtype=np.float32)) / np.asarray(std, dtype=np.float32)
    return crop.transpose(2, 0, 1)[None]


def check(sanitized_image: bytes) -> CheckerResult | None:
    folder = os.environ.get("CHECKER_MODEL_DIR")
    if not folder:
        return None
    session, meta, keys, classes = load_runtime(folder)
    try:
        embedding = session.run(
            None, {"pixels": pixels(sanitized_image, meta["image_size"], meta["mean"], meta["std"])}
        )[0][0]
    except Exception:
        log.exception("Category checker unavailable for %s; the report can still be filed by hand", meta["version"])
        return None
    logits = meta["logit_scale"] * classes @ embedding
    probabilities = np.exp(logits - logits.max())
    probabilities /= probabilities.sum()
    best = int(probabilities.argmax())
    confidence = round(float(probabilities[best]), 4)
    category = keys[best] if keys[best] != "background" and confidence >= threshold() else None
    return CheckerResult(category, confidence, [round(float(v), 6) for v in embedding], meta["version"])
