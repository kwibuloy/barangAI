"""Write ml/data/inventory/sel_signs.csv: one image per (folder, stem) from every sign source.

    python -I ml/audit/sel_signs.py

Input for embed.py (sign re-crops that perceptual hashes miss). `label` is only informational here;
the label rules of record are in pools.py.
"""

import csv
from pathlib import Path

INV = Path(__file__).resolve().parents[1] / "data" / "inventory"
SOURCES = [
    ("urban_issues", lambda r: r["folder_label"].startswith("DamagedRoadSigns"), lambda r: "damaged"),
    ("rf_signs_hind", lambda r: True, lambda r: "damaged" if "Damage" in r["box_classes"] else "healthy"),
    ("rf_jayke_signs_multilabel", lambda r: True, lambda r: "healthy" if r["folder_label"] == "Healthy" else "damaged"),
    ("rf_graff_signs", lambda r: True, lambda r: "healthy" if r["folder_label"] == "Healthy" else "damaged"),
    ("rf_damaged_traffic_signs", lambda r: True, lambda r: "damaged"),
    ("rf_cos40007", lambda r: "damaged_sign" in r["box_classes"] or "intact_sign" in r["box_classes"],
     lambda r: "damaged" if "damaged_sign" in r["box_classes"] else "healthy"),
]

with (INV / "sel_signs.csv").open("w", newline="", encoding="utf-8") as out:
    writer = csv.writer(out)
    writer.writerow(["source", "relpath", "label"])
    for source, keep, label in SOURCES:
        seen, n = set(), 0
        with (INV / f"{source}.csv").open(encoding="utf-8") as stream:
            for r in csv.DictReader(stream):
                key = (r["folder_label"], r["stem"])
                if r["decode_ok"] != "1" or not keep(r) or key in seen:
                    continue
                seen.add(key)
                writer.writerow([source, r["relpath"], label(r)])
                n += 1
        print(source, n)
