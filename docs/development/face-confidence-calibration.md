# Face confidence calibration

ArcFace produces a normalized-embedding cosine similarity score, not a probability. This page describes how to convert that score into a calibrated confidence value suitable for the authority gate, how to prepare and validate a calibration dataset, and what happens at runtime when a calibration artifact is missing or incompatible.

## Why calibration matters

Cosine similarity from ArcFace is not directly comparable to a probability: a score of 0.80 does not mean "80% chance this is the same person." The value depends on the embedding distribution, the training set, and the preprocessing pipeline in use. Treating similarity as probability leads to miscalibrated authority decisions and inconsistent confidence across deployments.

The calibration toolchain maps raw similarity to a calibrated probability using a reproducible fit on labeled face pairs. The runtime reads a versioned artifact and applies the mapping on every recognized face. If no valid artifact exists, the service starts in `degraded_missing` state and returns `calibrated_confidence: null` in every response. The CTS authority gate reads `calibrated_confidence` and denies authority on null.

## Calibration health states

The person identification service exposes four health states. Any degraded state yields `calibrated_confidence: null`.

| State | Cause |
| --- | --- |
| `ready` | Artifact loaded, validated, and version-compatible |
| `degraded_missing` | No `calibration.artifact_path` configured, or the file is absent |
| `degraded_incompatible` | Artifact versions do not match `arcface_model_version`, `model_profile`, or `preprocessing_version` |
| `degraded_invalid` | Artifact fails schema validation, finiteness checks, or monotonicity checks |

The current state appears in `GET /health` under the `calibration` key and is exported as the Prometheus gauge `pid_calibration_health_state` with a bounded label set covering all four states.

## Dataset design

Use labeled same-person and different-person face pairs. Each pair must carry a `similarity` score, a binary `label` (1 for same, 0 for different), and an `identity_id` for the split validator.

```json
[
  {"similarity": 0.87, "label": 1, "identity_id": "person-001"},
  {"similarity": 0.31, "label": 0, "identity_id": "person-002"}
]
```

### Split requirements

The fitting toolchain enforces identity-disjoint splits: no identity may appear in more than one partition. The split validator rejects any overlap and reports all leaking identities before fitting begins.

- Fit, validation, and test partitions must be disjoint by identity.
- Use a baseline model dataset. Do not fit solely on household data.
- Use household examples only as a separate holdout set, not as fit or test data.
- Do not use inferred tracking labels. Use only labeled ground-truth pairs.
- Do not include pairs derived from adjacent frames within the same capture episode unless the episode is fully contained in one partition.

### Label provenance

Labels must come from confirmed same-person or different-person annotations. The correction workflow may add an unambiguous face to a calibration-candidate dataset as an explicit opt-in action, but this never touches ArcFace enrollment and is never automatic.

## Fitting a calibration artifact

Install the optional dependency group:

```bash
cd person-identification-service
uv sync --extra calibration-tools
```

Fit a logistic calibration artifact:

```bash
uv run --extra calibration-tools python -m app.calibration.cli fit \
  --pairs path/to/pairs.json \
  --output path/to/artifact.json \
  --method logistic \
  --arcface-model-version buffalo_l \
  --model-profile full \
  --preprocessing-version v1
```

The command prints dataset hashes, split counts, evaluation metrics, and a PASS or FAIL line for every gate. It writes the artifact only when all gates pass.

### Available methods

| Method | When to use |
| --- | --- |
| `logistic` | Default. Platt-style sigmoid calibration, one parameter per split. Use when the dataset is large enough for a well-conditioned logistic fit. |
| `isotonic` | Monotone piecewise-linear calibration. Use when the similarity distribution is non-linear and the dataset is large enough to avoid overfitting. |

### Acceptance gates

The toolchain enforces these gates before writing any artifact:

| Gate | Default threshold |
| --- | --- |
| Brier score (test split) | less than 0.10 |
| Log loss (test split) | less than 0.30 |
| ECE (10-bin, test split) | less than 0.05 |
| FMR at operating point (0.80) | less than 0.05 |
| Minimum fit pairs | 200 |
| Minimum validation pairs | 50 |
| Minimum test pairs | 50 |
| Minimum fit identities | 5 |

Override any gate with the corresponding flag (`--max-brier-score`, `--max-log-loss`, `--max-ece`, `--max-fmr`, `--min-fit-pairs`, `--operating-point`). A missing artifact is preferable to one with failed gates.

