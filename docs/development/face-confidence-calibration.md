# Face confidence calibration

ArcFace produces a normalized-embedding cosine similarity score, not a probability. This page describes how the person identification service turns that score into a calibrated confidence the authority gate can trust, how a household collects and labels the faces that calibration is fitted on, and what happens at runtime when an artifact is missing, incompatible, or does not cover a person.

## Why calibration matters

A similarity of 0.80 does not mean "80% chance this is the same person." The value depends on the embedding model, the preprocessing, and above all on the cameras: a face 12 pixels between the eyes scores very differently from the same face at 40 pixels. Treating similarity as probability leads to miscalibrated authority decisions.

The runtime reads a versioned artifact and applies its mapping to every recognized face. If no valid artifact exists, the service runs in `degraded_missing` state and returns `calibrated_confidence: null`. The Continuous Tracking authority gate reads `calibrated_confidence` and denies authority on null, so an uncalibrated deployment still tracks people; it just never treats a single face as proof.

Calibration is links 2 to 4 of the household's identity chain. The [Identity setup](/features/continuous-tracking/identity-integrity/identity-setup) page shows where your home is in that chain and what to do next.

## Calibration health states

Any degraded state yields `calibrated_confidence: null`.

| State | Cause |
| --- | --- |
| `ready` | Artifact loaded, validated, and version-compatible |
| `degraded_missing` | No `calibration.artifact_path` configured, or the file is absent |
| `degraded_incompatible` | The artifact's `recognizer_version` (legacy alias `arcface_model_version`), `model_profile`, `preprocessing_version`, or (schema 2) face quality scorer version or `gallery_representation` does not match the service |
| `degraded_invalid` | Artifact fails schema validation, finiteness, or monotonicity checks |

`GET /health` reports the state under `calibration`, with the artifact version and, for schema 2, its profile, quality scorer version, `gallery_representation`, and covered identities. The Prometheus gauge `pid_calibration_health_state` exports the same state.

Even when the state is `ready`, a schema 2 artifact returns `null` for any identity that is not in its `covered_identities` list, or whose current `gallery_revision` does not match the revision recorded in `gallery_revisions` when the artifact was fitted. A resident enrolled after the fit, one with too few labeled faces at fit time, or one whose gallery changed through re-enrollment, promotion, or prototype removal has no calibrated confidence until the household recalibrates.

## Calibrating on your own cameras

Calibration is fitted on faces from the household's own cameras (schema 2). Research face sets can be pooled into the fit, but the acceptance gates always run on a holdout of the household's own faces, because that is the only data that says how the deployment behaves.

### 1. Capture

Enroll every resident first. Then set `calibration_capture.enabled: true` in the person-ID service's `config/settings.yaml` for 7 to 14 days of normal living.

While it is on, every `POST /identify` call from the tracking orchestrator (which sends a `capture_context` naming the camera, the capture time, and the crop padding) offers its faces for capture. The service keeps a stratified sample: at most `per_bucket_per_day` (40) faces per quality decile, nearest enrolled identity (or none), and camera, per UTC day, so the rare low-quality and visitor faces are not drowned out by thousands of clear ones. Each capture stores the aligned 112x112 crop in MinIO and a row in `calibration_candidates` with the embedding, the quality components, and the versions in force. Capture runs in a bounded background queue: a full queue drops the face, and a capture failure never fails or slows the identify call.

Unlabeled and rejected captures, with their crops, are deleted after `unlabeled_retention_days` (30).

| Setting | Default | Purpose |
| --- | --- | --- |
| `calibration_capture.enabled` | `false` | Turn capture on |
| `calibration_capture.per_bucket_per_day` | `40` | Daily cap per (quality decile, nearest identity, camera) |
| `calibration_capture.unlabeled_retention_days` | `30` | Deletion age for unlabeled and rejected captures |
| `calibration_capture.queue_size` | `64` | Background capture queue length |

### 2. Label

