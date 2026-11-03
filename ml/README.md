# BarangAI five-class image experiment

This directory contains a reproducible training pipeline. A real 75-image ground-level pilot completed 10 epochs per architecture on 20 October 2026; checkpoints and results are private local artifacts. See [training results](TRAINING-RESULTS-2026-10-20.md). This small experiment does not establish reliable production inference. The pipeline compares TorchVision EfficientNet-B0 and MobileNetV3-Large on the same licensed images and incident-grouped split.

## Data and rights

Create a UTF-8 CSV with the columns in [`manifest.example.csv`](manifest.example.csv). The five exact `category` values are `flooding`, `potholes`, `fallen_trees`, `uncollected_garbage`, and `damaged_signage`. `image_path` is relative to `--image-root`; `sha256` is the SHA-256 of the original file bytes. Every row needs a source URL or internal consent-record reference, creator, image-specific license or permission, attribution text, incident ID, location ID, and photographer ID. Do not put private resident images or consent records in Git. An open repository's *code* license does not establish rights to its images. The CLI validates that the fields exist and hashes match; human review must verify the rights and labels.

Possible starting sources, **subject to category fit and individual rights review**:

- [RDD2022](https://github.com/sekilab/RoadDamageDetector/blob/master/README.md): CC BY-SA 4.0 road images; D40 is potholes. Its published test images have no labels. Do not use them as a scored test set.
- [FloodNet](https://github.com/BinaLab/FloodNet-Supervised_v1.0/blob/main/README.md): CDLA-Permissive-1.0 aerial post-flood imagery, which differs from resident phone photos.
- [Unsigned Road Incidents](https://zenodo.org/records/3764792): treefall class; authors restrict full-dataset access and flag copyright concerns. Verify each usable image's terms.
- [TACO](https://github.com/pedropro/TACO): litter, which does not by itself establish uncollected garbage; verify Flickr image licenses individually. The repository MIT file covers software.

No suitably verified damaged-signage corpus is assumed. Collect consented Philippine phone photographs for gaps and a local held-out test set. Keep a separate provenance ledger and document category labeling rules, exclusions, and annotation review. Resolve any face or license-plate privacy issues before dataset use.

## Run on local hardware, Colab, or Kaggle

For the current public-data shortlist and ready-to-import Kaggle notebook, see [DATASET-SOURCES.md](DATASET-SOURCES.md). Public licensed data can supply training images; local Philippine images help evaluate the actual reporting setting.

Use Python 3.11 or 3.12. In Colab/Kaggle, enable GPU if available, mount or upload **your own licensed dataset**, then run from this `ml/` directory. Install the matching PyTorch/TorchVision build for that runtime using [official PyTorch installation guidance](https://pytorch.org/get-started/locally/) before the other dependencies when needed. Internet is needed once for the official pretrained weights; no dataset download is embedded.

```bash
python -m pip install -r requirements.txt
python -m pytest tests -q --basetemp=.pytest_tmp
python -m barangai_ml.cli prepare --manifest /path/to/manifest.csv --image-root /path/to/images --output outputs/split.csv --seed 42
python -m barangai_ml.cli train --split outputs/split.csv --image-root /path/to/images --output outputs/run1 --seed 42 --epochs 10 --batch-size 16
```

Use `--cpu` to force CPU training. The split command checks file existence and SHA-256, groups every image from an incident and every repeated image hash or source URL into one partition, and records fixed `train`/`val`/`test` assignments. It rejects a class with fewer than three independent groups or a partition missing a class. Keep `outputs/split.csv` fixed across both architectures and future reruns. Near duplicates with different bytes or URLs still require manual or perceptual-hash review before splitting, especially burst photos and crops.

Training uses fixed seeds, deterministic PyTorch operations, zero data-loader workers, the same optimizer and hyperparameters for both models, and the official pretrained weight variants. It selects each model's checkpoint by **validation macro F1** and chooses the deployment candidate by validation macro F1. `results.json` records train history, held-out accuracy, macro F1, per-class precision/recall/F1/support, confusion matrix (rows=true; columns=predicted; class order in JSON), serialized checkpoint size, and single-image CPU latency with 10 warmups and 50 timed runs. Test metrics are reported for comparison; do not retune on the test set. CPU latency is hardware-specific, so benchmark again on the actual deployment host. PyTorch notes that exact reproducibility across releases, platforms, and CPU/GPU is not guaranteed; record Python, PyTorch, TorchVision, hardware, dataset manifest, and command versions in the research log.

The checkpoint contains architecture, pretrained-weight ID, class order, split SHA-256, and state dict. It is **not automatically deployed**. Review dataset provenance, class errors, uncertain cases, and resource measurements first. Select and record a confidence threshold from validation predictions before setting the API's `MODEL_CONFIDENCE_THRESHOLD`; do not tune that threshold on the held-out test set. The API's optional adapter verifies the reviewed checkpoint hash and preserves resident manual categorization, but its real TorchVision path remains untested until licensed data and a trained checkpoint exist.


## Review uncertainty without using the test set

After training each best validation checkpoint, the CLI writes `<architecture>_val_predictions.csv` and `<architecture>_test_predictions.csv`. Each row contains the relative image path, incident ID, original hash, true and predicted category, maximum confidence, and all five class probabilities. These are private research artifacts; do not publish identifying paths or incident references.

`results.json` contains a **validation-only** threshold table at 0.50, 0.60, 0.70, 0.80, 0.90, and 0.95. Coverage is the fraction with confidence at least the threshold; accepted accuracy is correctness among those images, or null when none are accepted. These thresholds are review candidates, not a chosen or calibrated safety threshold. Inspect per-class errors and document the selected threshold using validation data before final held-out testing. Keep the threshold and model choice fixed when reporting final test accuracy and coverage. Test prediction exports intentionally provide no threshold selection table. No scores exist until real training executes.
