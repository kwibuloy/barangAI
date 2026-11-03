# Licensing and provenance — BarangAI Watch CV v5

Date: 25 October 2026.

**This is an engineering record, not legal advice.** It documents the evidence found and a conservative policy. Decisions marked **[IR]** need institutional review: your thesis adviser, research ethics committee and university IP office.

## 1. Policy

1. **Research purpose.** Use is limited to noncommercial academic research for an undergraduate thesis prototype. Nothing is sold, and no public service is built on these weights without a separate review.
2. **Missing licence ≠ automatic exclusion, and declared licence ≠ cleared rights.**
   - An uploader's licence label (CC0, CC BY, MIT) on a Kaggle or Roboflow *compilation* is evidence of the uploader's intent. It does not prove that the uploader held rights to images scraped from the web, stock agencies or social media.
   - Your approval to investigate unlicensed datasets does **not** grant permission from third-party copyright holders.
3. **Tiers.**
   - **A:** explicit licence from the creators of the images, suitable for noncommercial academic use. **A-NC** means noncommercial only.
   - **B:** potentially usable for restricted academic research. The licence is uploader-declared on a compilation, or the provenance of the underlying images is unverified. Use rests on a documented academic-research basis (§4) and needs [IR].
   - **C:** rights materially unresolved or incompatible. Excluded from all tracks.
4. **Per-image overrides.** These images are tier C regardless of their dataset's tier and are removed during review (labeling guide §2.5):
   - visible stock-agency watermarks (alamy, Getty, Shutterstock, iStock, Dreamstime);
   - Google Street View captures;
   - news-broadcast overlays where the frame is the broadcaster's content.
5. **No circumvention.** No access restriction, paywall, sign-in wall, CAPTCHA or data-agreement gate was bypassed. Sets behind sign-in (Ultralytics), on request (dataclusterlabs full set) or behind agreements (StreetView-Waste, FRED) were not acquired.
6. **No redistribution.**
   - Third-party raw images are never committed to Git, never placed in public Drive, Kaggle or Roboflow spaces, and never shared by link.
   - Kaggle datasets made for training are **private**.
   - Checkpoints trained on tier-B data stay **private** (as `models/README.md` already requires for v3). Publicly releasing weights or images needs [IR] and source-by-source permission.
7. **Attribution.** Every source used is cited in the thesis with the attribution in §3. Image-level attribution is kept in the manifest (`source_url`, `creator`, `license`, `attribution` fields).

## 2. Legal and institutional context (summary, verify with your institution)

- **Philippines, copyright.** The Intellectual Property Code (Republic Act No. 8293, as amended) recognises **fair use** for purposes including research (Section 185). It is decided case by case on purpose, nature, amount and market effect. It is a defence, not a licence. Training a private, noncommercial thesis model is the strongest reading of research use. Publishing images or deploying commercially weakens it. **[IR]**
- **Philippines, privacy.** The **Data Privacy Act of 2012 (RA 10173)** applies to photos of identifiable people and to location data you collect. This matters most for the Philippine field set. Public-dataset images containing faces or plates are not redistributed, are not used in figures without blurring, and are metadata-stripped (GPS EXIF was found in 233 downloaded images; `dataset_review_report.md` §3.2).
- **Platform terms.**
  - Google Maps/Street View terms restrict copying and derivative use of imagery: hence tier C.
  - Stock agencies license watermarked previews only for evaluating a purchase: hence tier C.
  - Kaggle and Roboflow place licence responsibility on uploaders.
- **University policy.** No university research or IP policy document is in this repository, and I could not consult one. **[IR] Required:** confirm with your adviser or research office that (a) tier-B public datasets may be used for thesis training and (b) the Philippine field collection has ethics approval and consent forms.

## 3. Per-source record

