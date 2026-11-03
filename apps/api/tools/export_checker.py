"""Export MobileCLIP2-S0's image encoder to ONNX and pre-compute the category prompt embeddings.

The API's category checker (barangai/checker.py) then needs only onnxruntime, numpy and Pillow: no torch,
no text encoder at runtime. Run from the repo root with the project venv (needs open_clip_torch, onnx):

    .venv/Scripts/python.exe apps/api/tools/export_checker.py                 # model and prompts
    .venv/Scripts/python.exe apps/api/tools/export_checker.py --prompts-only  # prompts only

Weights: timm/MobileCLIP2-S0-OpenCLIP on Hugging Face, Apple ML research licence (apple-amlr): research use
only; whether that covers this project's use is not confirmed. Change PROMPTS below and re-run to retune the checker.
"""

import hashlib
import json
import sys
from pathlib import Path

import open_clip
import torch
from timm.utils import reparameterize_model

OUT = Path(__file__).resolve().parents[1] / "models" / "mobileclip2-s0"
MODEL, PRETRAINED, SIZE = "MobileCLIP2-S0", "dfndr2b", 256
TEMPLATES = ["a photo of {}.", "a phone photo of {}.", "a close-up photo of {}.", "a street-level photo of {}."]
# Each class is described several ways; background classes catch photos that show no barangay concern,
# so the checker abstains instead of forcing one of its categories.
PROMPTS = {
    "flooding": [
        "a flooded street",
        "floodwater covering a road in a neighborhood",
        "houses and cars standing in brown floodwater",
        "people wading through a flooded road",
    ],
    "potholes": [
        "a pothole in the road",
        "a damaged asphalt road with deep holes",
        "a broken road surface with a water-filled pothole",
        "a cracked and crumbling street",
    ],
    "fallen_trees": [
        "a fallen tree blocking a road",
        "a tree uprooted by a storm lying across the street",
        "broken tree branches on the road after a typhoon",
        "a toppled tree on a power line",
    ],
    "uncollected_garbage": [
        "a pile of uncollected garbage on the street",
        "overflowing trash bags on the roadside",
        "litter and rubbish dumped on a sidewalk",
        "a heap of plastic waste beside a road",
    ],
    "damaged_signage": [
        "a damaged street sign",
        "a bent and broken road sign",
        "a faded, vandalized traffic sign",
        "a fallen signboard on the street",
    ],
    "broken_streetlights": [
        "a broken streetlight",
        "a street lamp that is not working at night",
        "a damaged lamp post with a broken light",
        "a dark street with a dead streetlight",
    ],
    "exposed_wiring": [
        "exposed electrical wires",
        "dangling power lines hanging low over a street",
        "tangled loose electric cables on a utility pole",
        "a broken power cable lying on the ground",
    ],
    "other": [
        "a broken water pipe leaking onto a street",
        "a clogged canal or drainage",
        "a damaged public bench or railing",
        "an obstruction blocking a sidewalk",
    ],
    # Normal, working versions of each category's object, so an intact streetlight or sign is not read as broken.
    "background": [
        "a clean street with nothing wrong",
        "a working streetlight on a lamp post",
        "a street lamp standing upright in daylight",
        "an intact, readable street sign",
        "a clean new road sign",
        "a healthy tree standing beside a road",
        "a smooth, undamaged paved road",
        "a tidy closed garbage bin",
        "power lines neatly strung between poles",
        "a dry street on a sunny day",
        "a selfie of a person",
        "a screenshot of a phone screen",
        "a document or a page of text",
        "a plate of food",
        "an indoor room",
    ],
}


class NormalizedVisual(torch.nn.Module):
    def __init__(self, visual):
        super().__init__()
        self.visual = visual

    def forward(self, pixels):
        return torch.nn.functional.normalize(self.visual(pixels), dim=-1)


def main() -> None:
    model, _, _ = open_clip.create_model_and_transforms(MODEL, pretrained=PRETRAINED)
    model = reparameterize_model(model.eval())
    tokenizer = open_clip.get_tokenizer(MODEL)
    classes = []
    with torch.inference_mode():
        for key, phrases in PROMPTS.items():
            texts = [template.format(phrase) for phrase in phrases for template in TEMPLATES]
            features = torch.nn.functional.normalize(model.encode_text(tokenizer(texts)), dim=-1)
            centroid = torch.nn.functional.normalize(features.mean(dim=0), dim=-1)
            classes.append({"key": key, "embedding": [round(v, 6) for v in centroid.tolist()]})
    OUT.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT / "visual.onnx"
    # --prompts-only keeps the existing image model: the embedding version (and duplicate review) stay valid.
    if "--prompts-only" not in sys.argv or not onnx_path.is_file():
        torch.onnx.export(
            NormalizedVisual(model.visual),
            torch.zeros(1, 3, SIZE, SIZE),
            onnx_path,
            input_names=["pixels"],
            output_names=["embedding"],
            dynamic_axes={"pixels": {0: "batch"}, "embedding": {0: "batch"}},
            opset_version=17,
            dynamo=False,
        )
    digest = hashlib.sha256(onnx_path.read_bytes()).hexdigest()
    meta = {
        "model": f"{MODEL}/{PRETRAINED}",
        "source": "https://huggingface.co/timm/MobileCLIP2-S0-OpenCLIP",
        "license": "apple-amlr (research use only)",
        "version": f"mobileclip2-s0:{digest[:12]}",
        "onnx_sha256": digest,
        "image_size": SIZE,
        "mean": [0.0, 0.0, 0.0],
        "std": [1.0, 1.0, 1.0],
        "logit_scale": round(float(model.logit_scale.exp()), 4),
        "classes": classes,
    }
    (OUT / "checker.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(onnx_path, onnx_path.stat().st_size // 1024, "KB", meta["version"])


if __name__ == "__main__":
    main()
