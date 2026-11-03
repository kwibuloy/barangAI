# Architecture decision record — BarangAI Watch CV v5

Status: **Accepted (plan)**. Date: 25 October 2026. Evidence tags follow `dataset_audit.md`: [M] measured, [R] reported, [A] assumption.

## 1. Decision

Build a **single-label image classifier with six outputs**: `flooding`, `potholes`, `fallen_trees`, `garbage_accumulation` (shown in the app as "Uncollected Garbage"), `damaged_signage`, plus an explicit `other` (no target incident) class. §7 records the Phase 2 confirmation. On top of it sit:

- post-hoc **temperature scaling**;
- a **validation-selected confidence threshold** with abstention.

The backbone is selected by a pre-registered comparison among four ImageNet-pretrained CNNs:

- **EfficientNet-B0** and **MobileNetV3-Large** (TorchVision): primary, already integrated;
- **MobileNetV3-Small-100** and **ResNet18-A1** (user-supplied timm weights): secondary.

The rule is the highest mean validation macro-F1 over three seeds. A practical tie goes to the lower measured CPU latency (training plan §7).

**Rejected for v5:**

- object detection;
- supervised multi-label classification;
- a hybrid classifier + detector pipeline;
- ViT-B/16.

Bounding boxes are still used, *offline*, to choose positives and build context-preserving crops for the classifier.

## 2. What the product needs (the inputs to the decision)

These come from the codebase. [M]

1. A resident uploads **one photo** and selects **one category**. The model's output is a **suggestion** that is stored separately from the resident category and the staff-verified category (AGENTS.md; `apps/api/barangai/inference.py` → `Prediction(category, confidence, embedding, model_version)`).
2. Below the confidence threshold, the model must make **no suggestion** (`category=None`). Manual reporting must keep working if the model fails.
3. The same forward pass produces an **L2-normalised pooled embedding**. Duplicate-report suggestions use it with a cosine ≥ 0.85, 500 m gate (`apps/api/barangai/duplicates.py`). A detector does not give this for free.
4. The API runs on a **CPU-only free host** with 2 threads (`deploy/start-local.ps1`, `render.yaml`). The current EfficientNet-B0 checkpoint is 16.4 MB [M].
5. Images are sanitised before inference: EXIF transpose, RGB, JPEG re-encode at quality 85, and a 5 MB upload limit (`media.py:116`).

## 3. Alternatives evaluated

| Criterion | Single-label classifier (+`other`) | Multi-label classifier | Object detector (e.g., YOLO-n, SSDLite) | Hybrid (classifier + detector) |
|---|---|---|---|---|
| Fits the supplied annotations | **Yes.** Every source gives at least an image-level label. | **No.** [M] No source has multi-label ground truth. [A] Urban Issues annotates each folder for its own class only, so negatives are unknown (missing-label problem). | **Partly.** Boxes exist for potholes, trees, signs and garbage [M]. **Flooding has no boxes.** [M] FloodIMG has 25 polygon files; Roadway Flooding has masks only. Flood is an amorphous "stuff" region that boxes model poorly. | Possible, but doubles annotation and QA work |
| Generalisation with our data size | Good with transfer learning. Minority class about 300 images [A]. | Needs negatives per label; partial-label methods add risk | Detector heads need many boxes per class. Signs have about 350 sources [M]. | Each part sees less data |
| CPU inference [M] | 22–43 ms (MobileNetV3-L … ResNet18, 2 threads) | Same as classifier | SSDLite-320 43 ms [M]; YOLO-n [A] about 50–150 ms at 640 | Sum of both |
| Size | 6–43 MB fp32 | Same | 9 MB+ | Sum |
| Training complexity | Lowest; the pipeline already exists (`ml/barangai_ml/cli.py`) | Low, but needs new labels | High: box QA, anchors/NMS, mAP tooling; Ultralytics is **AGPL-3.0** | Highest |
| Multiple hazards in one image | Single label; mitigated by top-2 display and the evaluation subset (§6) | Native, **if** labels existed | Native for boxable classes; flood unsolved | Native |
| Fits the barangay workflow (one category per report, staff verify) | **Direct fit** | Needs schema change (several categories) | Boxes are unused by the UI; category must still be derived | Over-engineered for a suggestion |
| Duplicate-embedding reuse | **Yes**, unchanged | Yes | No pooled image embedding by default | Yes, via the classifier |