An admin labels captures in Cognitive Companion at People, Face Calibration (`/admin/face-calibration`, permission `face_calibration.review`). Each capture is one keystroke with the keys every review page shares: a number for a resident, `n` for someone not in the household, `x` for not usable (stored as `not_a_face`, which the fit skips). No member is highlighted, so the closest match never steers a ground-truth label. **Reject capture** sets a capture aside; deleting removes it and its crop. Each choice's effect comes from the server, and the page states that labels never change enrollment on their own. **Select several** shows the queue as a grid for labeling many faces **Not in the household** or **Not usable** at once (one call to person-id's `POST /api/v1/calibration/candidates/label-batch`); member labels are never given in bulk, because each becomes a genuine pair in the fit. The labeler recorded is the signed-in admin.

A label never changes the gallery; only explicit promotion, an operator action, does. On the **Labeled** view in `/admin/face-calibration`, an admin can explicitly promote an eligible labeled resident capture into that resident's pose-binned prototypes (**Use for recognition**, behind a confirmation). Promotion requires a clear capture (quality at least 0.5, eye distance at least 24 px, active quality scorer version) and advances the member's `gallery_revision`, pausing calibrated recognition authority for that person until the next calibration fit.

Label `not_enrolled` faces (visitors, carers, relatives) as carefully as residents. They are what the open-set false-match gate is measured on, and a relative who looks like a resident is exactly the case calibration must not get wrong.

The progress panel (`GET /api/v1/calibration/summary`, and the read-only MCP tool `get_face_calibration_summary`) shows labeled faces and distinct walks per resident against the target of 150 labeled faces (which yields the 30 holdout faces the coverage gate needs), as well as promotable capture counts by resident and pose bin.

### 3. Build the manifest

```bash
cd person-identification-service
DATABASE_URL=postgresql://... uv run --extra calibration-tools \
  python -m app.calibration.cli build-manifest --output manifest.jsonl --gallery centroid
```

Pass `--gallery prototypes-v1` to score probes against pose-binned prototypes (the mode used once `recognition.gallery_representation` moves from `shadow` to `prototypes`).

The command opens a read-only database connection. It groups labeled captures into walks (episodes): a run of captures with one label on one camera with gaps under 300 seconds. It then scores every labeled probe against every enrolled resident (either centroids or pose-binned prototypes), producing genuine records, closed-set impostor records (a resident against another resident), and open-set impostor records (a not-enrolled person against every resident), together with the best-vs-second-best `margin`. Under `--gallery prototypes-v1`, any promoted capture from the same walk is excluded when scoring that walk so leave-episode-out holdout scores are never optimistic. The manifest and its `.meta.json` sidecar (row count, SHA-256, versions, `gallery_representation`, and per-member `gallery_revisions`) hold household biometric scores: keep them outside the repository.

Faces a wearable labeled (state `attested`, label source `sensor_attested`) join the manifest only with `--include-attested`, and only when an audit of a uniform random sample shows at least 200 audited with a Wilson 95% lower bound of precision of 0.99 or better; below that the builder refuses and prints the audit summary. Captures audited wrong never enter. The bar is fixed in `app/calibration/attestation_audit.py`, not in settings.

To pool a research face set, add `--external set.jsonl`. The listing is one `{"image": ..., "identity_id": ...}` object per line, and it must sit next to `set.jsonl.licence.json` naming the dataset, its version, and its licence; a set without one is refused. External images run through the service's own face engine (this needs Triton). They are aligned and quality-scored exactly like household captures. External identities are prefixed `external:` and never reach the household holdout.

### 4. Fit

```bash
uv run --extra calibration-tools python -m app.calibration.cli fit-v2 \
  --manifest manifest.jsonl --output artifact.json --allow-household-only
```

Omit `--allow-household-only` when the manifest includes an external set; without either, the fit refuses to run. Household walks split 60/20/20 into fit, validation, and holdout partitions by walk, stratified per label, so frames from one walk never land on both sides. External identities split into fit and validation only.

The fit is a logistic regression evaluated over candidate feature sets (`similarity` and `quality_score`; `similarity`, `resolution`, and `sharpness`; plus variants adding `margin` when multiple identities are present), picking the candidate with the lowest validation log loss and storing raw-space coefficients so the runtime needs only NumPy. The command prints the gates, a reliability table, and the coverage list, and writes the artifact only when every gate passes. Without `--output` it is a dry run.

| Gate (household holdout) | Default |
| --- | --- |
| Expected calibration error (10 bins) | at most 0.05 |
| Brier score | at most 0.10 |
| False-match rate at 0.80, all impostors | at most 0.01 |
| False-match rate at 0.80, not-enrolled impostors alone | at most 0.01, and must be measured |
| Holdout genuine faces for a resident to be covered | 30 |
| Covered residents | at least 1 |
| Identities in the fit split | at least 5 |

