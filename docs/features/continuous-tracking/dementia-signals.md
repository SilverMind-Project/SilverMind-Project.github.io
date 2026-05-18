# Dementia Signal Detection

A periodic worker (`DementiaSignalWorker`) runs every 60 s (configurable) and computes six signal kinds per tracked identity. Each signal is persisted via upsert with a deterministic UUID5 so the same detection window always maps to the same row.

## Signal computation

All signals use robust z-scores (median + MAD) against per-person historical baselines fetched from the `BehaviorBaselineRepository`. A configurable hysteresis system prevents flicker:

- **Onset debounce**: a trigger condition must hold for `min_consecutive` runs (default: 2) before first emission.
- **Cooldown**: after emission, the same (identity, kind) is suppressed for `cooldown_minutes` (default: 60) unless severity escalates.
- **Severity monotonic**: within an active episode, severity only increases; the episode closes when the trigger condition clears.

Incremental window computation (enabled by default) merges new trajectory/dwell data with rolling state from previous runs, avoiding re-fetching the full 24-hour window on each cycle.

## Signal kinds

| Kind | Trigger | Baseline | Severity tiers |
|------|---------|----------|----------------|
| `pacing` | Repeated room transitions in a 30 min window, normalized for observation density. Minimum 8 transitions and 2 unique rooms. Purpose-driven ambulation (kitchen, living room, bathroom) typically produces 5-6 transitions; 8+ in 30 min identifies repetitive, purposeless movement. | 30-day hourly activity transition rates | `info` (>0.15 rate), `warning` (>0.3 rate), `emergency` (rate-based) |
| `sundowning_index` | Evening (17:00-22:00 local) room transition rate vs 14-day evening baseline. Minimum 30 evening observation-minutes. | 14-day evening-window activity | `info` (mod-z >= 2.5), `warning` (>= 3.0), `emergency` (>= 4.0) |
| `bathroom_dwell_anomaly` | Current open bathroom dwell vs 30-day closed-dwell duration baseline. Nighttime (22:00-06:00) uses a relaxed z-threshold (4.0 vs 3.5). Cold start (before 5+ baseline samples): absolute 45 min threshold, severity capped at `warning`. | 30-day dwell durations | `info` (z >= 3.5), `warning` (z >= 4.0), `emergency` (z >= 5.0) |
| `nighttime_movement` | Room transitions during 22:00-06:00 local time. Cold start: flat threshold of 3 transitions (one bathroom trip returns 2 transitions; 3+ indicates additional nocturnal movement). | 14-day hourly activity | `info`, `warning` (z >= 3.0), `emergency` (z >= 4.0) |
| `stillness_anomaly` | Sustained near-zero motion energy in a non-resting posture (lying in non-bedroom, or prolonged sitting/standing). Default threshold: 60 min. Desk work, reading, and TV watching routinely exceed 30 min without clinical concern; 60 min aligns with clinical guidelines for meaningful seated immobility. Resting rooms are configurable (default: "bed", "bedroom"). | 30-day stillness episode durations | Posture-aware: `lying` starts at `warning` (escalates to `emergency` at 120 min); `sitting`/`standing` starts at `info` at threshold (upgrades to `warning` at 2× threshold) |
| `absence` | No detection for > 60 min (configurable). Cameras do not cover every room; 30 min gaps are normal (cooking, porch, bathroom). Hourly context from 14-day baseline: if the person is historically frequently absent at this hour, severity is demoted. | 14-day hourly activity | `info` (>60 min), `warning` (>120 min), `emergency` (>180 min); demoted by `expected_absence_prior` |

## Signal structure

Each `DementiaSignal` carries:

| Field | Description |
|-------|-------------|
| `signal_id` | Deterministic UUID5 from `(identity, kind, window_start, window_end)` |
| `identity_id` | Tracked person |
| `signal_kind` | One of the 6 kinds above |
| `severity` | `info`, `warning`, or `emergency` |
| `value` | Raw metric value (rate, duration, transition count) |
| `baseline` | Historical median from the 30-day baseline |
| `z_score` | Modified z-score against the baseline |
| `window_start` / `window_end` | Detection window (UTC) |
| `algorithm_version` | Version stamp for signal evolution (currently 3) |
| `context` | Structured JSON payload with kind-specific details |

Acknowledging a signal in the admin UI sets `acknowledged_at`, which the `dementia_signal` filter uses for cooldown.

## Configuring signal thresholds

All signal thresholds are configurable via environment variables, with defaults set to clinically validated values. Override any threshold in the tracking orchestrator's `config/settings.yaml` or via environment variable:

```yaml
# tracking-orchestrator/config/settings.yaml
signal:
  interval_s: "${SIGNAL_INTERVAL_S:-60}"
  stillness_threshold_minutes: "${SIGNAL_STILLNESS_THRESHOLD_MINUTES:-60}"
  stillness_emergency_minutes: "${SIGNAL_STILLNESS_EMERGENCY_MINUTES:-120}"
  stillness_motion_floor: "${SIGNAL_STILLNESS_MOTION_FLOOR:-0.02}"
  pacing_room_threshold: "${SIGNAL_PACING_ROOM_THRESHOLD:-8}"
  pacing_window_minutes: "${SIGNAL_PACING_WINDOW_MINUTES:-30}"
  nighttime_transition_threshold: "${SIGNAL_NIGHTTIME_TRANSITION_THRESHOLD:-3}"
  absence_threshold_minutes: "${SIGNAL_ABSENCE_THRESHOLD_MINUTES:-60}"
  bathroom_absolute_threshold_seconds: "${SIGNAL_BATHROOM_COLD_START_S:-2700}"
```

| Environment variable | Default | Description |
|---------------------|---------|-------------|
| `SIGNAL_INTERVAL_S` | `60` | How often the signal worker runs (seconds) |
| `SIGNAL_STILLNESS_THRESHOLD_MINUTES` | `60` | Minimum stillness duration before triggering `stillness_anomaly` at `info` severity |
| `SIGNAL_STILLNESS_EMERGENCY_MINUTES` | `120` | Stillness duration that escalates `lying` posture to `emergency` severity |
| `SIGNAL_STILLNESS_MOTION_FLOOR` | `0.02` | Motion energy below this value is treated as stillness. Normal physiological ambient motion (breathing, micro-adjustments) is approximately 0.01-0.02. |
| `SIGNAL_PACING_ROOM_THRESHOLD` | `8` | Minimum room transitions in the pacing window to trigger `pacing` |
| `SIGNAL_PACING_WINDOW_MINUTES` | `30` | Rolling window for pacing transition counting (minutes) |
| `SIGNAL_NIGHTTIME_TRANSITION_THRESHOLD` | `3` | Cold-start flat threshold for `nighttime_movement` (transitions per night) |
| `SIGNAL_ABSENCE_THRESHOLD_MINUTES` | `60` | Minimum undetected duration before triggering `absence` at `info` severity |
| `SIGNAL_BATHROOM_COLD_START_S` | `2700` | Cold-start absolute threshold for `bathroom_dwell_anomaly` (seconds; 2700 s = 45 min) |
