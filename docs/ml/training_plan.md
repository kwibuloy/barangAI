# Training plan — BarangAI Watch CV v5

Version 2 (Phase 2), 25 October 2026. Supersedes version 1.

- This document covers *how* to train.
- `evaluation_protocol.md` covers how results are judged.
- `implementation_spec.md` covers the code.
- `dataset_review_report.md` holds the data evidence.

Numbers marked [E] are planning estimates, not results.

**Hard constraints:**
- ₱0 cost: Kaggle free GPU, Colab free, or the local GTX 1650 / Ryzen 5 4600H.
- PyTorch.
- CPU deployment through FastAPI.
- No fabricated metrics.
- Test sets decide nothing.

## 1. Data construction

### 1.1 Label set

`LABELS = ("flooding", "potholes", "fallen_trees", "garbage_accumulation", "damaged_signage", "other")`.

The checkpoint also stores `app_categories = ("flooding", "potholes", "fallen_trees", "uncollected_garbage", "damaged_signage", None)`. Definitions are in `labeling_guidelines.md`.

### 1.2 Source → label mapping

The mapping of record is `rule()` in **`ml/audit/pools.py`**. It is the single place that encodes which source folders and box classes become which proposed label, which are excluded, and which are evaluation-only probes. Its output, `ml/data/inventory/candidates_v5.csv`, is the only input to the build step.

- **Every `needs_review=1` candidate passes human contact-sheet review** (labeling guide §5) before it can enter training, validation or test.
- **Cross-label conflict groups** (1,297 [M]) are reviewed. Never auto-assign them.

### 1.3 Choosing one image per augmented group

Many sources contain baked-in augmented siblings (cutouts, mosaics, rotations, grayscale). Within each Roboflow stem group, keep **one** image: the best-scoring copy, chosen by:

1. the lowest `black_frac` (letterboxing or cutouts);
2. then colour over grayscale (mean HSV saturation > 0.08);
3. then the largest dimensions;
4. then the lexicographically smallest relpath.

The other siblings are discarded. They are **not** extra training data, because their augmentations are unrealistic and duplicate the original.

Other near-duplicates within one dedup group (re-uploads, reposts) are also collapsed to one image per group per label, preferring the source with the best rights tier (precedence list in `pools.py`).

### 1.4 Box-guided context crops (potholes, signs, garbage)

For a reviewed positive whose target box is small (`max_box_area < 0.05`; e.g., COS street scenes, Southeast Asian pothole frames):

- Crop a square around the largest target box, scaled to **3× the box's longer side**. Clip to the image and keep at least 224 px where possible.
- Record the crop coordinates in the manifest (`crop_xyxy`). The crop inherits the original's `group_id`.
- If the crop is still under 128 px on its short side, exclude the image.
- Crops are a data-construction step, not augmentation: one crop per image, and only on reviewed positives.

### 1.5 Caching and privacy

For every admitted image, in `build`:

- EXIF transpose → RGB → longest side ≤ 640 px → **JPEG quality 85**. This matches the API's `sanitize_image`, so training sees the serving input distribution.
- Re-encoding removes **all** metadata. GPS EXIF was found in 233 downloaded images [M].
- Store as `ml/data/cache/<sha256>.jpg` (git-ignored).
- Record both the original SHA-256 and the cache SHA-256.

### 1.6 Rights filtering

- Only tiers A, A-NC and B enter T-main (`licensing_and_provenance.md` §4).
- Images flagged in review as `reject:watermark`, `reject:streetview` or broadcast frames are removed (per-image tier C).
- The manifest stores `rights_tier` per image.

## 2. Duplicate detection and leakage prevention

The tooling exists and is tested (`ml/audit/`):

1. **`inventory.py`:** SHA-256, dHash and mirrored dHash, pHash and mirrored pHash, `black_frac`, label parsing.
2. **`dedup.py`:** exact + near (dHash ≤ 6 **and** pHash ≤ 12, direct or mirrored) + Roboflow stems + extra pairs → union-find `group_id`.
   - Multi-index search is proven equal to brute force (`ml/audit/test_audit.py`).
3. **`embed.py`:** semantic near-duplicates (re-crops). Threshold **0.90** was validated visually for signs: 14 of 16 pairs in the lowest band were the same photo.
   - **Run it for every target pool**, not only signs (spec S2). Pools with more than 15k images may be processed per label.
