"""Draw the app backdrop: map-style contour rings (the barangay map) as one SVG used as a CSS mask.

    python scripts/backdrop.py

Regenerate after changing the clusters below. The output is a mask, so its colour comes from CSS (light and dark).
"""

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "backdrop-contours.svg"
WIDTH, HEIGHT = 1600, 1000
# (centre x, centre y, first radius, ring gap, rings, wobble seed)
CLUSTERS = [(1350, 120, 40, 34, 11, 1.3), (180, 640, 30, 30, 10, 2.1), (980, 980, 50, 36, 8, 0.7)]


def ring(cx: float, cy: float, radius: float, seed: float) -> str:
    points = []
    for step in range(97):
        angle = step / 96 * math.tau
        wobble = (
            1 + 0.11 * math.sin(2 * angle + seed) + 0.06 * math.sin(3 * angle + seed * 2) + 0.03 * math.sin(5 * angle)
        )
        points.append((cx + radius * wobble * math.cos(angle), cy + radius * wobble * 0.82 * math.sin(angle)))
    path = f"M{points[0][0]:.1f} {points[0][1]:.1f}"
    path += "".join(f"L{x:.1f} {y:.1f}" for x, y in points[1:])
    return path + "Z"


def main() -> None:
    paths = []
    for cx, cy, first, gap, count, seed in CLUSTERS:
        for index in range(count):
            # Every fourth ring is an "index contour", drawn heavier as on survey maps.
            width = 2.2 if index % 4 == 3 else 1.1
            paths.append(f'<path d="{ring(cx, cy, first + index * gap, seed + index * 0.05)}" stroke-width="{width}"/>')
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="xMidYMid slice">'
        f'<g fill="none" stroke="#000">{"".join(paths)}</g></svg>'
    )
    OUT.write_text(svg, encoding="utf-8")
    print(OUT, len(svg) // 1024, "KB")


if __name__ == "__main__":
    main()