A failed gate usually means too few low-quality faces for one resident or too few visitors labeled; keep capturing and labeling, then rebuild the manifest. Override thresholds with `--max-ece`, `--max-brier-score`, `--max-fmr`, `--min-holdout-genuine`, and `--min-fit-identities` only with a recorded reason. A missing artifact is preferable to one that failed its gates.

### 5. Deploy

```bash
uv run --extra calibration-tools python -m app.calibration.cli validate --artifact artifact.json \
  --quality-version heuristic-v1
```

Mount the artifact read-only and point `CALIBRATION_ARTIFACT_PATH` at it. With docker compose, copy it to `./calibration/artifact.json` (mounted at `/app/calibration`) and set `CALIBRATION_ARTIFACT_PATH=/app/calibration/artifact.json`. On Kubernetes, create the `person-id-calibration` secret from the file; the deployment mounts it at the same path. Restart the service and confirm `GET /health` reports `ready` with the new artifact version and the residents you expect under covered identities. Then turn capture off, or lower `per_bucket_per_day` to keep watching for drift.

Face templates (several faces of one person matched together by `POST /api/v1/match-template`) need their own artifact, because a template's similarity is a different score from a single face's. Build it from the same labeled captures:

```bash
uv run --extra calibration-tools python -m app.calibration.cli build-manifest \
  --output /secure/template-manifest.jsonl --profile template
uv run --extra calibration-tools python -m app.calibration.cli fit-v2 \
  --manifest /secure/template-manifest.jsonl --allow-household-only --output template.json
uv run --extra calibration-tools python -m app.calibration.cli validate --artifact template.json \
  --quality-version heuristic-v1 --calibration-profile template
```

The template manifest draws templates of 2 to 8 faces from within one labeled walk (at most 20 per walk, because templates of one walk are near-duplicates), aggregates and quality-scores them exactly as the endpoint does, and scores them like single probes. The fit counts the coverage gate in distinct holdout walks instead of faces, and records the profile, the aggregator (`qwmean-v1`), and its gates in the artifact. Point `CALIBRATION_TEMPLATE_ARTIFACT_PATH` at it; `GET /health` reports it under `template_calibration`.

Recalibrate when a resident is enrolled, a camera is moved or replaced, the face recognizer profile changes, or the face quality scorer changes. The tracking orchestrator's `face_id.expected_recognizer_version` and `face_id.expected_quality_version` must match the active recognizer and scorer the artifact was fitted on; otherwise the orchestrator drops the calibrated confidence and the authority gate stays closed.

### Changing the face recognizer

The person-identification service loads its face recognizer from `face_engine.active_profile` and `face_engine.profiles` in `config/settings.yaml` (default `buffalo_l`). Aligned 112x112 PNG crops of enrollment photos and promoted examples are retained locally in MinIO under `enrollment/<person_id>/<embedding_id>.png` so you can build a parallel gallery for another profile without re-photographing residents:

```bash
cd person-identification-service
DATABASE_URL=postgresql://... TRITON_GRPC_URL=triton:8701 \
  uv run python -m app.tools.reembed --profile adaface_ir50_webface4m
```

`reembed` writes profile-scoped embeddings, centroids, and prototypes without modifying the active `buffalo_l` gallery. To compare candidate recognizers on household holdout captures before switching, run:

```bash
uv run --extra calibration-tools python scripts/evaluate_recognizer_swap.py \
  --baseline-scores baseline.json --candidate-scores candidate.json \
  --candidate-profile adaface_ir50_webface4m --output report.json
```

Switching `face_engine.active_profile` changes both `recognizer_version` and the profile-scoped quality version (`heuristic-v1@<recognizer_version>` for non-default profiles). Any previously deployed single-frame or template calibration artifact automatically reports `degraded_incompatible`, and Cognitive Companion's **Identity Setup** page blocks the calibration artifact step until you refit and deploy new artifacts with `build-manifest --recognizer-version <name>` and update `face_id.expected_recognizer_version` and `face_id.expected_quality_version` in the tracking orchestrator.

## Schema 2 artifact

