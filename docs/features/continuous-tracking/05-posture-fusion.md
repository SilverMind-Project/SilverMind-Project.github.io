# Posture Fusion

CTS estimates one posture per person hypothesis (PH), even when several cameras see that person at the same time. Each camera has a different view: one may see the side of a seated person clearly, another may see the same person head-on with the legs foreshortened, and a third may have the lower body partly occluded. Posture fusion keeps those cameras useful without letting a bad view dominate.

The implementation has three layers:

1. Per-camera posture scoring in `tracking-orchestrator/app/trajectory/posture.py`.
2. Geometry-aware camera weighting from `tracking-orchestrator/app/tracking/world/observation_model.py`.
3. Temporal smoothing in `GlobalPostureTracker`.

## Per-camera posture scores

`PostureStage` runs before trajectory writing and stores soft posture evidence in `FrameContext.det_posture_scores`. The value is a `PostureScores` object with three scores:

| Score | Meaning |
| --- | --- |
| `lying` | Evidence that the person is lying down |
| `sitting` | Evidence that the person is sitting |
| `standing_walking` | Evidence that the person is upright; motion energy later separates walking from standing |

These are not final labels. They are continuous values in `[0, 1]`, so multiple cameras can be averaged before a label is chosen.

## Why geometry matters

Keypoint confidence alone is not enough. A camera can have confident keypoints but still be a poor posture view:

- A front or back view can make a sitting person's bent legs look short or hidden.
- An overhead or head-on angle can make lying, sitting, and standing harder to separate.
- A bounding box cut off at the image edge or missing ankles means the lower body may be unreliable.

CTS computes an `ObservationGeometry` descriptor once during world tracking and stores it on `FrameContext.geometry_by_detection`. The posture path does not recompute geometry. It only calls:

```python
observation_model.posture_view_weight(geometry)
```

That function returns a multiplier in `[0, 1]`:

| View condition | Effect |
| --- | --- |
| Side view (`LEFT` or `RIGHT`) | Best posture view, weight near `1.0` |
| Front or back view | Penalized because sit/stand/lie are foreshortened |
| Unknown orientation | Conservative lower suitability when confidence is high |
| Unreliable footpoint / lower body | Strongly downweighted |

If no geometry exists, such as an uncalibrated camera path, the trajectory stage defaults the view weight to `1.0` so existing behavior is preserved.

## Fusion weight

`GlobalPostureTracker` stores one fresh `_CameraSnapshot` per `(PH, camera)` and fuses the active cameras for that PH. Each camera contributes:

```text
camera_weight = max(keypoint_confidence, depth_weight) * view_weight
```

The `depth_weight` floor keeps depth-only posture estimates from disappearing when `keypoint_confidence == 0.0`, but the view-suitability multiplier still scales the final contribution. A depth camera with a bad view is still downweighted.

The fused scores are weighted averages:

```text
fused_sitting = sum(camera_weight_i * sitting_i) / sum(camera_weight_i)
```

The same calculation is done for `lying` and `standing_walking`.

## Staleness

Posture snapshots expire after `camera_stale_after_s` seconds. If a person leaves one camera view, that camera's last posture score stops contributing after the stale window. This prevents an old "standing" view from dragging the fused posture after the person has sat down in another camera.

## Resolve margin

After fusion, `_resolve` chooses the top posture class only if it has enough evidence and, when changing away from the currently committed posture, beats the runner-up by the resolve margin.

```text
top_score - second_score >= 0.10
```

If the scores are too close, CTS keeps the committed posture. This handles same-frame ambiguity. Hysteresis handles time: a genuine new posture still has to remain stable for the configured consecutive-frame count before it becomes committed.

## Four-camera example

A person is sitting in a chair. Four cameras see them:

| Camera | View | Raw score | Keypoint confidence | View weight | Effective contribution |
| --- | --- | --- | --- | --- | --- |
| Hall side | Side, legs visible | sitting `0.82` | `0.90` | `1.00` | `0.90 * 1.00` |
| Kitchen side | Side, legs visible | sitting `0.78` | `0.86` | `1.00` | `0.86 * 1.00` |
| Door front | Front view | standing `0.80` | `0.92` | `0.60` | `0.92 * 0.60` |
| Corner partial | Lower body occluded | lying `0.70` | `0.75` | `0.30` | `0.75 * 0.30` |

Before geometry-aware weighting, the front camera could pull the fused result toward standing because its skeleton was confident. After weighting, the two side views dominate. The occluded camera still contributes, but only lightly.

The result is not "pick the best camera." Position still fuses all cameras, and posture still uses all fresh camera evidence. Geometry only changes how much each posture vote should count.

## Code references

| Concern | Code |
| --- | --- |
| Soft posture scores and hysteresis | `tracking-orchestrator/app/trajectory/posture.py` |
| Shared geometry descriptor | `tracking-orchestrator/app/domain/__init__.py` (`ObservationGeometry`) |
| Posture view suitability | `tracking-orchestrator/app/tracking/world/observation_model.py` (`posture_view_weight`) |
| Passing geometry weight into posture fusion | `tracking-orchestrator/app/pipeline/stages/trajectory.py` |
| Metrics | `tracking-orchestrator/app/observability/metrics.py` (`cts_posture_view_weight`) |

## Related pages

- [Tracking Concepts](./tracking-concepts.md)
- [Frame Pipeline](./frame-pipeline.md)
- [Camera Calibration](./camera-calibration.md)
