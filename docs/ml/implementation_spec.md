# Implementation specification — BarangAI Watch CV v5

Version 2 (Phase 2), 25 October 2026. Audience: the developer implementing it.

Read these first, in order; where this spec and they disagree, they win, and you flag the conflict to the user:

1. `dataset_review_report.md` — data evidence.
2. `labeling_guidelines.md`
3. `licensing_and_provenance.md`
4. `architecture_decision.md`
5. `training_plan.md`
6. `evaluation_protocol.md`
7. `philippine_evaluation_protocol.md`

The architecture and data decisions are **final for v5**. Do not repeat the research. Implement, measure, report.

## 0. Ground rules (non-negotiable)

1. **No git commit, push or deploy** without the user's direct request (AGENTS.md). Ask for approval to create branch `ml-v5` before changing code.
2. **₱0.** Use free Kaggle, Colab or local hardware only. No paid Roboflow, Kaggle, Hugging Face or cloud features; no billing details. Roboflow is used only to *download* public versions with a free key.
3. **Never fabricate.** Every reported number comes from a file produced by a script in this repository. Write "pending" for anything not yet run.
4. **Never commit** images, `ml/data/**`, consent records, credentials or checkpoints (except the whitelisted `models/efficientnet_b0-v3.pt`). `.gitignore` already covers `ml/data/`, `kaggle.json`, `.kaggle/`, `.roboflow/` and `*.api_key`.
5. **Test sets (T1, T2, T3) decide nothing.** Their predictions are opened only in S8.
6. **v3 stays the demo model** until evaluation protocol §8 gates pass **and** the user approves.
7. **Credentials.** `KAGGLE_API_TOKEN` (a `KGAT_…` bearer token) and `ROBOFLOW_API_KEY` are **Windows user-scope environment variables**. Load them into a shell without printing them:
   ```bash
   export KAGGLE_API_TOKEN="$(powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('KAGGLE_API_TOKEN','User')" | tr -d '\r\n')"
   export ROBOFLOW_API_KEY="$(powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('ROBOFLOW_API_KEY','User')" | tr -d '\r\n')"
   ```
   Never echo, log or write their values. `ml/audit/fetch.py` drops `Authorization` on cross-host redirects.
8. **Windows quirk.** Git Bash's `mkdir`, `cp` and `curl` **cannot write inside `C:\Users\rapha\Documents`** on this machine (Controlled-Folder-Access-like behaviour). The project `.venv` Python and PowerShell can. Do filesystem writes through Python or PowerShell.
9. **Untrusted downloads.** Never execute files from `ml/data/raw/**` (e.g., the Rome dataset ships `.py` scripts). Run analysis with `python -I` when inputs come from raw data.
10. **Disk.** C: had **29 GB free** after Phase 2 (raw archives 26.8 GB plus extracted copies). Check free space before large steps. Deleting extracted copies of *excluded* sources requires user approval.

## 1. What already exists (reuse; do not rewrite)

| Path | State | Use |
|---|---|---|
| `ml/audit/fetch.py` | Tested in practice | Kaggle / Roboflow / Mendeley / URL download with resume, length and zip checks, FETCH.json |
| `ml/audit/inventory.py` | Tested in practice | Per-image CSV: hashes, size, EXIF/GPS, `black_frac`, YOLO labels, stems |
| `ml/audit/dedup.py` | Unit-tested (`ml/audit/test_audit.py`) | Union-find groups; overlap report; vectorised (190k images in about 1 min) |
| `ml/audit/embed.py` | Used for signs | Embedding near-duplicate pairs (MobileNetV3-Large ImageNet; needs `TORCH_HOME`) |
| `ml/audit/sheets.py` | Used | Contact sheets plus review CSVs (`grid`, `pairs`, `stems`) |
| `ml/audit/pools.py` | Used | **Source→label rules of record** (`rule()`), rights tiers, `candidates_v5.csv`, `pools_summary.json`, `source_registry.csv` |
| `ml/data/raw/<source>/` | 31 sources downloaded (Mendeley Bangladesh incomplete) | Original archives plus `extracted/` |
| `ml/data/inventory/` | Inventories, `dedup_all/`, `embed_signs/`, `candidates_v5.csv` | Inputs to S2–S4 |
| `docs/ml/inventory/*.{csv,json}` | Committed-candidate summaries | Evidence for docs |
| `ml/barangai_ml/data.py`, `cli.py` | v4 pipeline | Extend (S5, S6) |
| `apps/api/barangai/inference.py` | v3 serving | Extend (S9) |

