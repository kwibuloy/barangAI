# Philippine deployment evaluation protocol — BarangAI Watch CV v5

Version 1.0, 25 October 2026. This protocol governs the **only** evidence that may support claims about Philippine performance. It runs **in parallel** with development and never blocks it. International datasets remain the training source.

## 1. Purpose and non-goals

- **Goal.** Measure how the frozen v5 model behaves on independent smartphone photos of real Philippine community incidents and non-incidents.
- **Not a goal.** Training, tuning or choosing models on PH-test. PH-test is scored once, for the final frozen candidate and the v3 baseline.
- **Not a goal.** Claiming national representativeness. The sample is small and from a few localities.

## 2. Sets

| Set | Use | Contents |
|---|---|---|
| **PH-dev** | Calibration (temperature, threshold) and error analysis only | The 15 previously reviewed Philippine photos (`artifacts/dataset-expansion-2026-10-20/philippine-current/`; the 12-image diagnostic is a subset and was already used once for a model decision), plus **30%** of newly collected incident groups |
| **PH-test (T3)** | Final, one-time evaluation | **70%** of newly collected incident groups, frozen and hashed before any v5 model sees Philippine data |
| Manila Bay (Roboflow, Adamson University) | `other` training negatives only | Isolated shoreline litter. **Never** in PH-test: it comes from a public training source and its location is asserted, not verified |

## 3. Collection targets

These are requirements, not expectations.

| Label | PH-test minimum independent incidents | PH-dev minimum | Notes |
|---|---|---|---|
| flooding | 40 | 15 | Street, alley or yard inundation; avoid photos taken while unsafe |
| potholes | 40 | 15 | Include water-filled potholes **and** crack-only negatives (→ `other`) |
| fallen_trees | 40 | 15 | Several storm events; avoid one event dominating (> 25% of the class) |
| garbage_accumulation | 40 | 15 | Sidewalk piles, estero/drainage dumping, overflowing bins |
| damaged_signage | 40 | 15 | Road, barangay, tarpaulin-on-frame and street-name signs; bent, broken, detached, unreadable |
| other | 60 | 20 | Hard negatives: intact signs, normal roads, puddles, standing trees, isolated litter, clean streets, closed bins |
| multi-hazard (extra) | as found | as found | Annotated with primary and secondary; reported separately |

- **Independence unit = incident.** At most 3 photos per incident. Burst shots and photos of the same object on the same day count as one incident.
- **Diversity quotas** (report achieved values):
  - at least **3 municipalities/cities** and at least **6 barangays** overall;
  - at least **4 photographers**, with no photographer contributing more than 30% of any class;
  - at least **2 phone brands**;
  - daylight and overcast/rain conditions, and at least 10% dusk or night if safe.
- **Timeline.** Collection can run during the rainy season (June–November) for floods and fallen trees. If a class misses its minimum, report the achieved n and its CI. Do not pad with web images.

## 4. Capture rules (safety and privacy first)

1. **Safety.** Never enter floodwater, approach downed power lines, or stand in traffic. Photograph from a safe public place. **Never stage or create an incident** (no dumping or damaging signs for photos).
2. **Device.** An ordinary smartphone camera app, held as a resident would. Store the phone model; no professional cameras.
3. **People.** Avoid identifiable faces and licence plates. If unavoidable, blur them **before** storage. Do not photograph minors as subjects.
4. **Private property.** Photograph only from public spaces. Do not photograph inside homes or yards unless the owner consents in writing.
5. **Metadata.** Record capture date, barangay and municipality on a separate form. Then strip EXIF/GPS (`ImageOps.exif_transpose` → RGB → JPEG q85, the same as API sanitisation) before files enter `ml/data/ph/`.

## 5. Consent, ethics and data protection

- **Ethics approval.** Obtain your institution's research ethics approval before collection begins. **[IR — blocker for PH-test]**
- **Photographer consent.** Participant code, permission for academic use of the photos, and a licence grant allowing use in the thesis and in a private model.
  - Recommended wording: "non-exclusive permission to use these photographs for noncommercial academic research, model training and evaluation, and thesis figures after blurring of people and plates."
  - Keep consent forms separate from images; never in Git.
- **Barangay coordination.** If photos are gathered through a barangay office, obtain written permission from the barangay. Do not use residents' real reports without their consent.
- **Data Privacy Act (RA 10173).**
  - Collect only what is needed.
  - Location is kept at barangay level only.
  - Access is limited to the research team.
  - Storage is a private folder or a private Kaggle dataset, never public, and outside web roots (AGENTS.md).
  - Define a retention period with your adviser, e.g., deletion one year after the defence.

## 6. Labelling

1. **Guide.** Two annotators label every image independently using `labeling_guidelines.md`. The fields are `label`, `secondary_categories`, `quality` (ok / blurry / dark / far), `view` (handheld / vehicle / elevated) and `exclude_reason`.
2. **Blind to the model.** Annotators never see model predictions.
3. **Agreement.** Report Cohen's κ on `label`. If κ < 0.6 on any label, discuss, revise the guide, and relabel that label.
4. **Adjudication.** A third person, or the two annotators together, resolve disagreements. The adjudicated label is final for scoring. Both original labels are kept.

## 7. Locking (leakage control)

1. **Deduplicate first.** Run `ml/audit/inventory.py` and `ml/audit/dedup.py` over the PH photos **together with all training sources**. Any PH image whose group touches training data is removed from PH sets and logged. Training data is not changed to accommodate PH images.
2. **Split.** Make the PH-dev/PH-test split by incident group (seeded, stratified by label).
3. **Freeze.** Write `ml/data/ph/ph_test_manifest.csv` and record its SHA-256 in `evaluation_protocol.md` §10 **before** any v5 model is run on any PH image.
4. **Access.** PH-test prediction files are opened only in spec step S8. Any later change to PH-test makes a new version that must be reported as such.

## 8. Metrics and reporting

Same metrics as `evaluation_protocol.md` §4: macro-F1, per-class recall and precision, confusion matrix, calibration, selective prediction at the deployed threshold, and the false-suggestion rate on `other`. Additionally:

- results by **quality** (ok vs blurry/dark/far) and by **view**;
- results by **municipality**, reported descriptively only (n is too small for comparisons);
- the multi-hazard subset: top-1 and top-2 any-hazard hit rate.

## 9. Sample-size limits (state these in the thesis)

Wilson 95% intervals for a per-class recall estimate, computed from the formula; they are not results:

| Independent incidents (n) | Observed recall 0.80 → 95% CI | Observed recall 0.60 → 95% CI |
|---|---|---|
| 15 | 0.55 – 0.93 | 0.36 – 0.80 |
| 40 | 0.65 – 0.90 | 0.45 – 0.74 |
| 80 | 0.70 – 0.87 | 0.49 – 0.70 |

- With 40 incidents per class, per-class claims are coarse (±12–15 points), and differences between models under about 15 points are usually not distinguishable.
- Photographs from a few barangays do not represent all Philippine regions (Mindanao, Visayas, upland and coastal settings).
- **Report "performance on this local sample", never "accuracy in the Philippines".**

## 10. If collection falls short

- **PH-test below 40 per class.** Report achieved n with CIs, label the result *preliminary*, and make no class-level claims below n = 15.
- **No ethics approval or no collection.** The thesis states that no Philippine performance was measured. PH-dev may be shown only as a qualitative diagnostic.
