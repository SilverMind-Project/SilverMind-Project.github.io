# Tracking Concepts

Explanations of the core algorithms used by the per-camera tracker (`app/tracking/tracker.py`). These concepts apply to step 6 (per-camera tracking) and step 7 (tracklet management) in the [Frame Processing Pipeline](./frame-pipeline.md).

## Bounding box and IoU

A bounding box is a rectangle that encloses a detected person. CTS uses axis-aligned boxes described by four pixel coordinates: `(x_min, y_min, x_max, y_max)`.

**Intersection over Union (IoU)** measures how much two bounding boxes overlap:

```
IoU = area(A ∩ B) / area(A ∪ B)
```

```
┌──────────────┐
│    Box A     │
│       ┌──────┼──────┐
│       │  ∩   │      │
└───────┼──────┘      │
        │    Box B    │
        └─────────────┘

IoU = (area of overlap) / (area of A + area of B − area of overlap)
```

| IoU value | Meaning |
|-----------|---------|
| 1.0 | Boxes are identical |
| 0.5 | Roughly half the combined area is shared |
| 0.25 | Minimal but meaningful overlap |
| 0.0 | No overlap |

IoU is used in two places in the tracker:

- **Association gate**: a detection is only accepted as a match for an existing track when `IoU >= match_thresh` (default: 0.2). This prevents the Hungarian solver from assigning a detection to a track on the opposite side of the frame.
- **Dedup filter**: a newly created track that overlaps a stable existing track by `IoU > dedup_iou_threshold` (default: 0.6) is dropped immediately to prevent ghost duplicate tracks.

## Kalman filter

A Kalman filter is a recursive state estimator. Given a noisy stream of observations (bounding box positions from YOLO), it maintains a smoothed estimate of the person's current position and predicts where they will be in the next frame.

### State vector

The 8-dimensional state vector follows the BoT-SORT formulation:

```
x = [cx, cy, a, h, v_cx, v_cy, v_a, v_h]ᵀ
```

| Component | Meaning |
|-----------|---------|
| `cx`, `cy` | Bounding box center coordinates |
| `a` | Aspect ratio (width / height) |
| `h` | Height |
| `v_cx`, `v_cy`, `v_a`, `v_h` | Frame-to-frame velocities of the above |

The observation vector is just the first four components: `z = [cx, cy, a, h]ᵀ`. Velocities are inferred from the sequence of observations, not measured directly.

### Predict and update

Each frame, the filter runs two steps:

```mermaid
flowchart LR
    Predict["Predict\nProject state forward\nusing velocity terms"]
    Observe["Observe\nYOLO detection\narrives"]
    Update["Update\nBlend prediction\nwith observation"]
    Predict --> Observe --> Update --> Predict
```

- **Predict**: multiplies the state by the transition matrix `F`, which adds velocity to position. This is where the filter extrapolates the person's location when no detection is present.
- **Update**: blends the prediction with the observed bounding box using the Kalman gain (a weighting that depends on how uncertain the prediction is versus how noisy the measurement is).

The result is a track that tolerates brief detection gaps and produces smooth bounding boxes even when the detector is noisy.

## Hungarian algorithm

The Hungarian algorithm (also called the Munkres algorithm) solves the **assignment problem**: given a cost matrix where `cost[i][j]` is the cost of assigning track `i` to detection `j`, find the globally optimal one-to-one assignment that minimizes total cost.

```
Tracks:      T1   T2   T3
            ┌──────────────┐
Detection D1│ 0.1  0.8  0.9 │ ← cheapest: T1
Detection D2│ 0.7  0.2  0.8 │ ← cheapest: T2
Detection D3│ 0.9  0.7  0.3 │ ← cheapest: T3
            └──────────────┘
Optimal assignment: D1→T1, D2→T2, D3→T3  (total cost: 0.6)
```

A greedy approach (each detection picks its cheapest track independently) would fail when two detections compete for the same track. The Hungarian algorithm solves this globally and runs in O(n³) time, which is fast enough for typical frame sizes (fewer than 20 people per camera).

