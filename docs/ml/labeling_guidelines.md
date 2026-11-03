# Visual labeling guidelines — BarangAI Watch CV v5

Version 1.0, 25 October 2026. Applies to:
- every image admitted to training, validation or test;
- the human contact-sheet review;
- the Philippine evaluation annotation (`philippine_evaluation_protocol.md`).

The examples cite contact sheets under `ml/data/review/`. They are git-ignored and private; tile numbers refer to those sheets.

## 1. Label set

| Training label | ID | App category (API) | One-line definition |
|---|---|---|---|
| `flooding` | 0 | `flooding` | Meaningful inundation affecting streets, pathways, structures or public areas |
| `potholes` | 1 | `potholes` | Visible road cavity or surface depression with missing material; ordinary cracks excluded |
| `fallen_trees` | 2 | `fallen_trees` | A fallen tree or substantial tree section on the ground, blocking, or resting on something |
| `garbage_accumulation` | 3 | `uncollected_garbage` | Visible accumulation or dumping of waste; not isolated litter |
| `damaged_signage` | 4 | `damaged_signage` | Public or road signage that is clearly broken, detached, bent, destroyed or functionally impaired |
| `other` | 5 | *(no suggestion)* | No clearly identifiable target incident |

**Why the garbage label is renamed.** An image cannot show whether a collection was scheduled or missed. The training label therefore describes only what is visible. The API maps `garbage_accumulation` to the existing `uncollected_garbage` display category (`implementation_spec.md` S9), so the resident-facing wording does not change.

## 2. General admission rules (all labels)

An image is admissible only if **all** of these hold:

1. **It is a photograph.** No illustrations, renders, stock "grunge" graphics, posters, book covers, maps, screenshots of apps or news tickers, or collages.
   - Seen in review: rendered peeling-sticker sign graphics (`cs_urban_signs` 7, 19, 39) and a book cover (`cs_urban_trees` 16).
2. **It is a ground-level or handheld perspective.** Phone, pedestrian, vehicle-window or CCTV views are allowed.
   - **Aerial or drone views are excluded** (`cs_floodimg` 2, 12, 35).
   - A dashcam view through a windshield is admissible for training. It is *not* representative of resident capture, so it is tagged `view=dashcam`.
3. **The target is identifiable at 224 px.** After letterboxing to 224 × 224, a reviewer must still see the incident.
   - A sign or pothole that is a few pixels wide is not admissible as a whole image. Use a box-guided context crop (training plan §1.4) or exclude it.
   - Examples: `cs_cos_bent` 0, 1, 2 and 8 are wide street scenes in which the bent sign is invisible.
4. **It has no heavy synthetic artefacts.** Exclude images with baked-in mosaics (4-image tiles), cutout rectangles covering more than about 10% of the frame, or rotations beyond ±15°, 90° or 180°.
   - Mild Roboflow brightness or noise is acceptable.
   - Examples: `qa_stems_aaa` groups 0, 2, 3 and 7; `cs_anomaly_garbage` 1, 13, 15 and 20.
5. **Rights tier.** The image must be tier A or B (`licensing_and_provenance.md`).
   - **Visible stock-agency watermarks** (alamy, Getty, Shutterstock, iStock, Dreamstime) move the *individual image* to tier C. Mark `reject:watermark` even if its dataset is tier B.
   - **Google Street View captures** are tier C (`cs_roadissues_garbage`: the Google logo is visible).
6. **No privacy or dignity problem.** Exclude images where an identifiable person is the main subject, where minors are prominent, or where the content is distressing (e.g., `cs_myspace` 20, a person in polluted water). Faces incidental to a scene may stay in training but must never appear in published figures.
7. **One clear label (single-label rule, §4).**

## 3. Class definitions with decision rules

### 3.1 `flooding`

- **Include.** Water covering a substantial part of a road, sidewalk, alley, yard or public space. Water reaching kerbs, doorways or vehicle wheels. People wading. Submerged ground-floor structures. Typhoon or monsoon street inundation.
- **Exclude** (→ `other` or drop):
  - **Ordinary puddles**: water confined to a small patch with the road surface visible around it on both sides.
  - Rivers or streams at normal or high level that are **not** visibly affecting streets, structures or public areas. Many FloodIMG webcam frames show dry culverts (`cs_floodimg` 9, 17, 29, 30, 34, 39).
  - Aerial or drone views.
  - Water-level gauge close-ups without context.
- **Visual cues of "meaningful":** water spans most of the road width, or covers a footpath or entrance, or depth is visible (submerged tyres, people knee-deep).

### 3.2 `potholes`

- **Include.** A cavity, hole or depression where surface material is missing and depth is visible: broken edges, an exposed base layer, a dark interior, or water inside a defined rim.
- **Exclude** (→ `other`): linear or alligator **cracks without missing material**, manhole covers, drain grates, speed bumps, patched (repaired) surfaces, and road-marking wear.
- **Gravel or dirt roads:** label a pothole only where a distinct cavity is visible, not a general rough surface.

### 3.3 `fallen_trees`

- **Include.** A trunk or large limb on the ground, across a road or path, resting on a vehicle, house, wall or power line, or uprooted with its root plate exposed.
- **Exclude:**
  - leaf litter, twigs, small branches, a standing tree, a leaning but standing tree (→ `other`);
  - neatly cut logs or stacked timber, sawmill or forestry scenes (→ `other`);
  - natural forest floor with old deadwood where no community space is involved (→ exclude, e.g., `cs_urban_trees` 2, 10, 35);
  - crews cutting a standing tree.
