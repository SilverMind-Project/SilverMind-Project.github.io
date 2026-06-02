# Tracking Concepts

Explanations of the core algorithms used by the world-coordinate tracker (`app/tracking/world/tracker.py`). These concepts underpin the [Frame Processing Pipeline](./frame-pipeline.md).

## Bounding box and IoU

A bounding box is a rectangle that encloses a detected person. CTS uses axis-aligned boxes described by four pixel coordinates: `(x_min, y_min, x_max, y_max)`.

**Intersection over Union (IoU)** measures how much two bounding boxes overlap:

```
IoU = area(A n B) / area(A u B)
```

```
+------------------+
|    Box A         |
|       +----------+--------+
|       |   n      |        |
+-------+----------+        |
        |    Box B          |
        +-------------------+

IoU = (area of overlap) / (area of A + area of B minus area of overlap)
```

| IoU value | Meaning |
|-----------|---------|
| 1.0 | Boxes are identical |
| 0.5 | Roughly half the combined area is shared |
| 0.25 | Minimal but meaningful overlap |
| 0.0 | No overlap |

IoU is used in the detection dedup step: newly decoded bounding boxes whose IoU with an already-kept box exceeds `detection_iou_dedup_threshold` (default: 0.55) are suppressed before the tracker sees them. The world tracker's association uses floor-plane Mahalanobis distance, not IoU.

## Kalman filter

A Kalman filter is a recursive state estimator. Given a noisy stream of floor-position observations, it maintains a smoothed estimate of a person's position and velocity and predicts where they will be in the next frame.

### State vector

The world tracker uses a 4-dimensional floor-plane state (`app/tracking/world/kalman.py`):

```
x = [x_m, y_m, vx_m_s, vy_m_s]^T
```

| Component | Meaning |
|-----------|---------|
| `x_m`, `y_m` | Position on the shared floor plane in metres |
| `vx_m_s`, `vy_m_s` | Velocity in metres per second |

The observation is `z = [x_m, y_m]^T` from the per-camera homography (the calibrated `FloorPoint`). Velocity is inferred from the sequence of floor positions, not measured from the frame directly.

### Predict and update

Each frame, the filter runs two steps:

```mermaid
flowchart LR
    Predict["Predict\nProject state forward\nusing velocity terms"]
    Observe["Observe\ncalibrated FloorPoint\narrives"]
    Update["Update\nBlend prediction\nwith observation"]
    Predict --> Observe --> Update --> Predict
```

- **Predict**: advances the position by `velocity * dt` and decays velocity toward zero over `velocity_decay_s` (default: 3.0 s). This is where the filter extrapolates a person's floor position when no observation arrives.
- **Update**: blends the prediction with the observed floor point using the Kalman gain, weighted by `observation_noise_m` (default: 0.25 m, the calibration residual 95th percentile).

The result is a track that tolerates brief observation gaps and produces smooth floor positions even when the detector or homography is noisy.

### Mahalanobis gating

Before the Hungarian assignment, pairs whose squared Mahalanobis distance exceeds `gate_chi2 = 9.21` (chi-squared 99%, 2 dof) are excluded. This prevents the solver from assigning a detection to a PH on the opposite side of the room.

## Hungarian algorithm

The Hungarian algorithm (also called the Munkres algorithm) solves the **assignment problem**: given a cost matrix where `cost[i][j]` is the cost of assigning track `i` to detection `j`, find the globally optimal one-to-one assignment that minimizes total cost.

```
Tracks:      T1   T2   T3
            +-------------------------------+
Detection D1| 0.1  0.8  0.9 | <- cheapest: T1
Detection D2| 0.7  0.2  0.8 | <- cheapest: T2
Detection D3| 0.9  0.7  0.3 | <- cheapest: T3
            +-------------------------------+
Optimal assignment: D1->T1, D2->T2, D3->T3  (total cost: 0.6)
```

A greedy approach (each detection picks its cheapest track independently) would fail when two detections compete for the same track. The Hungarian algorithm solves this globally and runs in O(n^3) time, which is fast enough for typical frame sizes (fewer than 20 people per camera).

