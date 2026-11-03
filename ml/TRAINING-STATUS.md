## Tree repair completed — 20 October 2026 (latest; supersedes running notes below)

All four local CPU comparisons completed on the corrected **199-image** package, 155/18/26 split. Both architectures ran 10 epochs in none/balanced conditions. All validation macro F1 scores are 1.0; predefined ties select unweighted EfficientNet-B0. Test results: none EfficientNet 24/26, tree 1/2; none MobileNet 26/26, tree 2/2; balanced EfficientNet 25/26, tree 1/2; balanced MobileNet 25/26, tree 2/2 with one tree false alarm. Test scores did not change selection.

The selected candidate and existing v3 each score 10/12 on the reserved Philippine diagnostic. Candidate labels both garbage photos as trees; v3 has one tree false alarm. At unchanged 0.8 cutoff candidate accepts zero suggestions, versus four correct v3 suggestions; neither accepts a tree suggestion. All four diagnostic trees are one storm event; no potholes evaluated. No tuning used these photos. **Retain v3 in the local demo**; replacement is not justified by this evidence.

Image/split preservation, all four checkpoint hashes/metadata, class weights, histories and CSV metrics verified. Selected API preprocessing replay matches all 44 validation/test predictions within 1e-5 probability tolerance. Reserved metrics independently recomputed. Focused inference/ML tests: 21 passed. Checkpoints omit saved epoch/optimizer/RNG state; histories support completion. See [complete v4 report](TRAINING-RESULTS-V4-2026-10-20.md), private `verification-both.json` and `final-audit.json`. No training remains active; the PID file is historical. Earlier 201-image Kaggle input remains obsolete.

Remaining gates: diverse independent event data, fresh field evaluation and calibration, physical-phone camera/gallery/GPS, live provider privacy/database checks, hosting measurements and authorized deployment, human language/user evaluation and retention decision. No paid compute, billing, commit, push, deployment or model replacement occurred.

## Tree repair resumed - 20 October 2026 (historical)

Browser access restored and Kaggle Draft Session off confirmed. The old private Kaggle Tree Repair v4 dataset has the superseded201-image package, including two final rejects. Do not use its old run as final evidence. Correct local package is training-v4-final:199images,155train/18val/26test,32trainingtrees. Final27newtreeframes accepted from63reviewed; whole source group training-only. All172previousrecords/placements preserved. SplitSHA256 b5e6d35e4bcd8ebc1afe324e87c57dc202337b3cce0ae2e0a24184e70202e607.

Class weighting and full-image EXIF-aware letterbox224 implemented;15MLtests pass. API supports letterbox224 version and rejects unknownpreprocessing. Currentapp still usesv3checkpoint. LocalCPU comparison runs none/balanced weighting for botharchitectures10epochs, seed42,batch16; choose onlyvalidationmacroF1 with deterministicties. Run script artifacts/tree-reliability-2026-10-20/run_comparison.py; stdout/stderr logs and training.pid alongside. No newmetrics claimed until completed outputs exist.

Reservedlocal-evaluation has12realPhilippinephotos (fourtrees/oneVamcoevent,fivefloods,twogarbage,onesign); nevertraining/modelselection. Noexact/source/groupoverlap orperceptualflags againstv3. No localpotholeevaluation dueambiguouscause/unknownmunicipality exclusions. V3baseline10/12correct,tree4/4 buttwogarbagewrong; this is a small diagnostic, notfieldvalidation. Newmodels await finaldiagnostic aftervalidationselection. Do not tuneagainstlocaltest.

No paidcompute,billing,commit,push,deployment orreplacementmodelactivation.

## Local model integration - 20 October 2026

CPU Torch 2.11.0 and TorchVision 0.26.0 are installed in the ignored project .venv. The reviewed EfficientNet checkpoint loads with its approved SHA-256 and matching preprocessing. The real-checkpoint API test passed with a synthetic photo: preview, manual resident category, private saved image and access denied after logout. Runtime forward errors now return an unavailable prediction while manual reporting succeeds. Invalid hashes, configuration and dependencies still prevent startup.

The standard API suite passed 91 tests, with the opt-in model test skipped. The separate real-model and focused inference suite passed six tests. The website production build passed. The local presentation launcher, deploy/start-local.ps1, serves the built website and API with two CPU threads and a demo-only 0.8 cutoff. This cutoff is not calibrated. No embedding quality is claimed. Review caught a remote-environment risk in the launcher; it now always uses the local SQLite database and local private image folder, overriding inherited remote storage settings.

