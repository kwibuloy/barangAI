"""Cross-source duplicate grouping from inventory CSVs.

    python -I ml/audit/dedup.py ml/data/inventory/<a>.csv ml/data/inventory/<b>.csv ... --out ml/data/inventory/dedup

Relations (all merged with union-find into `group_id`):
  exact     identical file SHA-256
  near      dHash Hamming <= 6 and pHash Hamming <= 12, also tested against the mirrored image (flip copies)
  rf_stem   same (source, folder_label, Roboflow stem) - augmentation siblings, grouped conservatively
Candidate near pairs come from multi-index hashing (8 x 8-bit blocks of the dHash): any pair within Hamming 7
shares at least one identical block, so no qualifying pair is missed. Buckets larger than --max-bucket are
degenerate (blank/uniform images) and are reported, not expanded.

Outputs: groups.csv, near_pairs.csv, overlap.json (per source pair: images in A with a near/exact match in B),
stem_check.json (how often Roboflow stem siblings are also pixel-similar).
"""

from __future__ import annotations

import argparse
import collections
import csv
import itertools
import json
from pathlib import Path

import numpy as np


def ham(a: int, b: int) -> int:
    return (a ^ b).bit_count()


class DSU:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def near_pairs(d: list[int], dm: list[int], p: list[int], pm: list[int], max_bucket: int) -> tuple[set, int]:
    """All pairs with dHash <= 6 and pHash <= 12 (direct or mirrored); vectorised per multi-index bucket."""
    D, DM, P, PM = (np.array(x, dtype=np.uint64) for x in (d, dm, p, pm))
    pairs, skipped = set(), 0
    for queries, qp, kind in ((D, P, "near"), (DM, PM, "mirror")):
        for block in range(8):
            shift = np.uint64(8 * block)
            key_db = (D >> shift) & np.uint64(0xFF)
            key_q = (queries >> shift) & np.uint64(0xFF)
            for value in range(256):
                members = np.nonzero(key_db == value)[0]
                askers = np.nonzero(key_q == value)[0]
                if not len(members) or not len(askers):
                    continue
                if len(members) > max_bucket:
                    skipped += 1
                    continue
                for chunk in range(0, len(askers), 2048):
                    a = askers[chunk:chunk + 2048]
                    close = ((np.bitwise_count(queries[a][:, None] ^ D[members][None, :]) <= 6)
                             & (np.bitwise_count(qp[a][:, None] ^ P[members][None, :]) <= 12))
                    for x, y in zip(*np.nonzero(close)):
                        i, j = int(a[x]), int(members[y])
                        if i != j:
                            pairs.add((min(i, j), max(i, j), kind))
    # A pair found both ways keeps the direct label.
    direct = {(i, j) for i, j, k in pairs if k == "near"}
    return {(i, j, k) for i, j, k in pairs if k == "near" or (i, j) not in direct}, skipped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inventories", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-bucket", type=int, default=4000)
    parser.add_argument("--extra-pairs", nargs="*", type=Path, default=[],
                        help="pairs.csv files (e.g., from embed.py) whose pairs are merged as 'embed' relations")
    args = parser.parse_args()
    rows = []
    for path in args.inventories:
        with path.open(encoding="utf-8") as stream:
            rows += [r for r in csv.DictReader(stream) if r["decode_ok"] == "1"]
    n = len(rows)
    d = [int(r["dhash"], 16) for r in rows]
    dm = [int(r["dhash_mirror"], 16) for r in rows]
    p = [int(r["phash"], 16) for r in rows]
    pm = [int(r["phash_mirror"], 16) for r in rows]
    dsu = DSU(n)
    relations = collections.Counter()

    by_sha = collections.defaultdict(list)
    for i, r in enumerate(rows):
        by_sha[r["sha256"]].append(i)
    exact = [(g[0], j) for g in by_sha.values() for j in g[1:]]
    for a, b in exact:
        dsu.union(a, b)
    relations["exact"] = len(exact)

    pairs, skipped = near_pairs(d, dm, p, pm, args.max_bucket)
    for a, b, _ in pairs:
        dsu.union(a, b)
    relations["near_or_mirror"] = len(pairs)

    index = {(r["source"], r["relpath"]): i for i, r in enumerate(rows)}
    for path in args.extra_pairs:
        with path.open(encoding="utf-8") as stream:
            for r in csv.DictReader(stream):
                a, b = index.get((r["source_a"], r["relpath_a"])), index.get((r["source_b"], r["relpath_b"]))
                if a is not None and b is not None:
                    dsu.union(a, b)
                    relations["embed"] += 1

    stems = collections.defaultdict(list)
    for i, r in enumerate(rows):
        if r["rf_hash"]:
            stems[(r["source"], r["folder_label"], r["stem"])].append(i)
    pixel_linked = {frozenset((a, b)) for a, b, _ in pairs} | {frozenset(x) for x in exact}
    stem_groups, stem_all_similar, stem_none_similar = 0, 0, 0
    for members in stems.values():
        if len(members) < 2:
            continue
        stem_groups += 1
        links = sum(frozenset((a, b)) in pixel_linked for a, b in itertools.combinations(members[:12], 2))
        total = len(list(itertools.combinations(members[:12], 2)))
        stem_all_similar += links == total
        stem_none_similar += links == 0
        for j in members[1:]:
            dsu.union(members[0], j)
            relations["rf_stem"] += 1

    args.out.mkdir(parents=True, exist_ok=True)
    roots = [dsu.find(i) for i in range(n)]
    size = collections.Counter(roots)
    sources_in = collections.defaultdict(set)
    for i, root in enumerate(roots):
        sources_in[root].add(rows[i]["source"])
    with (args.out / "groups.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["source", "relpath", "group_id", "group_size", "group_sources"])
        for i, r in enumerate(rows):
            g = roots[i]
            writer.writerow([r["source"], r["relpath"], f"g{g:07d}", size[g], "|".join(sorted(sources_in[g]))])
    with (args.out / "near_pairs.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["source_a", "relpath_a", "source_b", "relpath_b", "kind", "dhash_dist", "phash_dist"])
        for a, b, kind in sorted(pairs):
            writer.writerow([rows[a]["source"], rows[a]["relpath"], rows[b]["source"], rows[b]["relpath"], kind,
                             ham(d[a], d[b]), ham(p[a], p[b])])

    matched = collections.defaultdict(set)  # (A, B) -> indices in A with a pixel match in B
    for a, b in list(exact) + [(a, b) for a, b, _ in pairs]:
        sa, sb = rows[a]["source"], rows[b]["source"]
        matched[(sa, sb)].add(a)
        matched[(sb, sa)].add(b)
    per_source = collections.Counter(r["source"] for r in rows)
    groups_per_source = collections.defaultdict(set)
    for i, r in enumerate(rows):
        groups_per_source[r["source"]].add(roots[i])
    overlap = {
        "images": n, "groups": len(size), "relations": relations, "degenerate_bucket_skips": skipped,
        "per_source": {s: {"images": c, "groups": len(groups_per_source[s])} for s, c in per_source.items()},
        "pixel_overlap": {f"{a} -> {b}": {"images_in_a_matched_in_b": len(ix), "share_of_a": round(len(ix) / per_source[a], 4)}
                          for (a, b), ix in sorted(matched.items())},
    }
    (args.out / "overlap.json").write_text(json.dumps(overlap, indent=1) + "\n", encoding="utf-8")
    (args.out / "stem_check.json").write_text(json.dumps(
        {"rf_stem_groups_with_2plus": stem_groups, "all_pairs_pixel_similar": stem_all_similar,
         "no_pair_pixel_similar": stem_none_similar,
         "note": "first 12 members per stem checked; 'no pair similar' means stem collision or strong augmentation"},
        indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: overlap[k] for k in ("images", "groups", "relations", "degenerate_bucket_skips")}, default=str))


if __name__ == "__main__":
    main()