### Why not detection

- Flooding, one of the five required classes, cannot be supervised with the supplied boxes. It would need a classification head anyway.
- The product consumes one category, not locations.
- Detection would add AGPL licensing (Ultralytics), mAP tooling and box-quality review. That workload is larger than the thesis needs.
- The headline benefit, handling several hazards in one image, cannot be *evaluated* without multi-label ground truth, which no source has.

### Why not multi-label now

There are no reliable negatives. Training sigmoid heads on per-folder labels would teach "a fallen-tree image is not garbage" even when garbage is visible. The data reality matches a single-label formulation. Multi-label stays as future work once the Philippine field set is annotated with secondary hazards (evaluation protocol §3.3).

### Why add `other`

- A softmax over five classes must pick one of them for every photo, including a healthy road, an intact sign, a standing tree, a puddle or a selfie.
- [M] The supplied data contains about 15,000 source images of **realistic non-target civic scenes**: graffiti on walls, damaged concrete, electric poles, dead animals, illegal parking, crack-only roads and manholes.
- These train a reject option that confidence thresholding alone does not give. Softmax confidence is known to be over-confident on out-of-distribution inputs.
- The cost is one extra logit and a small API change (spec S9). Experiment E3 tests whether `other` actually reduces false suggestions. If it does not, v5 ships as a 5-way model.

## 4. Backbone candidates

| Candidate | Weights | Params [M] | 2-thread CPU median [M] | Already integrated | Role |
|---|---|---|---|---|---|
| EfficientNet-B0 | TorchVision IMAGENET1K_V1 | 4.0 M | 32.6 ms | Yes (training, API, Render) | Primary |
| MobileNetV3-Large | TorchVision IMAGENET1K_V2 | 4.2 M | 22.2 ms | Yes | Primary |
| MobileNetV3-Small-100 | timm `lamb_in1k` (user-supplied) | 2.5 M | 13.6 ms (TorchVision equivalent) | No (needs `timm`) | Secondary |
| ResNet18-A1 | timm `a1_in1k` (user-supplied) | 11.7 M | 43.2 ms (TorchVision equivalent) | No | Secondary |
| ViT-B/16 | `google/vit-base-patch16-224` (user-supplied) | 86.6 M | **448 ms** | No | **Excluded** (dataset_audit §5.4) |

**What earlier project experiments do and do not show.** [M] In `ml/TRAINING-RESULTS-V4-2026-10-20.md`, EfficientNet-B0 and MobileNetV3-Large tied at validation macro-F1 = 1.0 on an 18-image validation set. **That evidence cannot separate the backbones.** It shows only that both train end to end. v5 must decide the backbone on a validation set roughly 100× larger.

**Expectation, stated as an estimate.** [A] On the order of 10k training images, EfficientNet-B0 and MobileNetV3-Large usually land within a few macro-F1 points of each other. MobileNetV3-Small is often a few points lower on fine-grained classes. If so, the latency tie-break will matter and favour MobileNetV3-Large. This is a prediction to falsify, not a result.

## 5. Inference pipeline (target)

```
sanitised JPEG (API) → EXIF-aware letterbox 224 (letterbox_224_v1) → backbone → pooled embedding ─┐
                                                                                              ├→ L2-normalised embedding (duplicates)
                                                       logits (6) / T (temperature) → softmax ─┘
  argmax == other            → category=None, reason "no_target"
  max p (5 targets) < τ      → category=None, reason "low_confidence"
  else                       → category=argmax, confidence p; UI may show top-2 if p1 − p2 < 0.15
```

Notes:

