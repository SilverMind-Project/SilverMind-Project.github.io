# Why One Dot Jitters

The symptom was simple: a person stood still, but the live map showed one dot vibrating in place.

That dot is not drawn directly from a camera box. Cognitive Companion plots the floor position that CTS publishes from the world tracker. If the dot moves while the person is still, the tremble is already in the tracker state.

## What was not the cause

The first suspicion was walls. A camera image contains a lot of wall pixels, and a wall is not part of the floor plane.

That was a real bug in one place, but not in person localization:

| Mechanism | Wall pixels involved? | Why |
| --- | --- | --- |
| Homography fit | No | `compute_homography` uses only picked floor correspondences. |
| Person localization | No | `FloorProjector` projects the footpoint, not every image pixel. |
| Room containment | No | Room checks happen in floor-plan coordinates. |
| Visibility polygon | Yes, before M10 | The old CC coverage polygon projected the image border, which includes walls. |

Here `M09`, `M10`, and `M11` refer to the implementation milestones that shipped these changes. So page 6 fixes the wall-contaminated visibility polygon from M10. The vibrating person dot needed a different fix: measurement uncertainty and motion filtering.

## Cause 1: every camera was trusted too equally

Two cameras can see the same person from very different angles. One may look down at nearby feet. Another may see the same person far away at an oblique angle. The second camera can have much larger floor-position uncertainty, especially along the view ray.

Before the fusion work, the tracker treated position noise too uniformly:

- Cross-camera dedup used a crop-quality-weighted mean, so a sharp but geometrically poor crop could pull the fused point.
- The Kalman update used one fixed isotropic observation noise for every camera, angle, and distance.

When overlapping cameras had different fixed calibration offsets, the dot could be tugged between them.

## Cause 2: the motion model created phantom velocity

The world tracker uses a constant-velocity Kalman filter. That is useful when a person walks, but noisy measurements can look like tiny motion. The filter can infer a small velocity from that noise, carry it forward, then correct back on the next frame.

For a standing person, that feedback loop looks like tremble: drift, correction, drift, correction.

## What changed

CTS now gives each observation a 2x2 measurement covariance `R` in floor-plan metres squared. This says not only how noisy the point is, but which direction is noisy. Oblique cameras get elongated error ellipses; reliable near cameras get tighter ones.

Cross-camera dedup now fuses by inverse covariance, with a non-shrinking calibration bias floor. The Kalman filter consumes the fused matrix `R` directly. When a person is truly stationary, zero-velocity updates drive the velocity estimate back toward zero.

## M09 acceptance numbers

M09 turned the fix into CI gates, which are automated acceptance tests, instead of a visual judgment. The recorded baseline from 2026-06-18 shows:

| Gate | Legacy | Fused | Result |
| --- | --- | --- | --- |
| Stationary jitter | 0.0279 m | 0.0073 m | ratio 0.262, better than the <= 0.50 gate |
| Camera-dropout jump | n/a | 0.0197 m | below the < 0.15 m gate |
| Slow-shuffle speed | n/a | 0.2854 m/s | error 0.015 m/s, within the 0.05 m/s gate |
| Oblique covariance eigen-ratio | n/a | 4.125 | above the >= 3.5 anisotropy gate |
| Four-camera posture agreement | n/a | 96.7% | above the >= 95% gate |
| Walk lag | n/a | 0 frames | below the <= 2 frame gate |

The stationary jitter result is the headline number: the fused tracker reduced the still-person jitter from 2.79 cm to 0.73 cm in the replay gate. The slow-shuffle gate matters just as much, because a dementia-relevant slow walk around 0.2-0.4 m/s must not be clamped as "standing still."

## Code references

| Concern | Code |
| --- | --- |
| Replay acceptance gates | `tracking-orchestrator/tests/integration/test_fusion_acceptance.py` |
| Replay metric harness | `tracking-orchestrator/tests/integration/_fusion_metrics.py` |
| Information-form fusion | `tracking-orchestrator/app/tracking/world/observation_model.py::fuse_information_form` |
| Matrix-R Kalman and ZUPT | `tracking-orchestrator/app/tracking/world/kalman.py` |
| Tracker wiring | `tracking-orchestrator/app/tracking/world/tracker.py` |

Previous: [Camera to Floor Basics](./01-camera-to-floor-basics.md)

Next: [Measurement Uncertainty](./03-measurement-uncertainty.md)