## Validating and inspecting an artifact

Validate schema, finiteness, and monotonicity without running inference:

```bash
uv run --extra calibration-tools python -m app.calibration.cli validate \
  --artifact path/to/artifact.json \
  --arcface-model-version buffalo_l \
  --model-profile full \
  --preprocessing-version v1
```

Pretty-print the manifest for audit:

```bash
uv run --extra calibration-tools python -m app.calibration.cli inspect \
  --artifact path/to/artifact.json
```

Evaluate against a held-out dataset:

```bash
uv run --extra calibration-tools python -m app.calibration.cli evaluate \
  --artifact path/to/artifact.json \
  --pairs path/to/holdout_pairs.json \
  --operating-point 0.80
```

## Runtime wiring

Point the service at the artifact by setting `CALIBRATION_ARTIFACT_PATH` in the environment or in `config/settings.yaml`:

```yaml
calibration:
  artifact_path: "${CALIBRATION_ARTIFACT_PATH:}"
  arcface_model_version: "${CALIBRATION_ARCFACE_MODEL_VERSION:buffalo_l}"
  preprocessing_version: "${CALIBRATION_PREPROCESSING_VERSION:v1}"
```

The service validates version compatibility at startup. If the artifact was fitted with a different `arcface_model_version`, `model_profile`, or `preprocessing_version`, the evaluator starts in `degraded_incompatible` state and returns `calibrated_confidence: null` for every face.

The runtime evaluator uses only stdlib and NumPy, with no scikit-learn dependency. Logistic evaluation applies `1 / (1 + exp(-(coef * x + intercept)))`. Isotonic evaluation uses clamped linear interpolation over the fitted knots.

## Artifact format

Artifacts are versioned JSON files. No pickle or joblib. The artifact carries:

| Field | Description |
| --- | --- |
| `schema_version` | Integer schema version, currently 1 |
| `artifact_version` | UUID generated at fit time |
| `method` | `logistic` or `isotonic` |
| `arcface_model_version` | ArcFace model identifier, e.g. `buffalo_l` |
| `model_profile` | Model profile, e.g. `full` or `int8` |
| `preprocessing_version` | Preprocessing pipeline version, e.g. `v1` |
| `fitted_at` | ISO 8601 UTC timestamp |
| `random_seed` | Seed used for splitting and logistic regression |
| `fit_dataset_hash` | SHA-256 of the sorted fit partition for provenance |
| `val_dataset_hash` | SHA-256 of the sorted validation partition |
| `test_dataset_hash` | SHA-256 of the sorted test partition |
| `split_counts` | Pair and identity counts for each partition |
| `metrics` | Brier score, log loss, ECE, FMR, FNMR, and operating point on the test split |
| `coef` | Logistic coefficient (logistic method only) |
| `intercept` | Logistic intercept (logistic method only) |
| `x_knots` | Isotonic input knots in ascending order (isotonic method only) |
| `y_knots` | Isotonic output knots in `[0, 1]`, non-decreasing (isotonic method only) |

The JSON schema lives at `schemas/calibration_artifact.schema.json` in the `person-identification-service` repository.

## Response fields

`POST /identify` and `POST /identify-batch` include these calibration fields in every face detection:

| Field | Type | Description |
| --- | --- | --- |
| `raw_similarity` | float | Normalized-embedding cosine similarity. Alias of `similarity`. |
| `calibrated_confidence` | float or null | Calibrated ArcFace probability in `[0, 1]`. Null when the evaluator is in any degraded state, or for non-recognized faces. |
| `calibration_status` | string | One of the four health states. |
| `calibration_artifact_version` | string or null | UUID of the loaded artifact. Null when degraded. |
| `arcface_model_version` | string | Active model version from the service config. |
| `model_profile` | string | Active model profile from the service config. |
| `preprocessing_version` | string | Active preprocessing version from the service config. |

The raw-similarity `confidence` field was removed on 2026-10-20. `similarity` is the match score; `raw_similarity` remains as its alias for one release, so consumers read `raw_similarity` and fall back to `similarity`.

## Face quality

Every face the person-ID service returns also carries `quality`: a score in `[0, 1]`, the four components it was combined from, and the scorer `version` (`heuristic-v1`). It is computed only in the service (`app/services/face_quality.py`), because it needs the aligned face crop and the eye keypoints, which never leave the service.

