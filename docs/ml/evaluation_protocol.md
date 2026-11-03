# Evaluation protocol — BarangAI Watch CV v5

Date: 25 October 2026. This protocol is **pre-registered**. It is fixed before any v5 model is trained. If it changes after results exist, the change must be logged with a reason in §10.

## 1. Principles

1. **Test sets decide nothing.** Model, architecture, hyperparameters, temperature, threshold and data choices use only `val` or PH-dev.
   - Each test set (T1, T2, T3) is scored **once** for the final candidate, plus the v3 baseline for comparison.
   - Re-scoring after changes counts as a new experiment and must be reported as such.
2. **The unit of independence is the group** (one incident or one deduplicated source scene), not the file. Confidence intervals are computed over groups.
3. **International results support only international claims.** Philippine claims come only from T3.
4. **Report every evaluated configuration**, including the ones that lost. No metric is reported unless a script in the repository produced it, with its output file.

## 2. Evaluation sets

| ID | Name | Composition | Labels | Purpose | Used for choices? |
|---|---|---|---|---|---|
| V | Internal validation | 15% of groups from `split.csv` | 6 labels | Model selection, HP, early stopping, *T*/τ (international) | **Yes** |
| T1 | Internal test | 15% of groups from `split.csv` | 6 labels | In-distribution generalisation to unseen scenes from the same sources | No |
| T2a | Flood cross-source probe | Roadway Flooding, **Mendeley original** (the Kaggle mirror is a 100% duplicate): 441 images = 438 groups [M] (never in training) | flooding only | Recall on an unseen flood source | No |
| T2b | Pothole cross-source probe | Rome phone subset, 102 images = **87 pothole groups + 14 crack/manhole-only groups** [M] (never in training) | potholes; crack/manhole-only → `other` | Phone-capture potholes, unseen device and location | No |
| PH-dev | Philippine development | Existing 15 reviewed PH photos + 30% of new PH groups | 6 labels + `secondary_categories` | PH calibration (*T*, τ), PH error analysis | **Yes** (calibration only) |
| T3 | **PH-test** | 70% of new PH groups, frozen before v5 training | 6 labels + `secondary_categories` | **The only basis for Philippine performance claims** | No |

Notes:

- **The existing 12-image diagnostic** (`artifacts/tree-reliability-2026-10-20/local-evaluation/`) was used once to decide whether to keep v3. It goes into PH-dev, not T3.
- **T2 probes contain one class each.** Only recall (and the `other` rate for T2b negatives) is defined; precision is not. Report them as recall probes, not as full classification benchmarks.

## 3. Constructing the evaluation sets

### 3.1 T1 and V

Produced by `prepare` (training plan §2–3). The leakage assertion must pass. Record:

- the `split.csv` SHA-256;
- per-split counts by label and by source;
- the number of groups per label.

### 3.2 T2 probes

- Run the full deduplication pipeline over the probes as well. Any probe image whose group touches training data is **removed from the probe**; the training copy is kept, because the probe set is the smaller of the two.
- Record how many were removed.

### 3.3 T3 / PH-dev: Philippine field collection

> **Superseded by `philippine_evaluation_protocol.md` (v1.0)**, which adds diversity quotas, safety and Data Privacy Act handling, a deduplication-before-freeze step and the sample-size table. The summary below is kept for reference; where the two differ, the dedicated protocol wins.

This needs human action (dataset_audit §6 item 4).

**Collection targets.** These are requirements, not expectations.

| Label | PH-test minimum independent incidents | PH-dev minimum |
|---|---|---|
| flooding | 40 | 15 |
| potholes | 40 | 15 |
| fallen_trees | 40 | 15 |
| uncollected_garbage | 40 | 15 |
| damaged_signage | 40 | 15 |
| other (healthy roads, intact signs, standing trees, clean streets, puddles, bins that are not overflowing) | 60 | 20 |

- At most **3 photos per incident**; the incident is the group.
- Spread across at least 3 barangays and at least 3 photographers where possible.
- Record weather and time of day.

**Why 40.** With 40 groups, a per-class recall of 0.80 has a Wilson 95% CI of about [0.65, 0.90]. Fewer groups make per-class claims uninformative.

**Protocol:**

1. **Consent and ethics.**
   - Follow the institution's research ethics process.
   - Collect only public-space hazards.
   - No identifiable people as the subject. If faces or plates are present, blur them before storage.
   - Photographer consent form with a participant code.
   - Consent records are kept separately and never committed.