| Field | Description |
| --- | --- |
| `schema_version` | `2` |
| `method` | `logistic_v2` |
| `profile` | `single_frame`; the tracking orchestrator trusts calibrated confidence only for this profile |
| `quality_version` | Face quality scorer the features came from, e.g. `heuristic-v1` |
| `features`, `coefficients`, `intercept` | `P(match) = sigmoid(intercept + sum(coefficient * feature))` in raw feature units (may include `margin` when multiple identities are enrolled) |
| `covered_identities` | Residents the artifact may score; everyone else gets `null` |
| `gallery_representation` | Gallery mode the artifact was fitted on (`centroid` or `prototypes-v1`); must match the service's active mode |
| `gallery_revisions` | Per-member gallery revision at fit time; a member whose revision changed gets `null` until refit |
| `fit_basis` | `household_only` or `pooled` |
| `capture_profile` | Crop padding and JPEG quality the captures were taken with |
| `household_holdout_metrics` | ECE, Brier score, log loss, FMR, and FNMR on the household holdout |
| `open_set_fmr_at_operating_point` | False-match rate for not-enrolled people alone |
| `external_datasets` | Name, version, licence, and identity and image counts of each pooled research set |
| `recognizer_version`, `arcface_model_version`, `model_profile`, `preprocessing_version`, `fitted_at`, `random_seed`, dataset hashes | As in schema 1 (`recognizer_version` is canonical; `arcface_model_version` is kept synchronized for one release) |

The JSON schema is `schemas/calibration_artifact_v2.schema.json` in the `person-identification-service` repository, generated from the Pydantic model and checked by a test. The runtime evaluator uses only the standard library and NumPy.

## Schema 1 (pair-based fit)

The original toolchain fits a one-feature mapping from labeled same-person and different-person similarity pairs, split by identity. It is kept for research sets prepared as pairs; household calibration should use schema 2.

```bash
uv run --extra calibration-tools python -m app.calibration.cli fit \
  --pairs pairs.json --output artifact.json --method logistic \
  --recognizer-version buffalo_l --model-profile full --preprocessing-version v1
```

Each pair is `{"similarity": 0.87, "label": 1, "identity_id": "person-001"}`. `--method isotonic` fits a monotone piecewise-linear map instead. Its gates run on the test split: Brier score below 0.10, log loss below 0.30, ECE below 0.05, FMR at 0.80 below 0.05, at least 200 fit pairs, 50 validation and 50 test pairs, and 5 fit identities. `evaluate --artifact ... --pairs ...` scores an artifact against held-out pairs, and `inspect --artifact ...` prints its manifest. The schema 1 JSON schema is `schemas/calibration_artifact.schema.json`. A schema 1 artifact has no quality version or coverage list, and the service still loads it.

## Response fields

`POST /identify` and `POST /identify-batch` include these calibration fields in every face detection:

| Field | Type | Description |
| --- | --- | --- |
| `raw_similarity` | float | Normalized-embedding cosine similarity. Alias of `similarity`. |
| `second_best_candidate_id` | string or null | Second-closest enrolled identity when at least two identities are enrolled; null otherwise. |
| `second_best_similarity` | float or null | Cosine similarity to the second-closest enrolled identity; null when fewer than two identities are enrolled. |
| `margin` | float or null | `raw_similarity - second_best_similarity`; null when fewer than two identities are enrolled. |
| `gallery_representation` | string | Gallery mode that scored this face (`centroid` or `prototypes-v1`). |
| `calibrated_confidence` | float or null | Calibrated ArcFace probability in `[0, 1]`. Null when the evaluator is in any degraded state, or for non-recognized faces. |
| `calibration_status` | string | One of the four health states. |
| `calibration_artifact_version` | string or null | UUID of the loaded artifact. Null when degraded. |
| `calibration_profile` | string | Profile of the calibration that produced `calibrated_confidence` (`single_frame`); empty when no artifact is loaded. |
| `recognizer_version` | string | Active recognizer version from the active profile (`face_engine.active_profile`). |
| `arcface_model_version` | string | One-release compatibility alias mirroring `recognizer_version`. |
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

