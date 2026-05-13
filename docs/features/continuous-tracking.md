# Continuous Tracking

The Continuous Tracking System (CTS) is a sibling service family in `continuous-tracking/`. It pulls RTSP camera streams, tracks individuals across multiple cameras, infers identity with a Bayesian posterior, and detects dementia-relevant behavioural patterns. Cognitive Companion is the BFF gateway: every browser, MCP, and rule-engine path into CTS goes through the CC backend.

This page covers what CTS adds on top of Cognitive Companion's existing single-frame perception, how to enable it, and how to write rules that use it.

## When to enable CTS

Cognitive Companion alone gives you single-frame perception: each camera event is an isolated batch of images analyzed by a vision LLM. This is enough for "did grandma walk in?", "is the stove on?", and "who is at the door?". It is **not** enough to answer:

- Has grandma been pacing in the hallway for the last 20 minutes?
- Is she stuck in the bathroom longer than usual?
- Is there a sundowning pattern building up over the afternoon?
- Did she leave the house and not come back within her usual window?

These questions need persistent, multi-camera tracking with stable identity over time. That is what CTS provides.

## What CTS adds

| Capability | Source | Surface in Cognitive Companion |
| --- | --- | --- |
| Multi-camera person tracking with BoT-SORT | `tracking-orchestrator` | Live tracking WebSocket at `/ws/cts`; admin views under `/admin/cts/*`. |
| Bayesian identity resolution (ArcFace face + SOLIDER-REID body) | `tracking-orchestrator` | Identity corrections and revision log under `/admin/cts/identity-corrections`. |
| Soft-revisable identity history | `IdentityRevision` on `tracking.revisions` | `IdentityRevisionSubscriber` rewrites `PersonLocationHistory`. The previous row is soft-deleted with `superseded_by_revision_id`; a corrected row is inserted. |
| Per-room dwell and trajectory storage | TimescaleDB hypertables in the shared Postgres instance (`continuous_tracking` database) | `cts_dashboard` endpoints (signals, trajectory, dwell summary). |
| Tagged keyframes (with retention controls) | `OrchestratorClient` | `cts_keyframes` router, `/admin/cts/keyframes` view. |
| Dementia signal generation | `tracking.signals` Redis stream | `DementiaSignalSubscriber` persists `DementiaSignal` rows; the `dementia_signal` filter and `presence_query` step expose them to rules. |
| Fused presence | `services/presence/factory.py` chain in `config/presence.yaml` | `PresenceService` powers `presence_query`, `home_state`, and the `presence_status` / `presence_dwell` / `home_state` filters. |

### Dementia signals emitted by `tracking-orchestrator`

The signal kinds shipped today are:

| Kind | What triggers it |
| --- | --- |
| `pacing` | Repeated direction changes in a short trajectory (continuous walking back and forth). |
| `sundowning_index` | Aggregate score over a late-afternoon to evening window combining motion, room-changes, and sustained agitation patterns. |
| `bathroom_dwell_anomaly` | Bathroom occupancy outside the rolling baseline duration. |
| `nighttime_movement` | Movement during configured night hours. |
| `stillness_anomaly` | Prolonged stillness in a room where the baseline is movement. |
| `absence` | Unexplained absence from the household beyond the configured window. |

Each signal carries `kind`, `severity` (`info` / `warning` / `emergency`), `started_at`, `ended_at`, `person_id`, `camera_id`, `room`, and a structured `details` payload. Acknowledging a signal in the admin UI sets `acknowledged_at`, which the `dementia_signal` filter uses for cool-off.

## Wiring CTS into Cognitive Companion

### 1. Stand up the CTS services

