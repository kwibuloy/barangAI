"""Per-image inventory of a downloaded source: decode check, size, EXIF/GPS, hashes, labels.

    python -I ml/audit/inventory.py ml/data/raw/<name>            # writes ml/data/inventory/<name>.csv + .summary.json

Reads only; the raw source is never modified. Columns are documented in docs/ml/dataset_review_report.md.
Hashes: SHA-256 of file bytes; 64-bit dHash (9x8 gradient) of the image and its mirror; 64-bit pHash
(32x32 DCT, 8x8 low band). YOLO labels are matched as images/<x>.<ext> -> labels/<x>.txt or a same-folder .txt,
with class names from the nearest data.yaml/config.yaml above the label.
"""

from __future__ import annotations

import collections
import concurrent.futures as cf
import csv
import hashlib
import json
import os
import re
import statistics
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")  # one BLAS thread per worker; pools otherwise exhaust memory
import numpy as np  # noqa: E402
from PIL import Image, ImageOps

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SPLITS = {"train", "valid", "val", "test", "training", "validation", "testing"}
GENERIC = SPLITS | {"images", "labels", "extracted", "data", "dataset", "obj", "img", "imgs", "real"}
RF = re.compile(r"^(?P<stem>.+?)_(?:jpe?g|png|webp|bmp)\.rf\.(?P<h>[0-9a-f]{20,})$", re.I)
Image.MAX_IMAGE_PIXELS = 200_000_000
_NAMES: dict = {}  # per-process cache: folder -> class names
_DCT = np.cos(np.pi * (2 * np.arange(32)[None, :] + 1) * np.arange(32)[:, None] / 64)
FIELDS = ["source", "relpath", "supplied_split", "folder_label", "stem", "rf_hash", "bytes", "sha256", "width",
          "height", "mode", "format", "decode_ok", "error", "has_exif", "has_gps", "dhash", "dhash_mirror", "phash", "phash_mirror", "black_frac",
          "label_status", "n_boxes", "box_classes", "max_box_area"]


def _bits(values: np.ndarray) -> str:
    return f"{int(''.join('1' if v else '0' for v in values.flatten()), 2):016x}"


def _phash(gray32: np.ndarray) -> str:
    low = (_DCT @ gray32 @ _DCT.T)[:8, :8].flatten()
    return _bits(low > np.median(low[1:]))


