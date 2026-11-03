# Dataset review report — BarangAI Watch CV v5 (Phase 2)

Date: 25 October 2026. This report covers the downloaded files themselves, not platform descriptions. It supersedes the metadata-only estimates in `dataset_audit.md` §1–4 wherever the two disagree.

Evidence tags:
- **[M]** measured by a script in `ml/audit/` (re-run commands in §9);
- **[V]** visual inspection of seeded contact-sheet samples by the auditor, where n is small, so rates are indicative only;
- **[E]** estimate derived from [M] and [V];
- **[R]** reported by the publisher.

Machine-readable outputs (committed, no images):
- `docs/ml/inventory/source_registry.csv`: per-source archive SHA-256, counts, dedup groups, rights tier, decision;
- `docs/ml/inventory/pools_summary.json`: per-class candidate groups and exclusion reasons;
- `docs/ml/inventory/overlap.json`: per-source pixel-level overlap.

Per-image inventories, the candidate manifest (`candidates_v5.csv`, 190,632 rows), dedup groups and contact sheets live in git-ignored `ml/data/`.

## 1. What was acquired

Thirty-one sources were downloaded with authenticated, free API calls. No paid operation was triggered: Roboflow exports of public Universe versions are free, and Kaggle, Mendeley and Zenodo downloads are free.

- Archives total **26.8 GB** [M]. Extracted copies take roughly the same again.
- Each archive's SHA-256 is in `ml/data/raw/<source>/FETCH.json` and copied into `source_registry.csv`.
- Originals are kept unchanged. Analysis reads only from the `extracted/` copies.

**Acquisition problems [M]:**
- The network dropped TLS handshakes to Google Cloud Storage repeatedly.
- Three archives arrived **silently truncated** (FloodIMG 5.5 of 11.96 GB; Piles of Garbage 67 of 385 MB; jayke o5qsa 6 of 61 MB). The fetcher now checks the expected byte length and zip integrity and resumes with HTTP Range, and all three were re-fetched completely.
- **Mendeley `rkh7nz2rcp` (Bangladesh illegal dumping) is incomplete.** The per-file endpoint delivered only 9 of 804 originals in about two hours, so the download was stopped deliberately. Resume command: §9.

## 2. Per-source measurements

All counts are [M]. "Groups" means deduplicated groups after exact + perceptual + Roboflow-stem + sign-embedding union (§3).

