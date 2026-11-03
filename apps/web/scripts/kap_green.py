"""Recolour the blue vest on the approved sign-in Kap art (already cut out, KAP lettering included) to Eager Green,
and save it as WebP beside the source. Only the vest's saturated blue changes; the sky-blue lanyard and badge,
lighter and less saturated, keep their colour. Kap is never redrawn (AGENTS.md).

    python scripts/kap_green.py path/to/kap-pose.png ...   (the originals are in git history before 3 Nov 2026)
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

VEST_HUE = 95 / 360  # Eager Green #58cc02, matching scripts/kap.py
VEST_VALUE = 0.8


def green(path: Path) -> Path:
    image = Image.open(path).convert("RGBA")
    rgba = np.asarray(image, dtype=np.float64)
    hsv = np.asarray(image.convert("RGB").convert("HSV"), dtype=np.float64) / 255
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    vest = (hue > 0.58) & (hue < 0.7) & (sat > 0.55) & (val < 0.9) & (rgba[..., 3] > 0)
    gain = VEST_VALUE / max(np.median(val[vest]), 1e-3)
    shifted = np.dstack([np.full(hue.shape, VEST_HUE), np.minimum(1, sat * 0.98), np.minimum(1, val * gain)])
    rgb = np.asarray(Image.fromarray((shifted * 255).round().astype(np.uint8), "HSV").convert("RGB"))
    out = rgba.copy()
    out[..., :3] = np.where(vest[..., None], rgb, rgba[..., :3])
    target = path.with_suffix(".webp")
    Image.fromarray(out.round().astype(np.uint8), "RGBA").save(target, "WEBP", quality=90, method=6)
    return target


if __name__ == "__main__":
    for name in sys.argv[1:]:
        print(green(Path(name)))
