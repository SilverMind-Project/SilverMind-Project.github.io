# Frame processing pipeline

The orchestrator's `FrameProcessingPipeline` (`app/pipeline/frame_pipeline.py`) processes each frame through 18 default stages: from JPEG decode through person detection, privacy enforcement, spatial floor projection, ReID and pose inference, single-view standing height estimation, face identification, world tracking (which includes pre-association cross-camera dedup and Bayesian identity resolution), detection backfill, PH lifecycle management, posture classification, trajectory writing, keyframe sampling, identity revision, trail management, durable provenance persistence, governed ReID candidate creation, and event publishing. (Conditional stages such as fall detection and wearable persistence/attestation run when their feature flags are enabled.)

```mermaid
flowchart TB
    FrameReady["FrameReady (MinIO key)"]
    Fetch["1. Frame fetch\nMinIO JPEG decode"]
    Detect["2. Person detection\nYOLO26L ONNX (Triton)"]
    Privacy["3. Privacy enforcement\nBlur zones, drop zones"]
    Spatial["4. Spatial projection\nFloor-point homography per detection"]
    Inference["5. ReID + Pose inference\nSOLIDER-REID + RTMPose (Triton)"]
    Height["6. Standing height estimation\nSingle-view metrology on validated cameras"]
    FaceID["7. Face identification\nArcFace (person-id-service)"]
    World["8. World tracking\nKalman predict, pre-association dedup,\nHungarian association, identity resolution"]
    Backfill["9. Detection backfill\nEnrich detections with PH assignments"]
    ClosePH["10. PH lifecycle\nClose terminated PersonHypotheses"]
    Posture["11. Posture classification\nKeypoint geometry analysis"]
    Trajectory["12. Trajectory writing\nFloor projection, dwells"]
    Keyframe["13. Keyframe sampling\nPeriodic + identity change"]
    Revisions["14. Identity revisions\nCross-table rewrite"]
    Trails["15. Trail management\nPer-PH foot-point trail buffer"]
    Provenance["16. Provenance persistence\nDurable identity-decision audit rows"]
    ReIDCandidate["17. ReID candidate creation\nGoverned gallery candidate writes"]
    Publish["18. Event publishing\ntracking.events Redis Stream"]

    FrameReady --> Fetch
    Fetch --> Detect
    Detect --> Privacy
    Privacy --> Spatial
    Spatial --> Inference
    Inference --> Height
    Height --> FaceID
    FaceID --> World
    World --> Backfill
    Backfill --> ClosePH
    ClosePH --> Posture
    Posture --> Trajectory
    Trajectory --> Keyframe
    Keyframe --> Revisions
    Revisions --> Trails
    Trails --> Provenance
    Provenance --> ReIDCandidate
    ReIDCandidate --> Publish
```

## 1. Frame fetch and stream acknowledgement

