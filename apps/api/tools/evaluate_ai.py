"""Compare the Cloudflare vision models and the MobileCLIP checker on labelled photos, and tune the checker.

The manifest is a CSV with columns `path,category,split`: path relative to --root, one of the eight API
categories (or `none` for photos that show no concern), and split `tune` or `test`. Keep the two splits
apart: tune on `tune` only, and report accuracy on `test` only, so reported numbers are not inflated.

    # compare everything on the test split (Cloudflare needs CLOUDFLARE_ACCOUNT_ID / _WORKERS_AI_TOKEN)
    .venv/Scripts/python.exe apps/api/tools/evaluate_ai.py --manifest data/manifest.csv --root data
    # checker only, no Cloudflare neurons
    .venv/Scripts/python.exe apps/api/tools/evaluate_ai.py --manifest data/manifest.csv --root data --skip-vision
    # tune: pick the confidence cutoff and blend in example photos, writing checker.tuned.json for review
    .venv/Scripts/python.exe apps/api/tools/evaluate_ai.py --manifest data/manifest.csv --root data --tune

Results go to --out (default artifacts/ai-evaluation/<timestamp>): results.json, report.md, predictions.csv.
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import httpx
import numpy as np

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))
os.environ.setdefault("CHECKER_MODEL_DIR", str(API / "models" / "mobileclip2-s0"))

from barangai import checker, vision  # noqa: E402
from barangai.media import sanitize_image  # noqa: E402

LABELS = (*vision.CATEGORIES, "none")
# Gemma 3 is not allowed on Workers Free accounts; Llama 3.2 Vision needs a one-time "agree" call first.
MODELS = ("@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.2-11b-vision-instruct")
# Neurons per million tokens (input, output), from Cloudflare's pricing page, October 2026; re-check before quoting.
NEURONS = {
    "@cf/google/gemma-3-12b-it": (31371, 50560),
    "@cf/mistralai/mistral-small-3.1-24b-instruct": (31876, 50488),
    "@cf/meta/llama-3.2-11b-vision-instruct": (4410, 61493),
}


def read_manifest(path: Path, root: Path):
    rows = []
    with path.open(newline="", encoding="utf-8") as handle:
        for line, row in enumerate(csv.DictReader(handle), start=2):
            category = row["category"].strip().lower()
            split = (row.get("split") or "test").strip().lower()
            if category not in LABELS or split not in {"tune", "test"}:
                raise SystemExit(f"{path}:{line}: category must be one of {LABELS}, split tune or test")
            image = root / row["path"]
            if not image.is_file():
                raise SystemExit(f"{path}:{line}: missing {image}")
            rows.append({"path": row["path"], "file": image, "category": category, "split": split})
    return rows


def ask_vision(model: str, image: bytes, language: str):
    """One Cloudflare call, keeping the token usage the API itself does not need."""
    settings = vision.configured()
    if not settings:
        raise SystemExit("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_WORKERS_AI_TOKEN, or pass --skip-vision")
    account, token, _ = settings
    path, body = vision.request_body(model, vision.shrink(image), language)
    started = time.monotonic()
    try:
        response = httpx.post(
            f"https://api.cloudflare.com/client/v4/accounts/{account}/{path}",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
            timeout=60,
        )
        data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        return None, time.monotonic() - started, None, f"{type(error).__name__}"
    seconds = time.monotonic() - started
    if response.status_code != 200:
        return None, seconds, None, f"HTTP {response.status_code}: {str(data)[:200]}"
    usage = data.get("usage") or (data.get("result") or {}).get("usage") or {}
    neurons = usage.get("neurons")
    if neurons is None and usage.get("prompt_tokens") is not None and model in NEURONS:
        rate_in, rate_out = NEURONS[model]
        neurons = (usage["prompt_tokens"] * rate_in + usage.get("completion_tokens", 0) * rate_out) / 1e6
    text = vision.reply_text(data)
    return (vision.parse(text, model) if text else None), seconds, neurons, None


def summarise(name: str, truths: list[str], guesses: list[str | None], seconds: list[float], neurons: list[float]):
    answered = [(truth, guess) for truth, guess in zip(truths, guesses, strict=True) if guess is not None]
    per_class = {}
    for label in LABELS:
        tp = sum(1 for truth, guess in answered if truth == label and guess == label)
        actual = sum(1 for truth in truths if truth == label)
        predicted = sum(1 for _, guess in answered if guess == label)
        if actual or predicted:
            per_class[label] = {
                "photos": actual,
                "recall": round(tp / actual, 3) if actual else None,
                "precision": round(tp / predicted, 3) if predicted else None,
            }
    confusion = Counter(
        f"{truth} -> {guess or 'abstained'}" for truth, guess in zip(truths, guesses, strict=True) if truth != guess
    )
    return {
        "model": name,
        "photos": len(truths),
        "accuracy": round(
            sum(1 for truth, guess in zip(truths, guesses, strict=True) if truth == (guess or "none")) / len(truths), 3
        )
        if truths
        else None,
        "answered": len(answered),
        "accuracy_when_answered": round(sum(1 for truth, guess in answered if truth == guess) / len(answered), 3)
        if answered
        else None,
        "per_class": per_class,
        "top_confusions": confusion.most_common(8),
        "median_seconds": round(float(np.median(seconds)), 2) if seconds else None,
        "mean_neurons_per_photo": round(float(np.mean(neurons)), 1) if neurons else None,
    }


def checker_scores(embedding, classes, scale):
    logits = scale * classes @ embedding
    probabilities = np.exp(logits - logits.max())
    return probabilities / probabilities.sum()


def tune(rows, embeddings, meta, out: Path):
    """Blend class text embeddings with the mean embedding of each class's tune photos, then sweep the cutoff."""
    keys = [item["key"] for item in meta["classes"]]
    text = np.asarray([item["embedding"] for item in meta["classes"]], dtype=np.float32)
    tune_rows = [row for row in rows if row["split"] == "tune"]
    if not tune_rows:
        raise SystemExit("--tune needs rows with split=tune")
    groups = defaultdict(list)
    for row in tune_rows:
        groups["background" if row["category"] == "none" else row["category"]].append(embeddings[row["path"]])
    sweeps = []
    for alpha in (0.0, 0.25, 0.5, 0.75):
        blended = text.copy()
        for index, key in enumerate(keys):
            if groups.get(key):
                mean = np.mean(groups[key], axis=0)
                vector = (1 - alpha) * text[index] + alpha * mean / np.linalg.norm(mean)
                blended[index] = vector / np.linalg.norm(vector)
        for cutoff in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
            right = answered = 0
            for row in tune_rows:
                probabilities = checker_scores(np.asarray(embeddings[row["path"]]), blended, meta["logit_scale"])
                best = int(probabilities.argmax())
                guess = keys[best] if keys[best] != "background" and probabilities[best] >= cutoff else "none"
                answered += guess != "none"
                right += guess == row["category"]
            sweeps.append(
                {
                    "alpha": alpha,
                    "cutoff": cutoff,
                    "accuracy": round(right / len(tune_rows), 3),
                    "answered_share": round(answered / len(tune_rows), 3),
                    "classes": blended,
                }
            )
    best = max(sweeps, key=lambda item: (item["accuracy"], item["answered_share"]))
    tuned = {
        **meta,
        "classes": [
            {"key": key, "embedding": [round(float(v), 6) for v in best["classes"][i]]} for i, key in enumerate(keys)
        ],
        "tuned": {
            "alpha": best["alpha"],
            "recommended_cutoff": best["cutoff"],
            "tune_photos": len(tune_rows),
            "tuned_at": datetime.now().isoformat(timespec="seconds"),
        },
    }
    (out / "checker.tuned.json").write_text(json.dumps(tuned, indent=1), encoding="utf-8")
    return [{key: value for key, value in item.items() if key != "classes"} for item in sweeps], best


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--models", nargs="*", default=list(MODELS))
    parser.add_argument("--language", default="en", choices=sorted(vision.LANGUAGES))
    parser.add_argument("--skip-vision", action="store_true")
    parser.add_argument("--tune", action="store_true")
    args = parser.parse_args()
    out = args.out or Path("artifacts/ai-evaluation") / datetime.now().strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    rows = read_manifest(args.manifest, args.root)
    _, meta, _, _ = checker.load_runtime(os.environ["CHECKER_MODEL_DIR"])
    images, embeddings, predictions = {}, {}, []
    checker_guesses, checker_seconds = {}, []
    for row in rows:
        images[row["path"]] = sanitize_image(row["file"].read_bytes())
        started = time.monotonic()
        result = checker.check(images[row["path"]])
        checker_seconds.append(time.monotonic() - started)
        embeddings[row["path"]] = result.embedding
        checker_guesses[row["path"]] = result.category
    test = [row for row in rows if row["split"] == "test"]
    truths = [row["category"] for row in test]
    results = {
        "manifest": str(args.manifest),
        "test_photos": len(test),
        "tune_photos": len(rows) - len(test),
        "checker_version": meta["version"],
        "models": [],
    }
    results["models"].append(
        summarise(
            f"checker {meta['version']}", truths, [checker_guesses[row["path"]] for row in test], checker_seconds, []
        )
    )
    for row in test:
        predictions.append(
            {
                "path": row["path"],
                "truth": row["category"],
                "model": "checker",
                "guess": checker_guesses[row["path"]] or "none",
                "description": "",
            }
        )
    if not args.skip_vision:
        for model in args.models:
            guesses, seconds, neurons = [], [], []
            for row in test:
                result, spent, cost, error = ask_vision(model, images[row["path"]], args.language)
                guesses.append(result.category if result else None)
                seconds.append(spent)
                if cost is not None:
                    neurons.append(cost)
                predictions.append(
                    {
                        "path": row["path"],
                        "truth": row["category"],
                        "model": model,
                        "guess": (result.category if result else None) or "none",
                        "description": (result.description if result else None) or error or "",
                    }
                )
                print(f"{model} {row['path']}: {guesses[-1]}", flush=True)
            results["models"].append(summarise(model, truths, guesses, seconds, neurons))
    if args.tune:
        results["tuning"], best = tune(rows, embeddings, meta, out)
        print(f"Tuned checker: alpha {best['alpha']}, cutoff {best['cutoff']} -> {out / 'checker.tuned.json'}")
    (out / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    with (out / "predictions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["path", "truth", "model", "guess", "description"])
        writer.writeheader()
        writer.writerows(predictions)
    lines = [
        f"# AI evaluation, {datetime.now():%d %b %Y}",
        "",
        f"{len(test)} test photos, {len(rows) - len(test)} tune photos. Accuracy counts an abstention as `none`.",
        "",
        "| Model | Accuracy | Answered | Accuracy when answered | Median s | Neurons/photo |",
        "|---|---|---|---|---|---|",
    ]
    for item in results["models"]:
        lines.append(
            f"| {item['model']} | {item['accuracy']} | {item['answered']}/{item['photos']} | "
            f"{item['accuracy_when_answered']} | {item['median_seconds']} | {item['mean_neurons_per_photo']} |"
        )
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nSaved to {out}")


if __name__ == "__main__":
    main()