| Source | Images | Unique SHA-256 | Dedup groups | Median size | Annotation (validated) | Decision |
|---|---|---|---|---|---|---|
| Urban Issues (Kaggle) | 47,140 | 46,416 | 24,188 | 640² | YOLO per class folder; 0 decode failures | use, with review |
| Civic Issues (Roboflow) | 43,908 | 43,742 | 22,338 | 640² | YOLO 10 classes | **duplicate** (99.98% matched in Urban) |
| Road Issues Detection (Kaggle `dsv/12723453`) | 9,660 | 9,659 | 4,586 | 640² | folders only | mostly duplicate; garbage = Street View |
| FloodIMG (Kaggle) | 9,296 | **7,010** | 4,758 | 1280 px | none used | use, view-type review |
| Roadway Flooding (Mendeley original) | 441 | 440 | 438 | 512×384 | masks (ignored) | probe T2a |
| Roadway Flooding (Kaggle mirror) | 441 | 440 | 438 | 512×384 | masks | duplicate of Mendeley (100%) |
| Rome road damage (Kaggle; paper PMC13181123) | 2,009 | 2,004 | 1,783 | 640×360 | YOLO; IDs 0=pothole, 1=crack, 2=manhole (README and COCO agree); 2 invalid label files | use; phone subset = probe T2b |
| Normal-Pothole (Zenodo 13334878) | 5,000 | 4,954 | 4,250 | **256 px** | folders | normal roads → `other`; potholes add 0 new groups |
| aaa/fallentrees v3 (Roboflow) | 2,956 | 2,956 | 1,087 | 640² | 1 class | duplicate (99.8% in Urban) |
| erykvtymons v1 / v2 (Roboflow) | 360 / 410 | all | 351 / 400 | 640² | `fallen_tree` | use (v1 87% inside v2) |
| COS40007 Rubbish & Road Issues v3 (Roboflow) | 6,058 | 6,058 | 3,099 | 640² | 23 classes; 1,026 empty | use, with review and crops |
| Damaged Traffic Signs (Roboflow test-olzsn v3) | 1,371 | 1,371 | 1,254 | 304 px (crops) | `Broken` | use, with review |
| damaged signs Hind (Roboflow) | 2,409 | 2,409 | 451 | 640² | Damage/Healthy | 55% in Urban |
| Damaged Signs Multi-label, jayke (Roboflow) | 1,793 | 1,793 | 672 | 640² | Healthy/Damage/Wear/Vandalism/Bending | use; **source of** Road Issues signs |
| graff / jayke-o5qsa damaged signs | 671 / 1,656 | all | 648 / 623 | 640² | Healthy/Misc/Vandalism | duplicates of jayke (99.85% / 93%) |
| damaged signs, sign-detection-x0fra | 516 | 516 | 358 | 640² | bent/rust/graffiti/broken-sheet/not-damaged | use, with review |
| matyworkspace signs, det / cls | 4,347 / 7,825 | all | 2,430 / 3,994 | 640² | damaged/ok/occluded/dirty | use det; cls `ok` → `other` only |
| myspace garbage-dumping | 7,022 | 6,698 | 2,260 | **300 px** | `garbage` | use, with review |
| cloudcam garbage dumping | 636 | 636 | 521 | 640² | `garbage` | use, with review (not visually sampled) |
| garbage-overflowing / roadside-garbage | 377 / 120 | all | 143 / 116 | 640 / 512 | bin / garbage | use, with review (not visually sampled) |
| Piles of Garbage (Kaggle) | 393 | 389 | 371 | 1200 px | darknet 0 pile / 1 bin / 2 bottle | use class 0 |
| Manila Bay (Adamson University, Roboflow) | 6,696 | 6,694 | 2,504 | 1280² | 8 waste types | Philippine isolated litter → `other` |
| Road-Pothole-Audit-Philippines (Roboflow) | 204 | 204 | 181 | 416 px | pothole | **excluded** (dashcam; Philippine origin not visible) |
| TACO-style trash detection (Roboflow) | 2,290 | 2,290 | 1,017 | 640² | 64 item classes | excluded (item-level litter) |
| road-anomaly (Kaggle aryan57) | 20,169 | **14,922** | 9,678 | 640² | folders | **excluded** (licence unknown; baked rotations) |
| "dumping" (Roboflow raez) | 4,458 | 4,458 | **10** | 640² | empty/dumping/full | **excluded** (industrial truck CCTV) |

**No image failed to decode** in any source [M].

## 3. Duplicate and leakage findings

### 3.1 Method

Implemented in `ml/audit/inventory.py`, `ml/audit/dedup.py` and `ml/audit/embed.py`.

- **Exact duplicates:** identical file SHA-256.
- **Near-duplicates:** 64-bit dHash Hamming ≤ 6 **and** 64-bit pHash Hamming ≤ 12, also tested against the mirrored image.
  - Candidates come from an 8 × 8-bit multi-index, so no pair within Hamming 7 is missed. A unit test proves the multi-index result equals brute force.
  - **QA [V]:** all 17 inspected cross-source "near" pairs at dHash 4–6 were true duplicates. The first, dHash-only mirror rule produced 3 false matches out of 7 (`qa_pairs_cross_d4to6`), which is why mirrored matches now require pHash agreement as well.
- **Roboflow siblings:** same `(source, folder, stem)` in `<stem>_<ext>.rf.<hash>` names.
  - Of 24,510 multi-member stems, 4,432 are pixel-similar throughout and 9,091 have no pixel-similar pair, either from heavy augmentation or from generic-name collisions.
  - They are grouped conservatively: over-grouping can only reduce leakage.
- **Sign re-crops (embeddings):** MobileNetV3-Large ImageNet features, cosine ≥ 0.90, sign pool only (4,733 images, 4,983 pairs).
  - **QA [V]:** in the lowest band (0.90–0.93), 14 of 16 pairs were the same photo re-cropped, flipped or recoloured. One more was the same physical sign at different times, and one pair was two distinct stock photos of similar style.