`rtsp-ingress` stamps each published `FrameReady` message with two timestamps: `received_time_unix_ns` (recorded after JPEG decode and rotation) and `capture_time_unix_ns` (recorded before the HTTP fetch to go2rtc minus the camera's configured `capture_latency_ms`). Before uploading and publishing a frame, `rtsp-ingress` runs a 16x9 cell motion gate (`motion_mode: cells` on the 320x180 grayscale thumbnail against both the previous polled frame and the last published frame, with a `motion_hold_s` post-motion publish window).

JPEG frames are fetched from MinIO using the key published in the `FrameReady` proto message. Every consumed `FrameReady` entry is processed at most once and always acknowledged (`XACK`) whether the frame succeeds, is dropped as stale (> 30 s old), or fails in a pipeline stage (`cts_frames_failed_total`). On startup, `RedisStreamsTransport` reclaims and acknowledges any abandoned pending entries older than `redis.pending_reclaim_min_idle_s`.

The fetched image is compared against the `FrameReady`-reported dimensions. A mismatch (e.g., from EXIF rotation or thumbnail storage) is logged and the actual image shape is used for all downstream coordinate transforms.

## 2. Person detection

YOLO26L ONNX runs on Triton, returning normalized bounding boxes (`[x1, y1, x2, y2]` in `[0, 1]` space) with confidence scores. Detections below `pipeline.detector_confidence` (default 0.7) are discarded.

Post-decode IoU deduplication suppresses near-duplicate detections that survive the model's baked NMS. A greedy algorithm processes boxes in descending confidence order: a box is suppressed if its IoU with any already-kept box exceeds `detection_iou_dedup_threshold` (default: 0.55). This is belt-and-braces: the ONNX model already applies NMS, but double detections still occur at scene boundaries.

## 3. Privacy zone enforcement

Operator-drawn privacy polygons (configured at `/admin/cts/privacy`) are applied in two passes:

- **Blur/mask**: pixels inside privacy zones are obscured in the frame before any further processing. This affects crops, keyframes, and the published frame URL.
- **Detection drop**: detections whose foot-point (bbox bottom-center) falls in a drop zone are discarded before tracking. A Prometheus counter (`privacy_detections_dropped_total`) tracks the drop rate per camera.

## 4. Spatial projection

`SpatialProjectionStage` computes the calibrated floor-plane coordinate (`FloorPoint`) for every surviving detection using the per-camera 3x3 homography matrix fitted by the calibration tool. The result is carried on the detection's `floor_point` field with `calibrated=True` for cameras that have been calibrated, and `calibrated=False` with `(0, 0)` coordinates for uncalibrated cameras.

Floor projection runs **before** ReID and pose inference so that the cross-camera dedup pass (inside the world tracker) can use per-detection floor positions at the time of association.

## 5. ReID and pose inference

Per-detection person crops are extracted at native resolution and sent in parallel to two Triton models:

- **SOLIDER-REID** (768-dimensional L2-normalized embedding): used by the world tracker for cross-camera appearance similarity and by the Bayesian identity resolver for gallery k-NN search.
- **RTMPose** (17 COCO keypoints): used by the posture classifier and the motion energy tracker. Crops smaller than 16x32 pixels are skipped.

If the ReID embedder is unavailable, an empty embedding list is returned and the tracker falls back to geometry-only association.

## 6. Standing height estimation

`HeightEstimationStage` (`app/pipeline/stages/height_estimation.py`) runs immediately after pose inference on every calibrated camera whose recovered 3D pose passes mount-height (within 0.25 m) and tilt (within 10 degrees) validation against its configured camera profile. For each detection that passes the upright standing gate (non-truncated box inside the central image band, height-to-width ratio at least 1.3, visible shoulders above hips above ankles, torso tilt at most 25 degrees), it back-projects the head pixel onto the vertical line above the calibrated floor footpoint and propagates floor covariance plus pixel noise into `(height_estimate_m, height_sigma_m)`. Unvalidated cameras and seated or truncated detections are skipped silently without affecting tracking.

## 7. Face identification

Face identification sends one crop per person to `POST /api/v1/identify` on the person-identification-service, which returns the faces it finds with an identity, a recognition state, and a raw similarity score.

**Face crop.** The face path cuts its own crop from the frame: the person box padded upward by 15% and sideways by 10% of its size (never downward), so a head at the top edge of the detector box keeps the context face detection needs. Privacy zones are already blurred or masked in the frame before any crop is taken, so padding cannot expose them. Crops are encoded at JPEG quality 95. ReID and pose keep using the tight person crop.

**One face per person.** A person crop can contain someone else's face when two people overlap. A face is attributed to the person only if its centre lies in the person's head region: the top 35% of the person box (plus the upward padding), widened by 10% of the box width on each side. If two faces fall in that region, the crop is ambiguous and produces no face evidence; an unknown identity is safer than a swapped one. Each resulting face anchor is attached to the observation of the detection it came from, never to another person seen by the same camera.

| Setting (`face_id.*`) | Default | Description |
|-----------|---------|-------------|
| `cooldown_s` | 5.0 | Minimum seconds between queries for the same tracked person on a `mixed` or `surveillance` camera |
| `identification_point_cooldown_s` | 1.0 | Minimum seconds between queries on a `face_capable` camera (resolved via `CameraProfileMap`) |
| `timeout_s` | 2.0 | HTTP request timeout |
| `min_raw_similarity` | 0.6 | Under the `legacy` evidence policy, recognized faces below this raw similarity are dropped |
| `evidence_policy` | `shadow` | `legacy`, `shadow`, or `calibrated`: which recognized faces become evidence and how they are weighed ([Identity authority](/features/continuous-tracking/identity-integrity/identity-authority#how-faces-are-weighed)) |
| `head_region_height_frac` | 0.35 | Share of the person box, from the top, that can hold the face |
| `head_region_side_margin_frac` | 0.10 | Horizontal tolerance per side, as a share of box width |
| `crop_pad_top_frac` / `crop_pad_side_frac` | 0.15 / 0.10 | Face crop padding |
| `crop_jpeg_quality` | 95 | JPEG quality of face crops |
| `enabled` | true | Master switch |
| Per-camera overrides | camera_id to `FaceIdCameraConfig` | Enable/disable per camera, override the minimum similarity |

With `face_templates.mode` on, the stage also asks for each face's embedding and hands every face attributed to the person (sub-floor and candidate faces included) to world tracking, which adds it to that person's face template after association; see [Face templates](/features/continuous-tracking/identity-integrity/identity-authority#face-templates).

Face identification can be disabled per camera (for example, top-down views where faces are never visible). Each `FaceAnchor` carries `person_id`, `match_score` (raw cosine similarity for recognized and candidate faces, the face detection score for an unrecognized marker), `det_score`, `quality` (the evidence-path weight: 1.0 for a face seen in this frame, lower for propagated or external evidence), `face_quality` (the person-ID service's image-quality score, null from an older service), `calibrated_confidence` (null unless calibration is ready), `detection_id`, and `camera_id`. The identity resolver weights face evidence 3x over ReID. Every face result is also recorded for measurement; see [Measuring your cameras](/development/face-confidence-calibration#measuring-your-cameras).

## 8. World tracking

`WorldTrackingStage` builds `WorldObservation` objects for each detection (carrying standing height and uncertainty from stage 6 on validated cameras, or a synthetic virtual-tile floor point when a camera is uncalibrated), then calls `WorldTracker.step`. The tracker runs 10 numbered steps:

```mermaid
flowchart TD
  s1["1. Load open PHs\nKalman predict each to now"] --> s2
  s2["2. dedup_observations()\ncollapse cross-camera duplicates\nrepresentatives + cluster_map"] --> s3
  s3["3. associate()\nHungarian over cost matrix with gating"] --> s4
  s4["4. Update matched PHs\nKalman update, gallery-mean EMA, inverse-variance height fusion,\nmean_quality EMA, expand active_cameras"] --> s5
  s5["5. Spawn PHs for unmatched obs\ngated by room polygon if configured\ninit Kalman; born Unknown"] --> s6
  s6["6. Emit PHContinuationCandidate\nfor each spawn near a recently closed PH"] --> s7
  s7["7. Close unmatched PHs past ph_close_grace_s\nelse keep open with predicted state"] --> s8
  s8["8. Persist all updated PHs"] --> s9
  s9["9. Identity resolution\napply decisions, collect revisions"] --> s10
  s10["10. Build WorldFrameSnapshot per PH\nobservation_count >= min_observations_to_publish"]
```

**Steps 1-3: predict and associate.** All open PHs are loaded and their Kalman states predicted forward to the current timestamp. `dedup_observations()` then collapses detections from different calibrated cameras that are within `dedup_max_distance_m` (default: 0.6 m) and not in identity conflict into single representative observations. The Hungarian algorithm solves the assignment over a cost matrix (geometric + appearance + height) with a Mahalanobis gate (`gate_chi2 = 9.21`, chi-squared 99%, 2 dof) and an identity-conflict hard gate.

**Steps 4-5: update and spawn.** Matched PHs receive a Kalman update, gallery-mean EMA (`alpha = 1 / min(count+1, 100)`), inverse-variance standing height fusion with a 3-sigma innovation gate (rejecting sitting outliers and flooring `height_sigma_m` at 0.02 m), mean-quality EMA (`0.1 * obs.quality + 0.9 * prev`), and accumulate all contributing camera IDs. Accepted standing height samples are also appended to `ph_height_samples` (14-day retention) so `HeightProfileLearner` can learn per-resident standing height profiles across cameras and days. Unmatched observations spawn new PHs (gated by room polygon when configured). A new PH is born Unknown: the identity resolver, which runs later in the same step with that round's faces, is the only writer of identity, so a first face is weighed like any other.

**Steps 6-7: continuations and grace.** For each spawn, recently closed PHs within `inferred_handoff_max_s` (600 s) and `inferred_handoff_max_distance_m` (5.0 m) emit a `PHContinuationCandidate`. Unmatched PHs past `ph_close_grace_s` (15.0 s) are closed; those within the grace window coast: their stored state stays at their last observation and only the published snapshot carries the in-round prediction.

**Steps 8-10: persist, resolve, snapshot.** All updated PHs are persisted. The Bayesian identity resolver runs on every PH that received an observation. Face templates that finished since the previous round are passed to the resolver only, never to association. After the step, world tracking feeds this round's faces into each person's template buffer and starts template requests in the background, on every execution path, so a slow person-ID service never delays a frame. `WorldFrameSnapshot` objects are built for PHs with `observation_count >= min_observations_to_publish` (3).

### Pre-association cross-camera dedup

Before the Hungarian assignment runs, `dedup_observations()` (`app/tracking/world/dedup.py`) collapses detections from different cameras that correspond to the same physical person into a single representative observation.

The dedup gate passes a pair of observations when all three conditions hold:

1. The two detections are from **different** cameras.
2. Both have `calibrated=True` floor points within `dedup_max_distance_m` (default: 0.6 m) of each other.
3. The faces do not conflict (`dedup_require_no_face_conflict: true`). Two faces conflict only when both are single-frame recognitions from this camera frame naming different people, each with raw similarity at or above `face_conflict_min_similarity` (0.70), the same threshold association and revival use. A weak recognition, a candidate, a face template, or an external assertion never splits one person into two tracks.

Pairs that pass the gate are joined by a union-find algorithm; each resulting cluster elects one representative via `_select_representative()` (highest quality, ties broken deterministically). The cluster membership map propagates all source camera IDs back to the winning PH.

| Config knob | Default | Description |
|-------------|---------|-------------|
| `dedup_enabled` | `true` | Master switch for pre-association dedup |
| `dedup_max_distance_m` | `0.6` | Floor-plane distance gate in metres |
| `dedup_require_no_face_conflict` | `true` | Do not collapse observations with conflicting face identities |

Uncalibrated cameras: floor-distance `dedup_observations()` skips observations with `calibrated=False`. For uncalibrated home cameras, identity crosses cameras through the shared ReID gallery, cross-GT face propagation, PH continuation, group-appearance dedup within a declared overlap group (`enable_group_appearance_dedup`), and cross-camera revival.

The integration proof lives in `tests/integration/test_world_tracker_e2e.py::test_hallway_bathroom_one_person`.

### PersonHypothesis (PH) management and identity resolution

The `WorldTracker` maps confirmed per-camera tracks to `PersonHypothesis` (PH) entities. Each PH:

- carries a `ph_id` (UUID, the single physical-track identifier on the wire after R3).
- maintains a `mean_quality` field (exponential moving average of per-observation quality scores, added in migration `0002_quality`).
- is the entity that receives Bayesian identity resolution.

**Quality capture.** Each observation's quality score is computed from the detection's confidence and the crop size, then used to update the PH's `mean_quality`. The same `CropQuality` scorer is used for observations as for gallery entries; there is no parallel scorer. The `mean_quality` field travels to CC via the `IdentitySnapshot` proto and then through the `quality` field on `PersonLocationEnvelope`.

**Bayesian identity resolution.** The `IdentityResolver` maintains a posterior probability distribution for each PH over `{known_identities u UNKNOWN}`. Three evidence sources are combined via pointwise multiplication, with missing sources treated as uniform (weight = 1.0):

```
posterior(identity) proportional to prior(identity) x face_likelihood(identity) x reid_likelihood(identity)
```

**Temporal prior.** Encodes continuity from the previous identity assignment. The previous MAP identity receives `prior_weight = 0.6` of the probability mass. Identity persists for `prior_maintenance_max_age_s` (30 s) without new evidence; beyond that window, the prior alone cannot sustain a commit.

**Face likelihood.** The strongest recognized anchor contributes `p_face = 0.5 + 0.5 * tanh(4 * (0.7 * match_score + 0.3 * q - 0.5))`, capped at 0.99. This is an uncalibrated heuristic, not a probability fit to data. `q` is the anchor's `quality`; with `resolver.face_quality_mode: enabled` it is multiplied by the service's face quality, so a small, blurred, or steeply pitched face counts less. The default in `settings.yaml` is `shadow`: decisions use `quality` alone while a quality-weighted evaluation counts disagreements in `cts_identity_shadow_mismatch_total{feature="face_quality"}`. Face evidence receives a `face_weight_multiplier` of 3.0 over ReID evidence: ArcFace is more reliable than body appearance for disambiguating identities in multi-person households.

**ReID likelihood.** Gallery k-NN search (pgvector HNSW with StreamingDiskANN) retrieves similar embeddings and maps them to identities via a logistic curve.

**Commit rule:**

```
commit if: top_prob >= commit_prob (0.65)
          AND margin >= commit_margin (0.15)
          AND sensory_evidence_present (face or ReID, not prior alone)
```

A calibrated direct face match at or above `arcface_authority_calibrated_confidence` (0.80) grants direct-face authority; without a deployed calibration artifact this path stays closed.

**Governed ReID seeding.** Only face-confirmed detections whose direct recognized face matches the PH's committed identity with calibrated confidence at or above `arcface_authority_calibrated_confidence` (0.80) can mint governed `reid_gallery` entries in stage 16 (`ReIDCandidateStage`). ReID-only commits and operator PH corrections never write to the ReID gallery, preventing body-appearance feedback loops.

## 9. Detection backfill

`DetectionBackfillStage` enriches each detection in `ctx.domain_detections` with the `ph_id` assigned by the world tracker. This ensures downstream stages (posture, trajectory, publish) all read the same identity from the detection object instead of maintaining separate maps.

## 10. PH lifecycle (ClosePHStage)

`ClosePHStage` closes any PersonHypothesis that was active in the previous frame but no longer has an active detection in this frame. It writes the final trajectory and dwell segments for closed PHs so that dwell intervals are closed promptly, without waiting for the next detection.

## 11. Posture classification

`PostureStage` produces soft posture evidence for each detection instead of a single hard label. The 17 COCO keypoints drive geometric scorers (torso angle, knee bend, head-spine alignment, shin-drop geometry) into a `PostureScores` record with continuous evidence for `lying`, `sitting`, and `standing_walking`, plus a keypoint-confidence value. Soft scoring lets several weak cues accumulate instead of firing on one threshold. In a bedroom, a lying prior is added when the body is occluded.

Fusion and the final label happen in stage 12. `GlobalPostureTracker` keeps each camera's latest scores, fuses them quality-weighted across the person's active cameras, and applies hysteresis before committing a posture. Crops without pose output (smaller than 16x32 px or from cameras with pose disabled) contribute `unknown`. See [Handling noisy readings](./tracking-concepts.md#handling-noisy-readings) for the full position and posture fusion model.

## 12. Trajectory writing

`TrajectoryStage` records two types of data in TimescaleDB hypertables:

- **`person_trajectories`**: one row per frame per tracked person, with identity, room, floor-projected coordinates (in mm), posture, motion energy, and identity confidence. Points are written regardless of identity status: UNKNOWN trajectories are recorded and relabeled if identity is later resolved.
- **`room_dwells`**: continuous intervals in a room with entry/exit times, cumulative dwell, still-seconds, min/max/mean motion energy, and dominant posture.

When homography is unavailable, uncalibrated `(0, 0)` floor points are written.

## 13. Keyframe sampling

`KeyframeStage` saves tagged JPEG keyframes to the `tagged_keyframes` table and publishes `SceneSample` protos to the `scene.samples` Redis stream. Two triggers:

- **Periodic**: one keyframe per PH per configurable sampling interval.
- **Identity change**: an immediate keyframe when a PH's identity is revised, tagged with `tag_reason="identity_changed"`.

Keyframes carry annotations (ph_id, camera_id, identity_id, bounding box) used by the CC-side `SceneSampleSubscriber` for downstream scene analysis.

## 14. Identity revisions

When the committed identity changes (new assignment, reassignment, or demotion to UNKNOWN), an `IdentityRevision` proto is published to `tracking.revisions`. The revision carries the full posterior distribution as `IdentityCandidate` entries, the previous and new identity IDs, and evidence metadata. A rate limiter caps revisions at 3 per PH per minute.

When the identity committer is enabled, the `PostgresIdentityRewriter` performs retroactive cross-table rewriting: trajectory points, room dwells, and dementia signals for the affected PH are relabeled from the old identity to the new identity, covering the window from `applies_from` to `applies_to`.

## 15. Trail management

`TrailsStage` maintains an in-memory ring buffer of foot-point trail positions per PH (default: last 30 positions). These trails are published in the `TrackingEvent` proto and consumed by the CC live view to render person movement paths on the floor plan.

## 16. Provenance persistence

`ProvenancePersistStage` durably persists every identity decision that revises a PH's previous
identity (`revises_previous=True`), unconditionally. It runs immediately before the per-camera
publish throttle, and deliberately outside it: a decision that revises identity is audit data a
caregiver-facing read model joins against. It must never be dropped just because the frame
that carried it was rate-limited for live-view publishing. The stage is a no-op when no
`identity_provenance_repo` is configured.

## 17. ReID candidate creation

`ReIDCandidateStage` is the only pipeline path that writes to the ReID gallery. For each
committed, face-matched detection it evaluates a governed eligibility gate
(`evaluate_candidate`, `app/tracking/identity/candidate_eligibility.py`) and, when it passes,
creates a gallery candidate with crop and frame provenance, `origin_tracklet_id`, `ph_id`,
and model/preprocessing versions. A face-derived candidate requires the direct recognized ArcFace
identity to equal the committed identity with calibrated confidence at or above the authority
threshold (`0.80`); candidates with `calibrated_confidence >= auto_verify_min_confidence` (`0.90`)
mint directly into `auto_verified`, while candidates in `[0.80, 0.90)` enter `pending_review`.
Without a deployed calibration artifact the stage produces no candidates and does not fall back to
raw similarity. Like provenance persistence, this runs ahead of the publish
throttle because candidate creation is audit-visible governance data. The per-(identity,
orientation) cap on gallery growth counts `pending_review`, `auto_verified`, and
`operator_verified` rows together.

## 18. Event publishing

`PublishStage` assembles and publishes the final `TrackingEvent` proto to `tracking.events`. It carries per-frame detections enriched with `ph_id`, the posterior's top identity per PH (published even before formal commit, so the live view sees the current best guess immediately), pose keypoints, per-PH foot-point trails, and posterior evidence (top probability, top-2 probability, face anchor flag).

On the CC side, the `TrackingEventSubscriber` decodes this proto, builds a `ph_id -> identity_id` mapping from the `IdentitySnapshot` sub-messages, and assigns `identity_id`, `display_name`, and `identity_confidence` to each detection in the WebSocket broadcast.
