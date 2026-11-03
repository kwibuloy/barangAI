import csv
import math

import pytest

from barangai_ml.cli import export_predictions
from barangai_ml.data import CATEGORIES, Record


def records():
    return [Record(f"photos/{i}.jpg", label, f"incident-{i}", "consent:test", "Synthetic", "test-only", "test", "zone", "camera", f"{i:064x}")
            for i, label in enumerate(CATEGORIES[:2])]


def test_exports_per_image_probabilities_and_validation_coverage(tmp_path):
    path = tmp_path / "val.csv"
    result = export_predictions(path, records(), [[.8, .05, .05, .05, .05], [.6, .1, .1, .1, .1]], "val")
    with path.open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert rows[0]["incident_id"] == "incident-0"
    assert rows[0]["true_category"] == "flooding"
    assert rows[1]["predicted_category"] == "flooding"
    assert float(rows[0]["probability_flooding"]) == .8
    curve = {item["threshold"]: item for item in result["validation_thresholds"]}
    assert curve[.5]["coverage"] == 1.0
    assert curve[.5]["accepted_accuracy"] == .5
    assert curve[.7]["coverage"] == .5
    assert curve[.7]["accepted_accuracy"] == 1.0
    assert curve[.9]["accepted_accuracy"] is None


def test_test_export_does_not_supply_threshold_selection_curve(tmp_path):
    result = export_predictions(tmp_path / "test.csv", records(), [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0]], "test")
    assert "validation_thresholds" not in result


@pytest.mark.parametrize("probabilities", [[], [[math.nan] * 5] * 2, [[.2] * 4] * 2, [[1] * 5] * 2])
def test_rejects_invalid_prediction_rows_without_creating_export(tmp_path, probabilities):
    path = tmp_path / "invalid.csv"
    with pytest.raises(ValueError):
        export_predictions(path, records(), probabilities, "val")
    assert not path.exists()