def hashes(image: Image.Image) -> dict[str, str | float]:
    gray = image.convert("L")
    small = np.asarray(gray.resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    mirror = small[:, ::-1]
    g32 = np.asarray(gray.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float64)
    rgb = np.asarray(image.convert("RGB").resize((64, 64)), dtype=np.uint8)
    return {"dhash": _bits(small[:, 1:] > small[:, :-1]), "dhash_mirror": _bits(mirror[:, 1:] > mirror[:, :-1]),
            "phash": _phash(g32), "phash_mirror": _phash(g32[:, ::-1]),
            # share of near-black pixels: letterboxing, cutout/mosaic padding
            "black_frac": round(float((rgb.max(axis=2) < 12).mean()), 3)}


def _names_for(label: Path, root: Path, cache: dict) -> dict[int, str]:
    for folder in [label.parent, *label.parents]:
        if folder in cache:
            return cache[folder]
        for name in ("data.yaml", "config.yaml"):
            path = folder / name
            if path.is_file():
                import yaml
                raw = (yaml.safe_load(path.read_text(encoding="utf-8", errors="replace")) or {}).get("names", {})
                names = dict(enumerate(raw)) if isinstance(raw, list) else {int(k): str(v) for k, v in raw.items()}
                cache[folder] = names
                return names
        if folder == root:
            break
    return {}


def _label_for(image: Path) -> Path | None:
    parts = list(image.parts)
    for i in range(len(parts) - 1, -1, -1):
        if parts[i] == "images":
            candidate = Path(*parts[:i], "labels", *parts[i + 1:]).with_suffix(".txt")
            if candidate.is_file():
                return candidate
    same = image.with_suffix(".txt")
    return same if same.is_file() else None


def inspect(args: tuple[str, str, str]) -> dict:
    source, root_s, path_s = args
    root, path = Path(root_s), Path(path_s)
    rel = path.relative_to(root)
    parts = [p for p in rel.parts[:-1]]
    split = next((p.lower() for p in parts if p.lower() in SPLITS), "")
    folder = "/".join(p for p in parts if p.lower() not in GENERIC)
    match = RF.match(path.stem)
    row = {"source": source, "relpath": rel.as_posix(), "supplied_split": split, "folder_label": folder,
           "stem": match["stem"] if match else path.stem, "rf_hash": match["h"] if match else "",
           "bytes": path.stat().st_size, "decode_ok": 0, "error": ""}
    with path.open("rb") as stream:
        row["sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    try:
        with Image.open(path) as image:
            row.update(format=image.format, mode=image.mode)
            exif = image.getexif()
            row["has_exif"] = int(len(exif) > 0)
            row["has_gps"] = int(bool(exif.get_ifd(0x8825)) if exif else 0)
            image.draft("RGB", (256, 256))  # fast JPEG decode for hashing
            image = ImageOps.exif_transpose(image)
            image.load()
            row["width"], row["height"] = _true_size(path)
            row.update(hashes(image))
            row["decode_ok"] = 1
    except Exception as error:  # record and continue; corrupt files are findings
        row["error"] = f"{type(error).__name__}: {str(error)[:120]}"
    label = _label_for(path)
    if label is None:
        row["label_status"] = "none"
    else:
        lines = [l.split() for l in label.read_text(encoding="utf-8", errors="replace").splitlines() if l.strip()]
        try:
            classes = [int(float(l[0])) for l in lines]
            coords = [[float(v) for v in l[1:]] for l in lines]
            ok = all(len(c) >= 4 and all(-0.01 <= v <= 1.01 for v in c) for c in coords)
        except ValueError:
            classes, coords, ok = [], [], False
        names = _names_for(label, root, _NAMES)
        row["label_status"] = "empty" if not lines else ("ok" if ok else "invalid")
        row["n_boxes"] = len(lines)
        row["box_classes"] = ";".join(sorted({names.get(c, str(c)) for c in classes}))
        areas = []
        for c in coords:
            if len(c) == 4:
                areas.append(c[2] * c[3])
            elif len(c) >= 6:
                xs, ys = c[0::2], c[1::2]
                areas.append((max(xs) - min(xs)) * (max(ys) - min(ys)))
        row["max_box_area"] = round(max(areas), 4) if areas else ""
    return row


def _true_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        width, height = image.size
        orientation = image.getexif().get(0x0112, 1)
    return (height, width) if orientation in (5, 6, 7, 8) else (width, height)


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if r["decode_ok"]]
    dims = [(int(r["width"]), int(r["height"])) for r in ok]
    def stats(values):
        return {"min": min(values), "p50": int(statistics.median(values)), "max": max(values)} if values else {}
    return {
        "images": len(rows), "decode_failures": len(rows) - len(ok),
        "unique_sha256": len({r["sha256"] for r in rows}),
        "unique_rf_stems": len({(r["folder_label"], r["stem"]) for r in rows}),
        "unique_dhash": len({r.get("dhash") for r in ok}),
        "width": stats([w for w, _ in dims]), "height": stats([h for _, h in dims]),
        "short_side_lt_224": sum(min(d) < 224 for d in dims),
        "square_640": sum(d == (640, 640) for d in dims),
        "formats": collections.Counter(r.get("format") for r in rows).most_common(),
        "with_exif": sum(int(r.get("has_exif") or 0) for r in rows), "with_gps": sum(int(r.get("has_gps") or 0) for r in rows),
        "by_split": collections.Counter(r["supplied_split"] for r in rows).most_common(),
        "by_folder_label": collections.Counter(r["folder_label"] for r in rows).most_common(60),
        "label_status": collections.Counter(r.get("label_status") for r in rows).most_common(),
        "box_classes": collections.Counter(c for r in rows for c in (r.get("box_classes") or "").split(";") if c).most_common(60),
        "rf_stems_in_multiple_splits": sum(1 for s in _split_sets(rows).values() if len(s) > 1),
    }


def _split_sets(rows):
    sets = collections.defaultdict(set)
    for r in rows:
        if r["rf_hash"]:
            sets[(r["folder_label"], r["stem"])].add(r["supplied_split"])
    return sets


def main() -> None:
    raw = Path(sys.argv[1]).resolve()
    source = raw.name
    root = raw / "extracted" if (raw / "extracted").is_dir() else raw
    # Masks/label rasters are annotations, not photographs.
    paths = sorted(p for p in root.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file()
                   and not {"labels", "masks", "mask", "annotations"} & {q.lower() for q in p.relative_to(root).parts[:-1]})
    out = raw.parents[1] / "inventory"
    out.mkdir(parents=True, exist_ok=True)
    with cf.ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 1)) as pool:
        rows = list(pool.map(inspect, [(source, str(root), str(p)) for p in paths], chunksize=64))
    with (out / f"{source}.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    summary = summarize(rows) | {"source": source}
    (out / f"{source}.summary.json").write_text(json.dumps(summary, indent=1, default=str) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("source", "images", "decode_failures", "unique_sha256", "unique_rf_stems",
                                               "unique_dhash", "width", "height", "rf_stems_in_multiple_splits")}))


if __name__ == "__main__":
    main()
