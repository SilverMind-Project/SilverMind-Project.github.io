# Frame Processing Pipeline

The orchestrator's `FrameProcessingPipeline` (`app/pipeline/frame_pipeline.py`) processes each frame through 15 stages: from JPEG decode through person detection, privacy enforcement, spatial floor projection, ReID and pose inference, face identification, world tracking (which includes pre-association cross-camera dedup and Bayesian identity resolution), detection backfill, PH lifecycle management, posture classification, trajectory writing, keyframe sampling, identity revision, trail management, and event publishing.

```mermaid
flowchart TB
    FrameReady["FrameReady (MinIO key)"]
    Fetch["1. Frame fetch\nMinIO JPEG decode"]
    Detect["2. Person detection\nYOLO26L ONNX (Triton)"]
    Privacy["3. Privacy enforcement\nBlur zones, drop zones"]
    Spatial["4. Spatial projection\nFloor-point homography per detection"]
    Inference["5. ReID + Pose inference\nSOLIDER-REID + RTMPose (Triton)"]
    FaceID["6. Face identification\nArcFace (person-id-service)"]
    World["7. World tracking\nPre-association dedup, BoT-SORT,\nIdentity resolution (Bayesian)"]
    Backfill["8. Detection backfill\nEnrich detections with PH assignments"]
    ClosePH["9. PH lifecycle\nClose terminated PersonHypotheses"]
    Posture["10. Posture classification\nKeypoint geometry analysis"]
    Trajectory["11. Trajectory writing\nFloor projection, dwells"]
    Keyframe["12. Keyframe sampling\nPeriodic + identity change"]
    Revisions["13. Identity revisions\nCross-table rewrite"]
    Trails["14. Trail management\nPer-PH foot-point trail buffer"]
    Publish["15. Event publishing\ntracking.events Redis Stream"]

    FrameReady --> Fetch
    Fetch --> Detect
    Detect --> Privacy
    Privacy --> Spatial
    Spatial --> Inference
    Inference --> FaceID
    FaceID --> World
    World --> Backfill
    Backfill --> ClosePH
    ClosePH --> Posture
    Posture --> Trajectory
    Trajectory --> Keyframe
    Keyframe --> Revisions
    Revisions --> Trails
    Trails --> Publish
```

## 1. Frame fetch