- **Borderline:** a large broken limb (more than about 15 cm diameter) blocking a path counts as `fallen_trees`. Piles of trimmed branches dumped by a road are `garbage_accumulation` only if mixed with other waste; otherwise **exclude** as ambiguous.

### 3.4 `garbage_accumulation`

- **Include:**
  - piles or heaps of mixed waste;
  - several garbage bags together;
  - dumped household items (mattresses, furniture, appliances) on public land or kerbs;
  - overflowing bins with waste spilling outside them;
  - roadside or vacant-lot dumpsites;
  - waste-choked drains or esteros when the waste is the dominant subject.
- **Exclude** (→ `other`):
  - a **single litter item or a few scattered items** (a bottle, a cup, a wrapper), e.g., `cs_urban_garbage` 2, 4, 17, 19, 22, 27, 28, 31, 32, 45, 47, and all of `cs_ph_manila_bay`;
  - a closed or full bin without spill-over;
  - recycling sorted inside facilities, landfill operations, or garbage trucks collecting;
  - product photos of trash on white backgrounds (→ drop, not `other`).
- **Note:** bags placed neatly at a kerb for scheduled pickup *look* like accumulation. Label them `garbage_accumulation`, because the label is visual. The app's "uncollected" wording is resolved by staff, not by the model.

### 3.5 `damaged_signage`

- **Include.** Public, road or barangay signage that is:
  - physically **bent, broken, cracked through, torn, holed** (including bullet holes that affect legibility);
  - **detached, knocked down or lying on the ground**;
  - **collapsed**, or whose face is missing;
  - **faded, rusted or peeled until the message is unreadable**;
  - **vandalised so heavily that the message is obscured**.
- **Exclude** (→ `other`):
  - intact signs;
  - minor rust spots, light fading, or a small sticker or tag with the message still clearly readable (`cs_jayke_signs` 0, 12, 27);
  - **environmental occlusion** (snow, foliage, dirt) on an intact sign (`cs_maty_damaged` 10);
  - camera blur;
  - simulated or synthetic corruption (CURE-TSR-style datasets are not admissible).
- **Wear-only labels** from source datasets (jayke "Damage Wear") must be reviewed against the readability test.

### 3.6 `other`

Real photographs of public spaces **without** a target incident. Mixing in hard negatives on purpose is required:

- intact signs;
- crack-only roads and manholes;
- graffiti on walls;
- isolated litter;
- standing trees;
- normal roads;
- puddles;
- clean streets;
- full-but-closed bins.

Hard negatives must come from at least 5 distinct sources. `other` is **not** expected to catch every unknown input (architecture decision §5); softmax confidence and the review workflow remain the safety net.

## 4. Single-label rule for scenes with several hazards

An image may receive a single training label only when:

- (a) exactly one target hazard is visible; **or**
- (b) one target hazard is **clearly dominant**: it occupies most of the salient content and is the obvious reason a resident would report. The other hazard must be small, background or incidental, and the reviewer would still label it the same way with the minor hazard cropped out.

Otherwise the image is **excluded from single-label training and validation** and moved to the **multi-hazard pool** (`review=multi`). There it is annotated with `primary` (if any) and `secondary_categories`, and used only in the multi-hazard analysis (evaluation protocol §4.4).

| Ambiguous case | Decision |
|---|---|
| Water-filled pothole: rim visible, water confined to the cavity | `potholes` |
| Potholes visible under or around shallow street water | Water confined to pothole rims → `potholes`; water over the road surface → `flooding`; both clearly salient → multi-hazard pool |
| Trash floating in floodwater | Flood dominant (most cases) → `flooding`; a waste-choked drain or estero with little standing water → `garbage_accumulation`; both prominent → multi-hazard pool |
| Fallen tree damaging a sign | The tree is usually dominant → `fallen_trees`; a close-up of a sign bent by a branch → `damaged_signage`; otherwise multi-hazard |
| Graffiti on otherwise functional signage | Readable → `other`; message obscured → `damaged_signage` |
| Small amount of litter | `other` (never `garbage_accumulation`) |
| Normal vegetation vs fallen trees | Standing, leaning-but-rooted, hedges, cut and stacked wood → `other`; a trunk or large limb down → `fallen_trees` |
| Storm scene with fallen trees **and** flooding | Multi-hazard pool unless one clearly dominates |
| Dumped furniture next to an intact sign | `garbage_accumulation` (the sign is incidental) |
| Construction site rubble | `other`, unless it is clearly dumped on a public road or vacant lot |

## 5. Review procedure

1. **Reviewers use contact sheets** from `ml/audit/sheets.py`, with numbered tiles and a CSV. They fill `decision` with one code:
   - `accept`;
   - `relabel:<label>`;
   - `reject:not_photo`, `reject:aerial`, `reject:too_small`, `reject:artefact`, `reject:watermark`, `reject:streetview`, `reject:privacy`, `reject:not_target`, `reject:ambiguous`;
   - `multi`.
2. **Sampling.** Every candidate in classes with up to 3,000 unique groups is reviewed. Larger pools (`other`, potholes, flooding) are reviewed in random samples of 200 per source × label.
   - If a sample's reject rate has a Wilson 95% upper bound above 25%, review the whole pool, or drop the source for that label.
3. **Double review.** A random 10% of reviewed tiles (at least 100 per label) is reviewed independently by a second person. Report Cohen's κ per label. If κ < 0.6, revise this guide and re-review that label.
4. **Records.** Every decision is kept, never overwritten, with reviewer ID, date and guide version. Corrections create a new row.
5. **No model in the loop.** Reviewers never see model predictions while labelling evaluation data.
