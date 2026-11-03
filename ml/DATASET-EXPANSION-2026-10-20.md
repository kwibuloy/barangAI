# Dataset expansion review — 20 October 2026

## Decision

Use real close ground-level photographs first. Strong new candidates exist for potholes and damaged signs, so AI-generated replacements are not needed for those classes now. No newly researched source has been bulk-imported into the training set. Only small sign previews and source manifests were downloaded for review; no external scripts were run and no new model was trained.

User requirements: every class must be ground-level, with the incident clearly visible near the camera. Vehicle-mounted or standing-height downward phone views may qualify after review. Reject drone/aerial, balcony/high-vantage, distant indistinct incidents, screenshots, watermarks and uncertain image rights. A source's total size is not an accepted training-image count.

## Priority 1 — close pothole phone photographs

[Water-Filled and Dry Potholes — creator deposit](https://data.mendeley.com/datasets/tp95cdvgm8/1), [University of Kent paper](https://kar.kent.ac.uk/101156/).

713 author-collected UK mobile-phone photographs, covering dry, water-filled and debris-filled potholes. Images have Pascal VOC XML and YOLO annotations. Dataset license explicitly CC BY4.0. This is the best new camera-domain match for resident submissions. Two additional dashcam videos are separate resources. Paper object counts differ between abstract/body (1152/1157); recount annotations rather than promising either as a verified total. Representative figures were identified but could not be rendered by the research browser; sample-photo inspection, privacy, event grouping and archive integrity remain required before import. Do not merge it with watermarked third-party pothole mirrors.

[Indonesian Pothole Videos V3](https://data.mendeley.com/datasets/5bwfg4v4cd/3), [creator paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10867608/).

619 phone clips recorded around130cm above potholes, pointing downward: standing-height capture, not aerial. CC BY4.0. Each clip contains48RGB frames plus masks;29712frames are highly correlated, not29712independent examples. Official372/124/123train/validation/test clip split. Keep every clip and repeated physical pothole in one partition. Select a small number of sharp frames per event. Actual close-view photo review remains pending; paper image rendering encountered a browser challenge.

## Priority 2 — real damaged signs with linked close crops

[Author repository](https://github.com/Latzi/object-centric-low-data-datasets), [archival release](https://zenodo.org/records/22052437), [image-specific license](https://raw.githubusercontent.com/Latzi/object-centric-low-data-datasets/main/LICENSES/traffic_signs_license.txt).

TrafficSigns-Raw includes4185street-view source photographs and8249boxes. Locally downloaded annotation metadata confirms1262damaged-sign boxes in1161distinct source images; the rest are not automatically damage positives. Authors explicitly state ownership and release both Raw and OC images underCC BY4.0. TrafficSigns-OC offers3009close256x256crops with crop-to-source and shared split mappings.

Critical: OC merges healthy/damaged classes into a single TrafficSigns label. Preserve/recover raw condition labels via the mapping and manually check damage; do not label every crop damaged. There are636OCcrops derived from sources containing a damaged sign, but that is NOT636verified damaged crops. Eight previews from distinct source components were downloaded and inspected. They show much closer signs, with graffiti/defacement visible in some, but several appear healthy or only subtly affected. This confirms the need for label recovery and manual filtering.

Review files: `artifacts/dataset-research-2026-10-20/sign-source-boxes.csv`, `sign-crops.csv`, and `sign-preview/contact-sheet.jpg` plus preview provenance. No preview was added to training. Keep raw photos and derived crops in the same source/similarity group. Full release382.7MB; download only the relevant traffic-sign resource, not unrelated Cityscapes/potted-plant data. Exact accepted close-damaged-image count is pending.

## Garbage — useful real-source options

[pLitterStreet data](https://zenodo.org/records/8288500), [creator GitHub](https://github.com/gicait/pLitter).

More than13000vehicle-mounted street-side photographs with COCO annotations; regional coverage includes Thailand,Vietnam,Sri Lanka. Official Zenodo API license verifiedCC BY4.0 and saved in research artifacts. Select close accumulated litter/piles, not every isolated bottle or healthy bin. Boxes can guide context-preserving crops; keep crops with source frames. Photos13.7GB, annotations8.8MB, so inspect annotations/samples before any full transfer. This is a candidate source, not13000accepted uncollected-garbage incidents.

[Bangladesh urban illegal-dumping images](https://data.mendeley.com/datasets/rkh7nz2rcp/1).

Relevant positive/clean/critical-clean scene labels; licenseCC BY-NC4.0, so treat as noncommercial academic candidate, not unrestricted product data. Card says804original images but lists326positive+288negative+200critical-clean, summing814. It also describes3557images after training-only augmentation. Recount files and inspect actual ground-level/close views before use. Keep original and augmented identities grouped; do not count augmentation as independent evidence. No samples were visually certified in this review.

[StreetView-Waste author repository](https://github.com/DiogoJPaulo/StreetView-Waste).

Ground-level collection-vehicle fisheye images with overflow masks are relevant, but access requires a separate data-license agreement. MIT repository code does not grant rights to the photos. Conditional only; no agreement accepted or access request sent. Fisheye imagery differs from resident phone close-ups.

The existing GIGO source remains a defensible street-scene pool, but only visibly clear waste views/crops should be used. A photograph of bags or bulky waste does not establish missed collection scheduling.

## Flooding — filtered candidate pools, not wholesale imports

[European Flood2013 author repository](https://github.com/cvjena/eu-flood-dataset), [per-image metadata](https://raw.githubusercontent.com/cvjena/eu-flood-dataset/master/metadata.json).

3435Commons flood-event photographs have per-image author/license/source records. Another275pollution-search images must be excluded. Official montage includes a close flooded street/house view, elevated view and aerial view: the collection is mixed. Review individual Commons licenses and select close ground-level flooded public-space photographs only. Relevant-region annotations may help crops but cannot turn an aerial image into ground-level data. Exact eligible count unknown. Group repeated photographer/event/location views; compare Commons IDs against the existing pilot to avoid duplicates.

[FRED author dataset](https://huggingface.co/datasets/CMalone-Jupiter/FRED), [author code](https://github.com/AVR3-Training-Centre/python-FRED), [paper](https://arxiv.org/html/2605.22018v1).

Vehicle front/rear ground imagery, flooded and dry sequences across5Brisbane sites; approximately5340multimodal samples, not a verified flood-positive count. DatasetCC BY-NC-SA4.0, separate from BSD code; HF agreement/profile-sharing gate. Inspected author examples include distant flooding and a clearer road-flood view. Conditional supplement only, not guaranteed close phone photos. No agreement accepted. Keep adjacent frames/site/events together; exclude ordinary puddles/streams that do not fit the incident category.

## Fallen trees — unresolved scale gap

[Commons roads/paths blocked by fallen trees or branches](https://commons.wikimedia.org/wiki/Category:Roads_and_paths_blocked_by_fallen_trees_or_branches) lists125direct files plus subcategories. This is a candidate pool, not125accepted close photographs. Expand the existing17reviewed Commons images using per-file rights, actual fallen obstruction, close viewpoint and duplicate checks. No stronger unrestricted ready-to-use new fallen-tree corpus was verified in this search.

Roboflow Fallen Trees On Road has234project originals and546augmented v2outputs, but labels Roads/Trees do not establish fallen obstruction. A reviewed example was an app screenshot with a largely standing/leaning tree. Do not import wholesale based on the CC BY badge. Existing downloaded Hazard Detection63-image archive also needs individual source/viewpoint review before any use.

## GitHub reuse decisions

- Use creator repositories above for label formats, source mapping, grouping and annotation examples. Our existing classifier already compares the requested architectures; no framework replacement is necessary.
- [RDD2022 creator project](https://github.com/sekilab/RoadDamageDetector) is a secondary pothole source; filterD40 only and reject China_Drone and USGoogleStreetView. Official [Figshare image deposit](https://figshare.com/articles/dataset/RDD2022_-_The_multi-national_Road_Damage_Dataset_released_through_CRDDC_2022/21431547) currently statesCC BY4.0, while repository code isMIT. Some mirrors claim different licenses; preserve the exact primary deposit terms for the chosen version.47420total images is not a usable pothole count.
- [ECEM-YOLO/RFDD](https://github.com/zdpf122/ECEM-YOLO-RoadDefect) has damage classes and statesMITcode/CC BY-SA4data. Added-sign original provenance and camera distance still need review; not first priority over author-owned sign data.
- [Synthetic-Traffic-Sign-Data](https://github.com/BunningsWarehouseOfficial/Synthetic-Traffic-Sign-Data) is an optional augmentation research reference, not real test evidence. Its background/template inputs need their own rights review. No generator installed or executed.
- [Roadside waste mapping](https://github.com/hcu-cml/roadside-waste-detection-mapping) uses a heavy segmentation/depth stack and gated model weights; it adds complexity beyond this project's current need. Do not adopt it as a quick replacement or infer image permission from itsMITcode.
- [Road-Sign-Damage-Detection](https://github.com/Vedant417/Road-Sign-Damage-Detection) has no verified permissive image license in its educational-purpose notice. Do not copy its data/checkpoints or treat image blur heuristics as verified physical damage.

## Close-view and synthetic policy

1. Inspect actual photographs at intended model resolution. The damaged area must remain visible after resizing. Prefer original close shots; use clearly recorded context-preserving crops only when the original has adequate detail. Never crop away source rights problems.
2. Retain a mix of close and medium ground-level views so the model can handle actual resident framing. Do not zoom digitally and count every crop as a new incident.
3. Keep source, crop, video, photographer/event and near-duplicate groups in one partition. Preserve existing test isolation and never tune using the tiny pilot test results.
4. User permits AI-generated images if real sources cannot cover a gap. Mark synthetic images explicitly with generation provenance and known synthetic group IDs. Use them as a supplementary training-only experiment. Keep validation/test entirely real; do not invent incident metadata, consent records or field-performance claims.
5. Compare real-only training against real+synthetic using the same unseen real evaluation collection before adopting synthetic data. Do not assume photorealistic generation improves performance.

Next acquisition priority: inspect the Kent phone-photo archive and map/filter author-owned raw damaged-sign boxes into close crops. Then sample flood and garbage sources under their specific terms; continue per-file Commons collection for fallen trees. All counts above distinguish source size from reviewed usable images. No new training or app changes occurred in this research task.
