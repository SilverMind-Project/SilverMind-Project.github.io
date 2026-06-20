# Multi-Camera Fusion

CTS keeps one floor position per person hypothesis (PH), even when several overlapping cameras see the same person. Each camera measures that position with different view-dependent uncertainty. Fusion means combining those measurements without pretending they are equally precise.

This page builds on [Measurement Uncertainty](./03-measurement-uncertainty.md). The input is a per-observation covariance matrix `R`; the output is one fused position and one fused covariance for the Kalman tracker.

## Information-form fusion

A covariance matrix says how uncertain a measurement is. Its inverse is called information: a tight measurement has more information than a loose measurement.

For the random part of camera noise, CTS fuses observations in information form:

```text
R_random* = (sum inverse(R_random_i))^-1
x*        = R_random* * sum(inverse(R_random_i) * x_i)
```

This pulls the fused point toward the cameras with tighter random covariance. A far oblique camera still contributes, but it cannot yank the result as much as a near reliable camera.

The implementation lives in `tracking-orchestrator/app/tracking/world/observation_model.py::fuse_information_form`; `tracking-orchestrator/app/tracking/world/dedup.py` calls it while collapsing same-person cross-camera observations.

## Random noise and systematic bias

Not all uncertainty should shrink when more cameras see the same person.

Random detector noise is independent from frame to frame and camera to camera, so averaging can reduce it. Calibration bias is different: if a camera's homography is offset by 20 cm, that fixed offset does not disappear just because another camera also sees the person.

CTS therefore fuses only the random term and adds a non-shrinking bias floor afterward:

```text
R* = R_random* + R_bias_floor
```

The bias floor is derived from calibration residuals in the cluster. This prevents the filter from becoming overconfident and prevents large jumps when one camera drops out of an overlap set.

## Matrix-R Kalman update

The floor tracker in `tracking-orchestrator/app/tracking/world/kalman.py` tracks:

```text
[x, y, vx, vy]
```

Position is in metres and velocity is in metres per second. The update step now accepts the full 2x2 `R` matrix:

```text
S = H * P * H^T + R
K = P * H^T * S^-1
```

Because `R` can be stretched in one direction, the filter can trust the good axis more than the bad axis. The same covariance also feeds association gating through Mahalanobis distance, so uncertain oblique measurements get a gate that matches their actual shape.

## ZUPT for stationary people

ZUPT means zero-velocity update. It is a pseudo-measurement that says "this person appears stationary; velocity should be near zero."

CTS applies it only after both speed and innovation stay low for enough frames. The default bands are chosen to avoid freezing a real slow shuffle:

| Tunable | Default | Purpose |
| --- | --- | --- |
| `zupt_speed_enter_m_s` | `0.12` | Enter stationary mode below this sustained speed. |
| `zupt_speed_exit_m_s` | `0.20` | Release before the dementia slow-shuffle band. |
| `zupt_consecutive_frames` | `5` | Debounce brief pauses or noisy frames. |

The slow-shuffle gate measured 0.2854 m/s for a 0.3 m/s truth path, so ZUPT did not clamp
clinically meaningful slow walking.

## Stabilized primary camera

Position is still fused from all contributing cameras. CTS separately chooses one primary camera for the crop, keyframe association, and room fallback when a fused point is outside all room polygons.

Each observation carries a `primary_score` from `observation_model.primary_camera_score`. The tracker picks the best current camera, then applies hysteresis: a challenger must win for `primary_switch_frames` before the PH primary changes. This keeps the crop and room label from flickering while the position remains fused.

## Code references

| Concern | Code |
| --- | --- |
| R model and information fusion | `tracking-orchestrator/app/tracking/world/observation_model.py` |
| Cross-camera dedup | `tracking-orchestrator/app/tracking/world/dedup.py` |
| Matrix-R Kalman and ZUPT | `tracking-orchestrator/app/tracking/world/kalman.py` |
| Tracker wiring and primary camera | `tracking-orchestrator/app/tracking/world/tracker.py` |
| Persisted confidence fields | `tracking-orchestrator/app/storage/postgres/trajectory.py` |

Previous: [Measurement Uncertainty](./03-measurement-uncertainty.md)

Next: [Posture Fusion](./05-posture-fusion.md)