JPEG frames are fetched from MinIO using the key published in the `FrameReady` proto message. Frames older than 30 s are dropped as stale replay backlog (they are XACK'd normally to keep the pending-entry list clean, but pipeline work is skipped).

The fetched image is compared against the `FrameReady`-reported dimensions. A mismatch (e.g., from EXIF rotation or thumbnail storage) is logged and the actual image shape is used for all downstream coordinate transforms.

## 2. Person detection

YOLO26L ONNX runs on Triton, returning normalized bounding boxes (`[x1, y1, x2, y2]` in `[0, 1]` space) with confidence scores. The default confidence threshold is 0.25.

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

## 6. Face identification

Per-camera, rate-limited calls to the person-identification-service send person crops to `POST /api/v1/identify`. The ArcFace-based service returns face detections with identity assignments and confidence scores.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `face_id_cooldown_s` | 5.0 | Minimum seconds between calls per camera |
| `face_id_timeout_s` | 2.0 | HTTP request timeout |
| `face_id_min_confidence` | 0.4 | Global minimum ArcFace confidence |
| `face_id_enabled` | true | Master switch |
| Per-camera overrides | camera_id to `FaceIdCameraConfig` | Enable/disable per camera, override min confidence |

Face identification can be disabled per camera (e.g., top-down surveillance views where faces are not visible). Each `FaceAnchor` carries `person_id`, `confidence`, `tracklet_id`, and `camera_id`. The identity resolver uses these as high-weight evidence (3x over ReID).

## 7. World tracking

`WorldTrackingStage` delegates to `WorldTracker`, which runs three sub-steps in order:

### 7a. Pre-association cross-camera dedup

Before the Hungarian assignment runs, `dedup_observations()` collapses detections from different cameras that correspond to the same physical person into a single representative observation. This is the hallway-camera-watching-a-bathroom-door fix: when a hallway camera and a bathroom-adjacent camera both see one senior at the door, they must resolve to **one** `PersonHypothesis`, not two.

The dedup gate passes a pair of observations when all three conditions hold:

1. The two detections are from **different** cameras.
2. Their calibrated floor positions are within `dedup_max_distance_m` (default: 1.0 m) of each other.
3. When both carry committed face anchors, the face identities do not conflict (`dedup_require_no_face_conflict: true`).

Pairs that pass the gate are joined by a union-find algorithm; each resulting cluster elects one representative via `_select_representative()`, which picks the highest-quality detection (ties broken by camera_id then detection_id for determinism). The representative's floor position is the quality-weighted mean of all calibrated floor points in the cluster; its face anchor is the highest-confidence one across all members.

| Config knob | Default | Description |
|-------------|---------|-------------|
| `dedup_enabled` | `true` | Master switch for pre-association dedup |
| `dedup_max_distance_m` | `0.6` | Floor-plane distance gate in metres |
| `dedup_require_no_face_conflict` | `true` | Do not collapse observations with conflicting face identities |

The integration proof lives in `tests/integration/test_world_tracker_e2e.py::test_hallway_bathroom_one_person`, using the `tests/fixtures/frame_replays/hallway_bathroom_door.bin` fixture.

### 7b. Per-camera tracking (BoT-SORT)

Each camera has an isolated Kalman-filter tracker that associates detections frame-to-frame using the Hungarian algorithm.

**Association cost:**

```
cost(i,j) = (1 - alpha) x IoU_cost(i,j) + alpha x embedding_distance(i,j)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `appearance_weight` (alpha) | 0.15 | Appearance weight; IoU dominates so appearance changes do not break the spatial match |
| `match_thresh` | 0.2 | Minimum IoU to accept a match |
| `max_time_lost` | 30 frames | Frames without match before termination |
| `min_hits` | 3 frames | Consecutive matches before a track is confirmed |

### 7c. PersonHypothesis (PH) management and identity resolution

The `WorldTracker` maps confirmed per-camera tracks to `PersonHypothesis` (PH) entities. Each PH:

- carries a `ph_id` (UUID, the single physical-track identifier on the wire after R3).
- maintains a `mean_quality` field (exponential moving average of per-observation quality scores, added in migration `0002_quality`).
- is the entity that receives Bayesian identity resolution.

**Quality capture.** Each observation's quality score is computed from the detection's confidence and the crop size, then used to update the PH's `mean_quality`. The same `CropQuality` scorer is used for observations as for gallery entries; there is no parallel scorer. The `mean_quality` field travels to CC via the `IdentitySnapshot` proto and then through the `quality` field on `PersonLocationEnvelope`.

**Bayesian identity resolution.** The `IdentityResolver` maintains a posterior probability distribution for each PH over `{known_identities u UNKNOWN}`. Three evidence sources are combined via pointwise multiplication, with missing sources treated as uniform (weight = 1.0):

```
posterior(identity) proportional to prior(identity) x face_likelihood(identity) x reid_likelihood(identity)
```

**Temporal prior.** Encodes continuity from the previous identity assignment. The previous MAP identity receives `prior_weight = 0.6` of the probability mass. Identity persists for `prior_maintenance_max_age_s` (120 s) without new evidence; beyond that window, the prior alone cannot sustain a commit.

**Face likelihood.** Face anchors carry a `p_face` probability derived from a sigmoid of confidence and quality. Face evidence receives a `face_weight_multiplier` of 3.0 over ReID evidence: ArcFace is more reliable than body appearance for disambiguating identities in multi-person households.

**ReID likelihood.** Gallery k-NN search (pgvector HNSW with StreamingDiskANN) retrieves similar embeddings and maps them to identities via a logistic curve.

**Commit rule:**

```
commit if: top_prob >= commit_prob (0.65)
          AND margin >= commit_margin (0.25)
          AND sensory_evidence_present (face or ReID, not prior alone)
```

High-confidence face anchors (confidence >= 0.85) trigger an immediate commit bypassing the 3-second buffer.

**Identity feedback loop.** When a face anchor identifies a person on one camera, the resolved identity is stamped onto all gallery entries for that PH's detections, creating a self-reinforcing cycle that allows cross-camera identity carry even when a face is not visible on the second camera.

## 8. Detection backfill

`DetectionBackfillStage` enriches each detection in `ctx.domain_detections` with the `ph_id` assigned by the world tracker. This ensures downstream stages (posture, trajectory, publish) all read the same identity from the detection object rather than maintaining separate maps.

## 9. PH lifecycle (ClosePHStage)

`ClosePHStage` closes any PersonHypothesis that was active in the previous frame but no longer has an active detection in this frame. It writes the final trajectory and dwell segments for closed PHs so that dwell intervals are closed promptly rather than on the next detection.

## 10. Posture classification

`PostureStage` runs `classify_posture(pose_result, bbox)` for each detection that has pose keypoints. The 17 COCO keypoints drive a geometry-based classifier (ear-to-hip ratio, ankle visibility, horizontal spine angle) producing: `lying`, `sitting`, `standing`, or `unknown`.

Crops without pose output (smaller than 16x32 px or from cameras with pose disabled) get `unknown` posture.

## 11. Trajectory writing

`TrajectoryStage` records two types of data in TimescaleDB hypertables:

- **`person_trajectories`**: one row per frame per tracked person, with identity, room, floor-projected coordinates (in mm), posture, motion energy, and identity confidence. Points are written regardless of identity status: UNKNOWN trajectories are recorded and relabeled if identity is later resolved.
- **`room_dwells`**: continuous intervals in a room with entry/exit times, cumulative dwell, still-seconds, min/max/mean motion energy, and dominant posture.

When homography is unavailable, uncalibrated `(0, 0)` floor points are written.

## 12. Keyframe sampling

`KeyframeStage` saves tagged JPEG keyframes to the `tagged_keyframes` table and publishes `SceneSample` protos to the `scene.samples` Redis stream. Two triggers:

- **Periodic**: one keyframe per PH per configurable sampling interval.
- **Identity change**: an immediate keyframe when a PH's identity is revised, tagged with `tag_reason="identity_changed"`.

Keyframes carry annotations (ph_id, camera_id, identity_id, bounding box) used by the CC-side `SceneSampleSubscriber` for downstream scene analysis.

## 13. Identity revisions

When the committed identity changes (new assignment, reassignment, or demotion to UNKNOWN), an `IdentityRevision` proto is published to `tracking.revisions`. The revision carries the full posterior distribution as `IdentityCandidate` entries, the previous and new identity IDs, and evidence metadata. A rate limiter caps revisions at 3 per PH per minute.

When the identity committer is enabled, the `PostgresIdentityRewriter` performs retroactive cross-table rewriting: trajectory points, room dwells, and dementia signals for the affected PH are relabeled from the old identity to the new identity, covering the window from `applies_from` to `applies_to`.

## 14. Trail management

`TrailsStage` maintains an in-memory ring buffer of foot-point trail positions per PH (default: last 30 positions). These trails are published in the `TrackingEvent` proto and consumed by the CC live view to render person movement paths on the floor plan.

## 15. Event publishing

`PublishStage` assembles and publishes the final `TrackingEvent` proto to `tracking.events`. It carries per-frame detections enriched with `ph_id`, the posterior's top identity per PH (published even before formal commit, so the live view sees the current best guess immediately), pose keypoints, per-PH foot-point trails, and posterior evidence (top probability, top-2 probability, face anchor flag).

On the CC side, the `TrackingEventSubscriber` decodes this proto, builds a `ph_id -> identity_id` mapping from the `IdentityRevision` sub-messages, and assigns `identity_id`, `display_name`, and `identity_confidence` to each detection in the WebSocket broadcast.
