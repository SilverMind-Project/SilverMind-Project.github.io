# Composable Pipelines

The pipeline system is the core of Cognitive Companion. Each rule defines its own ordered sequence of pipeline steps executed by the `PipelineExecutor`. Rather than a fixed linear chain, administrators configure exactly which steps run and in what order, including conditional branching and wait/resume for multi-stage workflows.

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
    trigger_type: str       # "sensor_event", "cron", "manual"
    sensor_id: str | None
    room_name: str | None
    media_paths: list[str]
    media_type: str | None
```

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
- `prompt`: the analysis prompt sent to the vision model
- `max_tokens`: maximum response length

**Output keys:** `vision_response` (the model's textual analysis)

#### `activity_detection`

Records a detected person activity (eating, sleeping, taking medication) based on upstream pipeline data. These records can be used as context filters in downstream rules.

**Config fields:**
- `activity_type`: the type of activity to record (e.g., `eating`, `sleeping`, `medication`)
- `target_persons`: which person(s) the activity applies to

**Output keys:** `activity_recorded` (boolean), `activity_id` (the created record ID)

### Reasoning

#### `logic_reasoning`

Evaluates upstream analysis with the logic LLM (Gemma3) to decide whether action is warranted. Typically receives the vision analysis output and determines if a notification should be sent.

**Config fields:**
- `prompt`: the reasoning prompt (can reference upstream data via template variables)
- `max_tokens`: maximum response length

**Output keys:** `logic_response` (the model's response, typically structured with `is_notification_needed`, `notification_message`, `alert_level`)

#### `condition`

Evaluates a boolean expression against `pipeline_data` to control execution flow. Can branch to different steps based on the result.

**Config fields:**
- `expression`: the condition expression to evaluate
- Uses `next_step_on_true` / `next_step_on_false` fields on the `PipelineStep` model for branching

**Output keys:** `condition_result` (boolean)

See [Condition Expressions](#condition-expressions) below.

#### `verification`

Re-runs a check to confirm or update a finding. Typically used after a `wait` step to verify that the original situation is still occurring before notifying.

**Config fields:**
- `prompt`: the verification prompt
- `capture_new_media`: whether to take a fresh camera capture

**Output keys:** `verification_response`, `verification_passed` (boolean)

### Action

#### `notification`

Dispatches an alert to configured notification channels based on alert level. The `NotificationDispatcher` routes the message to WebSocket, Telegram, e-ink, TTS, and/or Home Assistant based on the level mappings in `notifications.yaml`.

**Config fields:**
- `alert_level`: `emergency`, `warning`, `info`, or `reminder`
- `channels`: optional override of which channels to use
- `eink_targets`: optional list of sensor IDs for targeted e-ink display rendering

**Output keys:** `notification_sent` (boolean), `notification_channels` (list of channels used)

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
- `source_field`: which pipeline_data key to translate (defaults to notification message)

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

| Function | Description |
|----------|-------------|
| `exists(path)` | Returns true if the path exists in pipeline data |
| `contains(path, value)` | Returns true if the value at path contains the given substring |

### Examples

```text
# Notify only if a person was detected and reasoning says to
person_detections.count > 0 and logic_response.is_notification_needed == true

# Skip translation if no notification message exists
exists(logic_response.notification_message)

# Branch based on alert level
logic_response.alert_level == "emergency"
```

## Example Pipeline Configurations

### Camera Monitoring

The classic detect-analyze-notify chain:

```text
person_identification → vision_analysis → logic_reasoning → translation → notification
```

### Lunch Reminder

Detect the person, check recent activity, wait, then verify and remind:

```text
vision_analysis → activity_detection → wait (30 min) → verification → notification
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

## Workflow Execution

When a rule's pipeline is triggered, a `WorkflowExecution` record tracks the full lifecycle:

| Status | Meaning |
|--------|---------|
| `running` | Pipeline is actively executing steps |
| `waiting` | Paused at a `wait` step, will resume at `resume_at` time |
| `completed` | All steps finished successfully |
| `failed` | A step failed and the pipeline halted |
| `cancelled` | Manually cancelled via the API or admin UI |

All intermediate results are persisted in `pipeline_data_json` on both the `WorkflowExecution` and the `EventLog` for debugging and auditability. You can inspect the full pipeline data at any point via the admin console's **Workflows** view.