## 2. Target file structure

```
ml/
  audit/                      (exists) + candidates mode in sheets.py, review.py (NEW)
  barangai_ml/
    data.py                   EXT  LABELS, APP_CATEGORIES, optional manifest columns, group_id union, source-balance check
    build.py                  NEW  candidates + review ledger -> cache + manifest_v5.csv (+ probes manifests)
    models.py                 NEW  build_model / embed / param_groups (TorchVision + timm)
    augment.py                NEW  training transform (training_plan §5)
    calibration.py            NEW  temperature, ECE/NLL/Brier, threshold rule, risk-coverage
    evaluate.py               NEW  metrics, group bootstrap, Wilson, McNemar, robustness slices, reports
    bench.py                  NEW  end-to-end CPU latency / RSS / cold load
    cli.py                    EXT  build, prepare, train, select, calibrate, evaluate, bench
  notebooks/kaggle-v5.ipynb   NEW
  tests/                      EXT  + test_build, test_models, test_augment, test_calibration, test_evaluate, test_labels
  requirements.txt            EXT  + timm>=1.0,<2
apps/api/barangai/inference.py   EXT  (S9)
apps/api/tests/test_inference.py EXT
docs/ml/results_v5.md            NEW (S11)
```

## 3. Data contracts

### 3.1 `candidates_v5.csv` (exists; produced by `pools.py`)

Columns: `source, relpath, sha256, group_id, group_sources, proposed_label, label_reason, needs_review, eval_only, rights_tier, width, height, black_frac, stem, supplied_split`.

### 3.2 Review ledger: `ml/data/review/ledger.csv` (append-only)

Columns: `source, relpath, group_id, decision, label, secondary_categories, view, reviewer, reviewed_utc, guide_version, sheet`.

- `decision` uses the codes in labeling guide §5.
- The latest row per `(source, relpath)` wins. Earlier rows are never deleted.

### 3.3 `manifest_v5.csv` (produced by `build`; consumed by `prepare` and `train`)

**Required columns** are the existing `ml/barangai_ml/data.py` `FIELDS`, unchanged:

| Column | Value |
|---|---|
| `image_path` | Cache path relative to `ml/data/cache` |
| `category` | One of `LABELS` (training names) |
| `incident_id` | `group_id` |
| `source_url` | Unique per image: `kaggle://<owner>/<slug>/<relpath>`, `roboflow://<ws>/<project>/<version>/<relpath>`, `mendeley://<id>/<v>/<relpath>`, `zenodo://<record>/<relpath>` |
| `creator` | Dataset owner as listed |
| `license` | Declared licence string |
| `attribution` | From `licensing_and_provenance.md` §3 |
| `location_id` | `unknown:<source>` unless documented (e.g., `IT:Rome` from the paper) |
| `photographer_id` | `unknown:<source>` |
| `sha256` | Cache file |

**Optional columns:** `source`, `group_id`, `orig_relpath`, `orig_sha256`, `rights_tier`, `review_decision`, `view`, `secondary_categories`, `crop_xyxy`, `sibling_count`, `black_frac`, `label_reason`.

## 4. Tasks

### S0 — Setup and guardrails

- **Do:**
  - Ask for branch approval.
  - Add `timm>=1.0,<2` to `ml/requirements.txt` and install it in `.venv`.
  - Run all existing tests.
- **Commands** (repo root):
  ```bash
  .venv/Scripts/python.exe -m pip install -r ml/requirements.txt
  .venv/Scripts/python.exe -m pytest ml/audit -q -p no:cacheprovider
  cd ml && ../.venv/Scripts/python.exe -m pytest tests -q --basetemp=.pytest_tmp && cd ..
  cd apps/api && ../../.venv/Scripts/python.exe -m pytest -q && cd ../..
  ```
- **AC:** all pass; `git status` shows only `ml/requirements.txt` changed.

### S1 — Acquisition completeness

1. **On a new machine, re-fetch** each source in `docs/ml/inventory/source_registry.csv` with `ml/audit/fetch.py`. Verify that `archive_sha256` matches. Roboflow version numbers and formats are in `dataset_review_report.md` §2 and the `FETCH.json` files.
2. **Finish the Mendeley Bangladesh set** (tier A-NC). It is resumable; already-downloaded files are skipped only if you add a skip-existing check. Add one: skip a file whose local SHA-256 equals Mendeley's `sha256_hash`.
   ```bash
   .venv/Scripts/python.exe ml/audit/fetch.py mendeley rkh7nz2rcp 1 md_illegal_dumping_bd --folders Real
   ```