See [continuous-tracking/README.md](https://github.com/SilverMind-Project/continuous-tracking) for the full setup. Quick version:

```bash
cd ../continuous-tracking
docker compose up -d postgres redis minio    # infra
docker compose up -d                          # services
```

The services are: `go2rtc` (RTSP proxy, port 1984), `rtsp-ingress` (Go, port 8090), `tracking-orchestrator` (Python, port 8000), `triton` (gRPC 8701), `redis` (6379), `postgres` (5432), `minio` (9000).

### 2. Enable the CC feature flag

```yaml
# cognitive-companion/config/settings.yaml
cts:
  enabled: true
  consumer_id: "${HOSTNAME}"
  tracking_events_stream: "tracking.events"
  revisions_stream: "tracking.revisions"
  signals_stream: "tracking.signals"
  scene_samples_stream: "scene.samples"
  lock_seconds: 60      # CTS-precedence lock for PersonLocationState writes
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

When the flag is off, every CTS router returns `404 {"code": "cts.disabled"}` and the lifespan does not start any CTS subscribers.

### 3. Add cameras through the admin UI

Navigate to `/admin/cts/cameras` and add each RTSP camera (id slug, display name, `rtsp_url`, location). `rtsp-ingress` polls `GET /api/v1/cts/cameras` every 60 s and reconciles the running set with `go2rtc` automatically.

### 4. Calibrate

For multi-camera dwell and absence signals to work, calibration is required:

- **Homography**: at `/admin/cts/calibration`, click pixel-to-floor correspondences on a snapshot and let OpenCV RANSAC fit a 3x3 matrix per camera.
- **Privacy zones**: at `/admin/cts/privacy`, draw polygons over private regions (showers, toilet stalls). Frames are masked before they leave the LAN.
- **Adjacency graph**: at `/admin/cts/adjacency`, declare which cameras can see the same person consecutively, and the min/max transit time. Used by the cross-camera association step.

### 5. Tune the presence chain

`config/presence.yaml` defines the priority chain. The default chain is:

```yaml
providers:
  - name: night_anchor      # priority 90: bed-occupancy + light state
  - name: ha_bed_sensor     # priority 70: HA binary_sensor for bed
  - name: cts_location      # priority 50: CTS PersonLocationState
  - name: ha_device_tracker # priority 30: phone or watch tracker
  # plus stale_fallback and unknown_sentinel
```

Changes apply on `POST /api/v1/cts/presence-config/reload` without a restart.

## Rules that use CTS

Below are CTS-specific rule patterns. Each example assumes one senior (`grandma`) and at least one caregiver chat ID.

### Pacing detection

The `tracking-orchestrator` emits a `pacing` signal whenever a sustained back-and-forth pattern is observed.

**Rule:**

- `trigger_types`: `sensor_event` or `manual` alone does not work here; use a `dementia_signal` filter on a recurring rule. The simplest pattern is a webhook trigger fired by `DementiaSignalSubscriber` (see Internal wiring below) plus a `dementia_signal` filter that gates on `kind=pacing`.
- `cool_off_minutes`: `30`

**Filters:**

| Filter | Config |
| --- | --- |
| `dementia_signal` | `kind: pacing`, `severity_min: warning`, `cooldown_minutes: 30` |
| `home_state` | `person_id: grandma`, gate on `at_home` |

**Pipeline:**

```text
1. presence_query        person_id: grandma  (output_key: presence)
2. condition             expression: presence_dwell_minutes > 5
                         on_true → step 3, on_false → end
3. notification          channels: [telegram, pwa_realtime_ai]
                         telegram_template: "Grandma is pacing in {{presence_room_name}}. Last seen calm {{presence_dwell_minutes}} min ago."
                         pwa_realtime_ai_template: "Hi grandma, would you like to sit down for a few minutes? I can play some music if you'd like."
```

The `pwa_realtime_ai` channel sends an orchestrator-tagged prompt to the active Gemini Live session so the senior hears a calm voice rather than seeing yet another popup. The orchestrator turn is hidden from the on-screen transcript.

### Sundowning escalation

Sundowning typically presents as agitation in the late afternoon and evening. We want a graded response: gentle voice engagement first, then a caregiver alert if the signal persists.

**Filters:**

- `dementia_signal` (`kind: sundowning_index`, `severity_min: info`)
- `time_range` (`16:00 - 21:00`)

**Pipeline:**

```text
1. notification          channels: [pwa_realtime_ai]
                         pwa_realtime_ai_template: "Hi grandma, the sun is going down. How about a glass of water and a chair by the window?"
2. wait                  duration_minutes: 15
3. presence_query        person_id: grandma  (output_key: presence)
4. condition             expression: presence_recent_signals
                                       | filter(kind == "sundowning_index" and severity != "info")
                                       | length > 0
                         on_true → step 5, on_false → end
5. notification          channels: [telegram]
                         alert_level: warning
                         telegram_template: "Sundowning pattern persists for grandma after a 15 min check-in."
```

The `presence_query` step pulls recent signals via `services.signals` so step 4's condition can check whether escalation is warranted without re-querying CTS directly.

### Bathroom dwell anomaly with caregiver suppression

The senior sometimes uses the bathroom for genuine reasons longer than baseline. We want the alert, but only if a caregiver has not already acknowledged a prior bathroom-dwell signal in the last 30 minutes.

**Filters:**

- `dementia_signal` (`kind: bathroom_dwell_anomaly`, `severity_min: warning`, `cooldown_minutes: 30`)

The `cooldown_minutes` field on the filter checks `DementiaSignal.acknowledged_at` and suppresses the rule when a recent ack exists.

**Pipeline:**

```text
1. notification          channels: [telegram, pwa_popup_text]
                         alert_level: warning
                         telegram_template: "Grandma has been in the bathroom for {{trigger.signal.details.minutes}} min."
```

### Unexplained absence

The `absence` signal fires when a person leaves the household and does not return within the configured baseline window.

**Filters:**

- `dementia_signal` (`kind: absence`, `severity_min: warning`)
- `home_state` (`grandma`, `away`)

**Pipeline:**

```text
1. notification          channels: [telegram]
                         alert_level: emergency
                         telegram_template: "Grandma left the house at {{trigger.signal.started_at}} and has not returned. Last seen camera: {{trigger.signal.details.last_camera}}."
```

### Confused-state checks (where to extend)

There is no `confusion` signal kind shipped today. The closest proxy is to combine multiple existing signals:

- High `sundowning_index` with `severity == warning` for more than 20 minutes, AND
- Multiple `pacing` signals from different rooms in the same window, AND
- No detected face match on `person_identification` despite cameras seeing motion.

A composite rule can encode this with two `presence_query` calls (current + 20 min ago) plus a `condition` step. Tracking-orchestrator can also be extended with a new `confusion` signal detector; the path is documented in [feedback.md](https://github.com/SilverMind-Project/cognitive-companion/blob/main/feedback.md).

## Internal wiring (for builders)

When `cts.enabled` is true, `backend/services/cts/runtime.py` constructs `CTSRuntime`, which owns four Redis Streams subscribers. All Redis Stream messages are protobuf-encoded (compiled from `.proto` sources in `continuous-tracking/proto/continuoustracking/v1/`). Cognitive Companion consumes the compiled bindings from `backend/integrations/proto/continuoustracking/v1/`.

| Subscriber | Stream | Effect |
| --- | --- | --- |
| `TrackingEventSubscriber` | `tracking.events` | Updates `PersonLocationState` and writes `PersonLocationHistory` via `LocationWriter` and `SourceAuthority` (CTS-precedence lock controlled by `cts.lock_seconds`). Broadcasts `cts_live_frame` WebSocket messages for the live tracking view. |
| `IdentityRevisionSubscriber` | `tracking.revisions` | Soft-deletes superseded `PersonLocationHistory` rows via `IdentityRewriter` and inserts the corrected entries. |
| `DementiaSignalSubscriber` | `tracking.signals` | Persists `DementiaSignal` via `SignalStore`; fires a `TriggerContext(trigger_type="cts_signal")` event for any rule with a matching `dementia_signal` filter. |
| `SceneSampleSubscriber` | `scene.samples` | Decodes tagged keyframe `SceneSample` proto messages, pulls the JPEG from MinIO, runs scene analysis (YOLO + Florence-2 + CLIP + hazards), and persists observations to semantic memory. |

All four reuse the `StreamConsumer` base class for consumer-group creation, `XAUTOCLAIM` reclaim, bounded semaphore, and graceful shutdown. Shared utilities live in `_time.py` (time helpers) and `_types.py` (protocol types for injected service parameters).

The CTS BFF surface (cameras, calibration, signals, keyframes, identity, presence, dashboard, live view, frames) lives under `/api/v1/cts/*`. Browsers and MCP agents never reach `tracking-orchestrator` or `rtsp-ingress` directly: every call goes through CC routers, which proxy via the mTLS-aware `IngressAdminClient` and `OrchestratorClient`.

## Boundaries

- Do not write to `dementia_signals` or `cts_cameras` outside `services/cts/`.
- Do not import `_upstream_base` (mTLS + EdDSA service JWTs) from non-CTS code; LAN clients use `_http_base`.
- Do not subscribe to `tracking.*` or `scene.*` streams outside `CTSRuntime`.
- Do not bypass the BFF: there is no other path from the browser or MCP into CTS internals.
- Do not duplicate `_cts_enabled()`, `ns_to_iso()`, or `parse_ts()`. Import them from `backend.routers.cts_deps` or `backend.services.cts._time`.

## Related pages

- [Person Tracking](/features/person-tracking): single-camera face recognition, camera topology, room transitions.
- [Composable Pipelines](/features/pipeline): full step-type reference and rule examples that don't require CTS.
- [MCP Integration](/features/mcp-integration): exposing CTS read-only views to AI agents and the voice companion.
