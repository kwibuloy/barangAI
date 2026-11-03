# Tree repair comparison — 20 October 2026

All four fixed local CPU runs completed. Validation-only selection retains **unweighted EfficientNet-B0** through the predefined tie rule. The selected checkpoint is a research candidate; the local presentation launcher retains v3. The reserved diagnostic does not justify replacing it: both models get 10/12 raw predictions correct, while the candidate adds a tree false alarm and produces no suggestions at the unchanged 0.8 cutoff.

## Data and protocol

- Correct final package: `artifacts/tree-reliability-2026-10-20/training-v4-final/`, **199 images**, 155 train / 18 validation / 26 test. The obsolete 201-image Kaggle package was not used.
- Split SHA-256: `b5e6d35e4bcd8ebc1afe324e87c57dc202337b3cce0ae2e0a24184e70202e607`.
- All 172 v3 records and split placements remain unchanged. Added 27 reviewed tree photos are training-only under one conservative source group. Training counts: flooding 23, potholes 71, fallen trees 32, uncollected garbage 10, damaged signage 19.
- New source rights are uploader-declared CC BY 4.0. Original ownership, photographers and capture country remain unverified. No public redistribution permission is asserted.
- EfficientNet-B0 and MobileNetV3-Large each ran 10 epochs in both `none` and `balanced` conditions. Seed 42, batch 16, AdamW learning rate 0.0001, two CPU threads. Balanced weights use training counts only, inverse frequency normalized to mean 1.
- Full-image EXIF-aware 224 letterbox, black padding, training horizontal flip only; metadata `letterbox_224_v1`. Official pretrained weights: EfficientNet ImageNet1K V1 and MobileNet ImageNet1K V2.
- Environment: Python 3.12.5, Torch 2.11.0+cpu, TorchVision 0.26.0+cpu, scikit-learn 1.9.1. These local CPU results are not hosting benchmarks.

## Frozen development results

| Weighting | Architecture | Validation macro F1 | Test correct | Test macro F1 | Tree recall | Tree false positives |
| --- | --- | --- | --- | --- | --- | --- |
| none | EfficientNet-B0 | 1.000000 | 24/26 | 0.864762 | 1/2 | 0 |
| none | MobileNetV3-Large | 1.000000 | 26/26 | 1.000000 | 2/2 | 0 |
| balanced | EfficientNet-B0 | 1.000000 | 25/26 | 0.915152 | 1/2 | 0 |
| balanced | MobileNetV3-Large | 1.000000 | 25/26 | 0.952593 | 2/2 | 1 |

All validation scores tie. The fixed order is none before balanced, then EfficientNet before MobileNet. Better test results do not change selection. Validation includes 14 potholes and only one example of each other class. These tiny, reused development holdouts cannot establish field reliability or a causal benefit from weighting.

The selected model misses one tree as garbage and one garbage photo as flooding. Balanced EfficientNet also misses one tree as garbage. Balanced MobileNet labels one pothole as a fallen tree. Compared with v3's 0/2 old test-tree recall, the selected candidate reaches 1/2; one extra correct image is weak evidence.

## Reserved Philippine diagnostic after selection

Only the frozen selected candidate and existing v3 were evaluated. No threshold, checkpoint or architecture was tuned against these photos.

| Model | Raw correct | Flood recall | Tree recall | Garbage recall | Sign recall | Tree false positives | Suggestions at 0.8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| selected v4 candidate | 10/12 | 5/5 | 4/4 | 0/2 | 1/1 | 2 | 0/12 |
| existing v3 | 10/12 | 5/5 | 4/4 | 0/2 | 1/1 | 1 | 4/12, all four correct |

Both candidate garbage photos become trees; v3 labels one as a tree and one as flooding. None of the four trees reaches 0.8 confidence in either model. Raw tree recognition therefore does not mean a tree suggestion appears in the demo. Candidate tree precision is 4/6; v3 tree precision is 4/5. Zero accepted candidate predictions means accepted accuracy is undefined, not zero accuracy.

The 12 photos cover four classes and five conservative groups. All four tree photos show one Vamco storm event. No potholes were evaluated. Photographers are not independent; provenance and perceptual screening cannot exclude all related sources. This is a local diagnostic, not representative Philippine field validation. Further model decisions require fresh evaluation data; do not repeatedly tune against these 12 photos.

## Integrity and evidence

Checkpoints remain private under `artifacts/tree-reliability-2026-10-20/results-cpu/{mode}/`:

| Weighting / architecture | SHA-256 |
| --- | --- |
| none / EfficientNet | `f70f7b16bf9adce87be7645ddd2d58ade95c063e3e985d8649d052027fa28cda` |
| none / MobileNet | `d42d9800af5b5ce4e77e09e1d2e61e31832a7188657d7de7ab605c13cff8a94d` |
| balanced / EfficientNet | `c33651857eec7bfaa47bdbd05294d26f84c11b7ae165975ec42cfd631d2246d8` |
| balanced / MobileNet | `93d8308257c33ff2a70b252c52ddb61975a19f0a4f92bb2ada58967cf6e51d66` |

`verification-both.json` verifies image hashes, preserved records, checkpoint metadata/size/finite tensors, class weights, all four 10-epoch histories and recomputed prediction CSV metrics, confusion matrices and validation coverage tables. Checkpoints omit saved epoch, optimizer and RNG state; completion is supported by histories/logs, and first best epochs are inferred as 4, 6, 6 and 2 in table order.

`results-cpu/selection.json` records all four validation comparisons. `local-evaluation/results.json` and per-image prediction JSON preserve both diagnostic runs. `training.stdout.log`, empty `training.stderr.log`, and `results-cpu/environment.json` record completion. The stale `training.pid` identifies the completed run and is not proof of a running job.

`final-audit.json` independently recomputes reserved metrics and confirms validation-only selection. Replaying the selected checkpoint through API preprocessing on all 18 validation and 26 test images reproduces every label; maximum probability errors are 4.77e-7 and 6.56e-7 respectively (tolerance 1e-5).

Focused API inference and ML tests: **21 passed**. Existing broader app evidence remains recorded in the local handoff. No launcher replacement occurred, so no new browser integration result is claimed.

## Next gates

Collect diverse independent events, mixed tree/flood scenes, standing trees and irrelevant inputs. Establish labels before training; measure tree false alarms and calibrate confidence on separate validation data. Keep resident category and staff verification independent of model prediction. Physical-phone camera/gallery/GPS, live provider privacy/migrations, hosting memory/latency, human language review and actual user evaluation remain pending. No paid compute, billing, commit, push or deployment occurred.
