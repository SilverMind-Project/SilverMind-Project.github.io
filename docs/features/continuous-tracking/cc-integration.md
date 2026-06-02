# Cognitive Companion Integration

This page covers how Cognitive Companion consumes CTS data. Every browser, MCP, and rule-engine path into CTS goes through the CC backend.

## Enabling CTS in CC

```yaml
# cognitive-companion/config/settings.yaml
cts:
  enabled: true
  consumer_id: "${HOSTNAME}"
  tracking_events_stream: "tracking.events"
  revisions_stream: "tracking.revisions"
  signals_stream: "tracking.signals"
  scene_samples_stream: "scene.samples"
  lock_seconds: 60
  jwt:
    private_key_pem: "${CTS_JWT_PRIVATE_KEY_PEM}"
    kid: "cts-svc-key-1"
  upstream:
    rtsp_ingress:
      url: "${CTS_INGRESS_URL}"
      timeout_s: 5.0
    tracking_orchestrator:
      url: "${CTS_ORCHESTRATOR_URL}"
      timeout_s: 5.0

cts_ui:
  calibration_enabled: true
  dashboard_enabled: true
  live_view_enabled: true
```

When `cts.enabled` is false, all CTS routers return `404 {"code": "cts.disabled"}` and no CTS subscribers are started.

## Stand up the CTS services

```bash
cd ../continuous-tracking
docker compose up -d postgres redis minio    # infra
docker compose up -d                          # services
```

The services are: `go2rtc` (RTSP proxy, port 1984), `rtsp-ingress` (Go, port 8090), `tracking-orchestrator` (Python, port 8000), Triton (gRPC 8701), Redis (6379), PostgreSQL (5432), MinIO (9000).

## Add cameras and calibrate

Add cameras through the admin UI at `/admin/cts/cameras` with an ID slug, display name, `rtsp_url`, and location. `rtsp-ingress` polls `GET /api/v1/cts/cameras` every 60 s and reconciles the running set with `go2rtc` automatically.

For multi-camera dwell and absence signals, calibration is required:

- **Homography**: at `/admin/cts/calibration`, click pixel-to-floor correspondences on a snapshot to fit a 3×3 matrix per camera via OpenCV RANSAC.
- **Privacy zones**: at `/admin/cts/privacy`, draw polygons over private regions. Frames are masked before they leave the LAN.
- **Adjacency graph**: at `/admin/cts/adjacency`, declare which cameras can see the same person consecutively, with min/max transit times.
- **Overlap groups**: at `/admin/cts/overlap-groups`, group cameras that share a physical field of view. These pairs skip transit-time budgets in cross-camera association and use a relaxed matching threshold.

## CC subscribers

When `cts.enabled` is true, the CC backend starts four Redis Streams subscribers that consume protobuf-encoded messages:

| Subscriber | Stream | Effect |
|------------|--------|--------|
| `TrackingEventSubscriber` | `tracking.events` | Updates `PersonLocationState` and writes `PersonLocationHistory` via `LocationWriter` and `SourceAuthority` (CTS-precedence lock controlled by `cts.lock_seconds`). Room name is taken from the `TrackingEvent` proto when present; when absent, `LocationWriter` falls back to the camera-to-room mapping loaded from `cts_cameras` at startup. The proto uses `ph_id` as the physical-track identifier. `mean_quality` from the `IdentitySnapshot` is stored on the presence segment and surfaces as `quality` in `PersonLocationEnvelope`: quality is always server-computed, never client-inferred. Broadcasts `cts_live_frame` WebSocket messages for the live tracking view. |
| `IdentityRevisionSubscriber` | `tracking.revisions` | Soft-deletes superseded `PersonLocationHistory` rows via `IdentityRewriter` and inserts corrected entries. Revisions reference `ph_id`. |
| `DementiaSignalSubscriber` | `tracking.signals` | Persists `DementiaSignal` via `SignalStore`. Before calling `fire_event`, checks the person's `cts_alert_config` in `household_members`. If the signal kind or severity is disabled for that person, the signal is stored for history but no rule is triggered. |
| `SceneSampleSubscriber` | `scene.samples` | Decodes tagged keyframe `SceneSample` protos, pulls the JPEG from MinIO, runs scene analysis (YOLO + Florence-2 + CLIP + hazards), and persists observations to semantic memory. |

::: info
CTS also publishes low-rate semantic state-change streams `tracking.presence` (appeared / disappeared) and `tracking.dwell` (started / ended). These let CC rules trigger on state changes instead of per frame, so rule load no longer scales with camera frame rate. The CTS-side emission and the per-camera throttle on `tracking.events` (`live_publish_max_hz`) are in place; migrating the CC rule triggers from per-frame `tracking.events` to these Tier-2 streams is a planned CC-side change, specified in the `CTS_ROBUSTNESS_M6` documents.
:::

```mermaid
sequenceDiagram
    participant Orch as tracking-orchestrator
    participant Redis as Redis Streams
    participant Sub as CC Subscribers
    participant DB as CC Database
    participant WS as WebSocket
    participant Rules as Rules Engine

    Orch->>Redis: TrackingEvent proto (tracking.events)
    Redis->>Sub: TrackingEventSubscriber consumes
    Sub->>DB: PersonLocationState upsert
    Sub->>DB: PersonLocationHistory insert
    Sub->>WS: cts_live_frame broadcast

    Orch->>Redis: IdentityRevision proto (tracking.revisions)
    Redis->>Sub: IdentityRevisionSubscriber consumes
    Sub->>DB: Soft-delete old history rows
    Sub->>DB: Insert corrected history rows

    Orch->>Redis: DementiaSignal proto (tracking.signals)
    Redis->>Sub: DementiaSignalSubscriber consumes
    Sub->>DB: SignalStore upsert
    Sub->>Rules: fire_event (if alert config permits)
```