Browser smoke passed on http://127.0.0.1:8001: synthetic photo selection and preview, real model response showing uncertainty, manual category, successful submission and history with separate resident/model/verified categories. Evidence: artifacts/model-integration-2026-10-20/resident-report-proof.png. An older server occupies port 8000 and was left running. The model-enabled server remains on port 8001.

No retraining, public deployment, paid service, commit or push occurred. Independent Philippine evaluation, known tree failures, deployment-host measurements and physical-phone tests remain outstanding.

# Latest training state — 20 October 2026, completed v3

Both models completed10epochs on freeKaggleT4 using172reviewedimages,128train/18val/26test. Each scored24/26test,macroF1.75 andvalidationmacroF1 1.0; existingtie-breakselectedEfficientNet. Bothmissed2/2trees asfloods. Tiny/reuseddevelopmentholdouts; NOTPhilippinefieldaccuracy. SixRoboflowtrainingcrops added; extra21duplicateexcluded;166oldplacementsunchanged. Separate15localcandidates unassigned/outside run. Predictions independently recomputed, ZIPCRC/checkpointsizes/frozensplit matched. PrivateQuickSavev2 withoutputs saved anddownloaded. DraftSession explicitlystopped; UIGPUoff confirmed. Fulfilledresumeautomationdeleted. No paidcompute/billing, deployment, modelactivation, commit/push. LocalAPIcheckpointloading/hostingbenchmarks andindependentlocalevaluation remainoutstanding. See [v3results](TRAINING-RESULTS-V3-2026-10-20.md). Earlier notes below are historical.

---
> **Current:** Foreign supplementary data authorized. Roboflow smark ZIP downloaded, SHA256/CRC checked; 24 candidates reviewed, 3 entered a validated candidate manifest. Fifteen Philippine candidates cover all five classes. No new training. Pause at 1% remaining; reported reset20October2026 at20:30:22Asia/Manila.

# Training status — 20 October 2026

## Latest user correction and acquisition — supersedes older source gates

The user explicitly permits non-Philippine training data and specifically approved smark's Roboflow `road-potholes-and-cracks-jmxtp` dataset as supplementary. Country verification is required only for claiming Philippine origin; unknown country does not itself block supplementary inclusion. Keep uploader-declared CC BY 4.0 attribution and review actual images/labels.

Official UI COCO export version 6 completed: **566,213,926 bytes**, SHA256 `65da88930d67e29b9d79d83f99f8bf39ca2237869a197b53cfc2af6d58566c4d`, ZIP CRC passed. Saved in `artifacts/dataset-expansion-2026-10-20/roboflow-smark/`. Inventoried 4,682 augmented images, 4,101 train / 386 validation / 195 test, and 10,895 annotations; source project lists 1,948 images. Reviewed 24 pothole candidates; three clear full-source/crop candidates passed manifest validation. Other samples include severe noise, cracks, TV/news logos and infographic overlays; exclude these. Original capture country/photographers are unknown. No paid training, account change, upload or model activation occurred. Do not equate generated copies or generic filename prefixes with independent scenes.

Next: review cleaner variants/more clear positives, exclude unpermitted overlays, check cross-source duplicates, preserve existing frozen holdouts and prepare a supplementary training expansion. The dataset has been acquired and sampled, not fully curated or trained. See its private README and inventory. Continue at the five-hour reset if usage reaches 1%; reported reset20October2026 at20:30:22Asia/Manila.

Meanwhile `artifacts/dataset-expansion-2026-10-20/philippine-current/` contains **15 validated real Philippine candidates across all five classes**, eight conservative groups: floods 6, trees 4, garbage 2, potholes 2, damaged signage 1. File paths/hashes and empty derivative EXIF passed. No split assigned. One Flickr pothole photograph is CC BY-NC 2.0 for noncommercial academic use; its municipality is unknown and it is training-only. Existing Davao/Calumpit pilot images remain separate. No new training run; prior metrics unchanged. Older statements that pothole/sign positives remain zero are historical.

## Completed