4. **Session grouping:**
   - Rome GoPro frames with the same date and timestamps within 60 s;
   - FloodIMG USGS webcam sequences (already grouped by pixel similarity: groups of 212–451 [M]);
   - COS40007 street sequences.
5. **Cross-set exclusion.** Probes (T2a, T2b) and all Philippine images (PH-dev, PH-test) are deduplicated together with training candidates. Any training group that touches them is **removed from training**.
6. **Leakage assertion.** This blocks training. After splitting, no relation from (1)–(4) may connect `train` with `val`/`test`, or any split with a probe or PH image. `prepare` exits non-zero on violation.

## 3. Splits

- **All supplied splits are ignored.** They leak: 2,156 Urban Issues stems cross them [M].
- **Grouped, label-stratified 70/15/15** by `group_id`, using the existing `ml/barangai_ml/data.py:split_records` extended with `group_id`.
- **Source balance in held-out splits.** For every label with at least 2 sources, `val` and `test` must each contain at least 2 sources. Otherwise the split is redrawn with the next seed (record the seed).
- **Freeze.** `split.csv` and its SHA-256 are frozen **before any v5 training run**. A change creates dataset version `v5.x` and invalidates earlier comparisons.
- **Evaluation-only sets are never in `split.csv`:** T2a (Roadway Flooding, 438 groups), T2b (Rome phone, 87 pothole + 14 crack-only groups), PH-dev and PH-test.

## 4. Class imbalance

Expected admitted images after review [E]:

| Label | Expected |
|---|---|
| garbage_accumulation | about 2,800–3,500 |
| damaged_signage | about 1,700–2,300 |
| flooding | about 1,300–1,800 |
| fallen_trees | about 1,400–1,700 |
| potholes | about 1,100–1,500 |
| `other` | capped |

That is a ratio of about 2–3×. Rules:

1. **Cap** each target label at **3,000** training images, and `other` at **4,000**.
   - `other` must come from at least 5 sources, each at most 40%, and must include intact signs, normal roads, crack-only roads, isolated litter and non-target civic scenes.
2. **At most 3 images per group** in training (after §1.3 there is usually 1).
3. **At most 60% from one source** within a target label. **Exception: flooding**, where FloodIMG is the only source. Record this as a known limitation (`dataset_review_report.md` §6) and add FloodDET when acquired.
4. **Weighted cross-entropy** (`class_weights(mode="balanced")`) vs unweighted is experiment E2. No sampler and weighted loss together.
5. **Macro-F1** is the selection metric.

## 5. Augmentation

Training only. Realistic phone conditions:

1. `exif_transpose → RGB`.
2. `RandomResizedCrop` on the original aspect, scale (0.6, 1.0) and ratio (3/4, 4/3), then letterbox to 224.
3. `RandomHorizontalFlip(0.5)`. **No vertical flips and no 90° rotations.** Several sources had these baked in; §1.3 removes them.
4. `RandomRotation(±8°)`.
5. `ColorJitter(0.3, 0.3, 0.25, 0.02)`.
6. `GaussianBlur` with p = 0.15.
7. `transforms.v2.JPEG(quality=(40, 95))` with p = 0.3. Verified to exist in TorchVision 0.26 [M].
8. Normalise, then `RandomErasing(p=0.1, scale=(0.02, 0.1))`.

Evaluation and serving use the plain `letterbox_224_v1`.

## 6. Transfer learning

- **Backbones** (architecture decision §4): EfficientNet-B0 and MobileNetV3-Large (TorchVision) are primary; MobileNetV3-Small-100 LAMB and ResNet18-A1 (timm, user-supplied) are secondary.
- **Head.** `Linear(in_features, 6)` with the backbone's default dropout.
- **Stage A.** 2 epochs with the backbone frozen; head learning rate 1e-3.
- **Stage B.** Full fine-tune. AdamW with head lr 3e-4 and backbone lr 1e-4; weight decay 0.05 (none on norm or bias). Batch 64 on GPU, 16 on CPU (freeze BN statistics on CPU and record that deviation).

## 7. Loss, schedule and selection rule