- **Union-find over all relations:** 190,632 images → **59,932 groups** [M]. The largest groups are fixed-camera sequences: raez CCTV (3,756), five USGS webcam sequences in FloodIMG (212–451) and one COS40007 street sequence (220). Grouping these is correct.

### 3.2 Findings

All [M]:

1. **The supplied splits leak.** Roboflow stems crossing train/valid/test:
   - Urban Issues 2,156;
   - Civic Issues 1,930;
   - COS40007 462;
   - Hind 173;
   - myspace 121;
   - TACO 108;
   - aaa 8.

   **No supplied split is used.**
2. **Re-uploads and compilations:**
   - Civic Issues → Urban Issues 99.98%;
   - aaa/fallentrees → Urban 99.8%;
   - Road Issues → Urban 65.5%, and its 1,793 sign images are exactly jayke multi-label;
   - graff → jayke 99.85%; o5qsa → jayke 93%;
   - Hind → Urban 55%;
   - COS40007 → Urban 24%; myspace → Urban 25%;
   - Normal-Pothole → Urban 13% and Road Issues 14%;
   - Roadway Kaggle → Mendeley 100%.
3. **Augmentation inflation:**
   - Urban Issues 47,140 files → 24,188 groups;
   - Hind 2,409 → 451;
   - aaa 2,956 → 1,087;
   - garbage-overflowing 377 → 143;
   - raez 4,458 → 10.
4. **Duplicates inside one source:**
   - **FloodIMG: 2,286 byte-identical files**, and 60% of its images have a near-duplicate inside FloodIMG (reposts and webcam sequences);
   - road-anomaly: 5,247 byte-identical files;
   - Rome: 5 exact duplicates, and 19% of frames have a near-duplicate (adjacent dashcam frames).
5. **Cross-dataset label disagreement:** **1,297 deduplicated groups receive conflicting labels from different sources** (e.g., 424 pothole vs crack-only; 393 damaged sign vs healthy sign). They are routed to review and excluded from automatic pools (`pools_summary.json` → `cross_label_conflict_groups`).
6. **Annotation inconsistencies inside Urban Issues:** 208 Graffiti-folder images carry pothole class IDs, and 277 Electrical-pole images carry pothole or parking IDs. The pothole folder itself is consistent: 4,447 images with a pothole box, 2,470 crack-only, 338 both.
7. **Privacy-relevant metadata:** images with GPS EXIF:
   - Urban Issues 144;
   - Normal-Pothole 53;
   - FloodIMG 34;
   - Piles of Garbage 2.

   The training cache must strip all metadata (training plan §1.4).

## 4. Visual review findings by class

Seeded contact-sheet samples (`ml/data/review/cs_*.jpg`), generally 24–48 originals per source × label. Rates are [V] with small n: the 95% CI is roughly ±14 points at n = 48.

