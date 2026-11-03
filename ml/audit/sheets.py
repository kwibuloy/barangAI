"""Contact sheets for human review (written under ml/data/review/, git-ignored).

    python -I ml/audit/sheets.py grid  --inventory ml/data/inventory/X.csv --where folder_label=Garbage --n 48 --name x
    python -I ml/audit/sheets.py pairs --pairs ml/data/inventory/dedup/near_pairs.csv --n 40 --name y [--cross-source]
    python -I ml/audit/sheets.py stems --inventory ml/data/inventory/X.csv --n 16 --name z

Every sheet has a matching CSV listing each numbered tile (source, relpath) with an empty `decision` column
for the reviewer. Sampling is seeded (--seed, default 0) so sheets are reproducible.
"""

from __future__ import annotations

import argparse
import collections
import csv
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1] / "data"
TILE = 200


def raw_path(source: str, relpath: str) -> Path:
    base = ROOT / "raw" / source
    return (base / "extracted" if (base / "extracted").is_dir() else base) / relpath


def tile(source: str, relpath: str, caption: str) -> Image.Image:
    canvas = Image.new("RGB", (TILE, TILE + 28), "white")
    try:
        with Image.open(raw_path(source, relpath)) as image:
            image.draft("RGB", (TILE * 2, TILE * 2))
            thumb = ImageOps.exif_transpose(image).convert("RGB")
            thumb.thumbnail((TILE, TILE))
            canvas.paste(thumb, ((TILE - thumb.width) // 2, (TILE - thumb.height) // 2))
    except Exception as error:
        ImageDraw.Draw(canvas).text((4, TILE // 2), f"ERROR {type(error).__name__}", fill="red")
    ImageDraw.Draw(canvas).text((3, TILE + 2), caption[:34], fill="black")
    ImageDraw.Draw(canvas).text((3, TILE + 14), caption[34:68], fill="black")
    return canvas


def save(tiles: list[Image.Image], columns: int, name: str, records: list[dict]) -> None:
    out = ROOT / "review"
    out.mkdir(parents=True, exist_ok=True)
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * TILE, rows * (TILE + 28)), "gray")
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % columns) * TILE, (i // columns) * (TILE + 28)))
    sheet.save(out / f"{name}.jpg", quality=85)
    with (out / f"{name}.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=[*records[0].keys(), "decision", "note"])
        writer.writeheader()
        writer.writerows(records)
    print(out / f"{name}.jpg", len(records))


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def grid(args) -> None:
    rows = [r for r in read(args.inventory) if r["decode_ok"] == "1"]
    for cond in args.where or []:
        key, _, value = cond.partition("=")
        rows = [r for r in rows if (value in r[key].split(";") if key == "box_classes" else r[key] == value)]
    if args.one_per_stem:
        seen, unique = set(), []
        for r in sorted(rows, key=lambda r: (r["folder_label"], r["stem"], r["relpath"])):
            if (r["folder_label"], r["stem"]) not in seen:
                seen.add((r["folder_label"], r["stem"]))
                unique.append(r)
        rows = unique
    random.Random(args.seed).shuffle(rows)
    picked = rows[: args.n]
    records = [{"tile": i, "source": r["source"], "relpath": r["relpath"], "folder_label": r["folder_label"],
                "box_classes": r["box_classes"]} for i, r in enumerate(picked)]
    save([tile(r["source"], r["relpath"], f"{i} {r['folder_label'][-16:]} {r['box_classes'][:14]}")
          for i, r in enumerate(picked)], 8, args.name, records)


def pairs(args) -> None:
    rows = read(args.pairs)
    if args.cross_source:
        rows = [r for r in rows if r["source_a"] != r["source_b"]]
    if args.min_dist is not None:
        rows = [r for r in rows if int(r["dhash_dist"]) >= args.min_dist]
    random.Random(args.seed).shuffle(rows)
    picked = rows[: args.n]
    tiles, records = [], []
    for i, r in enumerate(picked):
        tiles += [tile(r["source_a"], r["relpath_a"], f"{i}A {r['source_a']} d{r['dhash_dist']} p{r['phash_dist']}"),
                  tile(r["source_b"], r["relpath_b"], f"{i}B {r['source_b']} {r['kind']}")]
        records.append({"pair": i, **r})
    save(tiles, 8, args.name, records)


def stems(args) -> None:
    groups = collections.defaultdict(list)
    for r in read(args.inventory):
        if r["rf_hash"] and r["decode_ok"] == "1":
            groups[(r["folder_label"], r["stem"])].append(r)
    multi = [g for g in groups.values() if len(g) >= 2]
    random.Random(args.seed).shuffle(multi)
    tiles, records = [], []
    for i, g in enumerate(multi[: args.n]):
        for r in g[:4]:
            tiles.append(tile(r["source"], r["relpath"], f"{i} {r['stem'][:20]} {r['supplied_split']}"))
            records.append({"stem_group": i, "source": r["source"], "relpath": r["relpath"], "split": r["supplied_split"]})
        tiles += [Image.new("RGB", (TILE, TILE + 28), "gray")] * (4 - min(4, len(g)))
    save(tiles, 8, args.name, records)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="mode", required=True)
    p = sub.add_parser("grid"); p.add_argument("--inventory", type=Path, required=True); p.add_argument("--where", nargs="*")
    p.add_argument("--one-per-stem", action="store_true"); p.set_defaults(run=grid)
    p = sub.add_parser("pairs"); p.add_argument("--pairs", type=Path, required=True); p.add_argument("--cross-source", action="store_true")
    p.add_argument("--min-dist", type=int); p.set_defaults(run=pairs)
    p = sub.add_parser("stems"); p.add_argument("--inventory", type=Path, required=True); p.set_defaults(run=stems)
    for p in sub.choices.values():
        p.add_argument("--n", type=int, default=48); p.add_argument("--name", required=True); p.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