- τ and T are chosen on validation data (PH-dev when available; evaluation protocol §5). They are frozen before the final test.
- The 0.15 top-2 margin is a UI heuristic and is not tuned against any test set.
- The preprocessing version stays `letterbox_224_v1`, which the API already implements, so training and serving stay identical. The 224 vs 288 resolution ablation (E4) can only change this if it wins on validation; the change would then ship as `letterbox_288_v1` with an API test.
- Deployment format: PyTorch eager fp32 state dict with metadata. This is the current format; the hosted path is verified in `docs/deployment.md`.
- ONNX Runtime or int8 quantisation is only an optional task. It is justified only if host p95 latency misses the target (training plan §12).

## 6. Handling several hazards in one image

- **v5 behaviour.** Single label. The suggestion is advisory; the resident still chooses and staff still verify.
- **Mitigation.** When the top-2 margin is small, show both. The resident picks.
- **Measurement.** Philippine field images are annotated with `secondary_categories`. Evaluation protocol §4.4 reports top-1 and top-2 "any-hazard hit rate" on that subset. A future multi-label model has a defined target only if this subset shows a material problem.

## 7. Phase 2 review with real data (25 October 2026)

**Verdict: architecture unchanged.** No new evidence shows a substantial problem with single-label classification with `other` or with the four-backbone comparison. Specific checks:

| Question | Evidence | Conclusion |
|---|---|---|
| Does any acquired source provide multi-label ground truth? | [M] No. Detection sets annotate one task each. **1,297 deduplicated groups carry conflicting labels across datasets** (`dataset_review_report.md` §3.2) | Multi-label training remains unsupported. Conflicts go to review |
| Is detection now more attractive? | [M] Boxes exist for potholes, signs, garbage and trees. Flooding still has none. The small-object cases (Southeast Asian pothole frames, COS street scenes with tiny signs) are handled by **box-guided crops** for the classifier | Boxes are used offline for crops. No detector in v5 |
| Is the minority class still too small for CNN transfer learning? | [E] Expected usable after review: signs 1,700–2,300; smallest pool potholes 1,100–1,500 (`dataset_review_report.md` §5) | Comfortable for ImageNet-pretrained CNNs. ViT stays excluded on CPU cost alone ([M] 448 ms) |
| Do inputs suit 224 px? | [M] Median sizes 256–1280 px. Many small-target frames exist | Keep `letterbox_224_v1`. Box crops address small targets. E4 (288 px) stays an optional ablation |
| Is `other` learnable from the data? | [M] 27,309 candidate groups from ≥ 10 sources, including hard negatives (intact signs, normal roads, crack-only roads, isolated litter incl. Philippine shoreline) | Keep `other`. Cap and diversify it |
| Does `other` solve unknown inputs? | It cannot cover every unknown input (selfies, documents, indoor scenes). Softmax confidence is also not a reliable out-of-distribution detector | Keep **both** `other` and a calibrated abstention threshold. **Claim neither as complete unknown-input detection.** Report the false-suggestion rate on held-out `other` and on PH non-incidents |

**Training label naming.** The garbage label is now `garbage_accumulation`: it describes visible content and makes no claim about a missed collection. The checkpoint stores `labels` (training names) plus `app_categories` (`uncollected_garbage` for that label). The API maps one to the other (spec S9), so resident-facing wording is unchanged.

**Selection metrics** (pre-specified; evaluation protocol §5):
- Validation macro-F1 is primary.
- Ties within 0.01 or a non-significant difference go to the lower p95 CPU latency.
- Reported alongside, never used for selection: per-class recall, model size, peak RSS, latency, and robustness slices (blur, low light, JPEG compression; evaluation protocol §4.6).

## 8. Consequences

- **Code.** Small API change: accept a 6-label checkpoint, apply the temperature, map `other` to `None`. Existing v3/v4 5-class checkpoints keep loading.
- **Tooling.** New data tooling: source adapters, deduplication, audit, calibration and evaluation. Specified in `implementation_spec.md`.
- **Dependencies.** `timm` becomes an ML-side dependency. It joins the API only if a timm backbone wins and the human approves (spec S9e).
- **Deployment.** Unchanged unless a new checkpoint passes the acceptance gates in evaluation protocol §8. The v3 demo model stays active until a human approves replacement.
- **Embeddings.** Changing the checkpoint changes `model_version`. Existing duplicate embeddings become incomparable; `duplicates.py` already refuses mixed versions. No migration is needed.
