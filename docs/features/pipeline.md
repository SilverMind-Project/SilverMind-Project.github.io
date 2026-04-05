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
    trigger_type: str              # "sensor_event", "cron", "manual", "webhook", "occupancy_duration"
    sensor_id: str | None
    room_name: str | None
    media_paths: list[str]
    media_type: str | None
    webhook_payload: dict | None   # Payload from webhook triggers
    occupancy_duration_minutes: float | None  # Set for occupancy_duration triggers
```

For webhook triggers, `webhook_payload` is also available in `pipeline_data["trigger_input"]`. For `occupancy_duration` triggers, `occupancy_duration_minutes` reflects how long the sensor has been continuously occupied at the moment the rule fired.

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

#### `vision_analysis`

Sends media frames with a prompt to the vision LLM (Cosmos Reason2) for scene description and analysis. Supports acquiring additional images across the home for temporal or multi-angle context.

::: tip Prefer `llm_call` for new pipelines
The `llm_call` step (see [Reasoning](#reasoning)) is a superset of `vision_analysis`. It supports the same image-source options plus model selection, sensor-ordered image assembly for inter-frame analysis, and a configurable output key.
:::

**Config fields:**

- `prompt`: the analysis prompt sent to the vision model (supports [prompt templates](#prompt-templates))
- `image_source`: `"trigger"` (default), `"additional"`, or `"both"`. Controls which images to send to the model.
- `max_images`: max total images to send to the vision model (default `5`).
- `additional_sensor_ids` / `additional_room_names`: optionally pull recent images from extra cameras or rooms.
- `image_time_filter`: optional object with `since_minutes`, `time_start`, `time_end` to filter additional images temporally.
- `response_format`: `"default"` (text) or `"custom"` (JSON). Controls whether the vision model should output free text or structured JSON.
- `response_schema` / `response_json_schema`: text instruction and JSON Schema to enforce structured output via guided decoding when `response_format` is `custom`.

**Output keys:** `vision_response` (the model's response, which will be a parsed JSON dictionary if structured output is chosen, otherwise a textual analysis)

#### `activity_detection`

Record a single activity to the PersonActivity table. All fields support [prompt templates](#prompt-templates), so values can be fixed strings or resolved from any upstream step output or trigger context. Use multiple steps in sequence to record multiple activities.

**Config fields:**

::: v-pre

- `activity_type` (required): activity to record. Supports templates (e.g. `{{logic_response.activity_type}}` or a literal like `"bathroom_occupancy"`)
- `person_id` (optional): person to attribute the activity to. Supports templates (e.g. `{{person_detections.0.person_id}}`). Leave empty to record as unknown person.
- `room_name` (optional): room where the activity occurred. Supports templates (e.g. `{{room_name}}`). Defaults to the trigger room when empty.
- `confidence`: confidence score (0-1). Accepts a fixed number or `{{template}}` syntax (e.g. `{{logic_response.confidence}}`). Defaults to `0.8`.
- `trigger_cooloff`: whether a successful activity record should count toward the rule cool-off window. Defaults to `true`.

:::

**Output keys:** `detected_activities` (list with one entry), optional `_cooloff_triggered`

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

#### `logic_reasoning`

Evaluates upstream analysis with the logic LLM to decide whether action is warranted.

::: tip Prefer `llm_call` for new pipelines
`logic_reasoning` is hardwired to the global `llm.logic` provider. The `llm_call` step gives you per-step model selection, a configurable output key, and the same JSON schema enforcement.
:::

**Config fields:**

- `prompt`: the reasoning prompt (supports [prompt templates](#prompt-templates))
- `include_context`: list of `pipeline_data` keys to optionally include in the context
- `response_format`: `"default"`, `"activity_detection"`, or `"custom"` (default `"default"`)
- `response_schema`: custom instruction string appended to the prompt when `response_format` is `"custom"`
- `response_json_schema`: JSON Schema string to strictly enforce output structure via guided decoding.

**Output keys:** `logic_response` (the structured model response as a parsed dictionary. Schema depends on `response_format`; typically includes `is_notification_needed`, `user_notification`, `alert_level`, etc.)

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

Dispatches an alert to configured notification channels based on alert level. The `NotificationDispatcher` can route to WebSocket, Telegram, e-ink, TTS, `realtime_voice`, `homeassistant`, and outbound `webhook` channels.

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

#### `translation`

Translates text to a target language. Can automatically retry requests if the model outputs known gibberish.

::: tip Prefer `llm_call` for new pipelines
`translation` is hardwired to the global `llm.translation` provider and its TranslateGemma-specific prompt format. The `llm_call` step lets you use any capable model (including Gemma 4) with a natural-language prompt and the same hallucination retry.
:::

**Config fields:**

- `target_language`: language code (e.g., `ta` for Tamil)
- `source_text`: text to translate (supports [prompt templates](#prompt-templates)). Leave empty to auto-detect from `logic_response.user_notification` or `vision_response`.
- `special_instructions`: optional instructions prepended to the prompt to enforce translation style (e.g., informal Tanglish).
- `hallucination_marker`: an optional string that, if found in the model's output, forces the step to automatically retry the request using Tenacity.

**Output keys:** `translation` (the translated text)

### Flow

#### `wait`

Pauses pipeline execution for a configured duration. The execution state is persisted to the database and the scheduler resumes it automatically via an APScheduler `DateTrigger`.

**Config fields:**

- `minutes`: how long to wait before resuming

**Output keys:** none (the step simply pauses execution)

## Condition Expressions {#condition-expressions}

Condition steps use a safe expression evaluator built on a recursive-descent parser with no `eval()`. Supported syntax:

### Path Access

Access nested values in `pipeline_data`:

```text
person_detections.count
logic_response.is_notification_needed
vision_response
```

### Comparisons

```text
person_detections.count > 0
logic_response.alert_level == "emergency"
vision_response != null
```

Operators: `==`, `!=`, `>`, `<`, `>=`, `<=`

### Boolean Operators

```text
person_detections.count > 0 and logic_response.is_notification_needed == true
not exists(translation) or contains(vision_response, "empty")
```

### Built-in Functions

| Function                   | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `exists(path)`             | Returns true if the path exists in pipeline data               |
| `contains(path, value)`    | Returns true if the value at path contains the given substring |

### Examples

```text
# Notify only if a person was detected and reasoning says to
person_detections.count > 0 and logic_response.is_notification_needed == true