The manifest lists image files and the enrolled identity each shows. The script runs face detection directly (it never calls `/identify` and records no visitor sightings), reads enrolled centroids read-only, and prints each input's distribution, its Spearman correlation with raw similarity to the labeled identity, and suggested ramp anchors at the 5th and 95th percentiles. It never writes configuration. Changing an anchor or weight changes what the score means. The change ships as a new scorer version, and any calibration artifact or policy tuned on the old version must be re-checked.

## Measuring your cameras

Before fitting or trusting any calibration, check how large faces actually are on your cameras. Recognition accuracy depends mostly on the distance between the eyes in pixels: below about 16 px it is unreliable, 16 to 24 px is marginal, and above about 40 px the ArcFace template (roughly 35 px between the eyes) is already filled, so accuracy stops improving. On a wide-angle home camera that usually means faces are usable within 2 to 3 m.

Every face the person-ID service returns carries its size in pixels of the submitted image: `face_width_px`, `face_height_px`, and `interocular_px` (the distance between the two eye keypoints that face alignment uses, or `null` when it cannot be measured). The Continuous Tracking orchestrator records one row per face in `continuous_tracking.face_observation_stats` with these sizes, the detection score, head pose, the face quality score and version, raw similarity, recognition state, the closest enrolled identity id, and what the tracker did with the face (`emitted`, `dropped_min_similarity`, `dropped_no_candidate`, `dropped_no_detection`, `dropped_not_in_head_region`, or `dropped_ambiguous`). Rows hold no embeddings, crops, or names, and expire after 14 days.

Run the report from `continuous-tracking/tracking-orchestrator` after a week of normal activity:

```bash
DATABASE_URL=postgresql://... .venv/bin/python scripts/face_resolution_report.py --since 2026-10-20
DATABASE_URL=postgresql://... .venv/bin/python scripts/face_resolution_report.py --since 2026-10-20 --camera cam-01 --format json
```

Per camera it shows interocular percentiles, the share of faces in each pixel band, raw similarity by recognition state, how many recognized faces the tracker's `face_id.min_raw_similarity` floor discarded and at what similarity, how many only the `calibrated` evidence policy would emit (recorded as `emitted_shadow_only` while `face_id.evidence_policy` is `shadow`), the face count with median interocular distance and raw similarity in each face-quality band (below 0.2, 0.2 to 0.4, 0.4 to 0.6, 0.6 and above), and recognized faces per enrolled identity. Use it to decide where a camera needs a narrower lens or a lower mounting point.

Two live metrics complement the table:

| Metric | Service | Shows |
| --- | --- | --- |
| `pid_face_interocular_px` | person-ID | Histogram of interocular distance by recognition state |
| `pid_face_quality_score` | person-ID | Histogram of the face quality score by recognition state |
| `cts_face_queries_total{camera_id, result}` | tracking orchestrator | Person crops sent for face identification, by `face_found`, `no_face`, `too_small`, or `error`; the face hit rate per camera comes from here |
| `cts_face_gate_outcomes_total{camera_id, outcome}` | tracking orchestrator | What the tracker did with each returned face |

## Privacy and data handling

- Calibration captures (aligned face crops and embeddings) stay in the home's own database and MinIO. Unlabeled and rejected captures are deleted after 30 days; labeled ones stay until an admin deletes them.
- Manifests hold household biometric scores. Do not commit them, household captures, or populated research listings to version control. The service repository's `.gitignore` excludes `/calibration/` and manifest files.
- Do not download research data automatically in tests or CI. Pool only a set whose licence permits the use, and record it in the sidecar.
- The artifact carries fitted coefficients, metrics, identity ids, and provenance hashes, never embeddings or images.
- With face templates on, the tracking orchestrator receives face embeddings from the person-ID service on the home network and holds a few per person in memory for about 15 seconds; it never logs or stores them. Only the person-ID service stores embeddings.
- Wearable-attested faces are held only in the person-ID service's memory (at most 2,000, for 10 minutes) until the tracking orchestrator attests their detection; only then is the aligned crop stored, as an `attested` capture. Unaudited ones are deleted after 30 days like unlabeled captures, and so are ones an auditor marked wrong.
- Calibration labels never change enrollment on their own; enrollment changes only when an admin explicitly promotes a labeled capture (and recalibration is required before recognition authority resumes for that person).

## Related pages

- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)
- [Identity integrity change verification](/development/identity-integrity-verification)
- [Code standards](/development/code-standards)
