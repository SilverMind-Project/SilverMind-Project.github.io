# Composable Pipelines

The pipeline system is the core of Cognitive Companion. Each rule defines its own ordered sequence of pipeline steps executed by the `PipelineExecutor`. Rather than a fixed linear chain, administrators configure exactly which steps run and in what order, including conditional branching and wait/resume for multi-stage workflows.

Step handlers are self-contained plugins, each in its own file under `backend/steps/builtin/`, auto-discovered at startup via `StepRegistry`. The frontend loads available step types dynamically from the `GET /api/v1/pipeline/step-types` endpoint, so new plugins appear automatically in the step palette and config editor. See [Extending the Pipeline](/development/extending-pipeline) for how to add custom step types.

## How Pipelines Work

When a rule is triggered, the executor:

1. Creates a `WorkflowExecution` record to track progress
2. Initializes a shared `pipeline_data` dictionary
3. Executes each enabled step in order
4. Merges each step's output into `pipeline_data` for downstream steps
5. Handles branching, waiting, and error states

```python
@dataclass
class StepResult:
    success: bool = True
    data: dict = field(default_factory=dict)   # Merged into pipeline_data
    should_continue: bool = True
    next_step_id: int | None = None            # For conditional branching
    wait_until: datetime | None = None         # For wait/resume
```

Every step receives the full `pipeline_data` dictionary and a `TriggerContext` with metadata about what initiated the execution:

```python
@dataclass
class TriggerContext:
    trigger_type: str              # "sensor_event", "cron", "manual", "webhook", "occupancy_duration", "telegram"
    sensor_id: str | None
    room_name: str | None
    media_paths: list[str]
    media_type: str | None
    webhook_payload: dict | None   # Payload from webhook and Telegram triggers
    occupancy_duration_minutes: float | None  # Set for occupancy_duration triggers
```

For `webhook` and `telegram` triggers, the payload is also available in `pipeline_data["trigger_input"]`. For `occupancy_duration` triggers, `occupancy_duration_minutes` reflects how long the sensor has been continuously occupied at the moment the rule fired.

**Telegram trigger payload keys** (accessible as <code v-pre>{{trigger_input.command}}</code> etc.):

| Key | Description |
| --- | --- |
| `trigger_input.command` | The matched command, e.g. `"/medication"` |
| `trigger_input.args` | List of words following the command |
| `trigger_input.text` | Raw message text |
| `trigger_input.chat_id` | Telegram chat ID as a string |
| `trigger_input.from_user` | Telegram user object (id, first_name, username) |