# Skip translation if no notification message exists
exists(logic_response.notification_message)

# Branch based on alert level
logic_response.alert_level == "emergency"
```

## Prompt Templates {#prompt-templates}

::: v-pre
Several step config fields support `{{variable}}` template syntax: the `prompt` and `special_instructions` fields in `llm_call`, `vision_analysis`, `logic_reasoning`, and `translation`; the `person_id`, `activity_type`, and `room_name` fields in `activity_detection`; and the `person_id` and `room_name` fields in `verification` conditions. At execution time, placeholders are replaced with values from `pipeline_data` and trigger context.
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
| `vision_response` | vision_analysis step | `"A person is standing at the stove"` |
| `person_detections.0.name` | person_identification step | `"grandma"` |
| `person_detections.0.confidence` | person_identification step | `0.92` |
| `logic_response.user_notification` | logic_reasoning step | `"Stove left on"` |
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
llm_call (translation, output_key: translation) → notification [alert_level: warning, channels: [websocket, telegram, realtime_voice]]
```

**Rule configuration:**

- `trigger_type`: `occupancy_duration`
- `primary_sensor_id`: the presence sensor to watch (e.g. `bathroom_sensor_01`)
- `occupancy_config`: `{"min_minutes": 40}`
- `cool_off_minutes`: `30`, which prevents re-firing until a cool-off-triggering execution ages out
- Context filters: add `time_range`, `person_presence`, or `room` filters as needed

The `translation` step localises the message before the `notification` step dispatches it. The `realtime_voice` channel initiates an interactive voice check-in via Gemini Live; the `websocket` and `telegram` channels alert the admin console and caregiver simultaneously.

## Workflow Execution

When a rule's pipeline is triggered, a `WorkflowExecution` record tracks the full lifecycle:

| Status | Meaning |
| ------ | ------- |
| `running` | Pipeline is actively executing steps |
| `waiting` | Paused at a `wait` step, will resume at `resume_at` time |
| `completed` | All steps finished successfully |
| `failed` | A step failed and the pipeline halted |
| `cancelled` | Manually cancelled via the API or admin UI |

All intermediate results are persisted in `pipeline_data_json` on both the `WorkflowExecution` and the `EventLog` for debugging and auditability. You can inspect the full pipeline data at any point via the admin console's **Workflows** view.

Separately, the related `EventLog` is finalized as either `completed` or `ignored`. Only `completed` events participate in rule cool-off checks.