3. **Optional, only with user approval:**
   - FloodDET (`fetch.py mendeley px48m7vwvf 1 md_flooddet`, 6.2 GB);
   - TrafficSigns-Raw (`dataset_discovery.md` §5).
- **AC:** every used source has `FETCH.json`; Mendeley Bangladesh has 804 verified originals, or its shortfall is documented.

### S2 — Inventory, embeddings and dedup for all pools

1. Run `inventory.py` for any new source.
2. Run `embed.py` per target pool at threshold **0.90**. Build selections from `candidates_v5.csv` with one image per group: `garbage_accumulation`, `fallen_trees`, `potholes`, `flooding`, and an `other` sample of at most 5,000.
3. **Validate the threshold** for each new pool. Make `sheets.py pairs` sheets for the bands 0.90–0.93 / 0.93–0.96 and record same-scene precision in `ml/data/review/embed_threshold.csv`.
   - If precision in 0.90–0.93 is below 0.8 for a pool, raise its threshold to the lowest band with precision ≥ 0.8.
4. Re-run `dedup.py` with all `--extra-pairs`, then `pools.py`.
- **AC:**
  - `pools_summary.json` regenerated;
  - threshold evidence saved;
  - `test_audit.py` passes.
- **Note:** exclude `sel_*.csv` and `candidates*.csv` when globbing inventories.

### S3 — Review tooling and human review

**Tool tasks:**

- **(a)** Add `candidates` mode to `sheets.py`.
  - Filter `candidates_v5.csv` by `--label`, `--source` and `--needs-review`.
  - Pick **one representative per group** using the training plan §1.3 order. Compute HSV saturation on the fly.
  - Write 10×10 sheets (100 tiles) and a CSV with ledger columns pre-filled except `decision`.
  - Seeded and resumable: skip groups already in the ledger.
- **(b)** Add `ml/audit/review.py`.
  - Validate filled CSVs (allowed codes; `label` required for `relabel`).
  - Append them to `ledger.csv`.
  - Print per-label accept/reject counts and **Wilson 95% intervals** of the reject rate per source × label.
  - Flag pools needing full review (labeling guide §5.2).
- **(c)** Add `--double` sampling, which writes a 10% second-review sheet set, and compute **Cohen's κ** per label from the ledger.

**Human work** (the user, or reviewers the user appoints): review every target-label group (about 18k representatives [E]) plus 200-per-source samples of `other`.
- Estimate: about 180–220 sheets of 100 tiles, roughly 8–14 reviewer-hours [E].
- Run the review label by label, starting with `damaged_signage` and `garbage_accumulation`, which are the noisiest.

- **AC:**
  - the ledger covers every group admitted by `build`;
  - κ ≥ 0.6 per label (otherwise revise the guide and re-review);
  - review statistics are saved to `ml/data/review/review_stats.json`.
- **Tests:** `review.py` rejects an invalid code; the ledger keeps both rows when a decision is changed; κ matches a hand-computed example.

### S4 — Build (`ml/barangai_ml/build.py`, `cli build`)

- **Inputs:** `candidates_v5.csv`, `ledger.csv`, `dedup_all/groups.csv`, and the inventory CSVs (for box coordinates read from the label files).
- **Steps** (training plan §1):
  1. Keep accepted or relabelled rows with tier A, A-NC or B.
  2. Drop per-image C decisions.
  3. Choose one sibling per stem and collapse each group to one image per label.
  4. Make box-guided crops when `max_box_area < 0.05`.
  5. Cache images (sanitise, ≤ 640 px, JPEG q85, which strips metadata).
  6. Apply caps (training plan §4) with deterministic order (sort by SHA-256).
  7. Write `manifest_v5.csv`, `probes_t2a.csv`, `probes_t2b.csv` and `build_report.json`. The report reconciles counts: every candidate is either kept or dropped with a reason.
- **AC:**
  - Identical inputs give byte-identical manifests.
  - Cached files have no EXIF.
  - `load_manifest` validates all rows.
  - `build_report.json` totals reconcile.
- **Tests:** synthetic fixtures for sibling choice, crop geometry (clipping, the 3× rule, minimum size), cap determinism, EXIF removal, and probe exclusion.

### S5 — Labels, split and freeze (`data.py`, `cli prepare`)

1. **`data.py`:**
   - Add `LABELS` (6, training names) and `APP_CATEGORIES`.
   - `load_manifest` accepts `category ∈ LABELS` and reads the optional columns. Extend `Record` with defaults so positional construction still works.
   - `split_records` also unions by `group_id`.
   - A helper `labels_present()` keeps 5-label datasets valid (needed by E3 and by the old v4 manifests).
