"""Semantic near-duplicate candidates (re-crops/re-frames that perceptual hashes miss).

    python -I ml/audit/embed.py selection.csv [more.csv] --out ml/data/inventory/embed_<name> [--threshold 0.92]

Input CSVs need columns source, relpath (e.g., written by a selection step). Embeddings are ImageNet
MobileNetV3-Large pooled features (960-d, L2-normalised) of a 224 letterbox; weights load from the local
torch cache (TORCH_HOME) and are never trained. Pairs with cosine >= threshold are written for visual
review; they are candidates, not confirmed duplicates.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from torchvision import models

ROOT = Path(__file__).resolve().parents[1] / "data"


def load(source: str, relpath: str) -> torch.Tensor:
    base = ROOT / "raw" / source
    path = (base / "extracted" if (base / "extracted").is_dir() else base) / relpath
    with Image.open(path) as image:
        image.draft("RGB", (448, 448))
        image = ImageOps.pad(ImageOps.exif_transpose(image).convert("RGB"), (224, 224), color=(0, 0, 0))
    x = torch.from_numpy(np.asarray(image, dtype=np.float32) / 255).permute(2, 0, 1)
    return (x - torch.tensor([0.485, 0.456, 0.406])[:, None, None]) / torch.tensor([0.229, 0.224, 0.225])[:, None, None]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("selections", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--threshold", type=float, default=0.92)
    args = parser.parse_args()
    rows = []
    for path in args.selections:
        with path.open(encoding="utf-8") as stream:
            rows += [{"source": r["source"], "relpath": r["relpath"], "label": r.get("label", "")} for r in csv.DictReader(stream)]
    model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.IMAGENET1K_V2).eval()
    torch.set_num_threads(8)
    feats = []
    with torch.inference_mode():
        for start in range(0, len(rows), 64):
            batch = torch.stack([load(r["source"], r["relpath"]) for r in rows[start:start + 64]])
            pooled = torch.flatten(model.avgpool(model.features(batch)), 1)
            feats.append(torch.nn.functional.normalize(pooled, dim=1).numpy())
    emb = np.concatenate(feats).astype(np.float32)
    args.out.mkdir(parents=True, exist_ok=True)
    np.save(args.out / "embeddings.npy", emb)
    pairs = []
    for start in range(0, len(emb), 2048):
        sims = emb[start:start + 2048] @ emb.T
        for i, j in zip(*np.nonzero(sims >= args.threshold)):
            a, b = start + int(i), int(j)
            if a < b:
                pairs.append((a, b, float(sims[i, j])))
    with (args.out / "pairs.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["source_a", "relpath_a", "source_b", "relpath_b", "kind", "dhash_dist", "phash_dist", "cosine"])
        for a, b, s in sorted(pairs, key=lambda x: -x[2]):
            writer.writerow([rows[a]["source"], rows[a]["relpath"], rows[b]["source"], rows[b]["relpath"],
                             "embed", "", "", round(s, 4)])
    with (args.out / "rows.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["source", "relpath", "label"])
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"images": len(rows), "pairs": len(pairs), "threshold": args.threshold}))


if __name__ == "__main__":
    main()