2. **Capture.**
   - Use ordinary phones, held as a resident would. Record the phone model.
   - Do not stage hazards. Never create a hazard or put anyone at risk (no entering floodwater, no approaching downed lines).
3. **Storage.**
   - Run the same sanitisation as the API (EXIF transpose, JPEG q85; this removes GPS).
   - Store the location only at barangay level in `location_id`.
   - Keep the files in git-ignored `ml/data/ph/` or a private Kaggle dataset (AGENTS.md: outside public web roots, metadata stripped).
4. **Labelling.**
   - Two annotators label each image independently using the label policy (training plan §1.3). They also mark `secondary_categories` (other hazards visible) and `quality` (ok / blurry / dark / far).
   - Report **Cohen's κ** on the primary label.
   - Disagreements are adjudicated by a third person or by discussion, and the adjudicated label is final. Annotators must not see model predictions.
5. **Freezing.**
   - Split new groups 30/70 into PH-dev/T3 (seeded, stratified by label, grouped by incident).
   - Hash the T3 manifest and record the SHA-256 in this document (§10) **before** any v5 model is run on PH data.
6. **Fallback.** If T3 cannot be collected, the thesis reports **no Philippine performance**. PH-dev results may appear only as a labelled qualitative diagnostic.

## 4. Metrics

All metrics are computed by `ml/barangai_ml/evaluate.py` from per-image prediction CSVs. These extend the existing `export_predictions` format with `group_id`, `source`, `logit_*` and calibrated `probability_*` columns.

### 4.1 Classification (raw argmax, no abstention)

- Accuracy and balanced accuracy.
- **Macro-F1 over the 6 labels** (primary). Also report macro-F1 over the 5 targets only, for comparison with v3, which has no `other`.
- Per class: precision, recall, F1, support (images and groups).
- Confusion matrix: rows are the true label, columns the predicted label; both counts and row-normalised.
- Per-source and per-`aspect_distorted` breakdowns of recall (T1).

### 4.2 Calibration

- Top-label **ECE** (15 equal-width bins), **NLL** and **multiclass Brier score**, before and after temperature scaling.
- A reliability diagram (PNG) per evaluation set.

### 4.3 Selective prediction (the deployed behaviour)

At the frozen *T* and τ:

- **Coverage** = the fraction of images that receive a suggestion.
- **Accepted accuracy** = the accuracy among suggested images.
- **False-suggestion rate** = the fraction of `other`-truth images that receive a *target* suggestion. This is the metric that matters most for staff trust.
- **Per-class accepted precision.**
- **Risk–coverage curve** and **AURC** (area under the risk–coverage curve).

### 4.4 Multiple hazards (T3 and PH-dev)

On images with a non-empty `secondary_categories`:

- **top-1 any-hazard hit**: the prediction is in {primary} ∪ secondary;
- **top-2 any-hazard hit**;
- the number of such images.

These are reported descriptively; they decide nothing.

### 4.5 Operational

Measured with `ml/barangai_ml/bench.py`:

- model forward and end-to-end latency (decode + letterbox + forward), median and p95, at 2 threads;
- cold-load time;
- peak RSS increase;
- checkpoint size.

Measure on (a) the developer laptop and (b) the deployment host or container. Label each measurement with CPU model, threads and library versions.

### 4.6 Robustness slices

Reported, never used for selection. On T1, apply each corruption to the clean letterboxed image at a fixed seed:

- Gaussian blur, σ = 2;
- brightness × 0.5 (low light);
- JPEG quality 30;
- a 0.6-scale centre crop.

Report macro-F1 and per-class recall per slice, plus the change from clean. Also report T1 recall split by `source`, and by `view` where it is known (dashcam vs handheld).

## 5. Calibration and threshold procedure

1. Fit *T* on V logits by NLL.
2. Choose τ on calibrated V: the smallest τ ∈ {0.50, 0.55, …, 0.95} with accepted accuracy ≥ **target precision P\*** (default 0.90; human decision). If there is none, τ = 1.0.
3. When PH-dev has at least 15 groups per label, refit *T* and τ on PH-dev with the same rule. These become the **deployment** values. Report T3 at both the V-derived and the PH-dev-derived settings, and say which one is deployed.
4. Store *T* and τ in the checkpoint metadata and in the results JSON. The API threshold environment variable is set to the deployed τ.

## 6. Statistical procedure