- User-requested scheduled resume task deleted. Do not recreate it without another request. Keep the user's pause-at1%-remaining usage rule for future work.
- Ground-level-only pilot:75reviewed photos across allfiveclasses;47train/9validation/19test. Aerial flood and watermarked Kaggle samples excluded. Attribution, rights records, derived event groups, image hashes and original GIGO test placement preserved.
- Private Kaggle dataset `reddelmundo/barangai-ground-level-pilot` uploaded and attached. Runtime validated all75images and the frozen split.
- EfficientNet-B0 and MobileNetV3-Large each completed10realepochs on freeTeslaT4GPU. Python3.13.15/Torch2.11.0/TorchVision0.26.0/CUDA12.8 recorded. No paid service or billing.
- EfficientNet-B0 selected by validationmacroF1:0.5800. Test14/19correct; macroF1:0.5528. MobileNetV3-Large validationmacroF1:0.5314; test6/19correct; macroF1:0.4535.
- Downloaded both checkpoints, actual results, validation/test probabilities, environment and frozen split into `artifacts/training/2026-10-20-ground-level-pilot/`. ZIPCRC, checkpoint sizes and splitdigest checked.
- Kaggle private notebook QuickSave version1 completed. Session explicitly stopped and UI confirmed DraftSessionoff. No training remains running.

## Interpretation and remaining work

This is a tiny training smoke experiment, not reliable production accuracy. EfficientNet-B0 missed the sole held-out pothole and2/3held-out flood examples; confidence is low. No production threshold was calibrated, no localAPI model was activated and no deployment occurred. Next useful work is more diverse permitted ground-level data and independent local evaluation; extra epochs alone do not resolve sample limitations.

Full results and reproducibility: [TRAINING-RESULTS-2026-10-20.md](TRAINING-RESULTS-2026-10-20.md).

Local Torch/TorchVision is not installed. Real checkpoint loading in the local API and deployment-host memory/latency remain untested. Kaggle CPU timings are not hosting benchmarks. Existing resident categorization and staff verification remain necessary.

Private notebook: https://www.kaggle.com/code/reddelmundo/barangai-watch-model-training

Staging root: a private local folder on the training machine, outside the repository.

No commit, push, public publication or deployment was performed. Historical acquisition/handoff notes retained privately in the training artifact directory.

## Closer-photo expansion and Philippine priority — 20 October 2026

User now prioritizes genuinely Philippine photos, with close ground-level views. Foreign sources are supplementary; do not label imported foreign photos as Philippine. No new training was launched after this correction.

Prepared local `artifacts/dataset-expansion-2026-10-20/close-set-v2/`:166real closer photos (93UKpotholes,22author-owned damagedsign crops,27flooding,16GIGOgarbage,8trees). Project read_split validator passed with allfiveclasses in eachpartition; original holdouts preserved, EU2013regional flood alltraining. Frozen splitdigest05af43db6a0e66dbf361e1b47b6f3239db18a5dd8b96ac3ce1ce4e1c382c8983. This set is SUPPLEMENTARY INTERNATIONAL, not Philippine dataset or evidence of localperformance. Packaged ZIP exists but is not uploaded/trained. Private provenance/source+derivativehashes/cropcoords retained; only metadata-stripped derivatives in export.

Sign archive382703107bytes publishedSHA256 verified e1e162d114cfe14b209ab7614511524b0c558db72935d3e32c096f87150aff86. Reviewed96rawbox crops; accepted22/rejected74 because many source damage labels are healthy-looking or degraded photos. Kept obviousgraffiti/bending/broken/fallenboards. Kent713original photographs/annotations CRC+sizechecked, selected93close candidates; source663uniquehashes/1157boxes/4invalidboxes. FullKentarchiveSHA256 stillpending:214/278chunks cached224395264bytes; acquire_official.py resumes. No source scripts executed.

Philippine leads found: Roboflow AsifProjects Road-Pothole-Audit-Philippines204images CC BY4declared, but title alone does not verify locations/originalownership/closeviews. University2026paper RoadDamageDetection...PhilippineRoadConditions reports3033local images, but public image release/rights notverified. ProjectSBAFN GitHub islocalflood-risk metadata/features; no redistributable street photos, so notdirectincidentphoto data. Commons has documented localDavaoOriental Bopha2012fallen-roadtrees CC BY2 (SonnyDay), SanRafaelBulacan downedtreesCC0, and Navotas/Bacolor garbage candidatecollections. Eachimage stillneedsclosegroundview/license/location/eventreview; managedlandfill/collectionphotos mustnotbe mislabeled uncollectedstreetgarbage. Existing3CalumpitBulacan floodphotos arelocal butoneevent. Damaged-sign Philippine source notyetverified.

