# Dataset and pretrained-model audit — BarangAI Watch CV v5

Audit date: 25 October 2026. Auditor role: ML lead (planning only; no training was run).

> **Phase 2 status (25 October 2026, later the same day):** the datasets were downloaded with your credentials and inspected at pixel level. **Where this document's Phase 1 statements disagree with `dataset_review_report.md`, the review report wins.** Phase 1 assumptions resolved by measurement:
>
> - **Civic Issues ≈ Urban Issues — confirmed** (99.98% of Civic images pixel-matched).
> - **Ultralytics v4 ≈ aaa/fallentrees — consistent:** aaa itself is 99.8% inside Urban Issues. The Ultralytics copies were not downloadable without sign-in and stay excluded.
> - **erykvtymons v1 ≈ v2 — confirmed** (87%).
> - **Roboflow images are 640² — confirmed** for most exports. Exceptions: Damaged Traffic Signs crops (median 304 px), myspace (300 px), Normal-Pothole (256 px).
> - **FloodIMG contains aerial views, webcams and duplicates — confirmed:** 2,286 byte-identical files; USGS webcam frames of dry culverts.
> - **Roadway Flooding is low-resolution — confirmed:** 512×384.
> - **Urban Issues folders annotate only their own class — confirmed**, with 485 inconsistent class IDs.
> - **Urban Issues has only 352 sign originals — superseded:** new sources add about 2,600 deduplicated sign candidates.
>
> Also see `dataset_discovery.md`, `licensing_and_provenance.md` and `labeling_guidelines.md`. The credential limitation in §0 no longer applies: Kaggle bearer-token and Roboflow key authentication were validated without exposing the values.

## 0. How to read this document

Every statement is tagged:

- **[M] Measured**: obtained in this audit from real metadata, file listings, page data or local benchmarks. The method is given.
- **[R] Reported**: stated by the dataset owner, paper or card. Not independently verified.
- **[A] Assumption**: a reasoned inference that has to be verified before it is relied on.
- **[X] Missing**: information that could not be obtained.

### Access limits that shaped this audit

- **None of the user-listed datasets are in the workspace.** [M] A search of the repository and `artifacts/` found no copy of any listed source.
- **No Kaggle or Roboflow credentials are configured.** [M] There is no `~/.kaggle`, no `kaggle` CLI and no Roboflow key. Kaggle's file *download* endpoint returned `404 Data not found` without authentication.
- Kaggle's public metadata endpoints (`/api/v1/datasets/view/…` and the paged `/api/v1/datasets/list/…`) do work without authentication. I pulled **complete file listings** (every path and byte size) for every Kaggle source. All Kaggle counts below come from those listings.
- Roboflow Universe blocks scripted requests with a Cloudflare challenge. I read its pages in a real browser (Playwright). The Ultralytics Platform pages embed their dataset metadata as JSON, which I parsed.
- **Pixel-level checks have not been run yet.** This covers dimensions, corruption, EXIF, perceptual duplicates and visual label quality. They need authenticated downloads, so they are milestone M1 in `implementation_spec.md`. Where this document says "dimensions unknown", the implementation must measure them.

## 1. Executive summary