| Component | Measures | Scores 0 at | Scores 1 at |
| --- | --- | --- | --- |
| `resolution` | Distance between the eyes, pixels | 10 px | 36 px |
| `sharpness` | Variance of the Laplacian of the aligned 112x112 crop (log10) | 20 | 300 |
| `detection` | SCRFD face detection score | 0.5 | 0.9 |
| `pitch` | Absolute head pitch, degrees | 45 | 15 |

The score is a weighted geometric mean, `resolution^0.45 * sharpness^0.25 * detection^0.15 * pitch^0.15`, with each component floored at 0.01. A geometric mean is used because a face that fails badly on one axis is unusable however good the others are: a sharp, frontal, 8 px face scores about 0.13. Head yaw is left out because the tracking orchestrator already applies a yaw frontality factor. The anchors and weights are set in `face_quality.heuristic` in the service's `config/settings.yaml`, and they are provisional until checked against labeled faces:

```bash
uv run --extra calibration-tools python scripts/calibrate_face_quality.py manifest.json
```

The manifest lists image files and the enrolled identity each shows. The script runs face detection directly (it never calls `/identify`, so it records no visitor sightings), reads enrolled centroids read-only, and prints each input's distribution, its Spearman correlation with raw similarity to the labeled identity, and suggested ramp anchors at the 5th and 95th percentiles. It never writes configuration. Changing an anchor or weight changes what the score means, so it ships as a new scorer version, and any calibration artifact or policy tuned on the old version must be re-checked.

## Measuring your cameras

Before fitting or trusting any calibration, check how large faces actually are on your cameras. Recognition accuracy depends mostly on the distance between the eyes in pixels: below about 16 px it is unreliable, 16 to 24 px is marginal, and above about 40 px the ArcFace template (roughly 35 px between the eyes) is already filled, so accuracy stops improving. On a wide-angle home camera that usually means faces are usable within 2 to 3 m.

Every face the person-ID service returns carries its size in pixels of the submitted image: `face_width_px`, `face_height_px`, and `interocular_px` (the distance between the two eye keypoints that face alignment uses, or `null` when it cannot be measured). The Continuous Tracking orchestrator records one row per face in `continuous_tracking.face_observation_stats` with these sizes, the detection score, head pose, the face quality score and version, raw similarity, recognition state, the closest enrolled identity id, and what the tracker did with the face (`emitted`, `dropped_min_similarity`, `dropped_no_candidate`, `dropped_no_detection`, `dropped_not_in_head_region`, or `dropped_ambiguous`). Rows hold no embeddings, crops, or names, and expire after 14 days.

Run the report from `continuous-tracking/tracking-orchestrator` after a week of normal activity:

```bash
DATABASE_URL=postgresql://... .venv/bin/python scripts/face_resolution_report.py --since 2026-10-20
DATABASE_URL=postgresql://... .venv/bin/python scripts/face_resolution_report.py --since 2026-10-20 --camera cam-01 --format json
```

Per camera it shows interocular percentiles, the share of faces in each pixel band, raw similarity by recognition state, how many recognized faces the tracker's `face_id.min_raw_similarity` floor discarded and at what similarity, the face count with median interocular distance and raw similarity in each face-quality band (below 0.2, 0.2 to 0.4, 0.4 to 0.6, 0.6 and above), and recognized faces per enrolled identity. Use it to decide where a camera needs a narrower lens or a lower mounting point.

Two live metrics complement the table:

| Metric | Service | Shows |
| --- | --- | --- |
| `pid_face_interocular_px` | person-ID | Histogram of interocular distance by recognition state |
| `pid_face_quality_score` | person-ID | Histogram of the face quality score by recognition state |
| `cts_face_queries_total{camera_id, result}` | tracking orchestrator | Person crops sent for face identification, by `face_found`, `no_face`, `too_small`, or `error`; the face hit rate per camera comes from here |
| `cts_face_gate_outcomes_total{camera_id, outcome}` | tracking orchestrator | What the tracker did with each returned face |

## Privacy and data handling

- Do not commit calibration datasets, household face pairs, or populated manifests to version control.
- Do not download data automatically in tests or CI.
- Do not include household examples in fit or test partitions.
- The artifact carries only fitted coefficients and provenance hashes, not raw embeddings or images.
- ArcFace enrollment remains a separate golden dataset. Calibration data does not touch enrollment.

## Related pages

- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)
- [Identity integrity change verification](/development/identity-integrity-verification)
- [Code standards](/development/code-standards)
