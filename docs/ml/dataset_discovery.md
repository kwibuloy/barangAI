# Dataset discovery — BarangAI Watch CV v5 (Phase 2)

Date: 25 October 2026. Measured results for every downloaded candidate are in `dataset_review_report.md`. Rights tiers are explained in `licensing_and_provenance.md`.

## 1. Search method

| Platform | How it was searched | Queries (summarised) |
|---|---|---|
| Roboflow Universe | Authenticated Roboflow integration (`universe_search`) and REST metadata (`api.roboflow.com/<ws>/<project>`) for class counts, versions and augmentation flags | damaged / broken / bent / vandalized traffic signs; `class:damaged_sign`; illegal dumping; garbage pile; overflowing; roadside garbage; philippines; flood philippines baha; basura manila |
| Kaggle | Authenticated `api/v1/datasets/list?search=` plus full public file listings | damaged road sign; damaged traffic sign; broken sign; illegal dumping; garbage pile; garbage dump street; overflowing garbage; fallen tree; uprooted tree storm; flood street images; pothole images; philippines flood/road/garbage; typhoon damage |
| Hugging Face Datasets | `huggingface.co/api/datasets?search=` | damaged sign; illegal dumping; garbage street; fallen tree; flood; pothole; road damage; philippines |
| Zenodo | `zenodo.org/api/records?q=…&type=dataset&sort=bestmatch` | traffic sign damage; illegal dumping; waste street images; litter street; fallen tree; windthrow; pothole; urban flood images; street flooding; philippines road |
| Mendeley Data | Public API for the user-supplied leads | — |
| Web / papers | Web search for dataset papers and provenance | FloodIMG paper; Sazara roadway flooding; Kaggle `dsv/12723453`; COS40007 provenance |

**Limits:**
- Platform search ranking is noisy. The Zenodo `mostviewed` sort returned irrelevant records, so it was re-run with `bestmatch`.
- Hugging Face returned no damaged-sign, dumping or fallen-tree image datasets.
- Searches were bounded, so "not found" does not mean "does not exist".

## 2. User-supplied research leads

| Lead | Resolved to | Outcome |
|---|---|---|
| `universe.roboflow.com/test-olzsn/damaged-traffic-signs-b23l2` | Damaged Traffic Signs, CC BY 4.0, v3 has 1,371 images and no augmentation | **Accepted (review).** 1,254 groups; ~85% genuine damage, incl. knocked-down signs; little overlap with Urban Issues |
| `universe.roboflow.com/swinburne-bacs/cos40007-rubbish-road-issues-7kzdw` | COS40007 Rubbish & Road Issues, CC BY 4.0; v3 holds 6,058 of 7,562 project images, centre-crop filled to 640 | **Accepted (review).** Best garbage-accumulation photos; 7 damaged-sign subtypes plus `intact_sign` negatives |
| `kaggle.com/dsv/12723453` | **Road Issues Detection Dataset** (`programmerrdai/road-issues-detection-dataset`), MIT declared, 9,660 JPEGs | **Mostly duplicate.** 65.5% inside Urban Issues; signs = jayke multi-label; "Littering" = Google Street View (excluded) |
| `data.mendeley.com/datasets/rkh7nz2rcp/1` | Illegal Dumping in Urban Bangladesh, CC BY-NC 4.0. Real images: 326 positive, **278** negative (the card says 288), 200 critical-clean; augmented copies in separate folders | **Accepted for noncommercial academic use, acquisition incomplete** (9 of 804 files) |
| `data.mendeley.com/datasets/t395bwcvbw/1` | Image Dataset for Roadway Flooding (Sazara, Cetin, Iftekharuddin), CC BY 4.0 | **Source of record for the Kaggle mirror** (100% identical); held out as probe T2a |
| `data.mendeley.com/datasets/px48m7vwvf/1` | FloodDET, CC BY 4.0, 10,262 images in one 6.17 GB zip. Re-annotation of DEEPFLOOD + **FloodIMG** + Mapillary Vistas + MS COCO negatives | **Not acquired** (size over an unstable link). Recommended next flood source for diversity; must be deduplicated against FloodIMG |

## 3. Independently discovered candidates

### 3.1 Damaged signage (highest priority)