Any detection left unmatched after the assignment spawns a new track. Any track left unmatched increments its lost counter.

## World tracker association

The world tracker combines the Kalman filter, Hungarian algorithm, and appearance embeddings into a single floor-plane tracker. There is no per-camera tracker; one `WorldTracker` instance processes observations from all cameras in a single pass.

### Association cost

The cost matrix (`app/tracking/world/cost_matrix.py`) passed to the Hungarian algorithm is a weighted blend of three components:

```
cost(PH i, observation j) = alpha_geo * geo_cost + alpha_app * app_cost + alpha_height * height_cost
```

| Component | Default weight | Measurement |
|-----------|----------------|-------------|
| `geo_cost` | `alpha_geo = 0.5` | Normalized Mahalanobis distance on the floor plane |
| `app_cost` | `alpha_app = 0.4` | Cosine distance to the best-matching PH view prototype (max-over-views), falling back to the single gallery mean when no prototypes exist |
| `height_cost` | `alpha_height = 0.1` | Gaussian score on height difference |

Two hard gates return `GATE_INF` (never match):

- Geometric gate: squared Mahalanobis distance `> gate_chi2 (9.21)`. For uncalibrated observations the gate is widened to `uncalibrated_gate_chi2 (21.0)` and appearance is weighted more heavily, because synthetic floor points are not metric.
- Identity-conflict gate: the observation carries a recognized face `person_id` that differs from the PH's identity at confidence `>= face_conflict_threshold (0.70)`.

### PH lifecycle

```mermaid
stateDiagram-v2
    [*] --> Active: unmatched obs (spawn)\nor revival of a closed PH
    Active --> Active: matched obs\n(Kalman update, EMAs)
    Active --> Coasting: no match this frame\n(grace not yet exceeded)
    Coasting --> Active: re-matched
    Coasting --> Closed: unobserved > ph_close_grace_s
    Closed --> Active: revival reuses ph_id\n(same or adjacent camera)
    Closed --> [*]
```

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `min_observations_to_publish` | 3 | Minimum observations before a PH appears in downstream outputs |
| `ph_close_grace_s` | 15.0 s | Grace period before an unmatched PH is closed |
| `revive_max_age_s` | 30.0 s | A closed PH older than this is not revived |
| `revive_max_distance_m` | 2.0 m | Spawn point versus closed PH last position (same-camera revival) |
| `revive_appearance_min_sim` | 0.55 | Minimum appearance cosine for same-camera revival |
| `inferred_handoff_max_s` | 600 s | Window for publishing a continuation candidate to CC |

A PH with `observation_count < min_observations_to_publish` is tracked internally but produces no `WorldFrameSnapshot` and no downstream output, filtering out single-frame detection noise.

### PH revival (continuity)

