"""Checks for the audit hashing and duplicate search.  Run: python -m pytest ml/audit -q"""

import io
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from dedup import ham, near_pairs  # noqa: E402
from inventory import hashes  # noqa: E402


def scene(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 255, (12, 16, 3), dtype=np.uint8)  # smooth random structure after upsampling
    return Image.fromarray(base).resize((320, 240), Image.Resampling.BICUBIC)


def h(image):
    x = hashes(image)
    return [int(x[k], 16) for k in ("dhash", "dhash_mirror", "phash", "phash_mirror")]


def recompress(image, quality=40):
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality)
    return Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")


def pairs_for(images):
    d, dm, p, pm = zip(*(h(i) for i in images))
    return {(a, b) for a, b, _ in near_pairs(list(d), list(dm), list(p), list(pm), max_bucket=10_000)[0]}


def test_copies_match_and_unrelated_do_not():
    a, b = scene(1), scene(2)
    found = pairs_for([a, recompress(a), a.resize((160, 120)), ImageOps.mirror(a), b])
    assert {(0, 1), (0, 2), (0, 3)} <= found
    assert not any(4 in pair for pair in found)


def test_multi_index_finds_every_pair_brute_force_finds():
    rng = random.Random(0)
    base = [rng.getrandbits(64) for _ in range(300)]
    d = base + [x ^ (1 << rng.randrange(64)) ^ (1 << rng.randrange(64)) for x in base[:200]]  # close variants
    p = [0] * len(d)  # pHash identical so only dHash decides
    found = {(a, b) for a, b, k in near_pairs(d, d, p, p, max_bucket=10_000)[0] if k == "near"}
    brute = {(i, j) for i in range(len(d)) for j in range(i + 1, len(d)) if ham(d[i], d[j]) <= 6}
    assert found == brute
