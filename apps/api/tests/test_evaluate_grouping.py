import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))


def write_manifest(tmp_path, rows):
    manifest = tmp_path / "pairs.csv"
    manifest.write_text("path_a,path_b,latitude_a,longitude_a,latitude_b,longitude_b,category,resident_category_a,same,split\n"
                        + "\n".join(rows) + "\n", encoding="utf-8")
    return manifest


def test_grouping_evaluation_mirrors_live_suggestions_and_keeps_splits_apart(tmp_path):
    import evaluate_grouping as tool

    # Synthetic vectors only: this checks the arithmetic, not the model.
    vectors = {"a.jpg": [1.0, 0.0], "b.jpg": [0.99, 0.05], "c.jpg": [0.0, 1.0], "d.jpg": [0.9, 0.44]}
    manifest = write_manifest(tmp_path, [
        "a.jpg,b.jpg,14.6,121.0,14.6001,121.0,broken_streetlights,,yes,test",  # 11 m, similar: suggested
        "a.jpg,b.jpg,14.6,121.0,14.6010,121.0,broken_streetlights,,no,test",  # 111 m: past the 50 m radius
        "a.jpg,c.jpg,14.6,121.0,14.6001,121.0,broken_streetlights,,yes,test",  # different photos: missed
        "a.jpg,d.jpg,14.6,121.0,14.6001,121.0,flooding,,yes,tune",
        # The resident called it "other": the live server compares categories, so it is not suggested.
        "a.jpg,b.jpg,14.6,121.0,14.6001,121.0,broken_streetlights,other,yes,test",
    ])
    rows = tool.read_manifest(manifest, tmp_path)
    results = tool.measure(rows, lambda path: vectors[path.name])
    assert [pair["suggested"] for pair in results] == [True, False, False, True, False]
    summary = tool.summarise(results)
    assert summary["test"] == {"pairs": 4, "true_pos": 1, "false_pos": 0, "false_neg": 2,
                               "precision": 1.0, "recall": 1 / 3, "f1": 0.5}
    # The tune pair (similarity ~0.90) is found at cutoffs up to 0.89 and missed above.
    sweep = {row["cutoff"]: row["true_pos"] for row in summary["tune_sweep"]}
    assert sweep[0.89] == 1 and sweep[0.91] == 0
    assert summary["same_incident_spread"] == {"flooding": {"pairs": 1, "max_m": 11.1, "radius_m": 300}}
    assert "precision 100%, recall 33%" in tool.report(summary)


def test_grouping_manifest_rejects_unknown_labels(tmp_path):
    import evaluate_grouping as tool
    import pytest

    manifest = write_manifest(tmp_path, ["a.jpg,b.jpg,14.6,121.0,14.6,121.0,flooding,,maybe,test"])
    with pytest.raises(SystemExit):
        tool.read_manifest(manifest, tmp_path)