| Candidate | Metadata | Outcome |
|---|---|---|
| jayke-boghean `damaged-signs-multi-label` | CC BY 4.0, 695 originals: Healthy 325 / Damage / Wear / Vandalism / Bending (image-level) | **Accepted.** It is the upstream source of the Road Issues sign folder. Its Healthy class gives intact-sign negatives |
| road-inspection `damaged-signs-hind` | CC BY 4.0, 1,339 originals (v2 = 2,409 augmented); Damaged/Healthy boxes | Accepted, but it deduplicates to 451 groups, mostly shared with Urban Issues |
| graff `damaged-signs`; jayke `damaged-signs-o5qsa` | CC BY 4.0, 670 each | **Duplicates** of jayke multi-label (99.85% / 93%) |
| sign-detection-x0fra `damaged-signs-qpe48` | MIT, 516 images; bent/rust/graffiti/broken-sheet/crack/not-damaged | Accepted (review) |
| matyworkspace `traffic-signs-damaged-healthy` / `-cl-damaged-train` | CC BY 4.0; 2,542 / 4,039 originals; damaged/ok/occluded/dirty | Detection set accepted (damaged + ok). Classification crops: `ok` only |
| swinburne-bacs `cos40007-road-issues-gikuk` | CC BY 4.0, 3,529 images, no exportable version | Not downloadable (no generated version); class counts suggest a subset of COS40007 |
| sutha-vaithiyanathan `bus-stop-monitor` | CC BY 4.0, 22,890 originals (40,840 augmented); includes `damaged_sign` 1,277 | Not acquired: bus-stop domain, very large. Optional later |
| Kaggle `danielvareta/damaged-signs-dataset` | CC0 declared, 11.2 GB | Not acquired. The earlier repo review found Google Street View controls in its samples → rights C |
| Zenodo CURE-TSR (3903066) | CC BY 4.0 | **Excluded by rule:** simulated corruptions, not physical damage |
| Zenodo EMTD, GTSRB, LISA variants | Traffic-sign recognition | Intact signs only; usable at most as `other` and not needed |
| TrafficSigns-Raw (Zenodo 22052437; earlier repo research) | CC BY 4.0, 1,262 damaged-sign boxes, author-owned | Not re-acquired this phase. **Tier-A sign source**: recommended next if more A-tier signage is wanted |

### 3.2 Garbage accumulation (high priority)

| Candidate | Metadata | Outcome |
|---|---|---|
| Kaggle `hammadarshad18/garbage-detection` "Piles of Garbage" | CC0 declared, 393 phone photos (South Asia), darknet labels | Accepted (class 0 = pile) |
| myspace-vwrde `garbage-dumping-detection` | CC BY 4.0, 2,329 originals, 300 px | Accepted (review). 25% overlaps Urban Issues |
| cloudcam `garbage-dumping-6avsy` | CC BY 4.0, 636 | Accepted (review; not visually sampled) |
| trash-qdazj `garbage-overflowing`; akshita `roadside-garbage-detection` | CC BY 4.0, 157 / 120 originals | Accepted (review; not visually sampled) |
| raez-workspace `dumping-nqmbv` | CC BY 4.0 | **Excluded:** industrial truck-unloading CCTV, not waste dumping |
| project-elevate `illegal-dumping-detection` | CC BY 4.0, 97,062 images; classes are COCO-like objects (bed, couch, mattress, tire …) | Not acquired: likely object-level re-use of COCO/OpenImages-style photos; too large for this phase |
| DATA-298 `dumping` | CC BY 4.0, 9,127 images (car/garbage/person/truck) | Not acquired: appears to be event CCTV; optional |
| Zenodo pLitterStreet (8288500) | CC BY 4.0, >13,000 vehicle-mounted street images, 13.1 GB (+8.4 MB COCO annotations) | Not acquired (size). Litter boxes could select dense scenes; optional |
| Zenodo Urban Community Issues (18871460) | CC BY 4.0, 670 MB; waste *container* 600, pothole 300, good road 100 | Not acquired: low marginal value |
| Roboflow Manila Bay (Adamson University) | CC BY 4.0, 2,576 originals; Philippine shoreline waste | Accepted as **Philippine `other` hard negatives** (isolated items) |
| Kaggle `dataclusterlabs/domestic-trash-garbage-dataset` | 250-image sample; full set requires contacting the owner | Not acquired: small sample; it is an upstream source of Road Issues |
| StreetView-Waste (GitHub, earlier research) | Data licence agreement required | Not pursued without your authorisation |

### 3.3 Flooding, fallen trees, potholes