Before spawning a brand-new UNKNOWN PH for an unmatched observation, the tracker tries to revive a recently-closed PH that matches on space, time, and appearance, reusing its `ph_id`, identity, and gallery state. This keeps one person mapped to one PH through brief occlusions, turns, and association gaps, instead of fragmenting into many short-lived hypotheses. Same-camera revival uses `revive_*` thresholds above; cross-camera revival is gated by the learned camera topology and multi-view appearance (see [How identity crosses cameras](#how-identity-crosses-cameras)).

## PersonHypothesis (PH)

A **PersonHypothesis** (PH, frozen dataclass in `domain/__init__.py`) is the world-level entity representing one tracked person. It is the single physical-track identifier in the system. Every downstream output -- trajectory rows, room dwells, dementia signals, Redis stream events, and MCP tool responses -- references the `ph_id` (a UUID string) as the primary identity anchor.

A PH aggregates evidence from multiple cameras simultaneously. When two calibrated cameras share a field of view, the pre-association dedup pass ensures they produce exactly one PH, not two.

Key PH fields:

| Field | Meaning |
|-------|---------|
| `state_mean` | `(x, y, vx, vy)` floor-plane metres and m/s (Kalman mean) |
| `state_cov` | 16 floats, 4x4 row-major covariance |
| `born_at`, `last_seen_at`, `closed_at` | Lifecycle timestamps |
| `last_seen_camera`, `active_cameras` | Camera attribution; `active_cameras` accumulates every camera that has contributed |
| `observation_count` | Total observations folded in; gates publication via `min_observations_to_publish` |
| `current_identity_id`, `current_identity_committed_at` | The committed identity and when it was committed |
| `gallery_mean` | Online L2-normalised EMA of SOLIDER embeddings; `alpha = 1 / min(count+1, 100)` |
| `height_estimate_m` | EMA of height estimates (`alpha = 0.1`) |
| `mean_quality` | EMA of per-observation `CropQuality` scores: `0.1 * obs.quality + 0.9 * prev`. Travels to CC as the `quality` field on `PersonLocationEnvelope`. |

**Uncalibrated cameras.** When a camera has no homography, `SpatialProjectionStage` yields `FloorPoint(calibrated=False)`. `WorldTrackingStage._synthetic_floor_point` maps the bbox centre into a 4 m virtual room offset into a per-camera 200 m tile, still flagged `calibrated=False`. Because synthetic floor points jump as a person walks, the association gate is widened for uncalibrated observations (`uncalibrated_gate_chi2 = 21.0`) and appearance is weighted over geometry, so a turning or walking person is not dropped and respawned. Floor-distance dedup still skips uncalibrated observations, but appearance dedup within a declared overlap group does not. For uncalibrated home cameras, identity crosses cameras through the shared ReID gallery, recognized-face propagation, PH continuation, group-appearance dedup, and cross-camera revival.

### Quality and provenance

Each observation contributes a quality score from `CropQuality` (`app/pipeline/crop_quality.py`). The PH's `mean_quality` accumulates these scores across frames. Downstream consumers receive `quality` as an explicit field in the response envelope; they never compute it client-side.

## Cross-camera dedup

When two cameras see the same person simultaneously (the canonical case: a hallway camera and an adjacent camera at a bathroom door), naive association would produce two PHs for one person. The pre-association floor-point dedup (`dedup_observations()`) prevents this.

Before the Hungarian assignment runs, all detections with calibrated floor positions are grouped by floor proximity and identity compatibility. Each group elects one representative detection. Only representatives enter the `associate()` call, preserving the 1-to-1 contract of the Hungarian solver. After association, the cluster membership map propagates all source camera IDs back to the winning PH.

See [Frame Pipeline stage 7](./frame-pipeline.md#7-world-tracking) for the configuration knobs and the integration proof.

## PH continuation

When a person leaves the camera field and then re-enters, the world tracker detects the handoff via `PHContinuationCandidate`. When a new PH spawns, the tracker looks back at recently closed PHs: if a closed PH is within `inferred_handoff_max_s` (600 s) and `inferred_handoff_max_distance_m` (5.0 m), a `PHContinuationCandidate` is emitted with both PH IDs, the elapsed time, and the spatial distance.

The continuation candidate carries `predecessor_identity_id`, so the CC side can inherit the prior identity without waiting for the Bayesian resolver to re-accumulate evidence. CTS also acts on the handoff internally through cross-camera revival (carrier 6 in [How identity crosses cameras](#how-identity-crosses-cameras)): when the appearance and learned topology agree, the closed PH is revived on the new camera and keeps its `ph_id` and identity, rather than spawning a fresh UNKNOWN track. The Bayesian identity resolver then runs normally; the inherited gallery and face lock maintain the identity across the gap.

## Identity resolver

For each PH that received an observation this frame, `IdentityResolver.resolve` (`app/tracking/identity_resolver.py`) builds a posterior over `{enrolled identities} ∪ {UNKNOWN}` from four parts and applies a commit rule.

```mermaid
flowchart TD
  prior["Temporal prior\nprior_weight=0.6 on current identity\n+ uniform on others + unknown_mass=0.05"] --> comb
  face["Face likelihood\nstrongest anchor; p_face = sigmoid(0.7*conf+0.3*quality)\npropagated anchors x0.5"] --> comb
  reid["ReID likelihood\nmean recent gallery emb -> search_similar\nlogistic(sim); identified-entry + coherence boosts"] --> comb
  height["Height likelihood\nGaussian on enrolled height profile"] --> comb
  comb["_combine: posterior proportional to prior x face^(x3 if face supports id)\nx reid x height^(x1.5)\n(empty source = uniform)"] --> commit
  commit["_commit\ncommit if top_prob >= commit_prob AND margin >= commit_margin\nAND (sensory evidence present OR within maintenance window)"]
  commit -->|commit| set["ph_repo.update_identity(ph_id, identity_id, committed_at)"]
  commit -->|no commit| unknown["stay UNKNOWN / retain prior id within window"]
```

Commit thresholds: `commit_prob = 0.65`, `commit_margin = 0.15`; in dense scenes (2 or more identities with posterior > 0.3) `commit_prob_dense = 0.80`, `commit_margin_dense = 0.20`. The temporal prior alone cannot commit an identity: at least one sensory source (face or ReID) must support the top identity unless the PH is inside its maintenance window.

**Face lock and maintenance window.** When a face anchor's confidence clears `face_commit_min_confidence = 0.70`, the resolver sets a face lock on the PH. A face-locked identity is held without fresh face evidence for `face_lock_maintenance_max_age_s = 300 s`. Without a face lock, an existing identity is held by the prior for `prior_maintenance_max_age_s = 120 s`. After the window expires with no sensory evidence, the identity decays.

**Sticky maintenance (favor continuity).** When a person turns away, the face anchor vanishes and body ReID drifts, so the per-frame posterior argmax can flip to UNKNOWN even though the PH persists. Sticky maintenance holds the committed identity within the maintenance window unless it is strongly contradicted: a recognized face for a different identity at or above `contradiction_face_confidence = 0.70`, or a different identity that clears the dense-scene posterior thresholds. A candidate or unrecognized face never contradicts a held identity, so a resident at a bad angle keeps their label instead of dropping to UNKNOWN. Two enrolled people in one room still separate, because a recognized different-identity face does contradict.

### Three-valued face evidence and head pose

The person-identification-service already distinguishes a face that was detected but not recognized from no face region at all, and it computes head pose. CTS consumes all three states (`recognized` / `candidate` / `unrecognized`) plus head yaw:

| State | Similarity | Effect on the posterior |
|-------|-----------|--------------------------|
| `recognized` | at or above `recognition.threshold` | Strong positive for the matched identity, weighted `face_weight_multiplier = 3.0`, scaled by frontality |
| `candidate` | between `unknown_threshold` and `threshold` | Weak positive for the best candidate (`candidate_face_weight_multiplier`); corroborates a held identity through near-profile frames; never negative |
| `unrecognized` | below `unknown_threshold` | Small mass toward UNKNOWN (`face_present_unknown_unknown_mass = 0.10`); never subtracts from a held identity |
| no face region | n/a | Neutral; rely on body ReID, the prior, and sticky maintenance |

A frontality factor down-weights off-axis matches: full weight at or below `frontality_full_yaw_deg = 15` degrees yaw, ramping to a floor (`frontality_min_factor = 0.3`) at or above `frontality_zero_yaw_deg = 60` degrees. This reduces false commits from a glancing match while leaving frontal matches at full strength.

### Multi-view ReID gallery query

A single averaged body embedding cannot retrieve a person who turned around, because front and back are far apart in SOLIDER-REID space. The resolver estimates body orientation per observation from pose keypoints (front, back, left, right, unknown) and represents appearance as a small set of view-binned prototypes per PH and per identity. The gallery query runs once per orientation bin and takes the maximum logistic similarity across views, so a back-facing query that matches an identity's back entries scores high even when the front entries do not. A weak match leaves residual probability mass on UNKNOWN, so a non-matching body cannot be normalized onto the only enrolled identity.

Non-frontal gallery coverage grows online: once a PH has a recognized-face committed identity, subsequent observation embeddings are written to that identity's gallery tagged with their estimated orientation, subject to quality and orientation-confidence gates. Seeding requires a recognized face lock, so a candidate or unknown face never poisons the shared gallery.

## How a face signal updates a PH

This is the exact stage-by-stage path when ArcFace identifies a person on a camera:

```mermaid
sequenceDiagram
  participant FI as FaceIdentityStage (6)
  participant WT as WorldTrackingStage (7)
  participant TR as WorldTracker.step
  participant RS as IdentityResolver
  participant DB as PHRepository
  FI->>WT: FaceAnchor{person_id, confidence, detection_id}
  WT->>TR: observations (+ face anchors), now
  TR->>TR: associate() maps detection_id to ph_id (det_to_ph)
  TR->>RS: resolve(hypotheses, face_anchors remapped tracklet_id=ph_id)
  RS->>RS: _from_face_anchors -> strong face likelihood
  RS->>RS: _combine -> posterior, _commit clears thresholds
  RS-->>TR: IdentityDecision{ph_id, identity_id}
  TR->>DB: update_identity(ph_id, identity_id, committed_at=now)
  Note over RS,DB: if identity changed, an IdentityRevision is emitted\nand RevisionsStage rewrites past trajectory/dwell/signal rows
```

The key detail: `FaceIdentityStage` produces anchors keyed by `detection_id` (the PH does not exist yet at stage 6). After association, `WorldTracker._resolve_identities` remaps each anchor's `tracklet_id` to the assigned `ph_id` using `det_to_ph`. The identity-conflict hard gate in the cost matrix simultaneously prevents a strong, differing face from being matched to the wrong PH.

## How identity crosses cameras

```mermaid
flowchart TD
  subgraph paths["Cross-camera identity carriers"]
    d["1. Pre-association dedup\ncalibrated overlapping cameras\none PH carries both camera_ids"]
    e["5. Group-appearance dedup\nuncalibrated cameras in a declared\noverlap group, merged by appearance"]
    g["2. Shared ReID gallery\nPH on camera B matches identity entries\nfrom camera A; per-orientation max-over-views"]
    p["3. Cross-GT face propagation\nrecognized face on A creates synthetic anchor on B\nscaled by gallery similarity"]
    c["4. PH continuation candidate\nnon-overlapping handoff published to CC"]
    r["6. Cross-camera revival\nCTS reuses a closed PH id across cameras\ngated by learned topology + multi-view appearance"]
  end
```

Path 1 requires calibration. For uncalibrated home cameras, identity crosses through the ReID gallery (path 2), recognized-face propagation (path 3, gated twice: gallery similarity `>= cross_gt_face_propagation_threshold (0.72)` and `synthetic_confidence = source_confidence * gallery_sim >= face_commit_min_confidence (0.70)`), continuation candidates published to CC (path 4), appearance dedup within a declared overlap group (path 5), and cross-camera revival acted on inside CTS (path 6).

**Cross-camera revival (path 6)** extends PH revival across cameras. A closed PH may be revived on a different camera when the learned camera topology says the transit is plausible (`plausible_transit >= cross_camera_min_plausibility = 0.05`, with a floor so a first handoff is never blocked) and the multi-view appearance similarity clears `cross_camera_revive_appearance_min_sim = 0.60`. A recognized different-identity face blocks revival. When the predecessor PH is still open (a genuine co-presence on two overlapping cameras), CTS does not merge the PHs; it adopts the identity onto the new PH and records a co-presence link, so the dashboard shows one person on two views rather than two people.

**Camera topology** is learned online: each accepted handoff records a directed edge with a running transit-time distribution (`camera_topology_edges`). Until an edge has enough samples it returns the plausibility floor, so topology widens linking over time without blocking legitimate first handoffs.

## Next steps

- [Frame Processing Pipeline](./frame-pipeline.md): how all of these concepts fit into the full 15-stage pipeline
- [CC Integration](./cc-integration.md): how identity assignments and quality propagate to the WebSocket live view