## Tune the presence chain

`config/presence.yaml` defines the priority chain for person location resolution:

```yaml
providers:
  - name: night_anchor      # priority 90: bed-occupancy + light state
  - name: ha_bed_sensor     # priority 70: HA binary_sensor for bed
  - name: cts_location      # priority 50: CTS PersonLocationState
  - name: ha_device_tracker # priority 30: phone or watch tracker
  # plus stale_fallback and unknown_sentinel
```

Changes apply on `POST /api/v1/cts/presence-config/reload` without a restart.

## Rule examples

### Pacing detection

**Filters:**

| Filter | Config |
|--------|--------|
| `dementia_signal` | `kind: pacing`, `severity_min: warning`, `cooldown_minutes: 30` |
| `home_state` | `person_id: grandma`, gate on `at_home` |

**Pipeline:**

```text
1. presence_query        person_id: grandma  (output_key: presence)
2. condition             expression: presence_dwell_minutes > 5
                         on_true -> step 3, on_false -> end
3. notification          channels: [telegram, pwa_realtime_ai]
                         telegram_template: "Grandma is pacing in {{presence_room_name}}."
```

### Sundowning escalation

**Filters:** `dementia_signal` (`kind: sundowning_index`, `severity_min: info`), `time_range` (`16:00 - 21:00`)

**Pipeline:**

```text
1. notification          channels: [pwa_realtime_ai]
                         pwa_realtime_ai_template: "Hi grandma, the sun is going down. How about a glass of water?"
2. wait                  duration_minutes: 15
3. presence_query        person_id: grandma  (output_key: presence)
4. condition             expression: presence_recent_signals
                                       | filter(kind == "sundowning_index" and severity != "info")
                                       | length > 0
                         on_true -> step 5, on_false -> end
5. notification          channels: [telegram]
                         alert_level: warning
```

### Bathroom dwell anomaly

**Filters:** `dementia_signal` (`kind: bathroom_dwell_anomaly`, `severity_min: warning`, `cooldown_minutes: 30`)

The `cooldown_minutes` field checks `DementiaSignal.acknowledged_at` and suppresses the rule when a recent acknowledgment exists.

**Pipeline:**

```text
1. notification          channels: [telegram, pwa_popup_text]
                         alert_level: warning
                         telegram_template: "Grandma has been in the bathroom for {{trigger.signal.details.minutes}} min."
```

### Unexplained absence

**Filters:** `dementia_signal` (`kind: absence`, `severity_min: warning`), `home_state` (`grandma`, `away`)

**Pipeline:**

```text
1. notification          channels: [telegram]
                         alert_level: emergency
                         telegram_template: "Grandma left the house at {{trigger.signal.started_at}} and has not returned."
```

## Per-person alert configuration

Cognitive Companion supports multigenerational households where dementia-specific signals are relevant only for certain members. Each household member can be assigned an alert profile that controls which CTS signal kinds are dispatched and at what minimum severity.

### Alert profiles

| Profile | Signal kinds enabled |
|---------|---------------------|
| Senior | All 7 kinds: `pacing`, `room_revisit_rate`, `bathroom_dwell_anomaly`, `sundowning_index`, `nighttime_movement`, `stillness_anomaly`, `absence` |
| Adult | `absence`, `nighttime_movement`, `stillness_anomaly` (presence and sleep/rest only) |
| Presence only | `absence` only |
| Custom | Operator-selected subset |

### Setting an alert profile

The alert profile is captured in the household member enrollment dialog at `/admin/persons`. Select a profile when creating or editing a member. The Custom option exposes a grouped checkbox list and a minimum severity selector.

The profile is stored as `cts_alert_config` (JSONB) on the `household_members` table:

```json
{
  "enabled_kinds": ["absence", "nighttime_movement", "stillness_anomaly"],
  "min_severity": "info"
}
```

A `null` config is treated as permissive: all kinds at `info` severity.

### Enforcement layers

The profile is enforced at three points:

1. **Subscriber dispatch gate.** `DementiaSignalSubscriber` checks the config before calling `PipelineExecutor.fire_event`. The signal is always written to the database for history, but no rule is triggered when the kind or severity does not pass the gate.

2. **API read filter.** `GET /api/v1/cts/signals` and `GET /api/v1/cts/signals/unacknowledged` filter the response list against each person's config. This keeps the Alerts view quiet for household members who do not need dementia-specific alerts.

3. **Pipeline rule context filter.** Rules with a `dementia_signal` context filter can further narrow which signals trigger actions by specifying `kinds`, `person_ids`, `min_severity`, and `cooldown_minutes`.

### Signal kind reference

| Kind | Relevant for |
|------|-------------|
| `pacing` | Dementia (repetitive movement) |
| `room_revisit_rate` | Dementia (spatial disorientation) |
| `bathroom_dwell_anomaly` | Dementia, safety |
| `sundowning_index` | Dementia (evening agitation) |
| `nighttime_movement` | Safety, sleep quality |
| `stillness_anomaly` | Safety (falls, medical events) |
| `absence` | Presence (all member types) |