| # | Source (as supplied) | Usable for BarangAI? | Classes it can supply | Annotation | Key risk |
|---|---|---|---|---|---|
| 1 | Kaggle `hhrclemson/flooding-image-dataset` (FloodIMG) | **Yes, after filtering** | flooding | image-level (all flood) + 25 JSON polygon files | Images were scraped from Twitter, USGS and DOT. Mixed aerial and ground views. No negatives. |
| 2 | Kaggle `oladapokayodeabiodun/pluvial-flood-dataset` | **No** | none | — | [M] One `.xlsx` table; there are no images |
| 3 | Kaggle `saurabhshahane/roadway-flooding-image-dataset` | **Yes (small)** | flooding | 441 images + 441 PNG masks | Low-resolution files; provenance of the underlying images is unverified |
| 4 | Kaggle user `naiyakhalid` | **No** | none | — | [M] Only tabular data (flood-prediction CSV, Tesla stocks) |
| 5 | Kaggle `akinduhiman/urban-issues-dataset` | **Yes: the main multi-class source** | potholes, fallen trees, garbage, damaged signs, plus 5 non-target civic classes | YOLO boxes, one folder per class | Heavy augmentation duplication; the supplied splits leak; a CC0 label on a Roboflow compilation |
| 6 | Ultralytics `zelin-hu/fallen-trees-improve-1-1185v1iyolov11` | **No (license null)** | fallen trees | YOLO boxes, class `daoshu` | No license; looks derived from Roboflow sources |
| 7 | Roboflow `aaa-yryty/fallentrees` v3 | **Yes** | fallen trees | detection boxes | CC BY 4.0; overlaps with #8 and probably with #5 |
| 8 | Ultralytics `zelin-hu/fallen-treesv4iyolov11` | **No (license null); duplicate of #7** | fallen trees | YOLO, class `daoshu` | 2,950 images with the same validation count (164) as #7 |
| 9 | Roboflow `erykvtymons/fallen-trees-detection-v2-bigger-boxes` v8 | **Yes (small)** | fallen trees | detection boxes | Same author as #10; probably the same images with different boxes |
| 10 | Roboflow `erykvtymons/fallen-trees-detection-v1` v7 | **Yes, deduplicated against #9** | fallen trees | detection boxes | As above |
| 11 | PMC13181123 (Rome Road Damage: potholes, cracks, manholes) | **Yes** | potholes; cracks and manholes as hard negatives | YOLO boxes (axis-aligned) | 95% are windshield GoPro frames; Italy; license differs between paper and Kaggle card |
| 12 | Roboflow `trash-dataset-for-oriented-bounded-box/trash-detection-1fjjc` | **Mostly no** | (litter items) | 64-class TACO item boxes | Item-level litter, not uncollected garbage; 3× augmented |
| 13 | Roboflow `models-omkjo/civic-issues-qj5pb` ("Complete") | **Do not combine with #5** | same 10 classes as #5 | detection | [A] Re-upload of #5; using both would duplicate data |
| M1 | HF `google/vit-base-patch16-224` | Compatible, but **rejected for deployment** | — | — | 86.6 M parameters; measured 448 ms on CPU |
| M2 | HF `timm/resnet18.a1_in1k` | **Candidate (secondary)** | — | — | Needs `timm` |
| M3 | HF `timm/mobilenetv3_small_100.lamb_in1k` | **Candidate (secondary)** | — | — | Needs `timm` |

**Gaps that block a strong thesis claim:**

1. **Philippine data is tiny.** [M] Across the existing artifacts there are 15 reviewed Philippine photographs. The reserved 12-image diagnostic is a subset of those 15. None of the user-supplied datasets is Philippine.
2. **Damaged signage has the least independent data.** [M] Urban Issues has 2,349 sign images but only 352 unique Roboflow source stems behind them.
3. **No supplied source labels "uncollected garbage" as distinct from litter.**
4. **No supplied source has multi-label ground truth.**

## 2. Method

1. **Kaggle metadata.** `GET https://www.kaggle.com/api/v1/datasets/view/<owner>/<slug>` returned title, license, size, description and tags. `GET …/datasets/list/<owner>/<slug>?pageSize=200` was paged until there was no next-page token, which gave the complete file listing for every source (e.g., Urban Issues: 94,285 files over 472 pages).
2. **Roboflow augmentation siblings.** Roboflow export names follow `<stem>_<ext>.rf.<32-hex>.<ext>`. I grouped files by `(class folder, stem)` and counted:
   - images per split;
   - unique stems per split;
   - stems that occur in more than one split.

   This is a **filename proxy** for "same source photo". It can miss re-encoded duplicates. It can also over-merge generic stems such as `000100`. Milestone M1 confirms it with perceptual hashing.
3. **Roboflow and Ultralytics.** I read the page text: license, image count, versions, split, preprocessing and augmentation. Ultralytics pages embed `imageCount`, `annotationCount`, `classNames`, `splits` and `license` as JSON.
4. **Pothole paper.** I read the full text of PMC13181123 (Scientific Reports) and listed its Kaggle mirror.
5. **Models.** I used the HF model API (`/api/models/<id>?blobs=true`) and the model cards. I benchmarked CPU latency locally (§5).

The raw responses were kept in a scratch directory outside the repository and are not committed. Milestone M1 re-implements these probes as `ml/barangai_ml/audit.py`, so every number here can be regenerated.

## 3. Per-dataset findings

### 3.1 FloodIMG — `hhrclemson/flooding-image-dataset`

- **Size.** [M] 9,321 files, 12.11 GB:
  - `Flood Images/`: 6,403 `.jpg`, 2,892 `.png` and 1 `.jpeg`, i.e., **9,296 images**;
  - `Annotation/`: **25 JSON files** (`flood_6.json` … `flood_121.json`, 57–171 KB each).
