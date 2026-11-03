"""Prepare licensed image data and compare two TorchVision classifiers."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import random
import time
from pathlib import Path

from .data import CATEGORIES, FIELDS, Record, load_manifest, split_records

PREPROCESSING_VERSION = "letterbox_224_v1"


def class_weights(records: list[Record], names: list[str], mode: str) -> tuple[dict[str, int], list[float]]:
    if len(records) != len(names) or mode not in {"none", "balanced"}:
        raise ValueError("Aligned records and a supported class-weighting mode required")
    counts = {category: 0 for category in CATEGORIES}
    for record, split in zip(records, names):
        if split == "train":
            counts[record.category] += 1
    if any(count == 0 for count in counts.values()):
        raise ValueError("Every category needs training examples")
    if mode == "none":
        return counts, [1.0] * len(CATEGORIES)
    inverse = [1 / counts[category] for category in CATEGORIES]
    scale = len(CATEGORIES) / sum(inverse)
    return counts, [weight * scale for weight in inverse]


def full_image_transform(weights, *, training: bool = False):
    from PIL import Image, ImageOps
    from torchvision import transforms

    normalization = weights.transforms()
    steps = [transforms.Lambda(lambda image: ImageOps.exif_transpose(image).convert("RGB"))]
    if training:
        steps.append(transforms.RandomHorizontalFlip())
    steps.extend([
        transforms.Lambda(lambda image: ImageOps.pad(image, (224, 224),
                                                     method=Image.Resampling.BILINEAR, color=(0, 0, 0))),
        transforms.ToTensor(),
        transforms.Normalize(mean=normalization.mean, std=normalization.std),
    ])
    return transforms.Compose(steps)


def read_split(path: Path, root: Path) -> tuple[list[Record], list[str]]:
    records = load_manifest(path, root)
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or "split" not in reader.fieldnames:
            raise ValueError("split column required")
        names = [(row.get("split") or "").strip() for row in reader]
    if len(names) != len(records) or set(names) != {"train", "val", "test"}:
        raise ValueError("split must contain train, val and test only")
    for field in ("incident_id", "sha256", "source_url"):
        placement: dict[str, str] = {}
        for record, name in zip(records, names):
            key = getattr(record, field)
            if key in placement and placement[key] != name:
                raise ValueError(f"{field} crosses splits")
            placement[key] = name
    for name in ("train", "val", "test"):
        labels = {record.category for record, split in zip(records, names) if split == name}
        if labels != set(CATEGORIES):
            raise ValueError(f"{name} is missing categories: {sorted(set(CATEGORIES) - labels)}")
    return records, names


def export_predictions(path: Path, records: list[Record], probabilities: list[list[float]], split: str) -> dict:
    """Export held-out predictions; threshold exploration uses validation data only."""
    if split not in {"val", "test"} or len(records) != len(probabilities) or not records:
        raise ValueError("Nonempty aligned validation or test predictions required")
    rows = []
    for record, scores in zip(records, probabilities):
        if (len(scores) != len(CATEGORIES) or any(not math.isfinite(score) or score < 0 or score > 1 for score in scores)
                or not math.isclose(sum(scores), 1.0, abs_tol=1e-5)):
            raise ValueError("Each prediction must contain five finite class probabilities summing to one")
        predicted = CATEGORIES[max(range(len(scores)), key=lambda index: scores[index])]
        rows.append({"split": split, "image_path": record.image_path, "incident_id": record.incident_id,
                     "sha256": record.sha256, "true_category": record.category,
                     "predicted_category": predicted, "confidence": max(scores),
                     **{f"probability_{category}": score for category, score in zip(CATEGORIES, scores)}})
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    result = {"predictions_file": path.name}
    if split == "val":
        curve = []
        for threshold in (.5, .6, .7, .8, .9, .95):
            accepted = [row for row in rows if row["confidence"] >= threshold]
            curve.append({"threshold": threshold, "accepted_count": len(accepted),
                          "coverage": len(accepted) / len(rows),
                          "accepted_accuracy": (sum(row["true_category"] == row["predicted_category"] for row in accepted)
                                                / len(accepted)) if accepted else None})
        result["validation_thresholds"] = curve
    return result


def prepare(args: argparse.Namespace) -> None:
    records = load_manifest(args.manifest, args.image_root)
    names = split_records(records, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=[*FIELDS, "split"])
        writer.writeheader()
        for record, name in zip(records, names):
            writer.writerow({**vars(record), "split": name})
    counts = {name: sum(split == name for split in names) for name in ("train", "val", "test")}
    print(json.dumps({"split_file": str(args.output), "seed": args.seed, "counts": counts}))


def train(args: argparse.Namespace) -> None:
    # Delay heavyweight imports so provenance checks work without PyTorch installed.
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    import torch
    from PIL import Image
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
    from torchvision import models
    from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

    records, names = read_split(args.split, args.image_root)
    if args.epochs < 1 or args.batch_size < 1 or args.learning_rate <= 0:
        raise ValueError("epochs, batch-size and learning-rate must be positive")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.use_deterministic_algorithms(True)
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")

    class Images(Dataset):
        def __init__(self, indices: list[int], transform: object):
            self.indices = indices
            self.transform = transform

        def __len__(self) -> int:
            return len(self.indices)

        def __getitem__(self, index: int):
            record = records[self.indices[index]]
            with Image.open(args.image_root / record.image_path) as opened:
                image = self.transform(opened)
            return image, CATEGORIES.index(record.category)

    def metrics(truth: list[int], predictions: list[int]) -> dict:
        precision, recall, f1, support = precision_recall_fscore_support(
            truth, predictions, labels=list(range(len(CATEGORIES))), zero_division=0
        )
        return {
            "accuracy": float(accuracy_score(truth, predictions)),
            "macro_f1": float(sum(f1) / len(f1)),
            "per_class": {
                label: {"precision": float(precision[i]), "recall": float(recall[i]),
                        "f1": float(f1[i]), "support": int(support[i])}
                for i, label in enumerate(CATEGORIES)
            },
            "confusion_matrix": confusion_matrix(truth, predictions, labels=list(range(len(CATEGORIES)))).tolist(),
        }

    def evaluate(model: nn.Module, loader: DataLoader, *, export_path: Path | None = None, split: str = "val") -> dict:
        model.eval()
        truth: list[int] = []
        predictions: list[int] = []
        probabilities: list[list[float]] = []
        with torch.inference_mode():
            for images, labels in loader:
                logits = model(images.to(device))
                truth.extend(labels.tolist())
                predictions.extend(logits.argmax(dim=1).cpu().tolist())
                if export_path is not None:
                    probabilities.extend(torch.softmax(logits, dim=1).cpu().tolist())
        result = metrics(truth, predictions)
        if export_path is not None:
            result.update(export_predictions(export_path, [records[i] for i in loader.dataset.indices], probabilities, split))
        return result

    def latency_ms(model: nn.Module, image) -> dict:
        model = model.to("cpu").eval()
        image = image.unsqueeze(0).to("cpu")
        with torch.inference_mode():
            for _ in range(10):
                model(image)
            times = []
            for _ in range(50):
                start = time.perf_counter()
                model(image)
                times.append((time.perf_counter() - start) * 1000)
        times.sort()
        return {"median_cpu_ms": times[len(times) // 2], "p95_cpu_ms": times[47],
                "warmup_runs": 10, "timed_runs": 50, "threads": torch.get_num_threads()}

    options = {
        "efficientnet_b0": (models.efficientnet_b0, models.EfficientNet_B0_Weights.IMAGENET1K_V1),
        "mobilenet_v3_large": (models.mobilenet_v3_large, models.MobileNet_V3_Large_Weights.IMAGENET1K_V2),
    }
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    split_digest = hashlib.sha256(args.split.read_bytes()).hexdigest()
    training_counts, loss_weights = class_weights(records, names, args.class_weighting)
    summary: dict = {"split_sha256": split_digest, "seed": args.seed, "epochs": args.epochs,
                     "batch_size": args.batch_size, "learning_rate": args.learning_rate,
                     "device": str(device), "categories": CATEGORIES, "models": {},
                     "preprocessing_version": PREPROCESSING_VERSION,
                     "class_weighting": args.class_weighting,
                     "training_class_counts": training_counts,
                     "loss_class_weights": dict(zip(CATEGORIES, loss_weights))}

    for name, (factory, weights) in options.items():
        # Reset to the same seed so run order does not alter optimization randomness.
        random.seed(args.seed)
        torch.manual_seed(args.seed)
        model = factory(weights=weights)
        if name == "efficientnet_b0":
            model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(CATEGORIES))
        else:
            model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(CATEGORIES))
        model.to(device)
        validation_transform = full_image_transform(weights)
        training_transform = full_image_transform(weights, training=True)
        loaders = {
            split: DataLoader(
                Images([i for i, value in enumerate(names) if value == split],
                       training_transform if split == "train" else validation_transform),
                batch_size=args.batch_size, shuffle=(split == "train"), num_workers=0,
            ) for split in ("train", "val", "test")
        }
        optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
        loss_function = nn.CrossEntropyLoss(weight=(torch.tensor(loss_weights, dtype=torch.float32, device=device)
                                              if args.class_weighting == "balanced" else None))
        best_score = -1.0
        checkpoint = output / f"{name}.pt"
        history = []
        for epoch in range(1, args.epochs + 1):
            model.train()
            loss_sum = 0.0
            for images, labels in loaders["train"]:
                optimizer.zero_grad(set_to_none=True)
                loss = loss_function(model(images.to(device)), labels.to(device))
                loss.backward()
                optimizer.step()
                loss_sum += float(loss.item()) * len(labels)
            val = evaluate(model, loaders["val"])
            history.append({"epoch": epoch, "train_loss": loss_sum / len(loaders["train"].dataset),
                            "val_accuracy": val["accuracy"], "val_macro_f1": val["macro_f1"]})
            print(f"{name}: epoch {epoch}/{args.epochs}, val macro F1={val['macro_f1']:.4f}", flush=True)
            if val["macro_f1"] > best_score:
                best_score = val["macro_f1"]
                torch.save({"architecture": name, "weights": str(weights), "categories": CATEGORIES,
                            "split_sha256": split_digest, "preprocessing_version": PREPROCESSING_VERSION,
                            "class_weighting": args.class_weighting,
                            "training_class_counts": training_counts,
                            "loss_class_weights": dict(zip(CATEGORIES, loss_weights)),
                            "state_dict": model.state_dict()}, checkpoint)
        saved = torch.load(checkpoint, map_location=device, weights_only=True)
        model.load_state_dict(saved["state_dict"])
        result = {"pretrained_weights": str(weights), "best_val_macro_f1": best_score,
                  "history": history, "validation": evaluate(model, loaders["val"], export_path=output / f"{name}_val_predictions.csv", split="val"),
                  "test": evaluate(model, loaders["test"], export_path=output / f"{name}_test_predictions.csv", split="test"),
                  "model_size_bytes": checkpoint.stat().st_size,
                  "cpu_latency": latency_ms(model, loaders["test"].dataset[0][0])}
        summary["models"][name] = result
        (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    selected = max(options, key=lambda key: summary["models"][key]["best_val_macro_f1"])
    summary["selected_by_validation"] = selected
    (output / "results.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"results": str(output / 'results.json'), "selected_by_validation": selected}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare", help="validate provenance and write an incident-grouped split")
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--image-root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--seed", type=int, default=42)
    p.set_defaults(run=prepare)
    p = sub.add_parser("train", help="fine-tune and evaluate both architectures")
    p.add_argument("--split", type=Path, required=True)
    p.add_argument("--image-root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--epochs", type=int, default=10)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--learning-rate", type=float, default=0.0001)
    p.add_argument("--class-weighting", choices=("none", "balanced"), default="balanced")
    p.add_argument("--cpu", action="store_true")
    p.set_defaults(run=train)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
