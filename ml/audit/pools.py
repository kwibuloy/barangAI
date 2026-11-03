"""Map inventoried images to proposed v5 labels, rights tiers and review flags; count unique groups per class.

    python -I ml/audit/pools.py --inventory-dir ml/data/inventory --groups ml/data/inventory/dedup_all/groups.csv

Writes ml/data/inventory/candidates_v5.csv (one row per image) and pools_summary.json. The rules below are the
documented source->label mapping of docs/ml/dataset_review_report.md and docs/ml/licensing_and_provenance.md;
`needs_review=1` rows must pass human contact-sheet review before training. Nothing here is a final label.

Rights tiers (docs/ml/licensing_and_provenance.md): A = explicit licence from the creators, suitable for
noncommercial academic use (A-NC = noncommercial only); B = uploader-declared open licence on a compilation
whose underlying image rights are unverified; C = excluded (no licence and no provenance, Street View, stock
watermarks). Per-image C flags (watermark, Street View) are assigned during human review, not here.
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
from pathlib import Path

TARGETS = ("flooding", "potholes", "fallen_trees", "garbage_accumulation", "damaged_signage")
LABELS = TARGETS + ("other",)
SIGN_DAMAGE_COS = {"damaged_sign-bent", "damaged_sign-broken", "damaged_sign-cracked", "damaged_sign-graffiti",
                   "damaged_sign-rust", "damaged_sign-faded"}
SIGN_DAMAGE_X0FRA = {"bent", "broken-sheet", "graffiti", "rust", "crack"}


def rule(r: dict) -> tuple[str, str, int, int]:
    """Return (proposed_label, reason, needs_review, eval_only); label 'exclude' drops the image."""
    s, folder, boxes = r["source"], r["folder_label"], set(filter(None, r["box_classes"].split(";")))
    if s in ("urban_issues", "rf_civic_issues"):
        if "Pothole Issues" in boxes and (s == "rf_civic_issues" or folder.startswith("Potholes")):
            return "potholes", "pothole box", 1, 0
        if folder.startswith("Potholes") or boxes == {"Damaged Road issues"}:
            return "other", "crack-only road", 1, 0
        if folder.startswith("FallenTrees") or "Fallen trees" in boxes:
            return "fallen_trees", "fallen-tree folder/box", 1, 0
        if folder.startswith("Garbage") or "Littering-Garbage on Public Places" in boxes:
            return "garbage_accumulation", "litter/garbage folder: accumulation unverified", 1, 0
        if folder.startswith("DamagedRoadSigns") or "Broken Road Sign Issues" in boxes:
            return "damaged_signage", "damaged-sign folder/box", 1, 0
        if folder.startswith("Graffitti") or "Vandalism Issues" in boxes:
            return "other", "graffiti (sign defacement must be reviewed)", 1, 0
        return "other", f"non-target civic class {folder or ';'.join(sorted(boxes))}", 0, 0
    if s == "road_issues_kaggle":
        if "Littering" in folder:
            return "exclude", "Google Street View captures (rights C, litter not visible)", 0, 0
        if "Broken Road Sign" in folder:
            return "damaged_signage", "duplicate of jayke multi-label", 1, 0
        if "Pothole" in folder:
            return "potholes", "pothole folder", 1, 0
        if "Mixed" in folder:
            return "exclude", "multi-issue images, no per-image label", 0, 0
        return "other", f"non-target folder {folder}", 1, 0
    if s in ("rf_aaa_fallentrees", "rf_eryk_v1", "rf_eryk_v2"):
        return ("fallen_trees", "fallen-tree box", 1, 0) if boxes else ("other", "no box (empty version)", 1, 0)
    if s == "rome_road_damage":
        phone = not Path(r["relpath"]).name.startswith("vlcsnap")
        if "0" in boxes:
            return "potholes", "pothole box (id 0)" + ("; phone probe T2b" if phone else ""), 0, int(phone)
        return "other", "crack/manhole only" + ("; phone probe T2b" if phone else ""), 0, int(phone)
    if s == "roadway_flooding_mendeley":
        return "flooding", "roadway flood; cross-source probe T2a", 0, 1
    if s == "roadway_flooding_kaggle":
        return "exclude", "mirror of roadway_flooding_mendeley", 0, 0
    if s == "floodimg":
        return "flooding", "view type (aerial/webcam/river) must be reviewed", 1, 0
    if s == "rf_cos40007":
        damaged = boxes & SIGN_DAMAGE_COS
        rubbish = {b for b in boxes if b.startswith("rubbish")}
        if damaged and rubbish:
            return "exclude", "multi-hazard (sign + rubbish)", 0, 0
        if damaged:
            small = float(r["max_box_area"] or 0) < 0.05
            return "damaged_signage", "COS damaged-sign box" + ("; box-guided crop required" if small else ""), 1, 0
        if "rubbish_pile" in boxes or "rubbish-furniture" in boxes or len(rubbish) >= 2:
            return "garbage_accumulation", "COS rubbish pile/furniture/multiple rubbish", 1, 0
        if rubbish:
            return "exclude", "single rubbish item (isolated litter ambiguous)", 0, 0
        if boxes and boxes <= {"intact_sign", "graffiti", "illegal_parking", "road_issue-speed_bump"}:
            return "other", "intact sign / non-target", 1, 0
        if "road_issue-pothole" in boxes:
            return "potholes", "COS pothole box (small)", 1, 0
        if not boxes:
            return "other", "no annotations (street scene)", 1, 0
        return "exclude", "dirty-sign or ambiguous road issue", 0, 0
    if s == "rf_damaged_traffic_signs":
        return "damaged_signage", "Broken box (crop images)", 1, 0
    if s in ("rf_signs_hind",):
        if "Damage" in boxes:
            return "damaged_signage", "Damage box", 1, 0
        return ("other", "Healthy sign", 1, 0) if "Healthy" in boxes else ("exclude", "no box", 0, 0)
    if s in ("rf_jayke_signs_multilabel", "rf_graff_signs", "rf_jayke_signs_o5qsa"):
        if folder == "Healthy":
            return "other", "healthy sign", 1, 0
        if folder in ("", "Unlabeled"):
            return "exclude", "unlabeled", 0, 0
        if set(folder.split()) <= {"Damage", "Wear"}:
            return "damaged_signage", "wear-type damage: cosmetic vs functional must be reviewed", 1, 0
        return "damaged_signage", f"labels {folder}", 1, 0
    if s == "rf_signdet_x0fra":
        if boxes & SIGN_DAMAGE_X0FRA:
            return "damaged_signage", "damage box", 1, 0
        return ("other", "not-damaged sign", 1, 0) if "not-damaged" in boxes else ("exclude", "no box", 0, 0)
    if s == "rf_maty_signs_det":
        if "damaged" in boxes and not boxes & {"occluded", "dirty"}:
            return "damaged_signage", "damaged box", 1, 0
        if boxes == {"ok"}:
            return "other", "ok sign", 1, 0
        return "exclude", "occluded/dirty (environmental, not damage) or mixed", 0, 0
    if s == "rf_maty_signs_cls":
        return ("other", "ok sign crop", 1, 0) if folder == "ok" else ("exclude", "not_ok mixes damaged/occluded/dirty", 0, 0)
    if s in ("rf_myspace_dumping", "rf_cloudcam_dumping", "rf_roadside_garbage"):
        return ("garbage_accumulation", "garbage box", 1, 0) if boxes else ("exclude", "no box", 0, 0)
    if s == "rf_garbage_overflowing":
        return (("garbage_accumulation", "trash outside bin", 1, 0) if "trash out bin" in boxes
                else ("other", "bin without overflow", 1, 0))
    if s == "kg_piles_of_garbage":
        if "0" in boxes:
            return "garbage_accumulation", "pile box (class 0)", 1, 0
        return ("other", "bin only (class 1)", 1, 0) if boxes == {"1"} else ("exclude", "bottle close-up / none", 0, 0)
    if s == "rf_ph_manila_bay":
        return "other", "isolated shoreline litter (Philippine hard negative)", 1, 0
    if s == "md_illegal_dumping_bd":
        if "Positive" in folder:
            return "garbage_accumulation", "dump positive", 1, 0
        return "other", "clean/critical-clean urban scene", 1, 0
    if s == "zn_normal_pothole":
        return ("potholes", "pothole folder", 1, 0) if "pothole" in folder.lower() and "normal" not in folder.lower() \
            else ("other", "normal road", 1, 0)
    if s == "rf_trash_taco":
        return "exclude", "item-level litter (TACO taxonomy), not accumulation", 0, 0
    if s in ("kg_road_anomaly", "rf_raez_dumping", "rf_ph_pothole_audit"):
        return "exclude", {"kg_road_anomaly": "unknown licence; baked rotations defeat leakage control",
                           "rf_raez_dumping": "industrial truck CCTV (concept mismatch)",
                           "rf_ph_pothole_audit": "dashcam; Philippine origin not verified"}[s], 0, 0
    return "exclude", "source not mapped", 0, 0


RIGHTS = {
    "rome_road_damage": "A", "roadway_flooding_mendeley": "A", "md_illegal_dumping_bd": "A-NC",
    "rf_ph_manila_bay": "A", "zn_normal_pothole": "B",
    "urban_issues": "B", "rf_civic_issues": "B", "road_issues_kaggle": "B", "floodimg": "B",
    "rf_aaa_fallentrees": "B", "rf_eryk_v1": "B", "rf_eryk_v2": "B", "rf_cos40007": "B",
    "rf_damaged_traffic_signs": "B", "rf_signs_hind": "B", "rf_jayke_signs_multilabel": "B", "rf_graff_signs": "B",
    "rf_jayke_signs_o5qsa": "B", "rf_signdet_x0fra": "B", "rf_maty_signs_det": "B", "rf_maty_signs_cls": "B",
    "rf_myspace_dumping": "B", "rf_cloudcam_dumping": "B", "rf_garbage_overflowing": "B", "rf_roadside_garbage": "B",
    "kg_piles_of_garbage": "B", "rf_trash_taco": "B", "kg_road_anomaly": "C", "rf_raez_dumping": "B",
    "rf_ph_pothole_audit": "B", "roadway_flooding_kaggle": "B",
}
# Source precedence when one dedup group spans sources: prefer the most primary / best-licensed copy.
PRECEDENCE = ["rome_road_damage", "roadway_flooding_mendeley", "md_illegal_dumping_bd", "rf_cos40007",
              "kg_piles_of_garbage", "rf_jayke_signs_multilabel", "rf_signdet_x0fra", "rf_damaged_traffic_signs",
              "rf_signs_hind", "rf_maty_signs_det", "rf_eryk_v2", "rf_eryk_v1", "floodimg", "rf_myspace_dumping",
              "rf_cloudcam_dumping", "rf_garbage_overflowing", "rf_roadside_garbage", "rf_ph_manila_bay",
              "zn_normal_pothole", "urban_issues", "rf_aaa_fallentrees", "rf_graff_signs", "rf_jayke_signs_o5qsa",
              "rf_maty_signs_cls", "road_issues_kaggle", "rf_civic_issues"]


DECISION = {  # per-source outcome; reasons are documented in docs/ml/dataset_review_report.md
    "urban_issues": "use (review; least-augmented copy per stem)", "rf_civic_issues": "duplicate of urban_issues",
    "road_issues_kaggle": "mostly duplicate; garbage folder excluded (Street View)", "floodimg": "use (view-type review)",
    "rf_aaa_fallentrees": "duplicate of urban_issues", "rf_eryk_v1": "use (dedup with v2)", "rf_eryk_v2": "use",
    "rome_road_damage": "use; phone subset = probe T2b", "roadway_flooding_mendeley": "probe T2a",
    "roadway_flooding_kaggle": "duplicate of mendeley original", "rf_cos40007": "use (review; box crops for signs)",
    "rf_damaged_traffic_signs": "use (review)", "rf_signs_hind": "use (mostly duplicates)",
    "rf_jayke_signs_multilabel": "use (review wear-only)", "rf_graff_signs": "duplicate of jayke multilabel",
    "rf_jayke_signs_o5qsa": "duplicate of jayke multilabel", "rf_signdet_x0fra": "use (review)",
    "rf_maty_signs_det": "use (review; drop occluded/dirty)", "rf_maty_signs_cls": "ok-crops as other only",
    "rf_myspace_dumping": "use (review)", "rf_cloudcam_dumping": "use (review)", "rf_garbage_overflowing": "use (review)",
    "rf_roadside_garbage": "use (review)", "kg_piles_of_garbage": "use (review)", "rf_ph_manila_bay": "other hard negatives",
    "zn_normal_pothole": "normal roads as other; potholes duplicate", "md_illegal_dumping_bd": "acquisition incomplete",
    "rf_trash_taco": "exclude (item-level litter)", "kg_road_anomaly": "exclude (licence unknown; rotations)",
    "rf_raez_dumping": "exclude (concept mismatch)", "rf_ph_pothole_audit": "exclude (origin unverified; dashcam)",
}


def write_registry(inventory_dir: Path, overlap: dict) -> None:
    raw = inventory_dir.parent / "raw"
    rows = []
    for summary_path in sorted(inventory_dir.glob("*.summary.json")):
        s = json.loads(summary_path.read_text(encoding="utf-8"))
        fetch_path = raw / s["source"] / "FETCH.json"
        fetch = json.loads(fetch_path.read_text(encoding="utf-8")) if fetch_path.exists() else {}
        rows.append({"source": s["source"], "url": fetch.get("url", ""), "archive_sha256": fetch.get("sha256", ""),
                     "archive_bytes": fetch.get("bytes", ""), "fetched_utc": fetch.get("fetched_utc", ""),
                     "images": s["images"], "decode_failures": s["decode_failures"],
                     "unique_sha256": s["unique_sha256"], "unique_rf_stems": s["unique_rf_stems"],
                     "dedup_groups": overlap.get("per_source", {}).get(s["source"], {}).get("groups", ""),
                     "median_width": s["width"].get("p50", ""), "median_height": s["height"].get("p50", ""),
                     "with_exif": s["with_exif"], "with_gps": s["with_gps"],
                     "stems_crossing_supplied_splits": s["rf_stems_in_multiple_splits"],
                     "rights_tier": RIGHTS.get(s["source"], "C"), "decision": DECISION.get(s["source"], "")})
    with (inventory_dir / "source_registry.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory-dir", type=Path, required=True)
    parser.add_argument("--groups", type=Path, required=True)
    args = parser.parse_args()
    groups = {}
    with args.groups.open(encoding="utf-8") as stream:
        for g in csv.DictReader(stream):
            groups[(g["source"], g["relpath"])] = g
    out_rows = []
    for path in sorted(args.inventory_dir.glob("*.csv")):
        if path.name.startswith(("sel_", "candidates")):
            continue
        with path.open(encoding="utf-8") as stream:
            for r in csv.DictReader(stream):
                if r["decode_ok"] != "1":
                    continue
                label, reason, review, eval_only = rule(r)
                g = groups.get((r["source"], r["relpath"]), {})
                out_rows.append({"source": r["source"], "relpath": r["relpath"], "sha256": r["sha256"],
                                 "group_id": g.get("group_id", ""), "group_sources": g.get("group_sources", ""),
                                 "proposed_label": label, "label_reason": reason, "needs_review": review,
                                 "eval_only": eval_only, "rights_tier": RIGHTS.get(r["source"], "C"),
                                 "width": r["width"], "height": r["height"], "black_frac": r["black_frac"],
                                 "stem": r["stem"], "supplied_split": r["supplied_split"]})
    with (args.inventory_dir / "candidates_v5.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(out_rows[0]))
        writer.writeheader()
        writer.writerows(out_rows)

    # Unique groups per label: a group counts once, attributed to its highest-precedence source.
    rank = {s: i for i, s in enumerate(PRECEDENCE)}
    best: dict[str, dict] = {}
    conflicts = collections.Counter()
    labels_in_group = collections.defaultdict(set)
    for r in out_rows:
        if r["proposed_label"] == "exclude":
            continue
        labels_in_group[r["group_id"]].add(r["proposed_label"])
        current = best.get(r["group_id"])
        if current is None or rank.get(r["source"], 99) < rank.get(current["source"], 99):
            best[r["group_id"]] = r
    per_label = collections.Counter()
    per_label_source = collections.defaultdict(collections.Counter)
    per_label_tier = collections.defaultdict(collections.Counter)
    per_label_eval = collections.Counter()
    for gid, r in best.items():
        if len(labels_in_group[gid]) > 1:
            conflicts[tuple(sorted(labels_in_group[gid]))] += 1
            continue  # cross-label groups go to review, not to any pool
        key = r["proposed_label"]
        if int(r["eval_only"]):
            per_label_eval[key] += 1
            continue
        per_label[key] += 1
        per_label_source[key][r["source"]] += 1
        per_label_tier[key][r["rights_tier"]] += 1
    summary = {
        "images_considered": len(out_rows),
        "excluded_images_by_reason": collections.Counter(r["label_reason"] for r in out_rows if r["proposed_label"] == "exclude").most_common(),
        "unique_groups_training_pool": dict(per_label),
        "unique_groups_eval_only_probes": dict(per_label_eval),
        "groups_by_label_and_source": {k: dict(v.most_common()) for k, v in per_label_source.items()},
        "groups_by_label_and_rights_tier": {k: dict(v) for k, v in per_label_tier.items()},
        "cross_label_conflict_groups": {"|".join(k): v for k, v in conflicts.most_common()},
        "note": "Counts are deduplicated candidate groups BEFORE human review; review acceptance rates apply.",
    }
    (args.inventory_dir / "pools_summary.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    overlap_path = args.groups.parent / "overlap.json"
    write_registry(args.inventory_dir, json.loads(overlap_path.read_text(encoding="utf-8")) if overlap_path.exists() else {})
    print(json.dumps({k: summary[k] for k in ("unique_groups_training_pool", "unique_groups_eval_only_probes",
                                               "cross_label_conflict_groups")}, indent=1))


if __name__ == "__main__":
    main()