See [Telegram Command Triggers](#telegram-command-triggers) below for configuration details.

The executor also injects a localized `system` object into `pipeline_data` using `app.timezone` from `settings.yaml`:

```json
{
  "system": {
    "local_time": "08:42 AM",
    "local_date": "2026-03-29",
    "local_day_of_week": "Sunday",
    "timezone": "America/New_York"
  }
}
```

This makes local wall-clock values available to prompts and notification templates without requiring each step to compute them independently.

## Cool-Off Behavior

Rule cool-off is driven by `EventLog.status == "completed"`. A workflow that runs successfully but does not perform a terminal action is now recorded as `ignored`, so analytical or verification-only passes do not consume the rule's cool-off window.

Built-in steps that can explicitly mark a run as cool-off-worthy:

- `notification`: `trigger_cooloff` defaults to `true`
- `ha_action`: `trigger_cooloff` defaults to `true`
- `activity_detection`: `trigger_cooloff` defaults to `true`
- `condition`: `trigger_cooloff` defaults to `false`, and only applies when the expression evaluates to `true`

These steps add `_cooloff_triggered` to `pipeline_data`, and the executor uses that flag when finalizing the related event log.

## Pipeline Step Types

### Perception

#### `person_identification`

Sends media frames to the person identification service for face recognition. Returns detected identities with confidence scores and bounding boxes. Records sightings and updates person location state.

**Config fields:**

- `include_annotated_image`: return frames with bounding boxes and name labels drawn over faces
- `confidence_threshold`: minimum confidence to accept an identification (default from settings)
- `target_persons`: optional comma-separated list of person IDs to filter for

**Output keys:** `person_detections` (list of detections with identity, confidence, bbox), `annotated_images` (if enabled)

#### `activity_detection`

Record a single activity to the PersonActivity table. All fields support [prompt templates](#prompt-templates), so values can be fixed strings or resolved from any upstream step output or trigger context. Use multiple steps in sequence to record multiple activities.

**Config fields:**

::: v-pre

- `activity_type` (required): activity to record. Supports templates (e.g. `{{logic_response.activity_type}}` or a literal like `"bathroom_occupancy"`). The UI offers 30+ pre-programmed suggestions (eating, sleeping, medication, bathing, etc.) but any free-form string is accepted.
- `person_id` (optional): person to attribute the activity to. Supports templates (e.g. `{{person_detections.0.person_id}}`). Leave empty to record as unknown person.
- `room_name` (optional): room where the activity occurred. Supports templates (e.g. `{{room_name}}`). Defaults to the trigger room when empty.
- `confidence`: confidence score (0-1). Accepts a fixed number or `{{template}}` syntax (e.g. `{{logic_response.confidence}}`). Defaults to `0.8`.
- `capture_scene_description` (bool, default `false`): when `true`, saves the upstream vision model output into `metadata_json.scene_description` alongside the activity record. Creates a complete audit trail linking *what was observed* to *what was recorded*.
- `scene_description_key` (str, default `"vision_response"`): which `pipeline_data` key to read when `capture_scene_description` is enabled. Override to `"llm_response"` or any other key when using `llm_call` with a custom `output_key`.
- `metadata_extra` (str, optional): a JSON string (supports `{{template}}` syntax) merged into `metadata_json` alongside any captured scene description. Useful for recording structured reasoning alongside the activity: `{"reasoning": "{{logic_response.reasoning}}"}`.
- `trigger_cooloff`: whether a successful activity record should count toward the rule cool-off window. Defaults to `true`.

:::

**Output keys:** `detected_activities` (list with one entry, including `metadata` when populated), optional `_cooloff_triggered`

::: tip Detecting long-duration activities (meals, extended occupancy)

The VLM window in an `llm_call` step is bounded by the EventAggregator batch (typically 10 s to 1 min). To detect activities that unfold over a longer duration such as a meal, extend the temporal window on the **upstream** step:

```yaml
step_type: llm_call
config:
  model_id: cosmos_reason2
  image_source: both
  image_time_filter:
    since_minutes: 30    # pull the last 30 minutes of frames from MinIO
  prompt: "Looking at frames from the last 30 minutes, has the person had lunch?"
  output_key: vision_response
```

The `activity_detection` step then records the *conclusion* of that extended analysis. Enable `capture_scene_description: true` to save the VLM's full reasoning alongside the record.

:::

::: details Example: meal detection with scene capture

```yaml
# 1. Pull 30 minutes of kitchen frames, ask the vision model
step_type: llm_call
config:
  model_id: cosmos_reason2
  image_source: both
  additional_room_names: [Kitchen]
  image_time_filter:
    since_minutes: 30
  sort_by_sensor_then_time: true
  prompt: "Review all frames. Has {{person_detections.0.name}} eaten lunch today?"
  output_key: vision_response

# 2. Record the activity with the scene description attached
step_type: activity_detection
config:
  activity_type: meal_lunch
  person_id: "{{person_detections.0.person_id}}"
  confidence: "{{logic_response.confidence}}"
  capture_scene_description: true
  scene_description_key: vision_response
  metadata_extra: '{"reasoning": "{{logic_response.reasoning}}"}'
```

:::

#### `scene_analysis` {#scene-analysis}

Calls the standalone [scene-analysis-service](/guide/architecture#scene-analysis-service) for multi-modal analysis of a trigger image. Three inference components run in a single request: YOLO11x object detection, Florence-2-large structured scene description, and CLIP ViT-L/14 image embeddings. A YAML-configured hazard rule engine evaluates detections against named hazard rules and emits alerts for matches.

The step always continues the pipeline. When the scene-analysis-service is unreachable or disabled, all result keys are empty.

**Config fields:**

- `run_detect` (bool, default `true`): run YOLO11x object detection
- `run_describe` (bool, default `true`): run Florence-2-large scene description
- `run_embed` (bool, default `false`): run CLIP ViT-L/14 embedding (higher latency)
- `run_hazards` (bool, default `true`): evaluate YAML hazard rules against detections
- `max_images` (int, default `1`): number of trigger images to send for analysis

**Output keys:**

| Key | Type | Description |
| --- | ---- | ----------- |
| `scene_detections` | list | Object detections: `label`, `confidence`, `bbox` [x1,y1,x2,y2], `class_id` |
| `scene_description` | str | Structured natural-language caption from Florence-2 |
| `scene_embedding` | list[float] | 768-dim L2-normalized CLIP embedding vector (empty when `run_embed` is false) |
| `scene_hazards` | list | Triggered hazard alerts: `name`, `severity`, `description`, `detection` |
| `scene_detector_available` | bool | Whether YOLO was loaded in the service |
| `scene_describer_available` | bool | Whether Florence-2 was loaded in the service |
| `scene_embedder_available` | bool | Whether CLIP was loaded in the service |

::: details Example: detect and alert on hazards

```yaml
# 1. Run full scene analysis on the trigger frame
step_type: scene_analysis
config:
  run_detect: true
  run_describe: true
  run_embed: false
  run_hazards: true
  max_images: 1

# 2. Branch on hazards
step_type: condition
config:
  expression: "scene_hazards.count > 0"

# 3. Notify caregiver with the scene description
step_type: notification
config:
  alert_level: warning
  message_template: "Hazard detected: {scene_description}"
  telegram_template: "Hazard in {{room_name}}: {{scene_description}}"
```

:::

::: tip Combining with person identification

Place `person_identification` before `scene_analysis` in the pipeline. The `scene_detections` output complements face detections by identifying objects in the frame. Use a `condition` step to branch on both `person_detections.count > 0 and scene_hazards.count > 0` for context-aware alerts.

:::

#### `object_trend_analysis`

Queries the [semantic-memory-service](/guide/architecture#semantic-memory-service) for room-level object trend state: clutter scores, persistent/novel objects, and anomaly severity. Designed to precede a `condition` step (for rule branching) or an `llm_call` step (for LLM-enriched reasoning).

**Config fields:**

- `room_ids`: list of room IDs to query. Empty = use the trigger room.
- `include_snapshots_hours`: if > 0, fetch raw hourly snapshots for LLM context.
- `severity_threshold`: anomalies below this severity are stripped (`ok`, `info`, `warning`, `critical`; default `info`).
- `output_key`: key under which the result map is written (default `room_trends`).

**Output keys:**

| Key | Type | Description |
| --- | ---- | ----------- |
| `room_trends` | dict | Maps room_id to trend result: `clutter_score`, `trend_direction`, `overall_severity`, `persistent_objects`, `novel_objects`, `anomalies` |
| `room_trends_any_warning` | bool | Whether any room has severity >= warning |
| `room_trends_max_severity` | str | Highest severity across all rooms |
| `room_trends_summary` | str | Compact single-line text ready for LLM prompt injection |

Graceful degradation: when the semantic-memory-service is unreachable or returns no data, the step writes empty results and continues.

#### `presence_query`

Queries the fused [PresenceService](/guide/architecture#presence-fusion) for the current location and status of a person. Aggregates data from multiple providers (night anchor, HA bed sensor, CTS location, HA device tracker, stale fallback) via the priority chain in `config/presence.yaml`. Also fetches recent dementia signals when `services.signals` is wired.

**Config fields:**

- `person_id`: person to query. Leave blank to resolve from pipeline_data (sightings/persons).
- `signal_kind`: filter recent dementia signals to this kind (e.g. `bathroom_dwell_anomaly`).
- `signal_severity_min`: minimum severity for signal match (`info`, `warning`, `emergency`; default `info`).
- `signal_window_minutes`: lookback for dementia signals in minutes (default `30`).
- `output_key`: pipeline_data key for the result dict (default `presence`).

**Output keys:**

| Key | Type | Description |
| --- | ---- | ----------- |
| `{output_key}_status` | str | Presence status: `present_room`, `present_home`, `asleep`, `away`, `stale`, `unknown` |
| `{output_key}_room_name` | str | Current room name (or null) |
| `{output_key}_room_id` | str | Current room ID (or null) |
| `{output_key}_dwell_minutes` | float | Minutes in current room |
| `{output_key}_confidence` | float | Provider confidence (0-1) |
| `{output_key}_signals` | list | Recent dementia signals matching filters |
| `{output_key}_providers` | list | Active presence providers that contributed |
| `{output_key}_timestamp` | str | ISO-8601 snapshot timestamp |
| `presence_at_home` | bool | Convenience flat key: person is at home |
| `presence_asleep` | bool | Convenience flat key: person is asleep |
| `presence_away` | bool | Convenience flat key: person is away |

Graceful degradation: when the PresenceService returns `UNKNOWN` or `STALE`, all keys default to empty/null and `presence_at_home` / `presence_asleep` / `presence_away` are all `false`.

#### `home_state`

A thin convenience wrapper around `presence_query` that emits exactly four boolean flags. Designed for use with `condition` steps that react to high-level home-state changes.

**Config fields:**

- `person_id`: person to query. Leave blank to resolve from pipeline_data.
- `output_key`: pipeline_data key prefix for the result (default `home`).

**Output keys:**

| Key | Type | Description |
| --- | ---- | ----------- |
| `{output_key}_at_home` | bool | Person is in a known room or asleep (status `present_room`, `present_home`, or `asleep`) |
| `{output_key}_asleep` | bool | Person is asleep (status `asleep`) |
| `{output_key}_away` | bool | Person is away from home (status `away`) |
| `{output_key}_state_unknown` | bool | Status is `unknown` or `stale` |

These mirror the four boolean outputs of the `home_state` context filter, so the same logic used in rule filters is available inside a pipeline. When the presence service is unavailable, all four flags are `false`.

#### `semantic_memory_query`

Queries the [semantic-memory-service](/guide/architecture#semantic-memory-service) for recent scene observations, object presence, and hazard data in a room. Injects both structured results and a compact LLM-ready summary into `pipeline_data`.

**Config fields:**

- `room_id`: explicit room ID to query. Overrides `use_trigger_room`.
- `use_trigger_room`: when `true`, uses the trigger's room. Default `true`.
- `objects_limit`: max object presence records to return (default `10`).
- `hazards_limit`: max hazard observations (default `5`).
- `observations_limit`: max observation search hits (default `20`).
- `within_minutes`: lookback window in minutes (default `60`).
- `min_confidence`: minimum confidence for returned records (default `0.0`).
- `output_key`: pipeline_data key for the result dict (default `memory_context`).

**Output keys:**

| Key | Type | Description |
| --- | ---- | ----------- |
| `{output_key}.recent_objects` | list | Object presence records with label, confidence, first/last seen timestamps |
| `{output_key}.recent_hazards` | list | Hazard observations with flags, severity, confidence |
| `{output_key}.observations` | list | Observation search hits with description, embedding distance |
| `{output_key}.observations_count` | int | Total matching observations |
| `{output_key}.summary` | str | Compact single-paragraph text ready for LLM prompt injection |

Graceful degradation: when the semantic-memory-service is unreachable or disabled, the output contains empty lists and a "No memory context available." summary.

#### `vision_analysis` _(deprecated)_

::: warning Deprecated: use `llm_call` instead
The `llm_call` step with `output_key: vision_response` is a superset of `vision_analysis`. It supports the same image-source options plus model selection, sensor-ordered image assembly for inter-frame analysis, and a configurable output key.
:::

Sends media frames with a prompt to the vision LLM (Cosmos Reason2) for scene description and analysis.

**Config fields:**

- `prompt`: the analysis prompt sent to the vision model (supports [prompt templates](#prompt-templates))
- `image_source`: `"trigger"` (default), `"additional"`, or `"both"`
- `max_images`: max total images (default `5`)
- `additional_sensor_ids` / `additional_room_names`: pull images from extra cameras or rooms
- `response_format`: `"default"` (text) or `"custom"` (JSON)

**Output keys:** `vision_response`

### Reasoning

#### `llm_call`

The unified LLM step. Replaces `vision_analysis`, `logic_reasoning`, and `translation` with a single model-agnostic interface. The model is selected per step from the named registry in `settings.yaml`, so each step in a pipeline can use a different model without deploying multiple provider types.

**Config fields:**

- `model_id` (required): ID of a model entry from `llm.models` in `settings.yaml`.
- `prompt`: prompt text (supports [prompt templates](#prompt-templates)).
- `special_instructions`: text prepended to the prompt before template rendering. Useful for translation style guides or system-level constraints.
- `include_context`: list of `pipeline_data` keys to include as context above the prompt. If empty, `person_detections` and `vision_response` are auto-included when present.
- `image_source`: `"none"` (default), `"trigger"`, `"additional"`, or `"both"`. Image attachment is silently skipped when the selected model does not have the `vision` capability.
- `max_images`: hard cap on total images sent to the model (default `5`).
- `additional_sensor_ids`: camera sensor IDs to pull images from. When `sort_by_sensor_then_time` is enabled, the order of this list determines the grouping order.
- `additional_room_names`: pull images from all cameras in these rooms (unordered; for ordered multi-sensor analysis, use `additional_sensor_ids` instead).
- `images_per_sensor`: maximum images per sensor when sensor-ordered grouping is active (default `3`).
- `sort_by_sensor_then_time`: when `true`, images are grouped by sensor in `additional_sensor_ids` order, then sorted oldest-first within each group. This produces a temporally coherent sequence across sensors, enabling inter-frame analysis by vision reasoning models such as Cosmos Reason2.
- `image_time_filter`: optional object with `since_minutes`, `time_start`, `time_end` to restrict which images are fetched.
- `response_format`: `"text"` (default), `"json_schema"`, or `"json_free"`. Controls whether the output is stored as a plain string or parsed as JSON.
- `response_schema`: natural-language description of the expected JSON format, appended to the prompt.
- `response_json_schema`: JSON Schema string. When `response_format` is `"json_schema"` and the model has `guided_decoding: true` in settings, the schema is sent as `guided_json` to the server (vLLM). For other servers, it is injected as a prompt instruction.
- `output_key`: the `pipeline_data` key where the result is stored (default `"llm_response"`). Set to `"logic_response"`, `"vision_response"`, or `"translation"` for compatibility with downstream steps that reference those keys.
- `hallucination_marker`: if this string is found in the response, the call is retried up to the model's `max_retries` setting (Tenacity). Useful for translation models with known failure modes.

**Output keys:** `pipeline_data[output_key]` (string when `response_format` is `"text"`, parsed dict when `"json_schema"` or `"json_free"`). When `output_key` is `"logic_response"` and the response contains `is_notification_needed: false`, `notification_suppressed: true` is also written.

::: details Example: vision reasoning with sensor-ordered frames

```yaml
step_type: llm_call
config:
  model_id: cosmos_reason2
  prompt: "Analyze the sequence of frames from each camera. Has the person left the stove unattended?"
  image_source: both
  additional_sensor_ids: [kitchen_cam_1, kitchen_cam_2]
  sort_by_sensor_then_time: true
  images_per_sensor: 4
  max_images: 10
  response_format: json_schema
  response_json_schema: |
    {
      "type": "object",
      "properties": {
        "stove_unattended": {"type": "boolean"},
        "reasoning": {"type": "string"},
        "confidence": {"type": "number"}
      },
      "required": ["stove_unattended", "reasoning"]
    }
  output_key: vision_response
```

:::

::: details Example: reasoning and notification decision

```yaml
step_type: llm_call
config:
  model_id: gemma4_26b
  prompt: "Based on the analysis, should the caregiver be alerted?"
  include_context: [vision_response, person_detections]
  response_format: json_schema
  response_json_schema: |
    {
      "type": "object",
      "properties": {
        "is_notification_needed": {"type": "boolean"},
        "user_notification": {"type": "string"},
        "alert_level": {"type": "string", "enum": ["emergency","warning","info","reminder"]},
        "reasoning": {"type": "string"}
      },
      "required": ["is_notification_needed", "user_notification", "reasoning"]
    }
  output_key: logic_response
```

:::

::: details Example: translation with retry

```yaml
step_type: llm_call
config:
  model_id: gemma4_26b
  special_instructions: "Translate using informal Tamil as spoken in Chennai (Tanglish):"
  prompt: "Translate the following to Tamil:\n\n{{logic_response.user_notification}}"
  response_format: text
  output_key: translation
  hallucination_marker: "சென்னை"
```

:::

#### `condition`

Evaluates a boolean expression against `pipeline_data` to control execution flow. Can branch to different steps based on the result.

**Config fields:**

- `expression`: the condition expression to evaluate
- `trigger_cooloff`: whether a `true` result should mark the run as cool-off-worthy. Defaults to `false`.
- Uses `next_step_on_true` / `next_step_on_false` fields on the `PipelineStep` model for branching

**Output keys:** `condition.expression`, `condition.result`, `condition.branch`, optional `_cooloff_triggered`

See [Condition Expressions](#condition-expressions) below.

#### `verification`

Query the PersonActivity database to verify whether household members completed, or did not complete, specific activities within a time window. No LLM calls are involved.

**Config fields:**

::: v-pre

- `conditions`: list of condition objects, each with:
  - `activity_type` (str, required): the activity type to look for
  - `person_id` (str, optional): person to check; supports [prompt templates](#prompt-templates) (e.g. `{{person_detections.0.person_id}}`). Leave empty to match any person.
  - `room_name` (str, optional): room to filter by; supports templates (e.g. `{{room_name}}`). Leave empty to match any room.
  - `completed` (bool, default `true`): whether the activity should have been completed
  - `within_minutes` (float): relative time window from now
  - `window_start` / `window_end` (ISO-8601 timestamp): fixed wall-clock window (alternative to `within_minutes`). The stored time is re-anchored to today's date in `app.timezone` before querying.
  - `min_confidence` (float, default `0.5`): minimum confidence threshold for matching records
- `match_mode`: `"all"` or `"any"` (default `"all"`)
- `re_notify_if_failed`: bool (default `false`), re-trigger notification on verification failure
- `re_notify_delay_minutes`: int (default `5`), delay before re-notification

:::

**Output keys:** `verification.verified` (bool), `verification.match_mode`, `verification.matched_conditions`, `verification.unmatched_conditions`

### Action

#### `notification`

Dispatches an alert to configured notification channels based on alert level. The `NotificationDispatcher` can route to `pwa_popup_text`, Telegram, e-ink, `ha_speaker_tts`, `pwa_realtime_ai`, `pwa_tts_announcement`, and outbound `webhook` channels.

**Config fields:**

- `alert_level`: `emergency`, `warning`, `info`, or `reminder`
- `channels`: optional override of which channels to use (completely replaces the defaults from `notifications.yaml` when specified)
- `message_template`: standard Python format string with `{message}`, `{room}`, and any `pipeline_data` key representing the default broadcast text.
- `telegram_template` / `eink_template` / `tts_template` / `webhook_template`: channel-specific template overrides allowing you to format messages optimally for a specific medium. `webhook_template` should render a JSON string when you want to control the outbound payload body directly.
- `eink_targets`: optional list of sensor IDs for targeted e-ink display rendering
- `ha_media_player`: optional HA media_player entity ID for targeted TTS playback
- `webhook_url`: optional per-step override for the outbound webhook destination
- `trigger_cooloff`: whether a successful notification dispatch should count toward the rule cool-off window. Defaults to `true`.

**Output keys:** `notification_dispatched` (boolean), `notification_channels` (dict of channel -> success), optional `_cooloff_triggered`

#### `ha_action`

Calls a Home Assistant service. Can turn on lights, lock doors, activate scenes, trigger HA automations, or any other HA service call.

**Config fields:**

- `domain`: Home Assistant domain to call (e.g. `light`, `lock`, `script`)
- `service`: Home Assistant service name within that domain (e.g. `turn_on`, `lock`)
- `entity_id`: the target entity
- `data`: additional JSON payload to pass to the service
- `trigger_cooloff`: whether a successful Home Assistant action should count toward the rule cool-off window. Defaults to `true`.

**Output keys:** `ha_action.domain`, `ha_action.service`, `ha_action.entity_id`, `ha_action.success`, optional `_cooloff_triggered`

#### `activity_session_start`

Open a duration-aware activity session for a person. Idempotent: reuses an existing open session of the same type if one already exists. Stores timeout configuration for automatic stale-session cleanup.

**Config fields:**

::: v-pre

- `activity_type` (required): activity type (e.g. `sleep`, `bathroom`, `meal_prep`). Supports `{{template}}` syntax.
- `person_id`: person to attribute this session to. Supports templates (e.g. `{{person_detections.0.person_id}}`).
- `room_name`: room where the activity occurs. Supports templates. Defaults to trigger room.
- `confidence`: detection confidence (0-1). Accepts a fixed number or `{{template}}` syntax (default `0.85`).
- `timeout_minutes`: maximum session duration in minutes before auto-close. Uses built-in default for the activity type when empty. Supports templates.
- `metadata_extra`: optional JSON string of extra fields to merge into session metadata. Supports `{{template}}` syntax.
- `output_key`: `pipeline_data` key to write the session result under (default `session`).

:::

**Output keys:** `pipeline_data[output_key]` with `session_id`, `person_id`, `activity_type`, `room_name`, `started_at`, `timeout_minutes`, `was_existing`

#### `activity_session_end`

Close an open duration-aware activity session for a person. Computes duration from open to close. Optionally records a `PersonActivity` with `duration_minutes` populated. If no open session exists, logs a warning and continues.

**Config fields:**

::: v-pre

- `activity_type` (required): activity type to close. Supports `{{template}}` syntax.
- `person_id`: person to close the session for. Supports templates.
- `write_activity_record`: when `true`, also records a `PersonActivity` with `duration_minutes` populated (default `true`).
- `output_key`: `pipeline_data` key to write the closed session result under (default `closed_session`).

:::

**Output keys:** `pipeline_data[output_key]` with `session_id`, `person_id`, `activity_type`, `started_at`, `closed_at`, `duration_minutes`, `status`, `closed_via`

#### `daily_report`

Generate end-of-day activity reports for one or all household members. Aggregates sleep, meals, medication, bathroom, door events, exercise, and location data into structured `DailyReport` records with wellness scoring. Designed to be triggered by a cron rule at end of day.

**Config fields:**

::: v-pre

- `person_ids`: list of person IDs to generate reports for. Empty list means all active household members.
- `report_date_offset_days`: days offset from today for the report date (0 = today, -1 = yesterday).
- `generate_summary_text`: when `true`, generates an LLM prose summary of the day.
- `summary_model_id`: LLM model ID to use for summary generation (default `gemma4_26b`).
- `notify_on_complete`: when `true`, sends a notification when reports are ready.
- `output_key`: `pipeline_data` key to write the report results under (default `daily_reports`).

:::

**Output keys:** `pipeline_data[output_key]` (list of report results with `person_id`, `report_date`, `report_id`, `wellness_score`)

#### `info_card`

Delivers a curated info card to the senior via PWA popup, e-ink display, or both. Loads an approved `InfoCard` by ID from the knowledge repository, resolves its image slots through the image pipeline, and dispatches via the knowledge delivery service. A voice instruction override allows per-delivery Gemini Live behavioural guardrails.

**Config fields:**

- `info_card_id` (required): ID of an approved `InfoCard` to deliver
- `channels`: list of delivery channels: `pwa`, `eink`, or both (default `["pwa"]`)
- `pwa_dismiss_seconds`: auto-dismiss timeout for the PWA popup (default 60)
- `eink_expiry_minutes`: how long the e-ink image stays active before refresh (default 30)
- `voice_instruction`: override the default Gemini Live voice instruction for this delivery
- `trigger_cooloff`: whether successful delivery consumes the rule cool-off (default `true`)

**Output keys:** `info_card_delivery` with `info_card_id`, `layout_id`, `delivered_channels`, `delivery_id`

### Flow

#### `wait`

Pauses pipeline execution for a configured duration. The execution state is persisted to the database and the scheduler resumes it automatically via an APScheduler `DateTrigger`.

**Config fields:**

- `minutes`: how long to wait before resuming

**Output keys:** none (the step simply pauses execution)

#### `interactive_prompt`

Asks the user a question via popup text and/or voice AI, then pauses pipeline execution until a response is received or timeout occurs. Designed for check-ins, safety confirmations, and escalation workflows where the system needs explicit user input before proceeding.

**Config fields:**

::: v-pre

- `voice_prompt_template`: voice prompt template with `{{variable}}` syntax for the Gemini Live voice channel
- `popup_message_template`: popup message template with `{{variable}}` syntax for the PWA popup text channel
- `auto_escalate`: when `true`, sets `auto_escalate_triggered` in `pipeline_data` if the user selects "escalate" or timeout occurs (default `false`)
- `escalate_button_text`: text for the escalation button (default `"I need help"`)
- `dismiss_button_text`: text for the dismiss button (default `"I'm okay"`)
- `countdown_seconds`: timeout duration in seconds (5-300, default `30`)
- `timeout_action`: action to take when timeout occurs: `"escalate"` or `"dismiss"` (default `"escalate"`)
- `output_key`: key for storing response in `pipeline_data` (default `"interactive_response"`)

:::

At least one of `voice_prompt_template` or `popup_message_template` must be configured. Both channels can be used simultaneously for redundancy.

**Output keys:** `pipeline_data[output_key]` with `channel` (`"pwa_popup_text"`, `"pwa_realtime_ai"`, or `"timeout"`), `action` (`"escalate"` or `"dismiss"`), `timestamp`, and `raw_response`. When `auto_escalate` is enabled and escalation is triggered, `auto_escalate_triggered: true` is also written.

**Workflow status:** The execution status is set to `"waiting_for_response"` while the prompt is active. When a response arrives or timeout fires, the status transitions to `"running"` and the pipeline resumes from the next step.

::: details Example: bathroom safety check-in

#### `quiz_start`

Starts an interactive quiz session via the companion PWA. Loads an approved `Quiz` by ID from the knowledge repository, creates a `QuizSession`, and opens the quiz dialog on the senior's PWA. Supports question randomization, per-senior deduplication, configurable session timeout, and voice instruction overrides.

**Config fields:**

- `quiz_id` (required): ID of an approved `Quiz` to deliver
- `max_questions`: limit the number of questions delivered (default 5)
- `randomize_order`: randomize question order (default `false`)
- `session_timeout_minutes`: max session duration before auto-complete (default 10)
- `per_senior_dedupe_hours`: skip delivery if the same senior completed this quiz within N hours (default 12)
- `voice_instruction`: override the default Gemini Live voice instruction for this quiz session
- `trigger_cooloff`: whether successful delivery consumes the rule cool-off (default `true`)

**Output keys:** `quiz_session` with `quiz_id`, `session_id`, `question_count`, `status`, `questions`

::: details Example: daily medication knowledge quiz

A cron rule fires at 10 AM every day and delivers a medication knowledge quiz:

```yaml
# 1. Check home state to make sure the senior is awake and at home
step_type: home_state
config:
  output_key: home

# 2. Only proceed if the senior is home and awake
step_type: condition
config:
  expression: "home.home_at_home and not home.home_asleep"

# 3. Deliver the medication quiz
step_type: quiz_start
config:
  quiz_id: 3
  max_questions: 5
  randomize_order: false
  session_timeout_minutes: 15
```

:::

A rule with `trigger_type: occupancy_duration` fires when the bathroom presence sensor has been on for 40 minutes. The pipeline sends a bilingual check-in prompt and waits for a response:

```yaml
# 1. Translate the check-in message to Tamil
step_type: llm_call
config:
  model_id: gemma4_26b
  special_instructions: "Translate using informal Tamil as spoken in Chennai:"
  prompt: "Are you okay? Do you need help?"
  output_key: translation

# 2. Send interactive prompt via popup and voice
step_type: interactive_prompt
config:
  popup_message_template: "Are you okay?"
  voice_prompt_template: "{{translation}}"
  auto_escalate: true
  escalate_button_text: "I need help"
  dismiss_button_text: "I'm okay"
  countdown_seconds: 30
  timeout_action: escalate
  output_key: interactive_response

# 3. Branch on response
step_type: condition
config:
  expression: "auto_escalate_triggered == true"
  trigger_cooloff: true

# 4. If escalated, notify caregiver
step_type: notification
config:
  alert_level: emergency
  message_template: "Emergency: {{person_detections.0.name}} needs help in bathroom"
  channels: [telegram, pwa_popup_text, ha_speaker_tts]
```

If the user dismisses the prompt, the pipeline ends without triggering cool-off. If they select "I need help" or timeout occurs, `auto_escalate_triggered` is set, the condition step marks the run as cool-off-worthy, and the caregiver is alerted.

:::

::: tip Response correlation with voice AI

When using the `voice_prompt_template` channel, the prompt is sent to the Gemini Live voice companion with execution context metadata (`execution_id`, `step_id`) appended. The voice agent can then call the `respond_to_interactive_prompt` MCP tool to record the user's verbal response, which resumes the pipeline just like a popup button click.

:::

## Condition Expressions {#condition-expressions}

All template and condition expressions use a unified Lark-based grammar with `{{ }}` wrapping. The grammar supports paths, JMESPath pipes, comparisons, boolean operators, and built-in functions. Simple path references use a fast regex shortcut; complex expressions are parsed into an AST and evaluated.

Server-side validation catches typos and unknown paths at save time, so invalid expressions never persist.

### Path Access

Access nested values in `pipeline_data`:

```text
{{ steps.scene_1.outputs.count }}
{{ trigger.sensor_id }}
{{ system.local_time }}
```

### JMESPath Pipes

Apply JMESPath filters and transformations:

```text
{{ steps.scene_1.outputs.detections | length(@) }}
{{ steps.scene_1.outputs.detections[?label == 'person'] }}
```

### Comparisons

```text
{{ steps.scene_1.outputs.count > 3 }}
{{ steps.logic_1.outputs.alert_level == "emergency" }}
{{ steps.scene_1.outputs.label != null }}
```

Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`

### Boolean Operators

```text
{{ steps.scene_1.outputs.count > 0 and steps.logic_1.outputs.is_notification_needed == true }}
{{ not exists(steps.translate_1.outputs) or contains(steps.scene_1.outputs.description, "empty") }}
```

### Built-in Functions

| Function | Description |
| --- | --- |
| `contains(haystack, needle)` | Substring or list-membership test (case-sensitive) |
| `icontains(haystack, needle)` | Case-insensitive substring test |
| `length(value)` | Length of string, list, or dict |
| `lower(value)` | Convert to lowercase |
| `upper(value)` | Convert to uppercase |
| `keys(value)` | Dict keys as a list |
| `values(value)` | Dict values as a list |
| `exists(path)` | True if the path resolves to a non-None value |

### Examples

```text
# Notify only if a person was detected and reasoning says to
{{ steps.identify_1.outputs.person_detections | length(@) > 0 and steps.logic_1.outputs.is_notification_needed == true }}

# Skip translation if no notification message exists
{{ exists(steps.logic_1.outputs.notification_message) }}

# Branch based on alert level
{{ steps.logic_1.outputs.alert_level == "emergency" }}
```

Expression validation runs on every step save. A typo like `steps.scene_anaylsis_1.outputs.count` is rejected with a suggestion pointing to the correct label.

## Prompt Templates {#prompt-templates}

::: v-pre
Several step config fields support `{{variable}}` template syntax: the `prompt` and `special_instructions` fields in `llm_call`; the `person_id`, `activity_type`, and `room_name` fields in `activity_detection`; and the `person_id` and `room_name` fields in `verification` conditions. At execution time, placeholders are replaced with values from `pipeline_data` and trigger context.
:::

### Syntax

```text
{{key}}              -- top-level pipeline_data key
{{key.subkey}}       -- nested dict access
{{key.0.name}}       -- list index + nested access
{{room_name}}        -- trigger context value
{{trigger.sensor_id}} -- explicit trigger namespace
{{system.local_time}} -- localized executor-injected system value
```

Unresolvable placeholders are left as-is so the LLM still sees the intent.

### Available Variables

Any key in `pipeline_data` is available. Common variables:

| Variable | Source | Example Value |
| -------- | ------ | ------------- |
| `vision_response` | llm_call step (output_key: vision_response) | `"A person is standing at the stove"` |
| `person_detections.0.name` | person_identification step | `"grandma"` |
| `person_detections.0.confidence` | person_identification step | `0.92` |
| `logic_response.user_notification` | llm_call step (output_key: logic_response) | `"Stove left on"` |
| `system.local_time` | executor-injected system context | `"08:42 AM"` |
| `system.local_day_of_week` | executor-injected system context | `"Sunday"` |
| `trigger_input.reason` | webhook trigger payload | `"medication_missed"` |
| `room_name` | trigger context | `"Kitchen"` |
| `sensor_id` | trigger context | `"kitchen_cam_01"` |

### Template Examples

**Vision prompt:**

```text
Look at the person in the {{room_name}}. Are they using the stove safely?
```

**Logic reasoning prompt:**

```text
{{vision_response}}

The person identified is {{person_detections.0.name}}.
Determine if they need a reminder about stove safety.
```

**Notification template:**

```text
Reminder for {{person_detections.0.name}} at {{system.local_time}} in the {{room_name}}.
```

**Translation source text:**

```text
{{logic_response.user_notification}}
```

## Example Pipeline Configurations

### Camera Monitoring

The classic detect-analyze-notify chain using the unified `llm_call` step:

```text
person_identification → llm_call (vision, output_key: vision_response)
  → llm_call (reasoning, output_key: logic_response)
  → llm_call (translation, output_key: translation)
  → notification
```

Each `llm_call` step selects its own `model_id`, so vision reasoning can use Cosmos Reason2 while logic and translation use Gemma 4 on the same GPU node.

### Lunch Reminder

Identify who is in the room, record a lunch activity attributed to them, wait, then verify against the database and remind if they haven't eaten:

```text
person_identification → activity_detection (activity_type: "lunch", person_id: {{person_detections.0.person_id}}) → wait (30 min) → verification → notification
```

### Light Monitor

Analyze, decide, notify caregiver, wait for response, then act:

```text
llm_call (vision) → llm_call (reasoning, output_key: logic_response) → notification → wait (5 min) → verification → ha_action
```

### Conditional Alert Escalation

Use conditions to route based on severity:

```text
person_identification → llm_call (vision) → llm_call (reasoning, output_key: logic_response) → condition
  ├── (true: emergency) → notification [emergency level] → ha_action
  └── (false: routine)  → notification [info level]
```

### Occupancy Safety Alert

Triggered by the `occupancy_duration` trigger type when a presence sensor has been on for longer than the configured threshold. The pipeline below sends a multilingual voice prompt asking if the person needs help:

```text
llm_call (translation, output_key: translation) → notification [alert_level: warning, channels: [pwa_popup_text, telegram, pwa_realtime_ai]]
```

**Rule configuration:**

- `trigger_type`: `occupancy_duration`
- `primary_sensor_id`: the presence sensor to watch (e.g. `bathroom_sensor_01`)
- `occupancy_config`: `{"min_minutes": 40}`
- `cool_off_minutes`: `30`, which prevents re-firing until a cool-off-triggering execution ages out
- Context filters: add `time_range`, `person_presence`, or `room` filters as needed

The `llm_call` step localises the message before the `notification` step dispatches it. The `pwa_realtime_ai` channel initiates an interactive voice check-in via Gemini Live; the `pwa_popup_text` and `telegram` channels alert the admin console and caregiver simultaneously.

### Telegram Command Trigger {#telegram-command-triggers}

Rules with `trigger_type: telegram` fire when a matching Telegram bot command is received. The `TelegramTriggerService` polls the Bot API on a short interval (default 5 s, configurable via `notifications.telegram.trigger_poll_interval_seconds`). The service only starts when a Telegram bot token is configured.

**Rule settings tab:**

- `trigger_type`: `telegram`
- `telegram_trigger_config.command`: the command to match, e.g. `/medication`. Leave empty to match any command.
- `telegram_trigger_config.allowed_chat_ids`: list of Telegram chat IDs that may fire the rule. Falls back to `notifications.telegram.trigger_allowed_chat_ids` in settings. **An absent or empty whitelist blocks the command (fail-closed).**
- `telegram_trigger_config.respond_with_ack`: send a brief reply confirming the rule was triggered (default `true`).

**Dispatch path:** identical to webhook triggers. A `TriggerContext(trigger_type="telegram")` is built and executed by `PipelineExecutor`. The command payload is available via `trigger_input` keys.

::: details Example: medication reminder on demand

A caregiver or the senior sends `/medication` in the family Telegram group. The rule records a medication activity and sends a Tanglish voice confirmation:

```text
Rule: trigger_type=telegram, command=/medication
Pipeline:
  activity_detection (activity_type: medication, person_id: {{trigger_input.from_user.id}})
  → llm_call (translation, prompt: "Confirm: medication taken. Translate to Tamil.")
  → notification [channels: telegram, ha_speaker_tts]
```

The `notification` step sends the translated confirmation back to Telegram and plays it over the home speaker.

:::

## Real-world Examples {#real-world-examples}

The examples below assume a household with one senior (`grandma`) and a small set of caregivers. Each example names the trigger, every filter, every step, and every notification channel so you can replicate it end-to-end. All filter and step type names match what `GET /api/v1/pipeline/filter-types` and `GET /api/v1/pipeline/step-types` return on a current build.

### Stove caution when grandma is alone in the kitchen

The goal: when grandma is the only person at home and steps into the kitchen, gently remind her about stove safety. The reminder fires at most once per hour even if she walks in and out.

**Rule settings:**

- `trigger_type`: `sensor_event`
- `primary_sensor_id`: kitchen camera
- `cool_off_minutes`: `60`

**Filters (all must pass):**

| Filter | Config | Negate |
| --- | --- | --- |
| `room` | `room_name: Kitchen` | no |
| `home_state` | `person_id: grandma`, gate on `at_home` | no |
| `person_presence` | `person_id: grandma` | no |
| `person_presence` | `person_id: caregiver_1` | yes |
| `person_presence` | `person_id: caregiver_2` | yes |
| `time_range` | `06:00 - 22:00` (avoid waking her at night) | no |

**Pipeline:**

```text
1. scene_analysis  (run_detect=true, run_describe=true, run_hazards=true)
2. condition       expression: any_in(scene_detections.*.label, ["stove","oven","cooktop"])
                   on_true → step 3, on_false → end
3. notification    channels: [pwa_tts_announcement, eink]
                   pwa_tts_announcement_template: "Hi grandma, please be careful around the stove. Turn it off when you're done cooking."
                   eink_template_id: caution_template
                   eink_expiry_minutes: 30
```

The TTS announcement plays from the kitchen PWA tablet; the e-ink display in the kitchen also shows the message. `cool_off_minutes: 60` means subsequent stove sightings within an hour record `EventLog.status = ignored` and do not re-fire.

### Confirm grandma had lunch and send images to a caretaker

The goal: between 12:00 and 14:00, observe the kitchen periodically. If grandma appears to be eating, record a `meal_lunch` activity with the VLM's full reasoning attached, and forward an annotated image to the caretaker on Telegram.

**Rule settings:**

- `trigger_type`: `cron`
- `schedule_cron`: `*/10 12-13 * * *` (every 10 minutes from 12:00 to 13:50)
- `cool_off_minutes`: `120` (one lunch confirmation per day is enough)

**Filters:** none beyond cron.

**Pipeline:**

```text
1. person_identification  include_annotated_image: true, target_persons: ["grandma"]
2. condition              expression: person_detections.count > 0
                          on_true → step 3, on_false → end
3. llm_call (vision)      model_id: cosmos_reason2
                          image_source: both
                          additional_room_names: ["Kitchen"]
                          image_time_filter.since_minutes: 30
                          sort_by_sensor_then_time: true
                          response_format: json_schema
                          response_json_schema: {ate_lunch: bool, evidence: str, confidence: float}
                          output_key: vision_response
4. condition              expression: vision_response.ate_lunch == true
                          on_true → step 5, on_false → end
5. activity_detection     activity_type: meal_lunch
                          person_id: "{{person_detections.0.person_id}}"
                          confidence: "{{vision_response.confidence}}"
                          capture_scene_description: true
                          scene_description_key: vision_response
                          metadata_extra: '{"reasoning": "{{vision_response.evidence}}"}'
6. notification           channels: [telegram]
                          telegram_template: "Grandma had lunch. {{vision_response.evidence}}"
                          telegram_attach_images: true   # forwards annotated_images from step 1
```

The `activity_detection` step writes a row that downstream rules can read via `verification`. The `cool_off_minutes: 120` plus `meal_lunch` activity record is what stops the next rule (below) from also firing.

### Reminder when grandma has not had lunch by 14:00

The goal: at 14:00, check whether a `meal_lunch` activity was recorded for grandma since 11:00. If not, remind her over the kitchen tablet and e-ink, and notify caregivers.

**Rule settings:**

- `trigger_type`: `cron`
- `schedule_cron`: `0 14 * * *`
- `dependencies`: must depend on the lunch-confirmation rule (above) so this rule does not fire on a day where the database write hasn't propagated.

**Pipeline:**

```text
1. verification           conditions:
                            - activity_type: meal_lunch
                              person_id: grandma
                              window_start: "11:00"
                              window_end:   "14:00"
                              min_confidence: 0.6
                          On at-least-one match → end (status: ignored).
2. notification           channels: [telegram]
                          telegram_template: "Reminder: grandma hasn't been recorded as having lunch yet today."
3. notification           channels: [pwa_tts_announcement, eink]
                          pwa_tts_announcement_template: "Grandma, it's lunch time. Would you like me to suggest something?"
                          eink_template_id: lunch_reminder
```

`verification` returns success and stops the pipeline (`should_continue=false`) when the activity exists, so the notifications never fire on a normal day.

### Unknown person enters when grandma is alone

The goal: if grandma is the only person home and an unidentified face is detected on the entry camera, send an emergency Telegram alert with an annotated image.

**Rule settings:**

- `trigger_type`: `sensor_event`
- `primary_sensor_id`: entry camera
- `cool_off_minutes`: `5` (we want quick re-firing if the person stays)

**Filters:**

| Filter | Config | Negate |
| --- | --- | --- |
| `home_state` | `person_id: grandma`, gate on `at_home` | no |
| `person_presence` | `person_id: caregiver_1` | yes |
| `person_presence` | `person_id: caregiver_2` | yes |

**Pipeline:**

```text
1. person_identification  include_annotated_image: true
2. condition              expression: any(person_detections, d -> d.identity == "unknown")
                          on_true → step 3, on_false → end
3. notification           channels: [telegram, pwa_popup_text]
                          alert_level: emergency
                          telegram_template: "Unknown person at the door while grandma is home alone."
                          telegram_attach_images: true
```

This rule has zero LLM calls. It relies entirely on person identification and the `home_state` + `person_presence` filters, which makes it cheap enough to run on every entry-camera frame.

::: tip Composing reminders with `interactive_prompt`

The reminder examples above push notifications and stop. To turn a reminder into a two-way exchange, replace the final `notification` with an `interactive_prompt` step. It pushes the question through the same channels, persists a pending response, and resumes the workflow with the answer in `pipeline_data["interactive_response"]`. A downstream `condition` step can then branch on yes / no / timeout.

:::

## Cron Triggers

Cron schedules are decoupled from rules through a dedicated `CronTrigger` model with a many-to-many relationship. A rule can have multiple cron schedules, and multiple rules can share the same schedule.

Cron-triggered rules go through `RulesEngine` like sensor events, so context filters (`time_range`, `day_of_week`, `person_presence`), dependencies, and rate limits all apply. The scheduler creates one APScheduler job per `CronTrigger`, not per rule.

The admin UI includes a **Cron Builder** with preset modes: Daily, Weekly, Hourly, Every N Minutes, and Custom. A live "next 5 runs" preview shows when the rule will fire in the operator's timezone. Raw cron expressions are always editable for power users.

The `POST /api/v1/pipeline/cron/preview` endpoint validates expressions and returns parsed structure plus next-run timestamps.

## Rule Import/Export

Rules can be exported to portable YAML or JSON bundles and imported across installations. Bundles use stable string identifiers (labels, type names, sensor ids) instead of database primary keys, so they survive round-trips between different installs.

- **Export:** `GET /api/v1/rules/{id}/export` returns a self-contained `RuleBundle` document with steps, contexts, dependencies, cron expressions, and external references
- **Import preview:** `POST /api/v1/rules/import/preview` validates a bundle and returns an `ImportReport` with per-step migration status and any warnings, without writing to the database
- **Import commit:** `POST /api/v1/rules/import` commits a validated bundle within a single transaction. All-or-nothing: if any step fails validation or any reference is unresolvable, the entire import rolls back
- **Migration chains:** Each step handler can declare `ConfigMigration` entries that transform config dicts from older schema versions to the current one. Migrations are pure functions with unit tests

Bundles are also accessible to AI agents through the MCP server (`get_rule_bundle`, `import_rule_bundle`).

## Workflow Execution

When a rule's pipeline is triggered, a `WorkflowExecution` record tracks the full lifecycle:

| Status | Meaning |
| --- | --- |
| `running` | Pipeline is actively executing steps |
| `waiting` | Paused at a `wait` or `interactive_prompt` step, will resume at `resume_at` time |
| `completed` | All steps finished successfully |
| `failed` | A step failed or the pipeline timed out |
| `cancelled` | Manually cancelled via the API or admin UI |

**Cancel:** Running or waiting executions can be cancelled from the Live Run tab or via `POST /api/v1/workflows/{id}/cancel`. The executor checks for cancellation between steps (cooperative cancellation) and stops at the next step boundary.

**Rerun:** Any execution can be rerun from the beginning via `POST /api/v1/workflows/{id}/rerun`. This copies the original trigger context and re-executes all enabled steps. Useful for testing rule changes against the same trigger.

**Execution detail:** `GET /api/v1/workflows/{id}/detail` returns a rich view model with a step-by-step timeline showing labels, icons, categories, elapsed seconds, success/failure status, outputs, and errors. The same component renders both live and historical executions.

**Per-step timeout:** Each step has a 60-second timeout to prevent stuck LLM calls from hanging the pipeline. If a step times out, it is marked failed and the pipeline continues.

All intermediate results are persisted in `pipeline_data_json` on both the `WorkflowExecution` and the `EventLog` for debugging and auditability. Step timings include labels, elapsed seconds, and success/failure status.

Separately, the related `EventLog` is finalized as either `completed` or `ignored`. Only `completed` events participate in rule cool-off checks.