| Candidate | Metadata | Outcome |
|---|---|---|
| Zenodo Normal-Pothole (13334878) | CC BY 4.0, 2,500 normal + 2,500 pothole | Accepted for **normal-road `other`**. Its potholes add no new groups |
| Kaggle `aryan57/new-dataset-3` "road anomaly" | No licence; 20,169 images: fallen-tree, garbage, pothole, road | **Excluded** (rights C; baked rotations) |
| Kaggle `tunhunhminh/demodata` "City Problems" | Unknown licence, 23,879 images, 2.2 GB | Not acquired: no licence, no provenance (C) |
| Kaggle pothole sets (atulyakumar98, sachinpatel21, RDD2022, andrewmvd …) | Various | Not acquired: potholes are not under-represented, and these mirrors overlap heavily (the Normal-Pothole result confirms the shared pool) |
| HF `Outerview/global-potholes-dataset` | CC BY 4.0 tag, 10k–100k | Not acquired; optional pothole diversity source |
| Zenodo windthrow datasets (WInD, Žofia) | Forest inventory / aerial | Excluded: forestry and aerial, not community incidents |
| Zenodo STURM-FloodDepth, TinyCamML coastal flooding | CC BY 4.0 | Not acquired: niche (flooded cars; fixed coastal cameras); optional |
| HF flood datasets (FloodNet, ETCI, geoid-flood …) | Satellite or aerial | Excluded: aerial or SAR |

## 4. Ranking by expected contribution

Scores: H = high, M = medium, L = low.

| Rank | Source | Class | New unique groups [M] | Label quality [V] | Phone-perspective relevance | Geographic diversity | Rights tier | Contribution |
|---|---|---|---|---|---|---|---|---|
| 1 | COS40007 | garbage, signs, other | 3,099 total (588 garbage, 332 signs) | H for rubbish | **H** (real phone photos) | AU | B | **Highest new value** |
| 2 | Damaged Traffic Signs (test-olzsn) | signs | 1,244 | H | M (crops) | mixed web | B | High |
| 3 | matyworkspace det | signs, other | 1,245 + 478 | H, but stock-heavy | M | mixed web | B | High |
| 4 | Urban Issues (deduplicated) | all five + other | 24,188 | M (needs review) | M | mixed incl. SE Asia | B | High base, low quality |
| 5 | myspace dumping | garbage | 2,004 | M | M (300 px) | mixed | B | Medium |
| 6 | Rome road damage | potholes, other | 606 + 1,045 | H (authored) | L–M (dashcam) | IT | **A** | Medium, the only A-tier potholes |
| 7 | FloodIMG | flooding | 4,502 | L–M (30–40% usable) | M | US/EU | B | Medium; the only flood source |
| 8 | Normal-Pothole "Normal" | other | 3,721 | M (256 px) | M | unknown | B | Medium (hard negatives) |
| 9 | Piles of Garbage | garbage | 221 | M | **H** | South Asia | B | Medium (domain-relevant) |
| 10 | Manila Bay | other | 2,504 | H (as negatives) | H | **Philippines** | A | Medium (local negatives) |
| 11 | erykvtymons v1+v2 | trees | 352 | M | M (TV/dashcam frames) | PL | B | Low–medium |
| 12 | cloudcam, overflowing, roadside | garbage | 517 + 111 + 110 | unknown | — | — | B | Low–medium |
| 13 | jayke multi-label / x0fra | signs, other | 23 + 106 (rest deduplicates into others) | M | M | CA/mixed | B | Low new value, useful labels |
| — | Mendeley Bangladesh dumping | garbage, other | ≤ 804 (incomplete) | H (authored) | **H** | BD | **A-NC** | High once acquired |
| — | FloodDET | flooding | unknown (overlaps FloodIMG) | H (re-annotated) | M | mixed | A/B | High priority to fix flood diversity |
| — | TrafficSigns-Raw | signs | ≤ 1,262 boxes | H | M | EU | **A** | Medium (tier-A signs) |

## 5. Recommended next acquisitions (not done; need a decision or bandwidth)

1. **FloodDET** (6.2 GB): flood diversity plus non-flood negatives. Run `fetch.py mendeley px48m7vwvf 1 md_flooddet` on a stable connection, then deduplicate against FloodIMG.
2. **Finish the Mendeley Bangladesh dumping download** (tier A-NC, South Asian streets, real negatives).
3. **TrafficSigns-Raw** damaged-sign boxes: tier-A signs to reduce dependence on stock-photo pools.
4. **Philippine field collection** (`philippine_evaluation_protocol.md`): the only path to Philippine evidence.
