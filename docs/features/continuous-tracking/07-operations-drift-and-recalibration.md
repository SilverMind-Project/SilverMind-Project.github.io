# Operations, Drift, and Recalibration

A calibrated camera is assumed to stay fixed. If it is bumped, rotated, or moved, its homography no longer matches the scene. Person localization can become offset, cross-camera dedup can degrade, and room-level signals can become less reliable.

M11 adds drift detection: CTS scores whether a camera still matches its calibration reference frame, and CC flags the camera for operator review. The system never silently recalibrates.

## Reference frame

When an operator commits a homography, CC captures a live camera snapshot and stores it with a stable key:

```text
calibration-refs/{camera_id}/{calibrated_at}.jpg
```

The key is stored on `cts_cameras.calibration_ref_key`. That image is the baseline for later drift checks.

## Drift score

The pure scoring function is `tracking-orchestrator/app/calibration/drift.py::drift_score`. It compares the reference frame with a recent frame.

The primary metric is ORB feature matching plus RANSAC inlier ratio:

1. Convert both frames to grayscale.
2. Extract ORB keypoints and binary descriptors.
3. Match descriptors with a Hamming-distance matcher.
4. Apply Lowe's ratio test to discard ambiguous matches.
5. Fit a homography with RANSAC.
6. Compute `inlier_ratio = inliers / good_matches`.

An inlier ratio below `0.35` is flagged as drift by default.

## Why ORB is primary and SSIM is secondary

SSIM measures image similarity. It is useful context, but it can fall when lighting changes between day and night even if the camera did not move.

ORB descriptors are more robust to brightness and contrast changes. That is why ORB/RANSAC is the primary decision metric. CTS still returns Gaussian-windowed mean SSIM as supporting information for operators, but SSIM alone does not trigger a drift flag.

The scorer also estimates rotation and translation from inlier matches:

| Check | Default flag threshold |
| --- | --- |
| ORB/RANSAC inlier ratio | `< 0.35` |
| Rotation | `> 1.5 deg` |
| Translation | `> 15 px` |

If there are too few feature matches, the result is `drifted=False` with `reason="insufficient_features"`. That avoids noisy alerts from dark or textureless frames.

## Human-in-the-loop policy

When drift is detected, CC sets:

| Column | Meaning |
| --- | --- |
| `needs_recalibration` | camera requires operator review |
| `drift_checked_at` | time of the latest check |
| `drift_reason` | scorer reason such as `low_inlier_ratio:0.120` |

The admin UI surfaces a drift badge and offers a recalibration call to action. The operator still reviews and commits the new calibration. No endpoint mutates the active homography just because drift was detected.

## Polling cadence

CC owns the periodic poll in `cognitive-companion/backend/services/cts/drift_poll.py`. The default interval is hourly through `cts.drift_poll_interval_s = 3600`. Drift is rare, so this check should not run at camera frame rate.

## Recalibration flow

1. Open the CTS camera admin UI and find the camera with the drift badge.
2. Start the recalibration flow.
3. Review the auto-calibration proposal and floor-region overlay.
4. Adjust points or the floor region if needed.
5. Commit the calibration.

On commit, CC clears `needs_recalibration`, stores a new reference frame, and the new homography becomes the active mapping for future CTS localization.

## Code references

| Concern | Code |
| --- | --- |
| Drift scoring | `tracking-orchestrator/app/calibration/drift.py::drift_score` |
| CTS drift endpoint | `tracking-orchestrator/app/routers/calibration.py` (`POST /internal/calibration/drift/{camera_id}`) |
| CC drift poll | `cognitive-companion/backend/services/cts/drift_poll.py` |
| CC orchestrator client | `cognitive-companion/backend/integrations/tracking_orchestrator_client.py::check_drift` |
| CC camera columns | `cognitive-companion/backend/models/cts_camera.py` |

Previous: [Floor Region and Visibility](./06-floor-region-and-visibility.md)