- **Loss.** Cross-entropy with optional class weights (E2). No label smoothing.
- **Schedule.** 1-epoch warm-up, then cosine to 1e-6, with up to 30 Stage-B epochs. AMP on CUDA.
- **Determinism.** Fixed seeds; `use_deterministic_algorithms(True, warn_only=True)`; `num_workers=2` with seeded generator and `worker_init_fn`.

**Pre-registered architecture selection**, fixed before any v5 training:

1. Train each of the 4 backbones with seeds {42, 43, 44}.
2. A = the best mean validation macro-F1; B = the runner-up.
3. If the mean difference is < 0.01, or the paired group-bootstrap 95% CI includes 0, choose whichever of A and B has the lower p95 CPU latency at 2 threads (measured by `bench`). Otherwise choose A.
4. Deploy the best-validation seed of the chosen backbone.
5. Test sets are never consulted.

## 8. Hyperparameter budget (free compute)

| Experiment | Runs | GPU-h [E] |
|---|---|---|
| E1: 4 backbones × 3 seeds | 12 | 4–8 |
| HP: lr_backbone {5e-5, 1e-4, 3e-4} × wd {0.01, 0.05}, seed 42 | 6 | 2–4 |
| E2: class weighting none vs balanced, 3 seeds | 3 | 1–2 |
| E3: 5-way (no `other`) vs 6-way, 3 seeds | 3 | 1–2 |
| E4 (optional): input 288 vs 224 | 3 | 1.5–3 |
| E5 (optional): T-licensed ablation (A/A-NC only; 3 labels) | 1–3 | < 1 |
| **Total** | about 28–30 | **about 10–20 GPU-h** |

Every choice is made on validation macro-F1, in the order E1 → HP → E2 → E3 → E4. The estimate assumes about 10–13k training images at 224 px on a Kaggle T4.

## 9. Checkpointing and early stopping

- **`best.pt`** (by validation macro-F1). Metadata:
  - existing keys plus `labels`, `app_categories`, `timm_name`, `mean`/`std`, `seed`, `epoch`, `hparams`;
  - `dataset_version`, `split_sha256`, `track` (`main`/`licensed`);
  - after calibration, `temperature`.
- **`last.pt`** with model, optimiser, scheduler, scaler and RNG state, for resuming across Kaggle session limits.
- **Early stopping.** Patience 6, minimum 8 Stage-B epochs. Write `history.jsonl`.

## 10. Evaluation and error analysis

See `evaluation_protocol.md`. Targeted confusions:
- tree ↔ garbage (seen in the v4 diagnostic);
- pothole ↔ flood (water-filled potholes);
- pothole ↔ other (cracks, manholes);
- signage ↔ other (graffiti, occlusion, wear);
- garbage ↔ other (isolated litter);
- flood ↔ tree (storms).

## 11. Calibration, uncertainty and manual review

1. **Temperature.** Fit on validation logits; refit on PH-dev when it has at least 15 groups per label.
2. **Threshold τ.** The smallest τ in {0.50, …, 0.95} whose accepted accuracy on non-`other` predictions is at least **P\*** (default 0.90, a human decision). If none qualifies, τ = 1.0 and the model makes no suggestions.
3. **Abstention reasons:** `no_target`, `low_confidence`, `model_unavailable`.
4. **Human review.** The resident category stays mandatory and staff verification stays independent. **Neither `other` nor softmax confidence is claimed to detect every unknown input.**

## 12. CPU inference and deployment

- **Baseline.** PyTorch eager fp32, 2 threads. [M] Local forward pass: 22–43 ms for the CNN candidates.
- **Targets on the deployment host** (product targets, measured by `bench`): end-to-end p95 ≤ 500 ms; RSS increase ≤ 250 MB; cold load ≤ 10 s.
- **ONNX or int8** only if a target is missed and macro-F1 drops ≤ 0.005.
- **Packaging** as for v3: private checkpoint, approved SHA-256, threshold in the environment.
- **v3 stays active** until the gates in evaluation protocol §8 pass **and** you approve the switch.

## 13. Tracks

- **T-main:** A + A-NC + B after per-image C removal. This is the thesis model; weights stay private.
- **T-licensed (E5, optional):** A and A-NC only. Only potholes, garbage (Bangladesh, once acquired) and `other` are feasible, so this is a 3-label sanity ablation, not a deployable model (`licensing_and_provenance.md` §4).
