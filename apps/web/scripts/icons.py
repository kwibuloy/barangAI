"""Home-screen icons and favicons for the installable web app, made from the user's Kap logo sticker (never redrawn).

Run from apps/web: python scripts/icons.py (after kap.py has cut src/assets/kap/logo.webp). Writes public/icons/*.png,
public/favicon.png and the Android app's launcher icons and splash mark (apps/mobile/android, rebuilt into the APK). Maskable icons keep Kap inside the
middle 80% so Android's round or squircle masks never cut him.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "assets" / "kap" / "logo.webp"
OUT = ROOT / "public" / "icons"
ANDROID = ROOT.parent / "mobile" / "android" / "app" / "src" / "main" / "res"
# Launcher size and adaptive-layer size (108dp canvas) per screen density.
DENSITIES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
BACKGROUND = (215, 255, 184, 255)  # Storybook Green, the soft green wash in styles.css


def icon(size, fill, background=BACKGROUND):
    kap = Image.open(SOURCE).convert("RGBA")
    kap = kap.crop(kap.getbbox())
    box = int(size * fill)
    kap.thumbnail((box, box), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background)
    canvas.alpha_composite(kap, ((size - kap.width) // 2, (size - kap.height) // 2))
    return canvas if background[3] == 0 else canvas.convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        icon(size, 0.86).save(OUT / f"icon-{size}.png", optimize=True)
        icon(size, 0.66).save(OUT / f"maskable-{size}.png", optimize=True)
    icon(180, 0.8).save(OUT / "apple-touch-icon.png", optimize=True)
    # Browser tab: the sticker alone on transparency, as large as the square allows.
    icon(64, 1.0, (0, 0, 0, 0)).save(ROOT / "public" / "favicon.png", optimize=True)
    # Android: adaptive icons draw the foreground over the green background colour (ic_launcher_background.xml) and
    # mask it to the phone's shape, keeping only the middle 66dp of 108dp, so Kap fills about 60% of the layer.
    clear = (0, 0, 0, 0)
    for density, (size, layer) in DENSITIES.items():
        folder = ANDROID / f"mipmap-{density}"
        icon(layer, 0.6, clear).save(folder / "ic_launcher_foreground.png", optimize=True)
        icon(size, 0.8).save(folder / "ic_launcher.png", optimize=True)
        round_icon = icon(size, 0.74).convert("RGBA")
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        round_icon.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
        round_icon.save(folder / "ic_launcher_round.png", optimize=True)
    # The splash mark: the sticker alone, centred on the splash colour by drawable/splash.xml.
    (ANDROID / "drawable-nodpi").mkdir(exist_ok=True)
    icon(288, 1.0, clear).save(ANDROID / "drawable-nodpi" / "splash_kap.png", optimize=True)
    print(sorted(path.name for path in OUT.iterdir()))
