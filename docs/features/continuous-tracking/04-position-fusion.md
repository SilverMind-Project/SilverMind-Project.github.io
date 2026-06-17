# Multi-Camera Position Fusion

CTS keeps one floor position per person hypothesis (PH), even when several overlapping cameras see the same person at once. Each camera measures that position with a different, view-dependent uncertainty: a camera looking along the floor at a distant person localises poorly along the view ray, while a camera looking down at a nearby person localises tightly. Position fusion weights every camera by *how much it should be trusted*, so the live-map dot for a stationary person stays still instead of vibrating between cameras.

This page covers four cooperating pieces, all driven by one shared geometry descriptor:

1. The per-observation measurement covariance `R` (the "how much to trust this camera" matrix).
2. Information-form cross-camera fusion with a non-shrinking calibration floor.
3. The matrix-`R` floor-plane Kalman filter.
4. Zero-velocity updates (ZUPT) and the stabilized primary camera.

## The measurement covariance R

Every calibrated observation carries a `2×2` covariance in floor-plane metres² describing how uncertain its position estimate is, and in which direction. It is built from one pure module, `tracking-orchestrator/app/tracking/world/observation_model.py`, so the same math feeds position fusion, posture weighting, and primary-camera selection.

```text
R_obs = J · Σ_px · Jᵀ  +  R_cal
```

| Term | Meaning |
| --- | --- |
| `Σ_px` | Footpoint uncertainty in **pixels²**. A base detector noise, inflated steeply when the feet are occluded or the bounding box is truncated, and scaled up when detection confidence or crop quality is low. |
| `J` | The `2×2` Jacobian of the homography at the footpoint, in **m/px**. It maps pixel uncertainty into floor metres and is what makes `R` *anisotropic*: oblique and far views get error stretched along the view ray. |
| `R_cal` | A **systematic** per-camera term from the calibration reprojection residual: `(k_cal · residual_m)² · I`. It encodes the fixed offset baked into a camera's homography. |

The `J · Σ_px · Jᵀ` part is the **random** term (independent detector noise). `R_cal` is the **systematic** term. The distinction is the heart of the fusion rule below.

## Information-form fusion (random vs systematic)

When dedup collapses several cameras that see the same person into one representative, it fuses their positions by **inverse-covariance (information-form) weighting** rather than a plain average. A camera with a small `R` pulls the fused point toward itself; a camera with a large `R` barely moves it.

```text
R_random* = ( Σ R_random_i⁻¹ )⁻¹
x*        = R_random* · Σ ( R_random_i⁻¹ · x_i )
R*        = R_random* + R_bias_floor
```

The critical detail is the **split**:

- The **random** term is inverse-summed, so it shrinks roughly like `1/N` with more cameras. That is correct — independent detector noise averages out.
- The **systematic** `R_bias_floor` (derived from the worst calibration residual in the cluster) is **added after** fusion. It must **not** shrink with camera count. Each camera's calibration offset is fixed, not random, so fusing it away would make the filter overconfident and make the dot **jump** by the inter-camera bias difference whenever the visible camera set changes — the exact symptom fusion is meant to remove.

A single-camera observation never goes through the inverse-sum, so dedup finalises it explicitly to the **total** `R = J · Σ_px · Jᵀ + R_cal`. Without this, single-camera tracks (the common case) would be filtered with only the random part and behave as if the calibration were perfect.

> **Implementation note.** The fusion math lives only in `observation_model.py`; `dedup.py` calls it. The representative that leaves dedup always carries the total `R` (fused `R*` for multi-camera clusters, `random + bias floor` for singletons), so the Kalman filter and the association gate consume a uniform covariance with no special-casing.

## Matrix-R Kalman filter

The floor-plane tracker (`tracking-orchestrator/app/tracking/world/kalman.py`) is a constant-velocity Kalman filter over `[x, y, vₓ, v_y]` in metres and m/s. Its `update` step takes the fused `2×2` `R` directly:

