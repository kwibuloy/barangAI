# Public dataset shortlist and Kaggle training

Checked 20 October 2026. Public datasets can supply training images; locally collected photos are not the only route. An uploader's license label is a starting point for checking the underlying image rights, not proof that every scraped image is cleared.

| Category | Candidate | Fit and remaining review |
| --- | --- | --- |
| Flooding | [Flood Area Segmentation](https://www.kaggle.com/datasets/faizalkarim/flood-area-segmentation) | Card lists 290 flood images plus masks and CC0. For classification use source photographs, not masks. Inspect image origin and ground-level relevance; do not assume all are Philippine phone scenes. |
| Potholes | [Annotated Potholes Image Dataset](https://www.kaggle.com/dsv/973710) | Potholes with bounding-box annotations. Card lists Open Database/Database Contents licensing. Review the linked terms and original image sources. Existing [RDD2022 source](https://github.com/sekilab/RoadDamageDetector) is another candidate; select pothole-positive D40 examples, not every cracked road. |
| Damaged signage | [Damaged Signs Dataset](https://www.kaggle.com/datasets/danielvareta/damaged-signs-dataset) | Title/description fit damaged signs; full license/provenance could not be verified through the accessible card. Candidate, not approved for import. |
| Garbage scenes | [Domestic Trash/Garbage](https://www.kaggle.com/datasets/dataclusterlabs/domestic-trash-garbage-dataset) | Original [owner repository](https://github.com/datacluster-labs/Domestic-Trash-Garbage-Dataset) distinguishes a Kaggle sample from the full dataset requiring contact. Review sample terms. Select genuinely accumulated/uncollected waste, not isolated recyclable-item photos. |
| Multiple relevant classes | [Road Issues Detection](https://www.kaggle.com/datasets/programmerrdai/road-issues-detection-dataset) | Broken signs, potholes and public-place garbage; card claims CC0. Its [source card](https://huggingface.co/datasets/Programmer-RD-AI/road-issues-detection-dataset/blob/main/README.md) lists mixed sources, so check upstream rights and duplicates before merging. |
| Fallen trees | No suitable Kaggle source verified in the bounded search | Continue source research or collect safely photographed, permitted local fallen-tree examples. Healthy standing-tree datasets do not represent this class. |

No candidate images have been downloaded, relabeled, combined or approved by this research step. No model has been trained.

## Add images to this project

Keep original photos outside Git, under a private dataset directory. Use the five exact category names from the README. Make `manifest.csv` using [manifest.example.csv](manifest.example.csv); each row needs a relative file path, category, incident ID, source/permission reference, creator, image license, attribution, location/photographer references and original SHA-256. Record unknown provenance as unresolved in a separate review sheet; do not invent metadata to satisfy the validator.

Review labels, remove exact/near duplicates, and keep photos of the same incident in one group. Dataset masks, annotations, logos and previews are not training photographs. Keep an unseen Philippine test collection separate from source selection and threshold tuning. Permission records remain private.

The training layout expected by the notebook is:

```text
barangai-five-class/
  manifest.csv
  images/
    flooding/
    potholes/
    fallen_trees/
    uncollected_garbage/
    damaged_signage/
```

## Run the prepared notebook

1. Import [train-on-kaggle.ipynb](notebooks/train-on-kaggle.ipynb) into a private Kaggle notebook. Select an available free GPU in Settings and enable Internet for dependencies and pretrained weights. GPU availability is subject to Kaggle limits; do not link paid cloud services.
2. Upload the local `artifacts/kaggle-training-code.zip` as a private Kaggle dataset and attach it. The archive contains only this project's training source and requirements, not photos or credentials. Regenerate it from current `ml/barangai_ml` sources if those change.
3. Attach the reviewed five-class dataset. Set `DATASET_DIR` to its actual Kaggle mount path.
4. Run all cells. The existing pipeline validates the manifest, freezes incident-grouped splits, fine-tunes EfficientNet-B0 and MobileNetV3-Large on the same split and selects validation checkpoints. Ten starting epochs are an experiment setting, not an accuracy guarantee.
5. Save a version with output and download `barangai-training-results.zip`. Review metrics, confidence exports, class errors and CPU latency. Select thresholds using validation data, then report held-out test performance without retuning.
6. Review and benchmark the chosen checkpoint on the real web host before enabling the API. GPU training and web deployment are separate steps.

The notebook's Python cells were syntax checked and the code archive was integrity checked locally. Kaggle execution, real image review and training remain unperformed. [Official Kaggle notebook instructions](https://www.kaggle.com/docs/notebooks) describe attaching data and selecting GPU accelerators.

## Acquisition review correction — 20 October 2026

User requires ground-level photos for every class. Do not use the aerial Flood Area Segmentation archive. Reviewed sheets include stock/news watermarks; its uploader CC0 label does not clear those underlying images. The Daniel Vareta sign sample contains Google Street View controls. The annotated pothole sample contains Dreamstime/Getty/copyright watermarks. All three source samples are quarantined rather than accepted under blanket uploader declarations.

Ground-level replacements with individual Wikimedia Commons license/creator/source records are staged for flooding(13), potholes(6), damaged signs(23) and fallen trees(17). GIGO contributes100licensed street-level garbage-scene candidates, still needing final category/crop selection. These are small public-source pilot candidates, not evidence of Philippine production accuracy. Per-file metadata, accepted/rejected decisions, hashes and attribution are retained in the training staging directory recorded in TRAINING-STATUS.md. No training results exist.

## Pilot execution completed

The reviewed75-image ground-level subset was privately uploaded and both models completed10epochs. Earlier no-training statements describe their acquisition stage. See TRAINING-RESULTS-2026-10-20.md for actual metrics and limitations. No aerial or quarantined source photos were used.

## New close-view source review

See [Dataset expansion review](DATASET-EXPANSION-2026-10-20.md) for prioritized phone potholes, author-owned damaged-sign crops, street-waste sources, filtered flood sources and remaining fallen-tree gap. It records image-specific license evidence, close-view/sample findings, source-vs-accepted counts and user-authorized synthetic-training-only fallback. No new candidate source was bulk-imported or trained.
