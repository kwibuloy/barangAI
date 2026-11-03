"""Cut Kap's poses out of the user's own artwork: key out the flat backdrop, recolour the vest blue.

Kap is never redrawn or regenerated (AGENTS.md); this only edits the supplied pixels.

    python scripts/kap.py design/kap-sheet.png --grid 4x2 --names skip,wave,welcome,idea,clipboard,arms,thinking,cheer
    python scripts/kap.py design/kap-thumbs.webp --names thumbs

"skip" leaves a cell out. The whole sheet is keyed at once, then each figure goes to the cell that holds most of it,
so a hand reaching into the next cell stays with its owner.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "kap"
VEST_HUE = 214 / 360  # matches --primary in styles.css


def key_out(rgb: np.ndarray) -> np.ndarray:
    """Alpha for the flat studio backdrop, including pockets enclosed by an arm."""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    backdrop = np.median(border, axis=0)
    distance = np.linalg.norm(rgb - backdrop, axis=-1)
    near, far = 14.0, 46.0
    labels, _ = ndimage.label(distance < far)
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, edge_labels[edge_labels > 0])
    # Enclosed pockets (between a raised hand and the head) only count when they are clearly backdrop-coloured.
    pockets, _ = ndimage.label(distance < near * 1.4)
    sizes = np.bincount(pockets.ravel())
    big = np.flatnonzero(sizes > 120)
    pocket_labels = np.unique(labels[np.isin(pockets, big[big > 0])])
    outside |= np.isin(labels, pocket_labels[pocket_labels > 0])
    alpha = np.ones(distance.shape)
    alpha[outside] = np.clip((distance[outside] - near) / (far - near), 0, 1)
    # Remove the backdrop tint from soft edges so they don't glow grey on white or black.
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb[:] = np.where(outside[..., None], np.clip((rgb - (1 - a) * backdrop) / a, 0, 255), rgb)
    return alpha


def recolour_vest(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    hsv = np.asarray(Image.fromarray(rgb.round().astype(np.uint8)).convert("HSV"), dtype=np.float64) / 255
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    reddish = (hue > 0.92) | (hue < 0.035)
    maroon = reddish & (sat > 0.32) & (val > 0.12) & (val < 0.8) & (alpha > 0.5)
    labels, count = ndimage.label(maroon)
    sizes = ndimage.sum(maroon, labels, range(1, count + 1))
    # Big panels are vest. Small pieces count too when they sit right beside a panel (cut off by an arm);
    # the open mouth is small and far from the vest, so it keeps its colour.
    panels = np.isin(labels, 1 + np.flatnonzero(sizes > 700))
    nearby = ndimage.binary_dilation(panels, iterations=10)
    touching = np.unique(labels[nearby & maroon])
    vest = np.isin(labels, touching[touching > 0])
    vest = ndimage.binary_closing(vest, iterations=2) & ((hue > 0.88) | (hue < 0.06)) & (sat > 0.18)
    # Fill holes so letter counters ("O" in OFFICIAL) and text fringes inside the vest turn blue too.
    vest = ndimage.binary_fill_holes(ndimage.binary_dilation(vest, iterations=1))
    vest &= ((hue > 0.85) | (hue < 0.08)) & (sat > 0.12)
    blue = np.dstack([np.full(hue.shape, VEST_HUE), np.minimum(1, sat * 1.05), np.minimum(1, val * 1.32)])
    blue = np.asarray(Image.fromarray((blue * 255).round().astype(np.uint8), "HSV").convert("RGB"), dtype=np.float64)
    return np.where(vest[..., None], blue, rgb)


def save(rgb: np.ndarray, alpha: np.ndarray, name: str) -> None:
    rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
    result = Image.fromarray(rgba, "RGBA")
    result = result.crop(result.getbbox())
    result.thumbnail((640, 640), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    result.save(OUT / f"{name}.webp", "WEBP", quality=88, method=6)
    print(OUT / f"{name}.webp", result.size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--grid", default="1x1", help="columns x rows")
    parser.add_argument("--names", required=True, help="comma-separated, left-to-right then top-to-bottom")
    args = parser.parse_args()
    columns, rows = (int(part) for part in args.grid.split("x"))
    names = args.names.split(",")
    rgb = np.asarray(Image.open(args.source).convert("RGB"), dtype=np.float64).copy()
    alpha = key_out(rgb)
    rgb = recolour_vest(rgb, alpha)
    height, width = alpha.shape
    figures, count = ndimage.label(alpha > 0.3)
    sizes = np.bincount(figures.ravel(), minlength=count + 1)
    cell_of = np.full(count + 1, -1)
    for index, box in enumerate(ndimage.find_objects(figures), start=1):
        cy, cx = ndimage.center_of_mass(figures[box] == index)
        column = min(columns - 1, int((box[1].start + cx) / (width / columns)))
        row = min(rows - 1, int((box[0].start + cy) / (height / rows)))
        cell_of[index] = row * columns + column
    for index, name in enumerate(names):
        if name == "skip":
            continue
        # Grow each figure 2px to keep its soft edge, but never into a neighbouring figure.
        # Specks under 80px are edge fragments of a neighbour; the idea pose's sparkle marks are larger.
        mine = np.isin(figures, np.flatnonzero((cell_of == index) & (sizes >= 80)))
        keep = ndimage.binary_dilation(mine, iterations=2) & ((figures == 0) | mine)
        save(rgb, alpha * keep, name)


if __name__ == "__main__":
    main()
