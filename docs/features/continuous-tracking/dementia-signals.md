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
| `pacing` | Repeated room transitions in a 30 min window, normalized for observation density. Minimum 8 transitions and 2 unique rooms. Purpose-driven ambulation (kitchen, living room, bathroom) typically produces 5-6 transitions; 8+ in 30 min identifies repetitive, purposeless movement. | Per-30-min-window transition rates over 30 days, fetched from `person_trajectories` via `BehaviorBaselineRepository.pacing_window_rates()`. Requires 5+ samples before switching from the flat threshold to a robust z-score. | `info` (mod-z >= 2.5), `warning` (>= 3.0), `emergency` (>= 4.0) |
| `sundowning_index` | Evening (17:00-22:00 local) room transition rate vs 14-day evening baseline. Minimum 30 evening observation-minutes. | Per-evening transition rates over 14 days, one sample per local calendar date from `BehaviorBaselineRepository.daily_window_rates(17, 22)`. The current local date is excluded. Requires 5+ prior-evening samples before switching from the flat threshold to a robust z-score. | `info` (mod-z >= 2.5), `warning` (>= 3.0), `emergency` (>= 4.0) |
| `bathroom_dwell_anomaly` | Current open bathroom dwell vs 30-day closed-dwell duration baseline. Nighttime (22:00-06:00) uses a relaxed z-threshold (4.0 vs 3.5). Cold start (before 5+ baseline samples): absolute 45 min threshold, severity capped at `warning`. Requires accurate single-PH resolution at the bathroom door: the cross-camera dedup pass ensures a hallway camera and an adjacent camera seeing the same senior at the door produce one PersonHypothesis, so the dwell timer starts correctly. The integration proof for this scenario lives in `tests/integration/test_world_tracker_e2e.py::test_hallway_bathroom_one_person`, replaying `tests/fixtures/frame_replays/hallway_bathroom_door.bin`. | Closed-dwell durations (seconds) from `room_dwells` over 30 days, via `BehaviorBaselineRepository.dwell_durations(room_predicate="bath")`. Requires 5+ samples before switching to a robust z-score. | `info` (z >= 3.5), `warning` (z >= 4.0), `emergency` (z >= 5.0) |
| `nighttime_movement` | Room transitions during 22:00-06:00 local time. Cold start: flat tiers anchored to the configured gate (default 3): `info` at gate, `warning` at gate+2, `emergency` at gate+4. | Per-night transition counts over 14 days, one sample per local calendar night from `BehaviorBaselineRepository.daily_window_rates(22, 6)`. The current night is excluded. Requires 5+ samples before switching from the flat threshold to a robust z-score. | `info`, `warning` (z >= 3.0), `emergency` (z >= 4.0) |
| `stillness_anomaly` | Sustained near-zero motion energy in a non-resting posture (lying in non-bedroom, or prolonged sitting/standing). Default threshold: 60 min. Desk work, reading, and TV watching routinely exceed 30 min without clinical concern; 60 min aligns with clinical guidelines for meaningful seated immobility. Resting rooms are configurable (default: "bed", "bedroom"). | Stillness episode durations (seconds) over 30 days from `room_dwells`, via `BehaviorBaselineRepository.stillness_episodes()`. Requires 5+ samples before switching to a robust z-score. | Posture-aware: `lying` starts at `warning` (escalates to `emergency` at 120 min); `sitting`/`standing` starts at `info` at threshold (upgrades to `warning` at 2x threshold) |
| `absence` | No detection for longer than `absence_threshold_minutes` (default: 90 min). Cameras do not cover every room; 30 min gaps are normal (cooking, porch, bathroom). Hourly context from 14-day baseline: if the person is historically frequently absent at this hour, severity is demoted. | Hourly activity from `BehaviorBaselineRepository.hourly_activity()` over 14 days, used for the expected-absence prior. | Tiers derive from the configured threshold: `info` (gap >= threshold), `warning` (gap >= threshold+60), `emergency` (gap >= threshold+120). With the default threshold of 90: info at 90 min, warning at 150 min, emergency at 210 min. Demoted by `expected_absence_prior` when the person is historically frequently absent at this hour. |

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