Next: prioritize Philippine image acquisition/verification and hold out real local evaluation. Keep existing166set as supplementary only. No scheduled task remains; do not recreate. No new training/upload/deploy/commit/push.

## Philippine acquisition after the five-hour reset — latest

Resumed after usage reset; deleted `resume-barangai-after-five-hour-usage-reset` once fulfilled. This supersedes the earlier scheduling notes. No GPU session is running.

Saved `artifacts/dataset-expansion-2026-10-20/philippine-reviewed/`: **12 new real Philippine images**, six flooding, four fallen trees and two accumulated roadside garbage. Source records, actual visual decisions, crop coordinates, attribution and source/derivative hashes are preserved. Project manifest validation passed all twelve file paths and SHA256 values; accepted derivatives have no EXIF. Related views share conservative groups. The country-only flood has municipality unknown and is restricted to a training candidate, excluded from local evaluation.

Not included in that count: previous Davao tree and three Calumpit pilot floods. Separate references: one healthy Benguet sign, three unlabeled Navotas shoreline-waste crops. Local pothole and damaged-sign positives remain zero; no rights or origin inferred from repository licenses, titles or badges. No synthetic data was generated.

No train/validation/test split assigned and no new upload/training run. This is a partial collection, not complete local coverage or verified field accuracy. More independent local photos are necessary, especially potholes and visibly damaged signs. See [PHILIPPINE-DATASET-SOURCES.md](PHILIPPINE-DATASET-SOURCES.md) and private per-source reviews for actual gates. Prior pilot metrics and model activation status are unchanged.

## Paused at 1% remaining — 20 October 2026
Usage reached99%used. Resume after20:30:22Asia/Manila; schedule20:31. Roboflow ZIP complete/CRC+SHA256verified. First24review:3manifestcandidatesvalidated. Additional24crops actually viewed in contact-extra24.jpg; full sources4,6,19,21 inspected in full-source-extra-contact.jpg and look clear, but NOT yet entered into accepted manifest. Extra source4/6/19/21 have no visible watermark in inspected full context; record licensing as uploader-declared CC BY4, country unknown, no fabricated originalphotographer/event. Next resume finish these decisions, prefer cleaner siblings, check actual/similar duplicates against166set, preserve previous holdouts, then prepare supplementary training data. Unknown country alone is allowed by latest direct user correction. Local15collection validated, allfiveclasses; no new training run or upload. No paid compute/billing, commit, push, publication or deployment. Resume should stay quiet unless meaningful progress or needed action. Pause again at1%.

## Resumed 20 October 2026 at 20:31 Manila — supplementary v3 prepared

Usage reset confirmed; fulfilled one-time resume automation deleted. Reviewed 48 Roboflow crops and source frames. Six retained: sample6,11,17 and extra4,6,19. Extra21 is a visually confirmed mirrored/resized duplicate of an existing v2 training photograph and excluded. Byte/decoded-image and perceptual screening flagged no selected overlap with the 28 frozen pilot holdouts; heuristic screening does not prove independent events. Whole smark source collection remains training-only under one conservative group; country and original photographers unknown, rights uploader-declared CC BY4.0.

Prepared close-set-v3:172 images (99 potholes,22 signs,27 floods,16 garbage,8 trees),128 train/18 validation/26 test. All166 v2 manifest records and split placements preserved by CSV readback comparison. Actual files/hashes, empty derivative EXIF and project read_split validation passed. Frozen split SHA256 cff3bcaaf1a983759c6d09da6934b1b76ee21b95e38aa18f69c25a8acbe01e04. ZIP34371515bytes, SHA256 a7b370cdde2a18558efc313afaf7aeb0bc2a10887c2836ffbac7171bd7507165, CRC passed. Separate15 Philippine candidates remain unassigned and excluded from this package. Mixed per-image attribution retained. Dataset uploaded as private BarangAI Close Ground Level v3 on Kaggle; attaching to existing private notebook. No new training metrics yet. No model activation, paid compute, deployment, commit or push.

Private Kaggle run started after v3 upload. Runtime verified the exact172 images,128/18/26 placements and expected split hash. Free Tesla T4 available, original pinned environment. Both architectures configured for10epochs, seed42/batch16/AdamW1e-4, existing reviewed source archive unchanged. EfficientNet has reached epoch9; MobileNet pending. Run is in progress: do not quote prior pilot outputs as new results. Save actual result archive/private version and explicitly stop DraftSession after completion. No localAPI activation.