Any detection left unmatched after the assignment spawns a new track. Any track left unmatched increments its lost counter.

## BoT-SORT

BoT-SORT (Boosting Online Multi-Object Tracking with Appearance Features) combines the Kalman filter, Hungarian algorithm, and appearance embeddings into a single tracker.

### Association cost

The cost matrix passed to the Hungarian algorithm is a weighted blend:

```
cost(track i, detection j) = (1 − α) × IoU_cost(i, j) + α × appearance_cost(i, j)
```

where:
- `IoU_cost = 1 − IoU(predicted_bbox, detection_bbox)` — spatial agreement
- `appearance_cost = cosine_distance(track_embedding, detection_embedding)` — visual similarity
- `α = appearance_weight` (default: 0.15)

With `appearance_weight = 0.15`, spatial position (IoU) dominates the assignment. Appearance acts as a tiebreaker when two detections are at similar distances from a track. This is intentional: when a person turns away from the camera, their ReID embedding changes significantly, but their bounding box position barely moves. Weighting IoU heavily prevents the tracker from losing the track due to an appearance change.

After the Hungarian step, a match is **accepted only if** `IoU >= match_thresh` (default: 0.2). Appearance similarity alone cannot force a match. This prevents the solver from pairing a detection with a distant track purely because their embeddings happen to be similar.

### Track lifecycle

```mermaid
stateDiagram-v2
    [*] --> Tentative: unmatched detection\nconfidence >= new_track_thresh
    Tentative --> Tentative: matched\nhit_count < min_hits
    Tentative --> Confirmed: matched\nhit_count >= min_hits
    Confirmed --> Confirmed: matched
    Confirmed --> Lost: unmatched\nlost_count < max_time_lost
    Lost --> Confirmed: matched again
    Lost --> [*]: lost_count >= max_time_lost
    Tentative --> [*]: lost before confirmed
```

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `new_track_thresh` | 0.7 | Minimum detection confidence to spawn a new track |
| `min_hits` | 3 | Consecutive matches required before a track is "confirmed" |
| `max_time_lost` | 30 frames | Frames without a match before the track is terminated |

A confirmed track feeds into the tracklet manager and identity pipeline. Tentative tracks are tracked in memory but produce no outputs, filtering out single-frame detection noise.

### Ghost suppression (dedup)

When the detector produces a duplicate bounding box for a person already tracked (common at scene boundaries or with overlapping NMS windows), the result is a new tentative track that overlaps the stable track. The dedup step checks every new tentative track against all confirmed tracks with `age >= dedup_min_age` (default: 3). If `IoU > dedup_iou_threshold` (default: 0.6), the new track is dropped immediately before it can appear in any output.

## Tracklet stability gate

A Tracklet wraps a confirmed track and carries detection history, ReID gallery entries, and identity metadata. Tracklets with `frames_alive < min_frames_to_publish` (default: 3) are withheld from cross-camera association, identity resolution, trajectory writing, and the published `TrackingEvent`. They accumulate evidence in memory but produce no external outputs.

This gate prevents transient YOLO detections from flickering into the live view or triggering spurious identity commits before enough positional and appearance evidence has been gathered.

## Same-camera re-entry

When a track is lost (the person left the frame, the camera was occluded, or BoT-SORT failed to associate a detection) and then re-detected, the following sequence occurs:

1. BoT-SORT creates a new local track and confirms it after `min_hits` frames.
2. The TrackletManager promotes it to a new Tracklet.
3. After the Tracklet passes the stability gate, the cross-camera associator checks whether its ReID embedding is similar to any existing GlobalTrack on the same camera.
4. If `appearance_sim >= same_camera_reentry_threshold` (default: 0.72) and the gap is small, the new Tracklet is merged into the existing GlobalTrack.
5. The existing GlobalTrack retains its identity assignment. The live view shows the correct label without re-running the full identity resolution pipeline.

## Next steps

- [Frame Processing Pipeline](./frame-pipeline.md): how tracking fits into the full 15-stage pipeline
- [CC Integration](./cc-integration.md): how identity assignments propagate to the WebSocket live view