- **File sizes.** [M] Median 1.51 MB, minimum 6.8 KB, maximum 11.7 MB. The files are high resolution but very heterogeneous.
- **Naming.** [M] `flood_<n>` (9,215 files) and `Flood_<n>` (81). Mixed case may hide repeated numbers.
- **License.** [M] Kaggle card: "CC0: Public Domain"; tag "united states".
- **Provenance.** [R] Karanjit, Pally and Samadi, *Data in Brief* 2023, doi:10.1016/j.dib.2023.109164. The images were collected through APIs from **Twitter and US federal agencies (USGS, DOT)**. The paper reports more than 9,200 images, about 7,400 used for training and 1,800 for testing, with bounding boxes and polygons ([PMC10164831](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10164831/)).
- **Rights.** [A] US federal works are generally public domain. Twitter images are third-party copyrighted works, so the uploader's CC0 label does not clear them.
  - **Decision:** academic training only, no redistribution, model weights stay private. This is the same policy the repository already uses.
- **Annotation support.** [M] Every image is a flood positive, so the source supports image-level classification for the positive class only. The 25 JSON files cover a small subset of images: their size suggests per-image polygon files. [X] The JSON schema has not been inspected yet. Segmentation is not needed for this plan.
- **Expected problems.** [A] This is based on the collection method; it is not yet visually confirmed:
  - aerial and drone views;
  - screenshots of tweets and news graphics, with text overlays and watermarks;
  - people and faces;
  - repeated reposts of the same photo, which are near-duplicates;
  - river and landscape floods that are not barangay street incidents.
- **Geography.** [M][R] United States. The domain shift to Philippine streets is large: road furniture, housing, vegetation and water colour all differ.
- **Plan.** Deduplicate, then filter with contact sheets for view type (`ground` / `elevated` / `aerial` / `graphic`). Keep `ground` and close `elevated` street-level views. Then cap the kept set (see training plan §2.4) so flooding does not dominate.

### 3.2 Pluvial flood — `oladapokayodeabiodun/pluvial-flood-dataset`

- **Contents.** [M] Exactly one file: `Pluvial_Flood_Dataset.xlsx` (11.8 MB).
- **Description.** [R] USGS and Copernicus climate data for Ibadan, Nigeria, used for fuzzy flood-susceptibility modelling.
- **License.** [M] "Database: Open Database, Contents: © Original Authors".
- **Verdict: unsuitable.** It has no images, so it cannot train or evaluate an image model. Excluded.

### 3.3 Roadway Flooding — `saurabhshahane/roadway-flooding-image-dataset`

- **Contents.** [M] 882 files, 16.9 MB: `Dataset/images/image_<n>.jpg` × 441 and `Dataset/labels/*.png` × 441 (masks).
- **File sizes.** [M] Median JPEG size is **37 KB**. [A] That points to low resolution, perhaps 300–600 px on the long side. M1 must measure dimensions.
- **License and origin.** [M] CC BY 4.0. [R] Mirror of Sazara, Cetin and Iftekharuddin (2019), Mendeley Data doi:10.17632/t395bwcvbw.1. The related paper (arXiv:1909.00125) describes hand-labelled roadway flood images from urban, suburban and natural settings. [X] How the underlying images were collected is not stated in the material I could access.
- **Annotation support.** [M] Segmentation masks (water region) and image-level flood positives.
- **Plan.** Use it as a small, roadway-specific flood source. Because it is small and homogeneous, hold it out as a **cross-source flood recall probe** (evaluation protocol §3.2) rather than mixing it into training. That gives an honest "unseen source" measurement at little cost.

### 3.4 Kaggle user `naiyakhalid`

- **Contents.** [M] Two public datasets:
  - `flood-prediction-dataset`: `flood.csv`, `train.csv`, `test.csv` and `sample_submission.csv`; 50,000 rows × 21 numeric columns; CC0;
  - `tesla-stocks-data`: CC BY-NC 4.0.
- **Verdict: unsuitable.** Neither dataset contains images.

### 3.5 Urban Issues — `akinduhiman/urban-issues-dataset` (main multi-class source)

