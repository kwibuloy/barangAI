"""Measure face blurring: how many faces it covers, and what else it blurs.

Keep the photos out of Git (artifacts/ is ignored). --faces holds FFHQ-aligned 1024 px synthetic portraits, whose face position is known;
each is pasted on a --scenes photo at a set size, tilt or simulated head turn, so the face region is known exactly. A
face counts as covered when at least 70% of it falls inside the blurred area. Scene photos are also run on their own,
and --boxes writes a crop of every box there for checking by eye, since a scene photo can hold real faces. Pasted faces
are easier than real ones, and the turn is a warp, not a real side view. Keep tune and test apart: tune on `tune`, and
report only `test`. --skip leaves out scene photos with people in them.

    .venv/Scripts/python.exe apps/api/tools/evaluate_faces.py --faces artifacts/faces --scenes artifacts/scenes --split test
"""

import argparse
import json
import math
import os
import random
import sys
import time
from pathlib import Path

import numpy as np

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))
os.environ["FACE_BLUR"] = "on"

import cv2  # noqa: E402
from barangai import privacy  # noqa: E402
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter  # noqa: E402

FACE = (240, 330, 785, 830)  # the face in an FFHQ-aligned 1024 px portrait
FACE_WIDTH = FACE[2] - FACE[0]
CONDITIONS = {
    **{f"width {width} px": {"width": width} for width in (300, 120, 60, 36, 24)},
    **{f"tilt {tilt}": {"width": 120, "tilt": tilt} for tilt in (15, 30, 45, 90, 180)},
    **{f"simulated turn {turn}": {"width": 120, "turn": turn} for turn in (30, 45, 60)},
    "dark": {"width": 120, "dark": 0.35},
    "small and tilted": {"width": 48, "tilt": 20},
}


def haar(image):
    """The cascade privacy.py used until 3 Nov 2026, as the baseline."""
    cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    scale = min(1.0, 640 / max(image.size))
    small = image.convert("L").resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))))
    boxes = cascade.detectMultiScale(np.asarray(small), scaleFactor=1.15, minNeighbors=6, minSize=(20, 20))
    return [tuple(round(int(value) / scale) for value in box) for box in boxes]


def turned(picture, degrees):
    """The picture wrapped on a cylinder turned by this many degrees, a rough stand-in for a head turning."""
    width, height = picture.size
    xs = (np.arange(width) - width / 2) / (width / 2)
    source = np.sin(np.arcsin(np.clip(xs, -1, 1)) - math.radians(degrees))
    map_x = np.tile(((source + 1) * width / 2).astype(np.float32), (height, 1))
    map_y = np.tile(np.arange(height, dtype=np.float32)[:, None], (1, width))
    return Image.fromarray(cv2.remap(np.asarray(picture), map_x, map_y, cv2.INTER_LINEAR))


def compose(scene_path, face_path, seed, width, tilt=0, turn=0, dark=1.0):
    """The scene, 1,600 px on its long side, with the face pasted on it, and a mask of where the face is."""
    with Image.open(scene_path) as image:
        scene = image.convert("RGB")
    scale = 1600 / max(scene.size)
    scene = scene.resize((round(scene.width * scale), round(scene.height * scale)))
    with Image.open(face_path) as image:
        face = image.convert("RGB")
    truth = Image.new("L", face.size, 0)
    ImageDraw.Draw(truth).rectangle(FACE, fill=255)
    edge = Image.new("L", face.size, 0)
    ImageDraw.Draw(edge).ellipse((110, 60, 914, 1010), fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(25))
    if turn:
        face, truth, edge = turned(face, turn), turned(truth, turn), turned(edge, turn)
    size = max(4, round(1024 * width / FACE_WIDTH))
    face, truth, edge = (
        face.resize((size, size), Image.Resampling.LANCZOS),
        truth.resize((size, size)),
        edge.resize((size, size)),
    )
    if tilt:
        face = face.rotate(tilt, expand=True, resample=Image.Resampling.BICUBIC)
        truth, edge = truth.rotate(tilt, expand=True), edge.rotate(tilt, expand=True)
    if dark != 1:
        face = ImageEnhance.Brightness(face).enhance(dark)
    rng = random.Random(seed)
    where = rng.randint(0, max(0, scene.width - face.width)), rng.randint(0, max(0, scene.height - face.height))
    scene.paste(face, where, edge)
    mask = Image.new("L", scene.size, 0)
    mask.paste(truth, where, truth)
    return scene, np.asarray(mask) > 127


def covered(mask, boxes):
    blurred = np.zeros_like(mask)
    for left, top, width, height in boxes:  # with the same margin as privacy.blur_faces
        pad_x, pad_y = width // 4, height // 4
        blurred[max(0, top - pad_y) : top + height + pad_y, max(0, left - pad_x) : left + width + pad_x] = True
    return (mask & blurred).sum() / max(1, mask.sum())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--faces", type=Path, required=True)
    parser.add_argument("--scenes", type=Path, required=True)
    parser.add_argument("--split", choices=["tune", "test"], default="test")
    parser.add_argument("--skip", default="", help="comma-separated scene file stems to leave out of the composites")
    parser.add_argument("--boxes", type=Path, help="folder for crops of every box on the scene photos")
    args = parser.parse_args()
    cv2.setNumThreads(1)
    every = args.split == "test"
    skip = set(filter(None, args.skip.split(",")))
    all_scenes = sorted(args.scenes.glob("*.jpg"))
    scenes = [path for path in all_scenes if path.stem not in skip][every::2]
    faces = sorted(args.faces.glob("*.jpg"))[every::2]
    detectors = {"haar (old)": haar, "yunet (current)": privacy.find_faces}
    results = {"split": args.split, "faces": len(faces), "scenes": len(scenes), "conditions": {}, "scene_photos": {}}
    totals = dict.fromkeys(detectors, 0)
    for condition, settings in CONDITIONS.items():
        pictures = [compose(scenes[i % len(scenes)], face, i, **settings) for i, face in enumerate(faces)]
        row = results["conditions"][condition] = {}
        for name, detect in detectors.items():
            row[name] = sum(covered(mask, detect(picture)) >= 0.7 for picture, mask in pictures)
            row[name] = int(row[name])
            totals[name] += row[name]
        print(condition, row, flush=True)
    results["covered"] = {name: f"{hits}/{len(faces) * len(CONDITIONS)}" for name, hits in totals.items()}
    for name, detect in detectors.items():
        started, found = time.perf_counter(), {}
        for path in all_scenes:  # every photo, people included: check the boxes by eye
            with Image.open(path) as image:
                picture = image.convert("RGB")
            boxes = detect(picture)
            if boxes:
                found[path.stem] = [[int(value) for value in box] for box in boxes]
                if args.boxes:
                    args.boxes.mkdir(parents=True, exist_ok=True)
                    for number, (left, top, width, height) in enumerate(boxes):
                        margin = max(width, height)
                        crop = picture.crop((left - margin, top - margin, left + width + margin, top + height + margin))
                        crop.save(args.boxes / f"{name.split()[0]}-{path.stem}-{number}.jpg", quality=90)
        elapsed = (time.perf_counter() - started) / max(1, len(all_scenes)) * 1000
        results["scene_photos"][name] = {"photos": len(all_scenes), "boxes": found, "ms_per_photo": round(elapsed)}
    print(json.dumps({key: results[key] for key in ("split", "faces", "scenes", "covered", "scene_photos")}, indent=1))


if __name__ == "__main__":
    main()
