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

Sends media frames with a prompt to the vision LLM (Cosmos Reason2) for scene description and analysis.

**Config fields:**

- `prompt`: the analysis prompt sent to the vision model (supports [prompt templates](#prompt-templates))
- `max_tokens`: maximum response length

**Output keys:** `vision_response` (the model's textual analysis)

#### `activity_detection`

Record a single activity to the PersonActivity table. All fields support [prompt templates](#prompt-templates), so values can be fixed strings or resolved from any upstream step output or trigger context. Use multiple steps in sequence to record multiple activities.

**Config fields:**

::: v-pre

- `activity_type` (required): activity to record. Supports templates (e.g. `{{logic_response.activity_type}}` or a literal like `"bathroom_occupancy"`)
- `person_id` (optional): person to attribute the activity to. Supports templates (e.g. `{{person_detections.0.person_id}}`). Leave empty to record as unknown person.
- `room_name` (optional): room where the activity occurred. Supports templates (e.g. `{{room_name}}`). Defaults to the trigger room when empty.
- `confidence`: confidence score (0-1). Accepts a fixed number or `{{template}}` syntax (e.g. `{{logic_response.confidence}}`). Defaults to `0.8`.

:::

**Output keys:** `detected_activities` (list with one entry)

### Reasoning

#### `logic_reasoning`

Evaluates upstream analysis with the logic LLM (Gemma3) to decide whether action is warranted. Typically receives the vision analysis output and determines if a notification should be sent.

**Config fields:**

- `prompt`: the reasoning prompt (supports [prompt templates](#prompt-templates))
- `max_tokens`: maximum response length
- `response_format`: `"default"`, `"activity_detection"`, or `"custom"` (default `"default"`)
- `response_schema`: custom instruction string when `response_format` is `"custom"`

**Output keys:** `logic_response` (the model's response, typically structured with `is_notification_needed`, `notification_message`, `alert_level`)

#### `condition`

Evaluates a boolean expression against `pipeline_data` to control execution flow. Can branch to different steps based on the result.

**Config fields:**

- `expression`: the condition expression to evaluate
- Uses `next_step_on_true` / `next_step_on_false` fields on the `PipelineStep` model for branching

**Output keys:** `condition_result` (boolean)

See [Condition Expressions](#condition-expressions) below.

#### `verification`

Query the PersonActivity database to verify whether household members completed (or did not complete) specific activities within a time window. No LLM calls  -  this is a deterministic database query step.

**Config fields:**

::: v-pre

- `conditions`: list of condition objects, each with:
  - `activity_type` (str, required): the activity type to look for
  - `person_id` (str, optional): person to check; supports [prompt templates](#prompt-templates) (e.g. `{{person_detections.0.person_id}}`). Leave empty to match any person.
  - `room_name` (str, optional): room to filter by; supports templates (e.g. `{{room_name}}`). Leave empty to match any room.
  - `completed` (bool, default `true`): whether the activity should have been completed
  - `within_minutes` (float): relative time window from now
  - `window_start` / `window_end` (ISO-8601 UTC): fixed time window (alternative to `within_minutes`)
  - `min_confidence` (float, default `0.5`): minimum confidence threshold for matching records
- `match_mode`: `"all"` or `"any"` (default `"all"`)
- `re_notify_if_failed`: bool (default `false`), re-trigger notification on verification failure
- `re_notify_delay_minutes`: int (default `5`), delay before re-notification

:::

**Output keys:** `verification.verified` (bool), `verification.match_mode`, `verification.matched_conditions`, `verification.unmatched_conditions`

### Action

#### `notification`

Dispatches an alert to configured notification channels based on alert level. The `NotificationDispatcher` routes the message to WebSocket, Telegram, e-ink, TTS, and/or Home Assistant based on the level mappings in `notifications.yaml`.

**Config fields:**

- `alert_level`: `emergency`, `warning`, `info`, or `reminder`
- `channels`: optional override of which channels to use (completely replaces the defaults from `notifications.yaml` when specified)
- `message_template`: optional Python format string with `{message}`, `{room}`, and any `pipeline_data` key
- `eink_targets`: optional list of sensor IDs for targeted e-ink display rendering

**Output keys:** `notification_dispatched` (boolean), `notification_channels` (dict of channel → success)

#### `ha_action`

Calls a Home Assistant service. Can turn on lights, lock doors, activate scenes, trigger HA automations, or any other HA service call.

**Config fields:**

- `service`: the HA service to call (e.g., `light.turn_on`, `lock.lock`)
- `entity_id`: the target entity
- `service_data`: additional data to pass to the service

**Output keys:** `ha_action_result` (success/failure status)

#### `translation`

Translates text to a target language using TranslateGemma.

**Config fields:**

- `target_language`: language code (e.g., `ta` for Tamil)
- `source_text`: text to translate (supports [prompt templates](#prompt-templates)). Leave empty to auto-detect from `logic_response.user_notification` or `vision_response`.

**Output keys:** `translation` (the translated text)

### Flow

#### `wait`

Pauses pipeline execution for a configured duration. The execution state is persisted to the database and the scheduler resumes it automatically via an APScheduler `DateTrigger`.

**Config fields:**

- `duration_minutes`: how long to wait before resuming

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
Several step config fields support `{{variable}}` template syntax: prompts in `vision_analysis`, `logic_reasoning`, and `translation`; the `person_id`, `activity_type`, and `room_name` fields in `activity_detection` (direct mode); and the `person_id` and `room_name` fields in `verification` conditions. At execution time, placeholders are replaced with values from `pipeline_data` and trigger context.
:::

### Syntax

```text
{{key}}              -- top-level pipeline_data key
{{key.subkey}}       -- nested dict access
{{key.0.name}}       -- list index + nested access
{{room_name}}        -- trigger context value
{{trigger.sensor_id}} -- explicit trigger namespace
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

**Translation source text:**

```text
{{logic_response.user_notification}}
```

## Example Pipeline Configurations

### Camera Monitoring

The classic detect-analyze-notify chain:

```text
person_identification → vision_analysis → logic_reasoning → translation → notification
```

### Lunch Reminder

Identify who is in the room, record a lunch activity attributed to them, wait, then verify against the database and remind if they haven't eaten:

```text
person_identification → activity_detection (activity_type: "lunch", person_id: {{person_detections.0.person_id}}) → wait (30 min) → verification → notification
```

### Light Monitor

Analyze, decide, notify caregiver, wait for response, then act:

```text
vision_analysis → logic_reasoning → notification → wait (5 min) → verification → ha_action
```

### Conditional Alert Escalation

Use conditions to route based on severity:

```text
person_identification → vision_analysis → logic_reasoning → condition
  ├── (true: emergency) → notification [emergency level] → ha_action
  └── (false: routine)  → notification [info level]
```

### Occupancy Safety Alert

Triggered by the `occupancy_duration` trigger type when a presence sensor has been on for longer than the configured threshold. The pipeline below sends a multilingual voice prompt asking if the person needs help:

```text
translation → notification [alert_level: warning, channels: [websocket, telegram, realtime_voice]]
```

**Rule configuration:**

- `trigger_type`: `occupancy_duration`
- `primary_sensor_id`: the presence sensor to watch (e.g. `bathroom_sensor_01`)
- `occupancy_config`: `{"min_minutes": 40}`
- `cool_off_minutes`: `30`  -  prevents re-firing until acknowledged or resolved
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
