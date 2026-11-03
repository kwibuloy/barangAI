"""Home-screen icons for the installable web app, made from Kap's existing pose art (never redrawn).

Run from apps/web: python scripts/icons.py. Writes public/icons/*.png. Maskable icons keep Kap inside the
middle 80% so Android's round or squircle masks never cut him.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "assets" / "kap" / "wave.webp"
OUT = ROOT / "public" / "icons"
BACKGROUND = (245, 244, 241, 255)  # the app's warm light background (styles.css --background)


def icon(size, fill):
    kap = Image.open(SOURCE).convert("RGBA")
    kap = kap.crop(kap.getbbox())
    box = int(size * fill)
    kap.thumbnail((box, box), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    canvas.alpha_composite(kap, ((size - kap.width) // 2, (size - kap.height) // 2))
    return canvas.convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        icon(size, 0.86).save(OUT / f"icon-{size}.png", optimize=True)
        icon(size, 0.66).save(OUT / f"maskable-{size}.png", optimize=True)
    icon(180, 0.8).save(OUT / "apple-touch-icon.png", optimize=True)
    print(sorted(path.name for path in OUT.iterdir()))
