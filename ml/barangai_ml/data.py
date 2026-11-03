"""Dataset provenance validation and incident-grouped splits."""

from __future__ import annotations

import csv
import hashlib
import random
import re
from dataclasses import dataclass
from pathlib import Path

CATEGORIES = ("flooding", "potholes", "fallen_trees", "uncollected_garbage", "damaged_signage")
FIELDS = (
    "image_path", "category", "incident_id", "source_url", "creator", "license",
    "attribution", "location_id", "photographer_id", "sha256",
)


@dataclass(frozen=True)
class Record:
    image_path: str
    category: str
    incident_id: str
    source_url: str
    creator: str
    license: str
    attribution: str
    location_id: str
    photographer_id: str
    sha256: str


def load_manifest(path: Path, image_root: Path, *, check_files: bool = True) -> list[Record]:
    """Load a CSV; validate provenance and, by default, image paths and hashes."""
    root = image_root.resolve()
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or set(FIELDS) - set(reader.fieldnames):
            raise ValueError(f"manifest columns required: {', '.join(FIELDS)}")
        records = []
        seen_paths: set[str] = set()
        hash_labels: dict[str, str] = {}
        for line, item in enumerate(reader, start=2):
            values = {field: (item.get(field) or "").strip() for field in FIELDS}
            for field in FIELDS:
                if not values[field]:
                    raise ValueError(f"line {line}: {field} is required")
            if values["category"] not in CATEGORIES:
                raise ValueError(f"line {line}: unknown category {values['category']}")
            rel = Path(values["image_path"])
            absolute = (root / rel).resolve()
            if rel.is_absolute() or not absolute.is_relative_to(root) or rel.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                raise ValueError(f"line {line}: invalid image_path")
            if values["image_path"] in seen_paths:
                raise ValueError(f"line {line}: repeated image_path")
            seen_paths.add(values["image_path"])
            digest = values["sha256"].lower()
            if not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError(f"line {line}: invalid sha256")
            if digest in hash_labels and hash_labels[digest] != values["category"]:
                raise ValueError(f"line {line}: sha256 has conflicting category labels")
            hash_labels[digest] = values["category"]
            values["sha256"] = digest
            if check_files:
                if not absolute.is_file():
                    raise ValueError(f"line {line}: image_path does not exist")
                with absolute.open("rb") as image:
                    actual = hashlib.file_digest(image, "sha256").hexdigest()
                if actual != digest:
                    raise ValueError(f"line {line}: sha256 mismatch")
            records.append(Record(**values))
    if not records:
        raise ValueError("manifest is empty")
    return records


def split_records(records: list[Record], *, seed: int) -> list[str]:
    """Deterministic 70/15/15-ish split; incident, source URL and exact hash stay together."""
    parent = list(range(len(records)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a: int, b: int) -> None:
        parent[find(a)] = find(b)

    seen: dict[tuple[str, str], int] = {}
    for index, record in enumerate(records):
        for key in (("incident", record.incident_id), ("sha256", record.sha256), ("source", record.source_url)):
            if key in seen:
                union(index, seen[key])
            seen[key] = index

    groups: dict[int, list[int]] = {}
    for index in range(len(records)):
        groups.setdefault(find(index), []).append(index)
    by_label: dict[str, list[list[int]]] = {label: [] for label in CATEGORIES}
    for members in groups.values():
        counts = {label: sum(records[index].category == label for index in members) for label in CATEGORIES}
        dominant = max(CATEGORIES, key=lambda label: counts[label])
        by_label[dominant].append(members)

    rng = random.Random(seed)
    result = [""] * len(records)
    for label, members_by_group in by_label.items():
        if len(members_by_group) < 3:
            raise ValueError(f"at least 3 independent groups required for {label}")
        rng.shuffle(members_by_group)
        count = len(members_by_group)
        test_count = max(1, round(count * 0.15))
        val_count = max(1, round(count * 0.15))
        if test_count + val_count >= count:
            raise ValueError(f"too few groups for {label}")
        for group_index, members in enumerate(members_by_group):
            split = "test" if group_index < test_count else "val" if group_index < test_count + val_count else "train"
            for index in members:
                result[index] = split
    for split in ("train", "val", "test"):
        missing = set(CATEGORIES) - {record.category for record, name in zip(records, result) if name == split}
        if missing:
            raise ValueError(f"{split} lacks categories {sorted(missing)}; collect more independent groups")
    return result
