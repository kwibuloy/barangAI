# Ground-level training pilot — 20 October 2026

## Completed run

Both EfficientNet-B0 and MobileNetV3-Large completed 10 real fine-tuning epochs on Kaggle Tesla T4 GPU. No aerial or quarantined source images were used. The same reviewed 75-image dataset and frozen 47 train / 9 validation / 19 test split were used for both models. GIGO original test placement was preserved.

| Model | Validation macro F1 | Test correct | Test accuracy | Test macro F1 | Checkpoint size | Kaggle CPU median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| efficientnet_b0 | 0.5800 | 14/19 | 73.68% | 0.5528 | 16,357,535 bytes | 31.49 ms |
| mobilenet_v3_large | 0.5314 | 6/19 | 31.58% | 0.4535 | 17,043,065 bytes | 22.88 ms |

Selected by validation macro F1: **EfficientNet-B0**. The test set did not select the model. CPU timings are from Kaggle with 2 Torch CPU threads (10 warmups, 50 measured runs), not the deployment host.

## Limits and decision

This is a pipeline and training smoke experiment, not evidence of reliable production classification. There are only 6 pothole images, including just one each in validation and test. The sources differ by country, camera, photographer and scene; source shortcuts can inflate or distort scores. GIGO visible bags/bulky waste do not establish a missed collection schedule. No Philippine field evaluation or user study was performed.

EfficientNet-B0 missed the only held-out pothole and detected only 1/3 held-out flood photos. Its highest validation confidence is approximately 0.549; MobileNetV3-Large reaches approximately 0.299. No production confidence threshold was selected or calibrated. Keep resident manual categorization and staff verification. Do not enable automatic acceptance, routing or public deployment from this experiment.

## Reproducibility and evidence

Private Kaggle notebook: https://www.kaggle.com/code/reddelmundo/barangai-watch-model-training . Dataset: https://www.kaggle.com/datasets/reddelmundo/barangai-ground-level-pilot . Notebook version 1 saved through Quick Save, preserving existing output without requesting another training run.

Runtime: Python 3.13.15, Torch 2.11.0+cu128, TorchVision 0.26.0+cu128, CUDA 12.8. Two Tesla T4 GPUs available; this script trains on the default CUDA device, without distributed training. Seed42, batch16, AdamW learning rate0.0001. Each checkpoint is the epoch with best validation macro F1, not necessarily epoch10.

The downloaded ZIP CRC passed. Local split SHA-256 matches results.json. Both checkpoint byte sizes match the recorded run. Training source archive hash: 385a757532b8dbbfa6bfdfca8a05903bba2a6d0b95378c59d31611e60e65c7c7.

- efficientnet_b0 checkpoint SHA-256: `affcaaaf595232d3cc578ca037da92db7076e19236f74a08aa51de17a5403e5c`
- mobilenet_v3_large checkpoint SHA-256: `d6e7cd92f9520472ba78fff2e8f1d986ccc19ece33ffae577481d074504505c5`

Local artifact directory: `artifacts/training/2026-10-20-ground-level-pilot/`. Includes original downloaded ZIP, checkpoints, results.json, environment.json, frozen split and validation/test probability CSVs. Image attribution and source metadata remain in the private dataset and local staging. Checkpoint loading in the local API and deployment-host memory/latency tests remain unperformed; local Torch/TorchVision is not installed.

## Next useful work

Collect more diverse permitted ground-level phone images, especially potholes and flooding; add independent events and realistic difficult/irrelevant scenes; preserve unseen local evaluation photos. Repeat training only after the dataset revision is reviewed. A larger number of epochs alone does not resolve this dataset limitation. No model deployment, paid compute, commit or push occurred.