2. **Source-balance check** (training plan §3): if a label with at least 2 sources has fewer than 2 sources in `val` or `test`, redraw with seed+1 (up to 20 attempts) and record the final seed.
3. **Leakage assertion:** using `near_pairs.csv`, all embedding pairs and session groups, fail if any relation crosses `train` and `{val, test}`, or touches a probe or PH image.
4. **Freeze:** write `split.csv`, print its SHA-256, and record it in `evaluation_protocol.md` §10.
- **AC:**
  - The old v4 package still validates and splits (regression).
  - An injected cross-split pair makes `prepare` exit non-zero.
  - The SHA-256 is recorded.
- **Tests:** label and optional-column handling; group union; source-balance redraw; leakage assertion.

### S6 — Model, augmentation and training code

Carried over from v1 T6, unchanged in substance:

- **`models.py`:**
  - `build_model(name, num_labels, pretrained)` for `efficientnet_b0`, `mobilenet_v3_large` (TorchVision) and `mobilenetv3_small_100.lamb_in1k`, `resnet18.a1_in1k` (timm).
  - `embed()` returns `(logits, pooled)`. Use `features/avgpool/classifier` for TorchVision and `forward_features/forward_head(pre_logits=True)` for timm.
  - `param_groups()` applies no weight decay to norm or bias parameters.
- **`augment.py`:** exactly training plan §5.
- **`train` CLI:**
  - Two-stage schedule, warm-up + cosine, AMP on CUDA, deterministic loaders.
  - `best.pt` / `last.pt` / `history.jsonl` / `environment.json`, with the checkpoint metadata of training plan §9 (incl. `labels`, `app_categories`, `track`).
  - **Remove the automatic test evaluation from `train`.** It exports only validation predictions. Note this behaviour change in `ml/README.md`.
- **AC:**
  - A CPU smoke run trains all 4 architectures (`pretrained=False`, 60 synthetic images, 2+2 epochs).
  - `--resume` reproduces the next epoch's loss within 1e-6 on CPU.
  - No test file is opened during `train`, checked by a test whose test rows point to missing files.

### S7 — Kaggle notebook and experiments E1–E5

- **Notebook** `ml/notebooks/kaggle-v5.ipynb`:
  - Attach the **private** Kaggle dataset `barangai-v5-cache` (`cache/`, `manifest_v5.csv`, `split.csv`, the probe manifests) and the code.
  - Verify the split SHA-256.
  - Run the experiments; zip the outputs.
  - Contains no secrets.
- **Upload** the cache as a **private** Kaggle dataset, built locally after review; about 2–3 GB [E].
- **Run order** and the selection rule follow training plan §7–8. `select` reads validation predictions only.
- **Budget guard:** print estimated GPU-hours before each experiment.
- **Session hygiene:** the user stops each Kaggle session and confirms that GPU is off.
- **AC:** every run has `history.jsonl`, `best.pt`, `val_predictions.csv` and `results.json`; `selection.json` documents the rule's inputs and output.

### S8 — Calibration and evaluation (one-time test scoring)

Carried over from v1 T8, plus the robustness slices of evaluation protocol §4.6:

- `calibrate` fits T and τ on V. When PH-dev has at least 15 groups per label, also fit on PH-dev. Write `best-calibrated.pt`; the original checkpoint stays unmodified.
- `evaluate` runs once each on T1, T2a, T2b, PH-test, and the v3 baseline in 5-label mode through the API's own `load_runtime`.
- **Evaluation preprocessing must equal API sanitisation byte-for-byte**, checked by a test. `--raw-input` is used only for the v3 regression check (24/26 on the v4 test split).
- **AC:**
  - Temperature recovers T = 2.0 within 2% on synthetic data.
  - McNemar(b = 10, c = 2) gives p = 0.0386.
  - Bootstrap results are seed-stable.
  - Macro-F1 equals sklearn's.

### S9 — API integration (`inference.py`)

