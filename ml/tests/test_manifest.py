import csv
from pathlib import Path

import pytest

from barangai_ml.data import CATEGORIES, load_manifest, split_records


def write_manifest(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def row(label: str, incident: str, suffix: str) -> dict[str, str]:
    return {
        "image_path": f"photos/{suffix}.jpg",
        "category": label,
        "incident_id": incident,
        "source_url": f"https://example.org/{suffix}",
        "creator": "Test creator",
        "license": "CC BY 4.0",
        "attribution": "Test creator / CC BY 4.0",
        "location_id": "test-location",
        "photographer_id": "test-photographer",
        "sha256": f"{int(suffix):064x}",
    }


def test_manifest_requires_provenance_and_known_category(tmp_path: Path) -> None:
    rows = [row(CATEGORIES[0], "incident-1", "1")]
    rows[0]["license"] = ""
    path = tmp_path / "manifest.csv"
    write_manifest(path, rows)
    with pytest.raises(ValueError, match="license"):
        load_manifest(path, tmp_path, check_files=False)

    rows[0]["license"] = "CC BY 4.0"
    rows[0]["category"] = "broken_streetlight"
    write_manifest(path, rows)
    with pytest.raises(ValueError, match="category"):
        load_manifest(path, tmp_path, check_files=False)


def test_manifest_rejects_path_escape_and_conflicting_hash_labels(tmp_path: Path) -> None:
    rows = [row(CATEGORIES[0], "incident-1", "1")]
    rows[0]["image_path"] = "../outside.jpg"
    path = tmp_path / "manifest.csv"
    write_manifest(path, rows)
    with pytest.raises(ValueError, match="image_path"):
        load_manifest(path, tmp_path, check_files=False)

    rows = [row(CATEGORIES[0], "incident-1", "1"), row(CATEGORIES[1], "incident-2", "2")]
    rows[1]["sha256"] = rows[0]["sha256"]
    write_manifest(path, rows)
    with pytest.raises(ValueError, match="sha256"):
        load_manifest(path, tmp_path, check_files=False)


def test_split_keeps_incidents_and_identical_images_together(tmp_path: Path) -> None:
    rows = [row(label, f"{label}-{i}", str(j)) for j, (label, i) in enumerate(
        ((label, i) for label in CATEGORIES for i in range(10)), start=1
    )]
    # The same source image appears in two separate incidents.
    rows[11]["sha256"] = rows[0]["sha256"]
    rows[11]["category"] = rows[0]["category"]
    path = tmp_path / "manifest.csv"
    write_manifest(path, rows)
    records = load_manifest(path, tmp_path, check_files=False)
    first = split_records(records, seed=42)
    second = split_records(records, seed=42)
    assert first == second
    assert first[0] == first[11]
    assert set(first) == {"train", "val", "test"}
    incident_splits: dict[str, set[str]] = {}
    for record, split in zip(records, first):
        incident_splits.setdefault(record.incident_id, set()).add(split)
    assert all(len(splits) == 1 for splits in incident_splits.values())


def test_split_rejects_too_few_groups(tmp_path: Path) -> None:
    rows = [row(label, label, str(i)) for i, label in enumerate(CATEGORIES, start=1)]
    path = tmp_path / "manifest.csv"
    write_manifest(path, rows)
    records = load_manifest(path, tmp_path, check_files=False)
    with pytest.raises(ValueError, match="groups"):
        split_records(records, seed=42)