- **CIs.** Group-level bootstrap with 2,000 resamples of groups with replacement, seed 0. Report percentile 95% CIs for macro-F1, accuracy, ECE and coverage. Per-class recall and precision use **Wilson 95%** intervals at the group level: a group counts as correct if its majority prediction is correct, or report image-level with that caveat.
- **Comparing models on the same set (v5 vs v3; backbone A vs B on V):**
  - paired group bootstrap of the macro-F1 difference;
  - **exact McNemar test** on paired per-image correctness, reported with its *p*-value and discordant counts.
  - v3 has no `other`, so v3-vs-v5 comparisons use target-label images only. A v5 `other` prediction counts as incorrect there.
- **Multiple comparisons.** E1–E4 are model-selection steps on V and are not hypothesis tests. Only the final v5-vs-v3 comparisons on T1 and T3 are reported as tests, two tests in total. Report them unadjusted, with that stated.
- **Agreement.** Cohen's κ for the T3 annotators.

## 7. Error analysis protocol

For T1 and T3:

1. Export the 50 highest-confidence errors and 50 random errors, as contact sheets plus a CSV.
2. One reviewer codes each error with a cause:
   - `label_error`
   - `ambiguous_policy`
   - `multi_hazard`
   - `small_or_far_object`
   - `occlusion`
   - `lighting_weather`
   - `domain_unfamiliar` (Philippine-specific appearance)
   - `aspect_distortion`
   - `model_confusion`
3. Report counts per cause and per targeted confusion pair (training plan §10).
4. Label errors found in T1 are **reported but not corrected** in this round. Correcting test labels after seeing predictions biases the test. Corrections go into the next dataset version.
5. Grad-CAM figures are illustrative only and must be captioned that way.

## 8. Acceptance gates for replacing the v3 demo model

These are product requirements fixed in advance, not predicted results. All must hold, **and** a human must approve.

| Gate | Requirement |
|---|---|
| G1 | Leakage assertion passed; split, manifest and checkpoint SHA-256 recorded |
| G2 | T1: v5 macro-F1 over the 5 targets > v3, and the paired bootstrap 95% CI of the difference excludes 0 |
| G3 | T1: every target-class recall ≥ 0.70 |
| G4 | T1: false-suggestion rate on `other` ≤ 0.10 at the deployed τ |
| G5 | V: post-calibration ECE ≤ 0.05 |
| G6 | T3 (if collected): no target class with recall 0; accepted accuracy at τ reported with CI; v5 not significantly worse than v3 (McNemar) |
| G7 | Deployment host: latency, RSS and cold-load targets met (training plan §12) |
| G8 | API test suites pass with the new checkpoint (spec S9) |
| G9 | Institutional-review record for tier-B data use exists (`licensing_and_provenance.md` §2) |

If a gate fails, keep v3 and report the failure. Do not tune against T1 or T3 to pass.

## 9. Reporting template (thesis results chapter)

For each evaluation set:

- sizes (images and groups per label);
- the table of §4.1 metrics with CIs;
- the confusion matrix;
- calibration metrics and a reliability diagram;
- the selective-prediction table at the deployed *T* and τ;
- the error-cause table.

Also report:

- the operational table, with hardware labels;
- every configuration from E1–E4 with validation scores (mean ± std over seeds);
- the exact commands, environment (`environment.json`) and all SHA-256 values;
- a limitations section covering source geography (dataset_audit §4.4), upstream-licence uncertainty, the T2 single-class design, T3 size and photographer independence, and calibration under domain shift.

**Claims that are not allowed:**

- "works in the Philippines" without T3;
- "detects multiple hazards";
- "real-time" without host measurements;
- any metric on the supplied leaking splits.

## 10. Pre-registration log

| Date | Item | Value |
|---|---|---|
| 2026-10-25 | Protocol version | 1.0 (this document) |
| 2026-10-25 | Protocol version | 1.1: measured probe sizes (T2a 438 groups, T2b 87 + 14), robustness slices §4.6, gate G9, Philippine protocol delegated to `philippine_evaluation_protocol.md` |
| 2026-10-25 | Garbage label name | `garbage_accumulation` (app category `uncollected_garbage`) |
| pending | `split.csv` SHA-256 (v5) | — |
| pending | T3 manifest SHA-256 | — |
| pending | Target precision P\* | default 0.90, awaiting human confirmation |
| pending | Label policy sign-off | training_plan §1.3 |
