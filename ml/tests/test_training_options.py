from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

from barangai_ml.cli import class_weights, full_image_transform
from barangai_ml.data import CATEGORIES


def test_balanced_weights_count_only_training_examples():
    records = [SimpleNamespace(category=category) for category in (
        "flooding", "potholes", "potholes", "fallen_trees", "fallen_trees", "fallen_trees",
        "uncollected_garbage", "damaged_signage", "potholes", "potholes")]
    names = ["train"] * 8 + ["val", "test"]
    counts, weights = class_weights(records, names, "balanced")
    assert counts == {"flooding": 1, "potholes": 2, "fallen_trees": 3,
                      "uncollected_garbage": 1, "damaged_signage": 1}
    assert weights[CATEGORIES.index("flooding")] == pytest.approx(1.304347826)
    assert weights[CATEGORIES.index("potholes")] == pytest.approx(0.652173913)
    assert weights[CATEGORIES.index("fallen_trees")] == pytest.approx(0.434782609)


def test_unweighted_baseline_preserves_counts_but_uses_equal_loss_weights():
    records = [SimpleNamespace(category=category) for category in CATEGORIES]
    counts, weights = class_weights(records, ["train"] * 5, "none")
    assert counts == {category: 1 for category in CATEGORIES}
    assert weights == [1.0] * 5


@pytest.mark.parametrize("training", [False, True])
def test_letterbox_keeps_entire_tall_image_visible(training):
    torchvision = pytest.importorskip("torchvision")
    weights = torchvision.models.EfficientNet_B0_Weights.IMAGENET1K_V1
    transform = full_image_transform(weights, training=training)
    tensor = transform(Image.new("RGB", (40, 200), "red"))
    assert tuple(tensor.shape) == (3, 224, 224)
    assert tensor[0, 112, 112] > tensor[0, 112, 0] + 2
    assert tensor[0, 0, 112] > tensor[0, 0, 0] + 2


def test_letterbox_applies_exif_orientation_before_padding():
    torchvision = pytest.importorskip("torchvision")
    weights = torchvision.models.EfficientNet_B0_Weights.IMAGENET1K_V1
    image = Image.new("RGB", (40, 200), "red")
    ImageDraw.Draw(image).rectangle((0, 100, 39, 199), fill="blue")
    image.getexif()[274] = 6

    tensor = full_image_transform(weights)(image)
    black_red = -weights.transforms().mean[0] / weights.transforms().std[0]
    assert tensor[0, 0, 112] == pytest.approx(black_red)
    assert tensor[2, 112, 20] > 1
    assert tensor[0, 112, 200] > 1