- **(a)** Admit legacy 5-category checkpoints **or** checkpoints with `labels == LABELS` and `app_categories`. Any other order is rejected.
- **(b)** Apply `temperature` when present.
- **(c)** If argmax is `other`, return `category=None` (keep the confidence and embedding). Otherwise apply τ and **map the training label through `app_categories`**, so `garbage_accumulation` → `uncollected_garbage`.
- **(d)** Accept preprocessing `letterbox_224_v1`, plus `letterbox_288_v1` only if E4 selected it.
- **(e) Only if a timm backbone wins and the user approves adding `timm` to `deploy/requirements-render-vision.txt`:** add the timm loader and embedding path.
- **Tests:**
  - a 6-label checkpoint is admitted;
  - a shuffled label order is rejected;
  - `other` → `None` with the embedding retained;
  - the temperature effect;
  - the garbage label maps to `uncollected_garbage`;
  - legacy v3 still loads;
  - a runtime failure still falls back.
- **AC:** the full API suite passes. No change to roles, the report workflow or the status graph.

### S10 — Bench

`bench.py`: cold load, end-to-end latency (median and p95 over 50 runs after 10 warm-ups, 2 threads), peak RSS and checkpoint size.

- Run it locally and inside the locally built Render image.
- Measuring on the hosted service needs user approval.
- Compare the results with training plan §12 targets.

### S11 — Results write-up

Generate `docs/ml/results_v5.md` from output JSONs, using the template in evaluation protocol §9. It must include:

- the [IR] record (gate G9);
- the gate table;
- the limitations: single-source flooding, rights tiers, and Philippine sample size.

Every number cites its file.

## 5. Milestone order

```
S0 → S1 → S2 → S3 (human review) → S4 → S5 (freeze split) → S6 → S7 (Kaggle) → S8 → S9 → S10 → S11
                                        ↑
        Philippine collection runs in parallel (philippine_evaluation_protocol.md);
        PH-test must be frozen before S8 to be scored.
```

S6 can be developed in parallel with S3, using synthetic data.

## 6. Dependencies

| Package | Where | Why |
|---|---|---|
| torch 2.11 / torchvision 0.26 (CPU, local; Kaggle provides CUDA builds) | ML + API | existing |
| Pillow, numpy (≥ 2, for `np.bitwise_count`), scikit-learn, PyYAML | ML / audit | existing (installed) |
| timm ≥ 1.0, < 2 | ML only (API only via S9e) | user-supplied backbones |
| pytest | tests | existing |

**Do not add:** ultralytics (AGPL; detection not chosen), the roboflow SDK, imagehash, faiss, opencv, lightning or wandb. Add onnxruntime only if S10 fails its targets and the user approves.

## 7. Testing requirements

- Unit tests use synthetic images only. No network, no GPU, no real datasets, no pretrained-weight downloads.
- At every milestone, these must pass: `ml/audit`, `ml/tests` and the API suite (commands in S0).
- **Smoke checks:**
  - S6: 4-architecture CPU smoke run.
  - S8: v3 regression of 24/26 with `--raw-input`.

## 8. Expected outputs

| Step | Artefacts (git-ignored unless noted) | Committed (only on request) |
|---|---|---|
| S2 | Updated `dedup_all/`, embedding pairs, `embed_threshold.csv`, `candidates_v5.csv` | Refreshed `docs/ml/inventory/*` |
| S3 | Sheets, `ledger.csv`, `review_stats.json` | Review statistics table in `dataset_review_report.md` |
| S4–S5 | `cache/`, `manifest_v5.csv`, `split.csv` (+ SHA-256), probe manifests, `build_report.json` | SHA-256 in evaluation protocol §10 |
| S7 | Run folders, `selection.json`, `bench-local.json` | — |
| S8 | Calibration, evaluation outputs, error sheets | — |
| S9–S11 | Bench JSON | API code + tests; `results_v5.md` |

## 9. Human decisions and inputs needed

1. Branch approval and commit permission.
2. **[IR] Institutional review** of tier-B data use, and ethics approval for Philippine collection.
3. Reviewer time for S3 (about 8–14 h [E]) and the second reviewer for κ.
4. Target precision P\* (default 0.90).
5. Optional acquisitions: FloodDET, TrafficSigns-Raw.
6. Kaggle GPU session approvals.
7. Whether `timm` may enter the API image (S9e).
8. Replacing v3 after the gates.
9. Deleting extracted copies of excluded sources to free disk space.

## 10. Definition of done

- All tests pass.
- The review ledger and κ are recorded.
- `split.csv` was frozen before training.
- E1–E4 were run or skipped with a reason.
- T1/T2/T3 were scored once.
- `results_v5.md` reports metrics with CIs, calibration, selective prediction, robustness slices, the gates and the limitations, all traceable to files.
- The API admits the chosen checkpoint behind hash approval.
- v3 remains the default unless the user approved replacement.
- No paid service was used, and nothing was committed, pushed or deployed without request.