- **Contents.** [M] 94,285 files, 4.91 GB, Kaggle version 19 (updated 2025-08-10), declared "CC0: Public Domain". There are **47,140 images** (44,392 `.jpg` and 2,748 `.png`), YOLO `.txt` labels, 3 `.yaml` files and 4 Roboflow README files.
- **Label scheme.** [R] The card lists 10 labels: cracks 0, potholes 1, illegal parking 2, broken road sign 3, fallen trees 4, garbage 5, graffiti 6, dead animal 7, damaged concrete 8, electric wires/poles 9.
- **Layout.** [M] One folder per class, each a separate Roboflow export with `train/valid/test`. Only two folders keep `data.yaml` and README files: `DamagedRoadSigns` and `IllegalParking`.

**Per-class counts.** [M] From the full listing and stem analysis:

| Folder | train img / stems | valid img / stems | test img / stems | Unique stems | Stems in >1 split |
|---|---|---|---|---|---|
| Potholes and RoadCracks | 5,667 / 3,035 | 1,219 / 1,202 | 369 / 338 | 4,265 | **270** |
| FallenTrees | 8,500 / 2,304 | 982 / 793 | 1,632 / 1,012 | 2,470 | **1,220** |
| Garbage | 3,133 / 2,609 | 660 / 627 | 337 / 331 | 3,332 | **225** |
| DamagedRoadSigns | 2,267 / 331 | 43 / 40 | 39 / 39 | **352** | **58** |
| Graffitti | 1,704 / 1,564 | 214 / 213 | 210 / 206 | 1,919 | 58 |
| Damaged concrete structures | 9,315 / 8,699 | 1,228 / 1,228 | 1,222 / 1,221 | 11,148 | 0 |
| DamagedElectricalPoles | 7,271 / 1,679 | 513 / 477 | 328 / 320 | 2,147 | 325 |
| DeadAnimalsPollution | 172 / 27 | 32 / 8 | 16 / 4 | 39 | 0 |
| IllegalParking | 57 / 19 | 3 / 3 | 7 / 3 | 29 | 0 |

**Findings:**

- **Augmentation inflation.** [M] FallenTrees has 11,114 files but about 2,470 source stems. DamagedRoadSigns has 2,349 files but 352 stems, about 6.7× inflation. **Counting files as independent images would be a serious methodological error.**
- **The supplied splits leak.** [M] Many stems appear in two or more splits; in FallenTrees, nearly half of all stems do. **The supplied splits must not be used.** Every result reported on them would be optimistic.
- **Missing labels.** [M] Garbage `train` has 3,133 images but 3,131 label files.
- **Mixed folder.** [R] "Potholes and RoadCracks" mixes class 1 (pothole) and class 0 (crack). [X] The per-file class-ID distribution needs label files, so it is M1 work. An image counts as a pothole positive only if it holds at least one class-1 box. Crack-only images become `other` hard negatives (label policy, training plan §1.3).
- **Missing annotations for other hazards.** [A] Each folder was annotated for its own class only. A fallen-tree image that also shows garbage is probably labelled only as a tree. This rules out supervised multi-label training from this source (architecture decision §3).
- **Preprocessing.** [A] Roboflow exports are usually resized to 640×640, often stretched, so aspect ratios may be distorted. [X] To be measured in M1.
- **Rights.** [M] The uploader declares CC0. [A] This is a compilation of Roboflow Universe projects whose own licenses vary, so CC0 is unlikely to have been the compiler's to grant for every image. **Decision:** treat it as `uploader_declared`: academic use, no redistribution, private weights. Record the risk.
- **Geography.** [X] Unknown. [A] Probably mixed, with a South-Asian share based on typical Roboflow civic-issue projects. Not Philippine unless proven.
- **Most useful part.** [M] About 15,000 source stems across the five **non-target** classes (graffiti, concrete, poles, dead animals, parking) plus the crack-only pothole-folder images. These are realistic civic-scene **hard negatives** for an explicit `other` output (architecture decision §4).

### 3.6 and 3.8 Ultralytics `zelin-hu` fallen-tree sets

- **`fallen-trees-improve-1-1185v1iyolov11`.** [M] 774 images; train 674 / val 100 / test 0; 1,043 annotations; one class, `"daoshu"`; task `detect`; **`"license": null`**. Sample entries are 640×640, named `ia_1000xxxxx_png.rf.<hash>`.
- **`fallen-treesv4iyolov11`.** [M] 2,950 images; train 2,786 / val 164 / test 0; 4,342 annotations; class `"daoshu"`; **license null**; names `ia_4000xxxxx_png.rf.<hash>`.
- **Class name.** [A] `daoshu` is pinyin for 倒树, "fallen tree".
- **Duplication.** [M] The v4 set's 2,950 images and 164-image validation split almost match Roboflow `aaa-yryty/fallentrees` v3 (2,956 images, 164 validation, §3.7). [A] It is a re-export of that set.
- **Verdict.** Without a license, default copyright applies. **Exclude both sets.** Where they duplicate §3.7, the CC BY original covers them anyway. If the user gets written permission from the owner, the 774-image set could be reconsidered, after deduplication.

