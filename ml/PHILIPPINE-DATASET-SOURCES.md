# Philippine-first dataset review — 20 October 2026

Priority: close, ground-level photographs. The user explicitly confirmed that non-Philippine data is acceptable for training; verified local photographs add regional examples. Keep source country unknown when it is not documented. No sufficiently diverse Philippine evaluation corpus has been verified.

## Latest collection and revised source scope

`artifacts/dataset-expansion-2026-10-20/philippine-current/` now consolidates **15 real Philippine photo candidates**: six floods, four fallen trees, two roadside garbage views, two potholes and one damaged sign. All fifteen paths/hashes passed the project manifest loader; derivatives contain no EXIF. Eight conservative related-view groups, split unassigned. Prior Davao/Calumpit photographs are kept separate and not counted again. This is still too small for credible local evaluation.

New sources: Judgefloro's own-work CC0 Plaridel road pit; Judgefloro's public-domain Santa Cruz, Manila street sign with substantial peeling lettering; and [jen del's Nueva Ecija pothole photograph](https://www.flickr.com/photos/jenniedel/3925803044/), CC BY-NC 2.0, restricted to noncommercial academic use with attribution. Original context and native foreground crops were visually reviewed. No damage cause, municipal incident identity or staff verification is asserted. The Nueva Ecija municipality is unknown and its photograph is a training-only candidate.

The user-requested Google Images search was performed, including its Creative Commons filter and original-source checks. Further photographer-owned Flickr images were reviewed. Copyright notices and location evidence are recorded per source. PNA's published terms did not establish permission for the proposed adapted training dataset; the DPWH original requested a CAPTCHA. Those leads were not imported. KartaView supplied seventeen geotagged Manila previews, but none was accepted as a clear positive in that sample.

The user specifically approved using [smark's road potholes and cracks dataset](https://universe.roboflow.com/smark-z7pr6/road-potholes-and-cracks-jmxtp) as supplementary data despite unverified country. Its page declares CC BY 4.0 and 1,948 source images. Export version 6 contains 4,682 augmented images with a 4,101/386/195 supplied split. A COCO ZIP download was started through the official UI without paid training. **ZIP acquisition is complete: 566,213,926 bytes, SHA256/CRC verified. Twenty-four candidate crops reviewed; three clear crops passed manifest validation. Full curation/duplicate review and training remain pending.** Review annotations and representative images; group augmentation/source siblings and duplicates before any new split or training. Do not call all 4,682 images independent photographs or label them Philippine. No pretrained segmentation model has been activated in the app.

The 166-image international collection remains available; foreign origin alone is not an exclusion. New model training has not run.

## First acquisition after the usage reset — preserved twelve-image batch

Saved privately in `artifacts/dataset-expansion-2026-10-20/philippine-reviewed/`:

| Class | New accepted photographs | Evidence and limits |
| --- | ---: | --- |
| Flooding | 6 | Samar, Pampanga, Guiguinto and a source identifying only the Philippines. Country-only photo is a training candidate; municipality unknown, excluded from local evaluation. Repeated Pampanga views share a group. |
| Fallen trees | 4 | San Rafael/Baliuag, Bulacan; visible fallen or uprooted trees. All Vamco-related views conservatively share one event group. Source capture dates remain separate from storm dates. |
| Accumulated roadside garbage | 2 | Layunan, Binangonan, Rizal; CC0, Judgefloro. Close bagged waste on a public sidewalk, one related-view group. Missed pickup and duration are not established. |
| Potholes | 0 | No reviewed source yet establishes usable photographs with both Philippine provenance and reuse rights. |
| Damaged signage | 0 | One licensed Benguet sign was readable and functional; kept as a healthy reference, not a positive. |

The existing Davao Oriental fallen-tree photograph and three Calumpit pilot floods are **not** counted as new acquisitions. Three Navotas shoreline refuse crops are separate supplemental candidates, excluded from positive class labels. Other rejected photos include elevated/distant floods, people obscuring the incident, river-only scenes, standing stumps, bark-only views and redundant images.

`manifest.csv` contains accepted metadata-stripped derivatives with attribution, source URLs, conservative related-view groups and actual SHA256. The existing project manifest validator verified all twelve files, paths and hashes; all accepted derivatives have no EXIF. Per-source reviews retain original metadata, rights records, crop coordinates and rejection reasons. Public image licensing is not a claim of resident/subject consent. No synthetic photographs were created.

No train/validation/test split is assigned. This partial collection is not twelve independent incidents, a complete local dataset or proof of Philippine field accuracy. Source-selection images are reviewed acquisition candidates; a future independent local evaluation must be frozen before training or model selection.

## Source records and remaining gates

- **Flood/tree:** per-file Commons source URLs, author/rights evidence, locations and actual crop review are saved in the private `philippine-flood-tree` folder. The prior [Davao Oriental Bopha photograph](https://commons.wikimedia.org/wiki/File:Sitio_Manat_highway,_Boston,_Davao_Oriental_after_Typhoon_Pablo_(Bopha)_-_Flickr.jpg), Sonny Day, CC BY 2.0, remains in `philippine-priority/`. [San Rafael source example](https://commons.wikimedia.org/wiki/File:2485Trees_downed_by_Typhoon_Vamco_(2020)_in_San_Rafael,_Bulacan_02.jpg) identifies local downed trees, but its published 2021 capture metadata must not be changed to 2020.
- **Garbage:** [Layunan photograph 46](https://commons.wikimedia.org/wiki/File:9316Layunan,_Binangonan,_Rizal_46.jpg) and [photograph 48](https://commons.wikimedia.org/wiki/File:9316Layunan,_Binangonan,_Rizal_48.jpg), Judgefloro, CC0, capture metadata 3 April 2019. Author location descriptions identify Layunan. Source and derivative hashes and exact crops are retained. [Navotas collection](https://commons.wikimedia.org/wiki/Category:Garbages_-_Punduhan_ng_Tangos,_Navotas_City) shows shoreline waste; its title does not establish uncollected street garbage.
- **Potholes:** [Road-Pothole-Audit-Philippines](https://universe.roboflow.com/asifprojects/road-pothole-audit-philippines) lists 204 images and CC BY 4.0, but no published collection description establishes Philippine capture locations or original ownership. A title/license badge is insufficient. The [2026 road-damage study](https://doi.org/10.1109/CICN70047.2026.11594244) reports 3,033 local road images across multiple damage types; an accessible original image release and reuse license remain unverified. These are leads, not accepted datasets.
- **Signage:** [Ampucao–Sta. Fe Ridge sign](https://commons.wikimedia.org/wiki/File:Welcome_Signboard_at_the_Ampucao%E2%80%93Sta._Fe_Ridge_Trail.jpg), MikelleBandin, own work, CC BY-SA 4.0. Official SHA1 matched the 8,830,754-byte original. Actual visual inspection found an intact readable board with ordinary wear, so it is a healthy reference only. Source EXIF/GPS is private provenance, not a model export.
- **GitHub:** [Project SBAFN](https://github.com/KubangPawis/project-sbafn) provides Philippine flood-risk features/metadata, not the needed redistributable ground photographs. An open-source code license alone does not grant third-party image rights. Intramuros Street View derivatives and foreign photo collections do not resolve the local rights/provenance requirement.

Practical next input: a collector-authored Philippine pothole/sign release with image permissions, or consented close local photographs. More independent local groups are also needed for the three partially covered classes. Contacting researchers or owners requires direct authorization; no messages were sent.

## Training and usage

No new upload, retraining, public publication, commit, push or deployment occurred. The 75-image pilot results remain unchanged; the 166-image international close-set remains supplementary and untrained. Synthetic fallback, if used later, must be explicitly synthetic training-only and cannot fill real local validation/test gaps.

The five-hour usage reset was confirmed and this acquisition resumed. Its one-time automation was deleted after fulfillment. Continue respecting the user's pause at 1% remaining rule. No GPU session is running.
