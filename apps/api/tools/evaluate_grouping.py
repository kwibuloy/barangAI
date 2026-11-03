"""Measure automatic duplicate suggestions on labelled photo pairs, and choose a similarity cutoff.

The manifest is a CSV with columns
`path_a,path_b,latitude_a,longitude_a,latitude_b,longitude_b,category,resident_category_a,same,split`: two photos
(relative to --root) with the places they were taken; `b` is the earlier report, `a` the new one. `category` is what
staff verified for `b`, `resident_category_a` what the resident filing `a` chose (blank means the same as
`category`); `same` is whether staff judge them one incident (`yes`/`no`), and split is `tune` or `test`. Include hard negatives: neighbouring
street lights, two potholes on one road. Choose the cutoff on `tune` only and report results on `test` only.

    .venv/Scripts/python.exe apps/api/tools/evaluate_grouping.py --manifest data/pairs.csv --root data

A suggestion is decided as on submission (cases.suggest_duplicates): the new report's resident category sets the
radius (cases.RADIUS_M) and must match the earlier report's verified category, and the pair must pass
duplicates.candidate_score, whose similarity cutoff of 0.85 is fixed. The distance table uses the tune split. The tuning
table shows how other cutoffs would do; changing the cutoff means changing the frozen duplicates.py, which
needs the group's decision. Results go to --out (default artifacts/grouping-evaluation/<timestamp>).
"""

import argparse
import csv
import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))

from barangai.cases import RADIUS_M, distance_m  # noqa: E402
from barangai.duplicates import candidate_score  # noqa: E402

CUTOFFS = [round(0.70 + 0.01 * step, 2) for step in range(26)]


def read_manifest(path: Path, root: Path):
    rows = []
    with path.open(newline="", encoding="utf-8") as handle:
        for line, row in enumerate(csv.DictReader(handle), start=2):
            row["resident_category_a"] = (row.get("resident_category_a") or "").strip() or row["category"]
            if (
                row["category"] not in RADIUS_M
                or row["resident_category_a"] not in RADIUS_M
                or row["same"] not in {"yes", "no"}
                or row["split"] not in {"tune", "test"}
            ):
                raise SystemExit(f"{path}:{line}: check the categories, same (yes/no) and split (tune/test)")
            rows.append(
                {
                    **row,
                    "path_a": root / row["path_a"],
                    "path_b": root / row["path_b"],
                    **{key: float(row[key]) for key in ("latitude_a", "longitude_a", "latitude_b", "longitude_b")},
                }
            )
    return rows


def cosine(a, b):
    norm = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b, strict=True)) / norm if norm else 0.0


def measure(rows, embed):
    """Distance, similarity and the live suggestion decision for each pair; `embed` maps a path to a vector."""
    results = []
    for row in rows:
        a, b = embed(row["path_a"]), embed(row["path_b"])
        distance = distance_m(row["latitude_a"], row["longitude_a"], row["latitude_b"], row["longitude_b"])
        chosen = row["resident_category_a"]
        suggested = (
            distance <= RADIUS_M[chosen]
            and candidate_score(
                chosen,
                row["latitude_a"],
                row["longitude_a"],
                a,
                row["category"],
                row["latitude_b"],
                row["longitude_b"],
                b,
            )
            is not None
        )
        results.append(
            {
                "pair": f"{row['path_a'].name} | {row['path_b'].name}",
                "category": row["category"],
                "resident_category_a": chosen,
                "split": row["split"],
                "same": row["same"] == "yes",
                "distance_m": round(distance, 1),
                "similarity": round(cosine(a, b), 4),
                "suggested": suggested,
            }
        )
    return results


def scores(pairs, decide):
    true_pos = sum(1 for pair in pairs if pair["same"] and decide(pair))
    false_pos = sum(1 for pair in pairs if not pair["same"] and decide(pair))
    false_neg = sum(1 for pair in pairs if pair["same"] and not decide(pair))
    precision = true_pos / (true_pos + false_pos) if true_pos + false_pos else None
    recall = true_pos / (true_pos + false_neg) if true_pos + false_neg else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else None
    return {
        "pairs": len(pairs),
        "true_pos": true_pos,
        "false_pos": false_pos,
        "false_neg": false_neg,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def matches(pair):
    """The live checks other than similarity: the resident's category agrees and the photos are within its radius."""
    chosen = pair["resident_category_a"]
    return chosen == pair["category"] and pair["distance_m"] <= RADIUS_M[chosen]


def summarise(results):
    tune = [pair for pair in results if pair["split"] == "tune"]
    test = [pair for pair in results if pair["split"] == "test"]
    sweep = [
        {"cutoff": cutoff, **scores(tune, lambda pair, c=cutoff: matches(pair) and pair["similarity"] >= c)}
        for cutoff in CUTOFFS
    ]
    # Only same-incident pairs say how far apart residents stand when they photograph one problem. Tune split only:
    # this table informs the radii, which the test split then judges.
    spread = {}
    for category in RADIUS_M:
        distances = sorted(pair["distance_m"] for pair in tune if pair["same"] and pair["category"] == category)
        if distances:
            spread[category] = {"pairs": len(distances), "max_m": distances[-1], "radius_m": RADIUS_M[category]}
    return {"test": scores(test, lambda pair: pair["suggested"]), "tune_sweep": sweep, "same_incident_spread": spread}


def percent(value):
    return "n/a" if value is None else f"{value:.0%}"


def report(summary):
    test = summary["test"]
    lines = [
        "# Grouping suggestion evaluation",
        "",
        f"Test split, live settings: {test['pairs']} pairs, precision {percent(test['precision'])}, "
        f"recall {percent(test['recall'])} ({test['true_pos']} right, {test['false_pos']} wrong suggestions, "
        f"{test['false_neg']} missed).",
        "",
        "## Similarity cutoff on the tune split (live cutoff 0.85)",
        "",
        "| Cutoff | Precision | Recall | F1 |",
        "| --- | --- | --- | --- |",
    ]
    lines += [
        f"| {row['cutoff']:.2f} | {percent(row['precision'])} | {percent(row['recall'])} | {percent(row['f1'])} |"
        for row in summary["tune_sweep"]
    ]
    lines += [
        "",
        "## Distance between photos of one incident (tune split)",
        "",
        "| Category | Pairs | Farthest | Radius |",
        "| --- | --- | --- | --- |",
    ]
    lines += [
        f"| {category} | {row['pairs']} | {row['max_m']} m | {row['radius_m']} m |"
        for category, row in summary["same_incident_spread"].items()
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    # Here, not at import: tests import this file, and the setting would then switch the checker on for later tests.
    os.environ.setdefault("CHECKER_MODEL_DIR", str(API / "models" / "mobileclip2-s0"))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    from barangai import checker
    from barangai.media import sanitize_image

    cache = {}

    def embed(path: Path):
        if path not in cache:
            # The same cleaning and model as a live submission.
            result = checker.check(sanitize_image(path.read_bytes()))
            if result is None:
                raise SystemExit(f"Checker unavailable for {path}; check CHECKER_MODEL_DIR")
            cache[path] = result.embedding
        return cache[path]

    results = measure(read_manifest(args.manifest, args.root), embed)
    summary = summarise(results)
    out = args.out or Path("artifacts/grouping-evaluation") / datetime.now().strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    (out / "results.json").write_text(json.dumps({"summary": summary, "pairs": results}, indent=1), encoding="utf-8")
    (out / "report.md").write_text(report(summary), encoding="utf-8")
    print(report(summary))
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