| Class | Source | Indicative accept rate | Main problems seen |
|---|---|---|---|
| garbage_accumulation | Urban Issues Garbage | **~45%** (22/48 piles; 19/48 single items; 7/48 irrelevant) | Isolated bottles and cups on plain backgrounds; alamy/dreamstime watermarks |
| | COS40007 rubbish | **~80%** (38/48) | A few distant or single-bag scenes. Real phone photos of dumped household waste: the best garbage source found |
| | myspace | ~70% (17/24) | 300 px; alamy watermarks; one distressing image |
| | Piles of Garbage (class 0) | ~60% | Sparse litter; bottle close-ups (classes 1 and 2 excluded) |
| | Road Issues "Littering" | **0%** | Google Street View captures, litter invisible → excluded (rights C) |
| | road-anomaly garbage | content good, but… | 90°/180° rotations, flips, cutouts baked in → excluded |
| damaged_signage | Urban DamagedRoadSigns | ~70–75% | Rendered "grunge" stock graphics; several intact signs; stock watermarks |
| | Damaged Traffic Signs | ~85% | Knocked-down and bent signs (good); alamy/getty watermarks; tiny crops |
| | Hind / maty | ~80–90% | Same scraped stock pool; snow on a sign labelled "damaged"; mirrored copies |
| | jayke multi-label | ~70% of damaged | "Wear" often cosmetic only; it has a genuine **Healthy** class |
| | COS40007 sign boxes | web crops OK; street scenes need crops | Wide Melbourne street frames where the bent sign is a few pixels wide |
| fallen_trees | Urban FallenTrees (includes aaa) | ~60–70% | Every original has 3 baked-augmented copies (cutouts, mosaics); forest-floor deadwood; a book cover; Chinese news watermarks |
| potholes | Urban Issues potholes | ~40% clear + ~35% recoverable with box crops | Many **Southeast Asian street frames** (relevant to PH) with small potholes; grayscale and rotation copies |
| | Rome | (not visually sampled; author-curated) | Dashcam through a windshield, 640×360 |
| | Normal-Pothole | potholes are duplicates; "Normal" is usable | 256 px textures; a stock watermark; cracks labelled pothole |
| flooding | FloodIMG | **~30–40%** street-level community flooding | European 2013 river floods; **USGS webcam frames showing dry culverts**; aerial views |
| other | Manila Bay (PH) | usable as negatives | Isolated shoreline litter, not accumulation |
| excluded | raez "dumping" | 0% | Industrial CCTV of trucks unloading cargo: a concept mismatch |
| excluded | Road-Pothole-Audit-Philippines | 0% for Philippine evaluation | Dashcam through a windshield; scenery not recognisably Philippine; one Street View frame |

## 5. Unique usable images per class

**Candidate groups** are [M]: deduplicated, mapped by `ml/audit/pools.py`, and cross-label conflicts removed. **Expected after review** is [E]: candidate groups × the indicative accept rates of §4, plus box-crop recovery, minus per-image tier-C removals (stock watermarks) estimated at 10–20% for the sign and garbage pools. These estimates must be replaced by actual review counts (spec S3).

| Class | Candidate groups [M] | By source [M] | Expected usable after review [E] |
|---|---|---|---|
| flooding | **4,502** | FloodIMG 4,502 (single source) | **1,300–1,800** |
| potholes | **1,924** | Urban 1,318; Rome 606 (A) | **1,100–1,500** (with box crops) |
| fallen_trees | **2,393** | Urban 2,041; eryk 352 | **1,400–1,700** |
| garbage_accumulation | **6,110** | Urban 2,559; myspace 2,004; COS 588; cloudcam 517; Piles 221; overflowing 111; roadside 110 | **2,800–3,500** |
| damaged_signage | **2,950** | maty 1,245; Damaged Traffic Signs 1,244; COS 332; x0fra 106; jayke 23 (other sign sets dedup into these) | **1,700–2,300** |
| other | **27,309** | Urban non-target 15,912; Normal-Pothole 3,721; Manila Bay (PH) 2,504; maty `ok` 1,848; COS 1,397; Rome crack/manhole 1,045; … | capped at 3,000–4,000 (≥ 5 sources) |
| Probes (evaluation only) | flooding 438, potholes 87 (+14 crack-only `other`) | Roadway (Mendeley), Rome phone | — |

**Damaged signage is no longer the bottleneck** (Phase 1 estimate: about 352 originals). The new sign sources add about 2,600 deduplicated candidates.

## 6. Remaining class imbalance and gaps

- **Expected ratio [E]:** largest target pool (garbage, about 3,000) to smallest (potholes, about 1,100–1,500) is roughly **2–3×**. This is moderate and handled by the training plan §4 (per-class cap and weighted loss).
- **Flooding comes from one source** (FloodIMG: US and Europe, rivers and webcams). This is now the **largest diversity risk**. Candidates to fix it: FloodDET (Mendeley, CC BY 4.0, 6.2 GB; includes DEEPFLOOD images plus non-flood negatives; it also re-annotates FloodIMG, so it overlaps) and Philippine flood photos. Neither was acquired in this phase.
- **Fallen trees come mostly from one compilation** (Urban Issues, largely Chinese social-media images) plus erykvtymons (Poland). Low geographic diversity.
- **Philippine data:** still only the 15 reviewed local photos from earlier work, plus Manila Bay isolated litter (`other`). **No Philippine source of potholes, fallen trees, damaged signs or flooding of usable size was found.** The local evaluation set must be collected (`philippine_evaluation_protocol.md`).
- **Southeast Asian relevance:**
  - Urban Issues potholes: Indonesian/Malaysian street frames.
  - Piles of Garbage, myspace and the Mendeley Bangladesh set (incomplete): South Asian streets.

  These are the closest available proxies to Philippine scenes.

