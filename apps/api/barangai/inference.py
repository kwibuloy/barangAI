"""Optional, explicitly approved five-class TorchVision inference."""

import hashlib
import io
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageOps

CATEGORIES = ("flooding", "potholes", "fallen_trees", "uncollected_garbage", "damaged_signage")
WEIGHTS = {"efficientnet_b0": "EfficientNet_B0_Weights.IMAGENET1K_V1",
           "mobilenet_v3_large": "MobileNet_V3_Large_Weights.IMAGENET1K_V2"}


@dataclass(frozen=True)
class Prediction:
    category: str | None
    confidence: float
    embedding: list[float]
    model_version: str


def model_settings():
    path = os.environ.get("MODEL_CHECKPOINT", "")
    if not path:
        return None
    digest = os.environ.get("MODEL_APPROVED_SHA256", "").lower()
    threshold = os.environ.get("MODEL_CONFIDENCE_THRESHOLD", "")
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("MODEL_APPROVED_SHA256 must identify the reviewed checkpoint")
    try:
        threshold_value = float(threshold)
    except ValueError as exc:
        raise ValueError("MODEL_CONFIDENCE_THRESHOLD is required") from exc
    if not 0 < threshold_value <= 1:
        raise ValueError("MODEL_CONFIDENCE_THRESHOLD must be in (0, 1]")
    return Path(path), digest, threshold_value


def validate_checkpoint_metadata(checkpoint):
    if tuple(checkpoint.get("categories", ())) != CATEGORIES:
        raise ValueError("Model checkpoint class order differs from API categories")
    architecture = checkpoint.get("architecture")
    if architecture not in WEIGHTS:
        raise ValueError("Unsupported model architecture")
    if checkpoint.get("weights") != WEIGHTS[architecture]:
        raise ValueError("Model preprocessing weights differ from training")
    if checkpoint.get("preprocessing_version") not in (None, "letterbox_224_v1"):
        raise ValueError("Unsupported model preprocessing version")
    if not checkpoint.get("split_sha256") or "state_dict" not in checkpoint:
        raise ValueError("Model checkpoint lacks training provenance or weights")
    return architecture


@lru_cache(maxsize=1)
def load_runtime(path: Path, digest: str, threshold: float):
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError("Model checkpoint does not match approved SHA-256")
    import torch
    from torchvision import models

    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    architecture = validate_checkpoint_metadata(checkpoint)
    if architecture == "efficientnet_b0":
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, len(CATEGORIES))
    elif architecture == "mobilenet_v3_large":
        weights = models.MobileNet_V3_Large_Weights.IMAGENET1K_V2
        model = models.mobilenet_v3_large(weights=None)
        model.classifier[3] = torch.nn.Linear(model.classifier[3].in_features, len(CATEGORIES))
    model.load_state_dict(checkpoint["state_dict"], strict=True)
    model.eval()
    transform = weights.transforms()
    if checkpoint.get("preprocessing_version") == "letterbox_224_v1":
        from torchvision import transforms

        transform = transforms.Compose([
            transforms.Lambda(lambda image: ImageOps.pad(image.convert("RGB"), (224, 224),
                method=Image.Resampling.BILINEAR, color=(0, 0, 0))),
            transforms.ToTensor(),
            transforms.Normalize(mean=transform.mean, std=transform.std),
        ])
    return model, transform, torch, threshold, f"{architecture}:{digest[:12]}"


def validate_configured_model():
    settings = model_settings()
    if settings:
        load_runtime(*settings)


def predict(sanitized_image: bytes) -> Prediction | None:
    settings = model_settings()
    if not settings:
        return None
    model, transform, torch, threshold, version = load_runtime(*settings)
    with Image.open(io.BytesIO(sanitized_image)) as image:
        tensor = transform(image.convert("RGB")).unsqueeze(0)
    try:
        with torch.inference_mode():
            features = model.features(tensor)
            pooled = torch.flatten(model.avgpool(features), 1)
            probabilities = torch.softmax(model.classifier(pooled), dim=1)[0]
            confidence, index = probabilities.max(dim=0)
            embedding = torch.nn.functional.normalize(pooled, dim=1)[0].tolist()
    except RuntimeError:
        logging.getLogger(__name__).error("Inference unavailable for model %s; manual reporting remains available", version)
        return None
    score = float(confidence)
    return Prediction(CATEGORIES[int(index)] if score >= threshold else None,
                      round(score, 4), embedding, version)
