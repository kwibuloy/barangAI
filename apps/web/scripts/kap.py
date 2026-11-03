"""Cut Kap's poses out of the user's own artwork: key out the flat backdrop, recolour the vest green.

Kap is never redrawn or regenerated (AGENTS.md): this keys and recolours the supplied pixels, and --vest-text replaces the
printed vest label (the owner asked for "KAP", 3 Nov 2026).

    python scripts/kap.py design/kap-sheet.png --grid 4x2 --names skip,wave,welcome,idea,clipboard,arms,thinking,cheer
    python scripts/kap.py design/kap-thumbs.webp --names thumbs
    python scripts/kap.py design/kap-logo.webp --sticker --keep-colours --names logo
    python scripts/kap.py design/kap-owl-sheet-v2.webp --sticker --keep-colours --grid 4x2 --names thumbs,wave,welcome,idea,clipboard,arms,thinking,cheer
    python scripts/kap.py design/kap-bust-faces.webp --keep-colours --cells --grid 4x2 --names face-smile,face-bright,face-smug,face-blink,face-sly,face-keen,face-happy,face-calm
    python scripts/kap.py design/kap-bust-cover.webp --keep-colours --cells --grid 4x2 --names cover-0,cover-1,cover-2,cover-3,cover-4,cover-5,cover-6,cover-7
    python scripts/kap.py design/kap-bust-look.webp --keep-colours --cells --grid 4x2 --names look-left,look-upleft,look-up,look-upright,look-downright,look-right,look-down,look-downleft

The v2 sheets (3 Nov 2026) arrive with the green KAP vest already drawn, and the bust sheets arrive cut out.

"skip" leaves a cell out. The whole sheet is keyed at once, then each figure goes to the cell that holds most of it,
so a hand reaching into the next cell stays with its owner.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "kap"
VEST_HUE = 95 / 360  # Eager Green #58cc02, --primary in styles.css
VEST_VALUE = 0.8  # the vest's typical brightness after recolouring, so its folds keep their shading
PANEL_MIN = 150  # px; owl sticker poses hide most of the vest behind crossed wings


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


def key_out_stickers(rgb: np.ndarray) -> np.ndarray:
    """Alpha for sticker art on a shaded grey backdrop: everything outside each sticker's white outline goes,
    vignette and drop shadows included. The black ink line inside the white outline is never reached."""
    hsv = np.asarray(Image.fromarray(rgb.round().astype(np.uint8)).convert("HSV"), dtype=np.float64) / 255
    sat, val = hsv[..., 1], hsv[..., 2]
    grey = (sat < 0.2) & (val < 0.78)
    labels, _ = ndimage.label(grey)
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, edge_labels[edge_labels > 0])
    # Backdrop seen through a gap (between a raised wing and the head): big grey pockets that are not ink.
    pockets = grey & (val > 0.22) & ~outside
    pocket_labels, count = ndimage.label(pockets)
    sizes = ndimage.sum(pockets, pocket_labels, range(1, count + 1))
    outside |= np.isin(pocket_labels, 1 + np.flatnonzero(sizes > 400))
    # Feather the cut by one pixel: edge pixels keep as much alpha as they are white.
    inside = ~ndimage.binary_opening(outside, iterations=1)
    edge = inside & ndimage.binary_dilation(~inside, iterations=1)
    alpha = inside.astype(np.float64)
    alpha[edge] = np.clip((val[edge] - 0.45) / 0.45, 0.25, 1)
    rgb[:] = np.where(edge[..., None], 255, rgb)
    return alpha


def recolour_vest(rgb: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    hsv = np.asarray(Image.fromarray(rgb.round().astype(np.uint8)).convert("HSV"), dtype=np.float64) / 255
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    reddish = (hue > 0.92) | (hue < 0.035)
    maroon = reddish & (sat > 0.32) & (val > 0.12) & (val < 0.8) & (alpha > 0.5)
    labels, count = ndimage.label(maroon)
    sizes = ndimage.sum(maroon, labels, range(1, count + 1))
    # Big panels are vest. Small pieces count too when they sit right beside a panel (cut off by an arm);
    # the open mouth is small and far from the vest, so it keeps its colour.
    panels = np.isin(labels, 1 + np.flatnonzero(sizes > PANEL_MIN))
    nearby = ndimage.binary_dilation(panels, iterations=10)
    touching = np.unique(labels[nearby & maroon])
    vest = np.isin(labels, touching[touching > 0])
    vest = ndimage.binary_closing(vest, iterations=2) & ((hue > 0.88) | (hue < 0.06)) & (sat > 0.18)
    # Fill holes so letter counters ("O" in OFFICIAL) and text fringes inside the vest turn green too.
    vest = ndimage.binary_fill_holes(ndimage.binary_dilation(vest, iterations=1))
    vest &= ((hue > 0.85) | (hue < 0.08)) & (sat > 0.12)
    # Scale brightness so the vest's median lands on VEST_VALUE: dark folds stay darker, highlights lighter.
    gain = VEST_VALUE / max(np.median(val[vest]), 1e-3) if vest.any() else 1
    green = np.dstack([np.full(hue.shape, VEST_HUE), np.minimum(1, sat * 1.25), np.minimum(1, val * gain)])
    green = np.asarray(Image.fromarray((green * 255).round().astype(np.uint8), "HSV").convert("RGB"), dtype=np.float64)
    return np.where(vest[..., None], green, rgb), vest


VEST_FONT = Path("C:/Windows/Fonts/ariblk.ttf")  # Arial Black by default; --font takes any heavy sans .ttf


def relabel_vest(rgb: np.ndarray, vest: np.ndarray, text: str, font: Path = VEST_FONT) -> np.ndarray:
    """Replace the printed vest label (BARANGAY OFFICIAL) with `text`: find the small white letter shapes enclosed by
    the vest, fill them from the nearest vest pixel so the shading carries on, then set the new word in heavy white
    capitals in the same spot. The badge (one big white block) and the collar (outside the vest) are left alone."""
    hsv = np.asarray(Image.fromarray(rgb.round().astype(np.uint8)).convert("HSV"), dtype=np.float64) / 255
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    hull = ndimage.binary_fill_holes(ndimage.binary_dilation(vest, iterations=3))
    pale = hull & ~vest & (val > 0.55) & (sat < 0.5) & ~((hue > 0.15) & (hue < 0.45) & (sat > 0.3))
    labels, count = ndimage.label(pale)
    boxes = ndimage.find_objects(labels)
    sizes = ndimage.sum(pale, labels, range(1, count + 1))
    letters = np.zeros_like(pale)
    for index, (box, size) in enumerate(zip(boxes, sizes), start=1):
        if 4 <= size <= 300 and box[0].stop - box[0].start <= 26:
            letters[box] |= labels[box] == index
    # Letters of one label sit within a few pixels of each other; a block needs several of them.
    blocks, block_count = ndimage.label(ndimage.binary_dilation(letters, iterations=7))
    out = rgb.copy()
    for block in range(1, block_count + 1):
        mine = letters & (blocks == block)
        if ndimage.label(mine)[1] < 5:
            continue
        ys, xs = np.nonzero(mine)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        # Clear the whole label box (its soft pink fringes too), sparing ink lines, the lanyard and the sun.
        box = np.zeros_like(mine)
        box[max(0, y0 - 4) : y1 + 4, max(0, x0 - 4) : x1 + 4] = True
        keep = (val < 0.3) | ((hue > 0.5) & (hue < 0.72) & (sat > 0.3)) | ((hue > 0.1) & (hue < 0.18) & (sat > 0.5))
        hole = box & hull & ~keep
        source = vest & ~hole & ~ndimage.binary_dilation(hole, iterations=2)
        _, (ny, nx) = ndimage.distance_transform_edt(~source, return_indices=True)
        out[hole] = rgb[ny[hole], nx[hole]]
        # Soften the nearest-pixel fill so it reads as flat fabric, not a patchwork.
        blurred = np.stack([ndimage.uniform_filter(out[..., c], size=5) for c in range(3)], axis=-1)
        out[hole] = blurred[hole]
        out = stamp(out, text, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.9, (y1 - y0) * 0.78, font)
    return out


def stamp(
    rgb: np.ndarray, text: str, cx: float, cy: float, max_width: float, max_height: float, font_path: Path = VEST_FONT
) -> np.ndarray:
    """White heavy capitals centred on (cx, cy), drawn 4x larger and scaled down for clean edges."""
    scale = 4
    size = 10
    while True:
        font = ImageFont.truetype(str(font_path), (size + 1) * scale)
        left, top, right, bottom = font.getbbox(text)
        if (right - left) / scale > max_width or (bottom - top) / scale > max_height:
            break
        size += 1
    font = ImageFont.truetype(str(font_path), size * scale)
    left, top, right, bottom = font.getbbox(text)
    layer = Image.new("L", (right - left + 8 * scale, bottom - top + 8 * scale), 0)
    ImageDraw.Draw(layer).text((4 * scale - left, 4 * scale - top), text, font=font, fill=255)
    layer = layer.resize((layer.width // scale, layer.height // scale), Image.LANCZOS)
    mask = np.asarray(layer, dtype=np.float64)[..., None] / 255
    x = int(round(cx - layer.width / 2))
    y = int(round(cy - layer.height / 2))
    region = rgb[y : y + layer.height, x : x + layer.width]
    rgb[y : y + layer.height, x : x + layer.width] = region * (1 - mask) + 250 * mask
    return rgb


def save(rgb: np.ndarray, alpha: np.ndarray, name: str, cell: tuple[int, int, int, int] | None = None) -> None:
    rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
    result = Image.fromarray(rgba, "RGBA")
    # --cells keeps the whole grid cell, so frames of one sequence stay registered and can swap in place.
    result = result.crop(cell or result.getbbox())
    result.thumbnail((640, 640), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    result.save(OUT / f"{name}.webp", "WEBP", quality=88, method=6)
    print(OUT / f"{name}.webp", result.size)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--grid", default="1x1", help="columns x rows")
    parser.add_argument("--sticker", action="store_true", help="white-outlined stickers on a shaded backdrop")
    parser.add_argument("--keep-colours", action="store_true", help="skip the vest recolour (the head-only logo)")
    parser.add_argument("--vest-text", help="replace the printed vest label with this word, e.g. KAP")
    parser.add_argument("--font", type=Path, default=VEST_FONT, help="heavy sans .ttf for --vest-text")
    parser.add_argument("--cells", action="store_true", help="crop every pose to its full grid cell (animation frames)")
    parser.add_argument("--names", required=True, help="comma-separated, left-to-right then top-to-bottom")
    args = parser.parse_args()
    columns, rows = (int(part) for part in args.grid.split("x"))
    names = args.names.split(",")
    image = Image.open(args.source)
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64).copy()
    supplied = np.asarray(image.convert("RGBA"))[..., 3] / 255
    if supplied.min() < 0.04:
        # The art already comes cut out (the bust sheets): keep its own edges.
        alpha = supplied
    else:
        alpha = key_out_stickers(rgb) if args.sticker else key_out(rgb)
    if not args.keep_colours:
        rgb, vest = recolour_vest(rgb, alpha)
        if args.vest_text:
            if not args.font.exists():
                parser.error(f"font not found: {args.font}; pass --font path/to/heavy-sans.ttf")
            rgb = relabel_vest(rgb, vest, args.vest_text, args.font)
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
        column, row = index % columns, index // columns
        cell = (
            round(column * width / columns),
            round(row * height / rows),
            round((column + 1) * width / columns),
            round((row + 1) * height / rows),
        )
        save(rgb, alpha * keep, name, cell if args.cells else None)


if __name__ == "__main__":
    main()