## 7. Datasets excluded or restricted, with reasons

| Source | Status | Reason |
|---|---|---|
| Pluvial flood; naiyakhalid (both) | excluded (Phase 1) | Tabular data, no images |
| Ultralytics zelin-hu × 2 | excluded | Licence null; the v4 copy matches aaa (2,950 vs 2,956, same 164-image validation split), which itself is 99.8% inside Urban Issues. Not downloaded: the platform requires sign-in. |
| Civic Issues | duplicate | 99.98% pixel-matched in Urban Issues |
| aaa/fallentrees, graff, o5qsa, Roadway (Kaggle) | duplicates | §3.2 |
| Road Issues "Littering" | excluded, rights C | Google Street View captures; litter not visible |
| Road Issues "Mixed Issues" | excluded | No per-image label |
| raez "dumping" | excluded | Concept mismatch (industrial CCTV) |
| road-anomaly (aryan57) | excluded, rights C | No licence or provenance; baked 90°/180° rotations defeat leakage control |
| TACO-style trash | excluded | Item-level litter, not accumulation |
| Road-Pothole-Audit-Philippines | excluded | Dashcam; Philippine origin not visually supported; one Street View frame |
| maty `not_ok` crops | excluded | Mixes damaged, occluded and dirty |
| maty/COS "occluded", "dirty" | excluded | Environmental occlusion is not damage (labeling guide §3.5) |
| Stock-watermarked images inside any source | per-image tier C | Removed in human review |
| Mendeley Bangladesh dumping | restricted, incomplete | CC BY-NC 4.0 (noncommercial academic OK); acquisition incomplete |
| FloodDET, pLitterStreet, StreetView-Waste, FRED | not acquired | Size or bandwidth (6.2 GB / 13 GB), data agreements, or overlap; listed in `dataset_discovery.md` |

## 8. Implications for the plan (summary)

1. Keep single-label classification with `other` (`architecture_decision.md`).
2. Build the training set only from `ml/audit/pools.py` candidates **after human review**. Choose the least-augmented sibling per group, use box-guided crops for small targets, and remove watermarked or Street View images (training plan §1–2).
3. Split by `group_id` from `dedup_all/groups.csv`. Never use supplied splits. Keep probes and Philippine data out of `split.csv`.
4. Treat flooding diversity and Philippine-domain evaluation as the two main open risks.

## 9. Reproduce

```bash
# credentials as environment variables only (KAGGLE_API_TOKEN, ROBOFLOW_API_KEY); see implementation_spec.md S1
python ml/audit/fetch.py kaggle akinduhiman/urban-issues-dataset urban_issues          # ...one line per registry row
python ml/audit/fetch.py mendeley rkh7nz2rcp 1 md_illegal_dumping_bd --folders Real   # resumable; incomplete here
python -I ml/audit/inventory.py ml/data/raw/<source>                                   # per source
python ml/audit/embed.py ml/data/inventory/sel_signs.csv --out ml/data/inventory/embed_signs --threshold 0.90
python -I ml/audit/dedup.py ml/data/inventory/*.csv --extra-pairs ml/data/inventory/embed_signs/pairs.csv --out ml/data/inventory/dedup_all
python -I ml/audit/pools.py --inventory-dir ml/data/inventory --groups ml/data/inventory/dedup_all/groups.csv
python -I ml/audit/sheets.py grid --inventory ml/data/inventory/<source>.csv --one-per-stem --n 48 --name <sheet>
python -m pytest ml/audit -q
```

Notes:
- `embed.py` needs `TORCH_HOME` pointing to a cache holding the MobileNetV3-Large ImageNet weights. Here that was `artifacts/torch-cache`.
- The exact source list and versions are in `source_registry.csv`.
- Exclude `sel_*.csv` and `candidates*.csv` from the dedup inputs.