| Source (local name) | Original publisher / creator | Licence evidence | Access terms | Attribution | Tier | Allowed use here |
|---|---|---|---|---|---|---|
| `rome_road_damage` | E. Giordani, L. Arcioni et al., *Scientific Reports* (PMC13181123); Zenodo plus Kaggle mirror `lorenzoarcioni/...` | Paper data-availability statement: **CC BY 4.0**. Kaggle card says "MIT" (discrepancy; follow the paper/Zenodo terms). Author-captured (GoPro + Galaxy A14); faces and plates blurred by the authors | Free, no registration | "Road Damage Dataset: Potholes, Cracks and Manholes, Giordani & Arcioni et al., CC BY 4.0" | **A** | Training; phone subset as probe |
| `roadway_flooding_mendeley` | C. Sazara, M. Cetin, K. Iftekharuddin, Mendeley doi:10.17632/t395bwcvbw.1 | **CC BY 4.0** (Mendeley record). How the images were collected is not described | Free | Cite DOI | **A** (with caveat) | Evaluation probe T2a only |
| `rf_ph_manila_bay` | Adamson University workspace, Roboflow `manila-bay` | **CC BY 4.0** (project). Consistent device and scenes suggest self-captured; Philippine location asserted by the project, not independently verified | Free export | "Manila Bay, Adamson University, Roboflow Universe, CC BY 4.0" | **A** (caveat) | `other` hard negatives |
| `md_illegal_dumping_bd` | R. Amin et al., Mendeley doi:10.17632/rkh7nz2rcp.1 | **CC BY-NC 4.0**; described as real author-collected images | Free | Cite DOI; noncommercial only | **A-NC** | Training (noncommercial); acquisition incomplete |
| `urban_issues` | Kaggle `akinduhiman`; compiled from Roboflow projects (`.rf.` names); includes the aaa, COS40007 and TACO images, among others | Uploader-declared **CC0** on a compilation; contains stock and news watermarks | Free | "Urban Issues Dataset (A. Himan), Kaggle" plus upstream credit where known | **B** | Training after review; per-image C removed |
| `rf_civic_issues` | Roboflow `models-omkjo` | CC BY 4.0 declared; 99.98% duplicate of Urban Issues | Free export | — | B | Not used (duplicate) |
| `road_issues_kaggle` | Kaggle `programmerrdai` (DOI 10.34740/kaggle/dsv/12723453); upstream sources listed on the card | MIT declared on a compilation; its "Littering" folder is Google Street View | Free | Cite card and upstreams | B / **C** (Street View folder) | Only non-duplicate, non-Street View images |
| `floodimg` | Karanjit, Pally, Samadi, *Data in Brief* 2023, doi:10.1016/j.dib.2023.109164; Kaggle `hhrclemson` | CC0 declared. Images gathered through APIs from **Twitter** and US federal sites (USGS, DOT) [R]. Federal works are typically public domain; Twitter images are third-party works | Free | Cite paper | **B** | Training after review |
| `rf_cos40007` | Roboflow `swinburne-bacs` (Swinburne University course project, per name) | CC BY 4.0 declared. Provenance unverified: phone photos (Melbourne inferred from signage) plus web crops | Free export | "COS40007 – Rubbish & Road Issues, Swinburne BACS, Roboflow Universe, CC BY 4.0" | **B** | Training after review |
| `rf_damaged_traffic_signs` | Roboflow `test-olzsn` | CC BY 4.0 declared; many stock-watermarked crops | Free export | Credit the workspace | **B** (+ per-image C) | Training after review |
| `rf_maty_signs_det`, `rf_maty_signs_cls` | Roboflow `matyworkspace` | CC BY 4.0 declared; stock-heavy | Free export | Credit the workspace | **B** (+ per-image C) | Training after review |
| `rf_signs_hind`, `rf_jayke_signs_multilabel`, `rf_graff_signs`, `rf_jayke_signs_o5qsa` | Roboflow `road-inspection`, `jayke-boghean-2pxtg`, `graff` | CC BY 4.0 declared | Free export | Credit the workspaces | B | jayke and Hind after review; graff and o5qsa are duplicates |
| `rf_signdet_x0fra` | Roboflow `sign-detection-x0fra` | MIT declared | Free export | Credit the workspace | B | Training after review |
| `rf_aaa_fallentrees` | Roboflow `aaa-yryty` | CC BY 4.0 declared; Chinese social-media watermarks; 99.8% inside Urban Issues | Free export | — | B | Duplicate (covered via Urban Issues) |
| `rf_eryk_v1`, `rf_eryk_v2` | Roboflow `erykvtymons` | CC BY 4.0 declared; includes TV-news frames (e.g., TVN24 overlay) | Free export | Credit the workspace | **B** (+ per-image C for broadcast frames) | Training after review |
| `rf_myspace_dumping`, `rf_cloudcam_dumping`, `rf_garbage_overflowing`, `rf_roadside_garbage` | Roboflow `myspace-vwrde`, `cloudcam`, `trash-qdazj`, `akshita-chauhan` | CC BY 4.0 declared; myspace has alamy watermarks | Free export | Credit the workspaces | **B** (+ per-image C) | Training after review |
| `kg_piles_of_garbage` | Kaggle `hammadarshad18` | CC0 declared; photos appear self-captured (consistent phone set), unverified | Free | Credit the uploader | **B** | Training after review |
| `zn_normal_pothole` | N. Tanwar, Zenodo 13334878 | CC BY 4.0 declared; 256 px web-style images, one stock watermark seen | Free | Cite the record | **B** | `other` (normal roads) |
| `rf_trash_taco` | Roboflow fork of TACO-style data | CC BY 4.0 declared; TACO images carry per-image Flickr licences | Free export | — | B | Excluded (label mismatch) |
| `rf_raez_dumping` | Roboflow `raez-workspace` | CC BY 4.0 declared | Free export | — | B | Excluded (concept mismatch) |
| `rf_ph_pothole_audit` | Roboflow `asifprojects` | CC BY 4.0 declared; title claims the Philippines, scenery does not support it | Free export | — | B | Excluded (origin unverified) |
| `kg_road_anomaly` | Kaggle `aryan57` | **No licence**, no provenance; scraped look with baked augmentations | Free | — | **C** | Excluded |
| Ultralytics `zelin-hu` × 2 | Ultralytics Platform | `license: null`; sign-in required to download | Not acquired | — | **C** | Excluded |