```text
S = H · P · Hᵀ + R
K = P · Hᵀ · S⁻¹      (solved, not inverted, for numerical stability)
```

Because `R` is anisotropic, the gain `K` pulls the estimate more along the well-measured axis than the poorly-measured one. The same `R` feeds the **association gate**: an uncertain observation has a smaller Mahalanobis distance, so it gates more permissively — exactly what you want for a far, oblique detection.

Uncalibrated or synthetic floor points have no homography and therefore no Jacobian. They fall back to a large fixed isotropic `R` (`observation_noise_m²·I`) so they contribute little.

## Zero-velocity updates (ZUPT)

A constant-velocity model manufactures phantom velocity out of measurement noise: a perfectly still person's estimate drifts, then snaps back, which the live map shows as tremble. ZUPT fixes this with a velocity pseudo-measurement.

When a PH's speed and innovation both stay small for `zupt_consecutive_frames`, the tracker applies `zero_velocity_update`, which nudges `vₓ, v_y` toward zero. Position is corrected through the cross-covariance, removing the drift.

The thresholds are tuned around a clinical safety constraint:

| Tunable | Default | Purpose |
| --- | --- | --- |
| `zupt_speed_enter_m_s` | `0.12` | Below this (sustained), treat as stationary. |
| `zupt_speed_exit_m_s` | `0.20` | Above this, release ZUPT. Sits at the **bottom of the dementia shuffle band (0.2–0.4 m/s)** so a genuine slow walk is never clamped. |
| `zupt_consecutive_frames` | `5` | Debounce so a momentary mid-walk pause is not clamped. |

The enter/exit hysteresis and the debounce together ensure a slow shuffling gait — which feeds the pacing, wandering, and stillness signals — is never frozen to zero.

## Stabilized primary camera

Position is always the fused Kalman state, never a single camera. But the snapshot still needs **one** camera label for the displayed crop, keyframe selection, and the room fallback when no room polygon contains the fused point.

Each observation carries a `primary_score` (footpoint reliability × crop quality × detection confidence). Each frame the tracker picks the best-scoring contributing camera, then applies hysteresis: a challenger must be best for `primary_switch_frames` consecutive frames before the PH's primary actually switches. This stops the displayed crop and room label from flickering across overlapping cameras while the fused dot stays put.

## Why this removes the jitter

The original tracker fused cameras with a crop-quality-weighted mean and ran the Kalman with a single fixed isotropic noise for every camera, angle, and distance. Two overlapping cameras with different fixed biases would tug the mean back and forth, and the constant-velocity model kept injecting phantom velocity. The result was "one dot vibrating in place."

With per-observation `R`, inverse-covariance fusion, a non-shrinking bias floor, and ZUPT, a stationary person resolves to a steady fused point whose uncertainty never collapses below the calibration floor, and whose velocity is actively held at zero.

## Code references

| Concern | Code |
| --- | --- |
| Geometry descriptor and R model | `tracking-orchestrator/app/tracking/world/observation_model.py` |
| Footpoint covariance through the homography | `tracking-orchestrator/app/tracking/floor_projector.py` (`project_with_covariance`) |
| Cross-camera fusion + bias floor | `tracking-orchestrator/app/tracking/world/dedup.py` |
| Matrix-R Kalman + ZUPT | `tracking-orchestrator/app/tracking/world/kalman.py` |
| Tracker wiring, primary camera, ZUPT gating | `tracking-orchestrator/app/tracking/world/tracker.py` |
| Persisted per-point confidence | `position_sigma_m`, `primary_camera_id`, `contributing_camera_count`, `footpoint_reliable` on `person_trajectories` |

## Related pages

- [Tracking Concepts](./tracking-concepts.md)
- [Camera Calibration](./camera-calibration.md)
- [Posture Fusion](./05-posture-fusion.md)