### 3.7 Roboflow `aaa-yryty/fallentrees` v3

- **Contents.** [M] Object detection, **CC BY 4.0**. 2,956 images; train 2,784 (94%) / valid 164 (6%) / test 8. Auto-orient applied; "fit within 640×640"; **no augmentation**. Generated 2023-12-22.
- **Missing details.** [X] Class names, box counts, image origin and geography.
- **Plan.** Download as YOLO through the free Roboflow API, which needs a free key: **human input**. Discard the supplied split. Deduplicate against Urban Issues FallenTrees, which may contain the same images.

### 3.9 and 3.10 Roboflow `erykvtymons` fallen-tree projects

- **v2-bigger-boxes, version 8 "Trees_1".** [M] CC BY 4.0. 410 images: 290 / 60 / 60. Stretched to 640×640; no augmentation. The project has 15 versions, some augmented to 990 ("Trees_3"), "Trees_noise" (700) and "KLATKI_KONTROLNE" (90).
- **v1, version 7 "Full_V1".** [M] CC BY 4.0. 360 images: 280 / 40 / 40. Stretched to 640×640; no augmentation. The project has 25 versions (e.g., "Only_Fallen_Trees" 300, "BazaV2_Empty" 380).
- **Overlap and content.** [A] The two projects are by the same author and very probably share images; v2 is described as "bigger boxes". Version names such as "Empty" and "BazaV2_Empty" suggest **background images with no boxes**. Those must not become fallen-tree positives.
- **Language.** [A] "Klatki kontrolne" and "Baza" are Polish (control frames / base), which suggests Poland.
- **Plan.** Download only these two versions. Deduplicate. Keep images with at least one box as positives. Route box-less images to manual review: they may be usable as `other` negatives, for example a standing tree on a road.

### 3.11 Rome Road Damage (PMC13181123; Kaggle `lorenzoarcioni/road-damage-dataset-potholes-cracks-and-manholes`)

- **Paper.** [R] Giordani, Arcioni et al., *Scientific Reports*. 2,009 hand-labelled images with **1,261 potholes, 2,519 cracks and 957 maintenance holes**, all axis-aligned boxes. Captured in Rome and nearby towns (Grottaferrata, Lariano, Tor Vergata, Velletri, Sacrofano …), in sunny, cloudy and rainy daylight. Faces and plates were blurred, and near-identical frames removed.
- **Capture devices.** [R] A GoPro HERO7 mounted on the windshield at 130 cm, 1080p video frames; and a Samsung Galaxy A14 phone used from a stationary car. Everything was resized to **640×360**.
- **Kaggle listing.** [M] 6,031 files, 194.8 MB:
  - `data/images` 2,009 `.jpg`;
  - `data/labels` 2,009 `.txt` (4-point polygons);
  - `data/labels-YOLO` 2,009 `.txt`;
  - `annotations_coco.json`, two conversion scripts and a README.
- **By device.** [M] **1,907 GoPro frames** (`vlcsnap…`) and **102 phone photos** (`2025MMDD_HHMMSS.jpg`).
- **License discrepancy.** [M] The Kaggle card says **"MIT"**. The paper's data-availability statement says **CC BY 4.0** and points to Zenodo. **Decision:** follow the primary Zenodo/paper terms (CC BY 4.0) and record the discrepancy.
- **Domain.** The GoPro frames are a **dashcam view through a windshield**, not a resident's phone held over a pothole. Only the 102 phone images resemble resident capture.
- **Leakage risk.** [A] Frames from one drive are temporally correlated. **Group frames by recording timestamp**: `vlcsnap_YYYY-MM-DD-HHhMMmSSs…` gives the session and time, so frames within ±60 s form one group.
- **Plan:**
  - Pothole positive = image with at least one pothole box.
  - Crack-only or manhole-only image = `other` hard negative. This directly teaches "a manhole is not a pothole".
  - Hold out the **102 phone photos** entirely as a cross-source pothole recall probe.
  - Use a capped share of GoPro frames for training.

### 3.12 Roboflow trash detection (`trash-detection-1fjjc`)

