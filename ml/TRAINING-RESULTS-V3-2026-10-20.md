# Supplementary ground-level training v3 — 20 October 2026

## Completed and verified

EfficientNet-B0 and MobileNetV3-Large each completed 10 epochs on free Kaggle Tesla T4. The private dataset contains 172 reviewed derivatives: 128 training, 18 validation, 26 test. All 166 v2 records/placements remain unchanged; six visually reviewed Roboflow pothole crops were added to training only. A seventh proposed crop was excluded as a mirrored existing training photograph. No overlap was flagged against frozen holdouts by the bounded audit; this does not prove independence. The separate 15 Philippine candidates remain unassigned and outside this run.

| Model | Validation macro F1 | Test correct | Test accuracy | Test macro F1 | CPU median on Kaggle |
| --- | ---: | ---: | ---: | ---: | ---: |
| EfficientNet-B0 | 1.0000 | 24/26 | 92.31% | 0.7500 | 36.44 ms |
| MobileNetV3-Large | 1.0000 | 24/26 | 92.31% | 0.7500 | 28.30 ms |

Both tie on validation. The existing deterministic architecture-order tie-break selected EfficientNet-B0; it did not outperform MobileNet on these metrics. Checkpoints use the first best epoch: EfficientNet epoch10, MobileNet epoch8. Test scores did not choose the model.

## Failure and practical limits

Both models classified both held-out fallen-tree photographs as flooding: fallen-tree recall 0/2. Other test recall: flooding3/3, potholes14/14, garbage5/5, damagedsigns2/2. Flood precision is3/5. Overall accuracy conceals this complete class failure. Validation has only one photograph for each class except potholes14. The training set is imbalanced:71 potholes,23 floods,19 signs,10 garbage,5 trees. The perfect validation score is not reliable evidence of generalization.

These are small development holdouts, including reused pilot photos, and many source/camera/dataset characteristics can correlate with labels. The larger test differs from the75-imagepilot test, so the aggregate accuracies are not a controlled comparison. No independent Philippine field evaluation, irrelevant-image rejection calibration, user study, or production threshold was established. Garbage visibility does not establish missed collection schedules. Keep resident category and staff verification; no automatic report acceptance.

No model was activated in the localAPI. Local Torch/TorchVision installation, real checkpoint loading through the API and deployment-host memory/latency are outstanding. Kaggle CPU timings use twoTorchthreads,10warmups/50runs and are not hosting benchmarks. No paid compute, billing, commit, push, public publication or deployment.

## Reproducibility and saved evidence

Seed42, batch16, AdamW1e-4; ImageNet pretrained weights; same reviewed existing trainer and fixed split for both models. Python3.13.15, Torch2.11.0+cu128, TorchVision0.26.0+cu128, CUDA12.8. TwoT4 GPUs available; training uses the defaultGPU without distributed training. SourcearchiveSHA256385a757532b8dbbfa6bfdfca8a05903bba2a6d0b95378c59d31611e60e65c7c7.

SplitSHA256:cff3bcaaf1a983759c6d09da6934b1b76ee21b95e38aa18f69c25a8acbe01e04.
ResultsZIP:30,882,228bytes; SHA2560569ada33f045a0c30435313e46cca9fd252b318d174507cf6aefa334d49d9d5; CRC passed. Exported prediction CSVs independently reproduce both validation/test accuracies and macroF1. Split bytes match the frozen172-imageinput. Checkpoint sizes match results.json.

- EfficientNet checkpoint SHA256:06b5ad7c02112c599c056b9be52fe771a3bdfdb08577897d1a962c1dd2c1f409;16,357,535bytes.
- MobileNet checkpoint SHA256:096bcd1d535af641723986332ea36d77c00366bee369cceae77406081fcf60ba;17,043,065bytes.

Artifacts: artifacts/training/2026-10-20-close-ground-level-v3/ including originalZIP, outputs/comparison_v3/results.json, checkpoints, predictionCSVs, environment and split; verification.json records checks.

Private notebook QuickSave version2, Reviewed172-imagecomparison, saved with output: https://www.kaggle.com/code/reddelmundo/barangai-watch-model-training . Private dataset: https://www.kaggle.com/datasets/reddelmundo/barangai-close-ground-level-v3 . DraftSession explicitly stopped and UI confirmed Sessionstopped. No GPU remains running. Fulfilled one-time resume automation deleted.

Next useful work: more diverse reviewed tree/flood examples and genuinely independent local evaluation. Do not tune against these test errors and then describe this same set as unseen field validation.