## 4. Training tracks

**Measured constraint:** tier A plus A-NC covers only **potholes (606 Rome groups), `other` (3,549 groups) and, once acquired, garbage (≤ 326 Bangladesh positives).** It has **no flooding, fallen-tree or damaged-sign training data** (`pools_summary.json` → `groups_by_label_and_rights_tier`). A strictly clearly-licensed five-class model is therefore **not feasible** with the available sources.

| Track | Data | Purpose | Release |
|---|---|---|---|
| **T-main (research)** | A + A-NC + B, after per-image C removal | The thesis model | Private weights; no image redistribution; [IR] approval for B use |
| **T-licensed (ablation)** | A + A-NC only | A 3-label sanity model (potholes / garbage / other) to show what clearly-licensed data alone supports. Optional; run only if the time budget allows | Private |
| **Future clean-up path** | Replace B with A sources: TrafficSigns-Raw (signs), FloodDET (flood, CC BY 4.0 re-annotation, still needs upstream checks), Philippine field data collected with consent and an explicit licence grant | Reduce rights risk before any public release | — |

No additional "restricted" (C) sources are used in any track. Every candidate C source was also a duplicate or of unusable quality, so excluding them costs no unique data.

## 5. Records to keep

- `docs/ml/inventory/source_registry.csv`: source, URL, archive SHA-256, fetch time, tier, decision.
- Manifest columns per image: `source`, `source_url`, `creator`, `license`, `attribution`, `rights_tier`, `review_decision` (spec S4).
- The [IR] decision record (adviser or office, date, scope) goes in `docs/ml/results_v5.md` before any results are reported.