- **Contents.** [M] CC BY 4.0. 2,783 source images. **64 classes, identical to the TACO taxonomy** (Plastic film, Cigarette, Drink can, Garbage bag …).
- **Version 14.** [M] 6,783 images = 6,000 train (2,000 sources × 3 augmentation outputs) + 673 + 110, stretched to 416×416. The augmentations include 90° rotations, vertical flips, shear and noise, which are not realistic for phone photos.
- **Class semantics.** These are **individual litter items**, often a single object photographed up close. "Uncollected garbage" in a barangay means accumulated waste: piles, bags or dumpsites. The two concepts overlap only partly. A single bottle on grass is not a reportable uncollected-garbage incident.
- **Rights.** [A] TACO images are crowd-sourced, mostly from Flickr, under per-image licenses. CC BY 4.0 on the Roboflow fork does not establish rights for every image.
- **Verdict.** Do not use as positives by default. Optional task (not scheduled): take images with at least 5 boxes or any `Garbage bag` box and review them by contact sheet as candidate pile scenes. Single-item images are excluded from all classes; they are ambiguous, not clean negatives.

### 3.13 Roboflow `models-omkjo/civic-issues-qj5pb` ("Complete")

- **Contents.** [M] CC BY 4.0. 43,105 images (version 2 export: 43,908 = 35,789 / 5,418 / 2,701). Stretched to 640×640; no augmentation.
- **Classes.** [M] The same 10 names as Urban Issues ("Broken Road Sign Issues", "Littering-Garbage on Public Places", "Pothole Issues" …).
- **Relationship to Urban Issues.** [A] A re-upload of the same compilation. Using both would add near-duplicates across sources.
- **Decision.** Use Urban Issues as the single copy: it can be attached directly in Kaggle notebooks, and its listing was fully audited. Optional M1 check: hash a 200-image sample from Civic Issues against Urban Issues to confirm the overlap.

### 3.14 Existing project assets (already curated)

[M] Read from local manifests:

| Asset | Images | Per class | Notes |
|---|---|---|---|
| `artifacts/tree-reliability-2026-10-20/training-v4-final/` | 199 | potholes 99, fallen trees 35, flooding 27, damaged signage 22, uncollected garbage 16 | Full per-image provenance. Split SHA `b5e6d35e…`. Includes Kent phone potholes and author-owned damaged-sign crops. |
| `artifacts/dataset-expansion-2026-10-20/philippine-current/` | 15 | flooding 6, trees 4, garbage 2, potholes 2, signage 1 | **Philippine.** 8 conservative groups. |
| `artifacts/tree-reliability-2026-10-20/local-evaluation/` | 12 | flooding 5, trees 4, garbage 2, signage 1 | **Subset of the 15 above.** [M] 12/12 SHA matches. Already used once to decide whether to keep v3, so it is no longer an unbiased test set. |
| `models/efficientnet_b0-v3.pt` | — | 5 classes | Current demo model; `letterbox`-free legacy preprocessing. |

[M] The v4 training set shares no SHA-256 with the Philippine sets.

## 4. Cross-source issues

### 4.1 Duplicates and near-duplicates