All signal thresholds are set as literal values in `tracking-orchestrator/config/settings.yaml`. Edit the file and restart the orchestrator to apply changes. The `signal:` block accepts:

```yaml
# tracking-orchestrator/config/settings.yaml
signal:
  interval_s: 60
  stillness_threshold_minutes: 60
  stillness_emergency_minutes: 120
  stillness_motion_floor: 0.05
  pacing_room_threshold: 8
  pacing_window_minutes: 30
  nighttime_transition_threshold: 3
  absence_threshold_minutes: 90
  bathroom_absolute_threshold_seconds: 2700
  min_baseline_n: 5
  cooldown_minutes: 60
  onset_consecutive_windows: 2
  resting_rooms: ["bed", "bedroom"]
  sundowning_z_threshold: 2.5
  bathroom_z_threshold: 3.5
  bathroom_z_threshold_night: 4.0
  pacing_min_obs_density: 0.5
```

| Key | Default | Description |
|-----|---------|-------------|
| `interval_s` | `60` | How often the signal worker runs (seconds) |
| `stillness_threshold_minutes` | `60` | Minimum stillness duration before triggering `stillness_anomaly` at `info` severity |
| `stillness_emergency_minutes` | `120` | Stillness duration that escalates `lying` posture to `emergency` severity |
| `stillness_motion_floor` | `0.05` | Motion energy (normalized units/s) below this value is treated as stillness. Provisional: recalibrate after 1 week of live data using `scripts/calibrate_motion_energy.py`. |
| `pacing_room_threshold` | `8` | Minimum room transitions in the pacing window to trigger `pacing` |
| `pacing_window_minutes` | `30` | Rolling window for pacing transition counting (minutes) |
| `nighttime_transition_threshold` | `3` | Gate for `nighttime_movement`: cold-start severity tiers anchor to this value (info at gate, warning at gate+2, emergency at gate+4) |
| `absence_threshold_minutes` | `90` | Gate for `absence`: info fires at this gap, warning at gap+60, emergency at gap+120 |
| `bathroom_absolute_threshold_seconds` | `2700` | Cold-start absolute threshold for `bathroom_dwell_anomaly` (2700 s = 45 min) |
| `min_baseline_n` | `5` | Minimum baseline samples required before switching from flat thresholds to a robust z-score |
| `cooldown_minutes` | `60` | Minimum time between emissions of the same (identity, kind) unless severity escalates |
| `onset_consecutive_windows` | `2` | Trigger must hold for this many consecutive worker runs before first emission |
| `resting_rooms` | `["bed", "bedroom"]` | Room-name substrings treated as resting rooms; `lying` in a resting room does not trigger `stillness_anomaly` |
| `sundowning_z_threshold` | `2.5` | Modified z-score gate for `sundowning_index` at `info` severity |
| `bathroom_z_threshold` | `3.5` | Modified z-score gate for `bathroom_dwell_anomaly` during daytime (22:00-06:00 uses `bathroom_z_threshold_night`) |
| `bathroom_z_threshold_night` | `4.0` | Modified z-score gate for `bathroom_dwell_anomaly` during nighttime (22:00-06:00) |
| `pacing_min_obs_density` | `0.5` | Minimum trajectory-point density (points/min) required to evaluate pacing; windows below this are skipped |

## Data quality gate

Each emitted signal carries a data quality assessment in its `context` payload. When the identity resolution confidence or trajectory coverage is below the configured floor, `warning` and `emergency` signals are demoted to `info` and the context includes `"severity_demoted_for_quality": true`. Caregivers see the lower severity; the `context` field shows the demotion reason. This prevents false high-severity alerts when tracking is degraded (for example, during a camera outage or before the identity gallery is seeded).