| Risk | Evidence | Mitigation (M1) |
|---|---|---|
| Roboflow augmentation siblings | [M] Up to 6.7× files per stem | Keep **one** file per `(source, stem)`. Pick the smallest `.rf.` hash for determinism. |
| Leaking supplied splits | [M] 1,220 FallenTrees stems cross splits | Ignore every supplied split. Re-split by group. |
| Re-uploads (#6/#8 ↔ #7; #13 ↔ #5; #5 FallenTrees ↔ #7/#9/#10) | [M] Matching counts; [A] shared upstream | Exact SHA-256 + 64-bit dHash (Hamming ≤ 6, also against the mirrored hash) + embedding cosine ≥ 0.97 (threshold confirmed by manual review), then union-find into one `group_id` |
| Reposted social-media images (FloodIMG) | [A] | Same as above |
| Video frames (Rome GoPro) | [M] Timestamped names | Session/time-window grouping |
| Existing v4 and Philippine sets vs new sources | [A] Same public origins are possible | Run the same deduplication over the union of all sources. Any match to a Philippine evaluation image removes the training copy. |

### 4.2 Class distribution

Unique-source estimates before filtering. [M] stems/files; [A] for what survives review.

| Target class | Main sources | Raw unique candidates | Expected after review/dedup [A] |
|---|---|---|---|
| flooding | FloodIMG 9,296; v4 27 | about 9,300 | 2,000–4,000 ground-level |
| potholes | Urban 4,265 stems (incl. crack-only); Rome 2,009; v4 99 | about 6,400 | 2,500–4,000 |
| fallen_trees | Urban 2,470; aaa 2,956; eryk ≤ 410; v4 35 | about 5,800 with heavy overlap | 2,000–3,500 |
| uncollected_garbage | Urban 3,332; v4 16 | about 3,350 | 1,500–2,800 (litter vs pile review) |
| damaged_signage | Urban 352; v4 22 | **about 375** | **250–350** |
| other (negatives) | Urban non-target about 15,000+; Rome crack/manhole-only; eryk empty | > 15,000 | capped at about 3,000 |

**Damaged signage will be the minority class by roughly 10×.** That drives the imbalance strategy in training plan §4. If more independent sign photos are needed, TrafficSigns-Raw (`ml/DATASET-EXPANSION-2026-10-20.md`, CC BY 4.0, 1,262 damaged-sign boxes) is the documented next source. It is not one of the user-supplied assets; the user decides whether to add it.

### 4.3 Label ambiguity

These cases need a written policy before review. Defaults are in training plan §1.3.

- Water-filled pothole vs flooding.
- Road cracks or manholes vs potholes.
- Graffiti on a road sign (damaged signage) vs graffiti on a wall (other).
- Litter item vs uncollected garbage; full bin vs overflowing bin.
- Leaning or standing tree vs fallen tree; cut logs vs a fallen tree.
- Flood with fallen trees in the same scene: a multi-hazard image.

### 4.4 Geographic relevance and domain shift

[M] No user-supplied image source is Philippine. Known origins:

- United States: FloodIMG; Roadway Flooding probably.
- Italy: Rome.
- Poland, probably: erykvtymons [A].
- Unknown: Urban Issues, aaa, TACO-derived.

Expected shift factors [A]:

- Philippine roads: asphalt and concrete mix, *estero* drainage, flooded *eskinita*, tricycles and jeepneys.
- Garbage practice: sacks, sidewalk piles, burned waste.
- Tropical vegetation: banana and coconut fronds, mango and acacia trees.
- Sign designs: DPWH signage and tarpaulin notices.
- Phone camera quality and monsoon lighting.

**No claim of Philippine performance may be made from international test results.** Evaluation protocol §3.3 defines the only valid basis.

### 4.5 Privacy

[A] FloodIMG (Twitter) and the Roboflow compilations may contain faces, licence plates and personal text. Training copies are stored privately (Kaggle private datasets or the git-ignored `artifacts/`), stripped of EXIF, and never redistributed. Philippine field photos follow AGENTS.md: consent, metadata stripping, storage outside public web roots, and no identifiable people as the subject.

## 5. Pretrained-model audit

### 5.1 Supplied models

[M] From the HF API:

| Model | Library | License | Params | Weights files | Pretraining |
|---|---|---|---|---|---|
| `google/vit-base-patch16-224` | transformers (also timm/torchvision equivalents) | Apache-2.0 | 86,567,656 | safetensors 346 MB, plus PyTorch/TF/Flax | IN-21k → IN-1k at 224 |
| `timm/resnet18.a1_in1k` | timm | Apache-2.0 | 11,699,112 | safetensors 46.8 MB | IN-1k, "ResNet Strikes Back" A1 recipe; train 224 / test 288 |
| `timm/mobilenetv3_small_100.lamb_in1k` | timm | Apache-2.0 | 2,554,968 | safetensors 10.2 MB | IN-1k, LAMB recipe; 224 |

None is gated, and all three are compatible with PyTorch transfer learning. **`timm` is not installed** [M] in the project `.venv`. The API adapter (`apps/api/barangai/inference.py`) supports only TorchVision `efficientnet_b0` and `mobilenet_v3_large`, and its embedding path uses `.features`/`.avgpool`/`.classifier`. A timm winner needs an adapter change (spec task S9e).

### 5.2 Required baselines (not in the supplied list)

- TorchVision `EfficientNet_B0_Weights.IMAGENET1K_V1` and `MobileNet_V3_Large_Weights.IMAGENET1K_V2`. Both are already used by `ml/barangai_ml/cli.py` and admitted by the API (BSD-3 code; ImageNet-derived weights distributed by PyTorch).

### 5.3 Local CPU benchmark

- **Hardware and software.** [M] AMD Ryzen 5 4600H, Python 3.12.5, Torch 2.11.0+cpu, TorchVision 0.26.0+cpu.
- **Setup.** Random weights with a 5-class head (latency does not depend on weight values). Batch 1, fp32, `inference_mode`. 10 warm-up runs, then 40 timed runs.
- **Scope.** Model forward pass only; decode and preprocessing are excluded.
- **Interpretation.** This is a *relative* comparison on a developer laptop, **not a deployment-host benchmark**.

| Model (TorchVision equivalent) | Params (M) | fp32 weights (MB) | 2 threads median / p95 (ms) | 6 threads median / p95 (ms) |
|---|---|---|---|---|
| MobileNetV3-Small | 1.52 | 5.8 | 13.6 / 15.7 | 10.3 / 11.4 |
| MobileNetV3-Large | 4.21 | 16.1 | 22.2 / 30.5 | 19.1 / 21.4 |
| EfficientNet-B0 | 4.01 | 15.3 | 32.6 / 43.7 | 32.6 / 35.6 |
| ResNet18 | 11.18 | 42.6 | 43.2 / 53.1 | 33.3 / 35.7 |
| ViT-B/16 | 85.8 | 327.3 | **448.2 / 466.9** | 262.5 / 312.5 |
| SSDLite320-MobileNetV3-Large (detector reference, 320 px) | 2.26 | 8.6 | 43.3 / 48.1 | 40.3 / 47.1 |

Notes:

- The param counts differ slightly from the HF figures because of head size and timm vs TorchVision implementations. The timm variants should be re-timed in M3.
- The production launcher uses 2 CPU threads (`deploy/start-local.ps1`), so the 2-thread column is the relevant one.

### 5.4 Model verdicts

- **ViT-B/16: rejected for deployment.**
  - [M] It is 14–20× slower than EfficientNet-B0 on this CPU and 21× larger.
  - [A] ViTs without strong augmentation tend to need more data than CNNs, and our minority class has about 300 images.
  - [A] Its 346 MB weights plus runtime would strain a 512 MB free host.
  - It is not run in the main comparison.
- **ResNet18-A1: secondary candidate.** It is a strong, simple CNN and a useful thesis comparison point. It is the slowest of the four CNNs at 2 threads and the largest.
- **MobileNetV3-Small-100 (LAMB): secondary candidate.** It is the fastest and smallest. [A] Its lower ImageNet capacity may hurt fine-grained classes such as damaged signs.
- **EfficientNet-B0 and MobileNetV3-Large: primary candidates.** Both are already integrated end to end (training CLI, API adapter, duplicate-embedding path, Render image).

## 6. Confirmed facts, assumptions, missing resources and human decisions

**Confirmed [M]:**

- Every count in §3.1–3.13 tables and the §5.3 benchmark.
- Pluvial and naiyakhalid contain no images.
- The Ultralytics sets have `license: null`.
- The Urban Issues supplied splits leak at the stem level.
- The Rome data is 1,907 GoPro frames + 102 phone photos.
- The 12-image Philippine diagnostic is a subset of the 15 Philippine photos.

**Assumptions [A], to verify in M1–M2:**

- Civic Issues ≈ Urban Issues.
- Ultralytics v4 ≈ aaa/fallentrees.
- erykvtymons v1 ≈ v2.
- Roboflow images are 640×640 and stretched.
- FloodIMG contains aerial views, graphics and faces.
- Roadway Flooding images are low resolution.
- Urban Issues folders annotate only their own class.

**Missing [X]:**

- Pixel-level statistics: dimensions, corruption, EXIF, perceptual duplicates.
- Class-ID distributions inside YOLO label files.
- Per-image upstream licenses of the compilations.
- Class lists for the aaa and eryk projects.
- **A Philippine field test set of useful size.**

**Decisions requiring human input:**

1. **Credentials.** Provide a free Kaggle API token and a free Roboflow API key, or download #7, #9 and #10 manually. No paid tier is needed.
2. **Licensing risk acceptance.** Accept `uploader_declared` sources (Urban Issues, FloodIMG) for academic training with private weights and no image redistribution. If not accepted, the dataset shrinks to CC BY sources (#3, #7, #9, #10, #11, v4) and fallen trees + flooding + potholes dominate.
3. **Label policy sign-off.** Training plan §1.3.
4. **Philippine field test.** Who collects, with what consent and ethics approval, and the targets in evaluation protocol §3.3.
5. **Extra damaged-sign source.** Whether to add TrafficSigns-Raw (not user-supplied) to fix the signage gap.
6. **Ultralytics 774-image set.** Whether to contact its owner. The default is to exclude it.
