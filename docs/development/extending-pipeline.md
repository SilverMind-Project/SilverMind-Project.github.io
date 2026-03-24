# Extending the Pipeline

Adding a new pipeline step type is one of the most common contributions to Cognitive Companion. This guide walks through the full process: 4 files, 2 backend and 2 frontend.

## Overview

The pipeline executor passes a shared `pipeline_data` dictionary from step to step. Each handler reads upstream results and merges its own output back in via `StepResult(data={...})`.

Adding a new step type touches:

1. **Backend model**: register the type string
2. **Backend handler**: implement the step logic
3. **Frontend palette**: add the step to the visual builder
4. **Frontend config dialog**: create the configuration form

## Step 1: Backend Model

Add your type string to the `STEP_TYPES` tuple in `backend/models/pipeline.py`:

```python
STEP_TYPES = (
    "person_identification",
    "vision_analysis",
    "logic_reasoning",
    "translation",
    "notification",
    "ha_action",
    "activity_detection",
    "wait",
    "condition",
    "verification",
    "your_new_type",  # Add here
)
```

This tuple is informational (the `step_type` column is a free-form string), but it documents the valid set and is used for validation hints.

## Step 2: Backend Handler

In `backend/services/pipeline_executor.py`, add a handler method and register it in the dispatch dict inside `_execute_step()`:

### Register the handler

```python
# In the handlers dict (~line 338):
handlers = {
    "person_identification": self._step_person_identification,
    "vision_analysis": self._step_vision_analysis,
    # ... existing handlers ...
    "your_new_type": self._step_your_new_type,  # Add here
}
```

### Implement the handler

```python
async def _step_your_new_type(
    self,
    step: PipelineStep,
    execution: WorkflowExecution,
    pipeline_data: dict,
    trigger: TriggerContext,
) -> StepResult:
    config = step.config_json or {}

    # Read from pipeline_data (upstream results)
    vision_output = pipeline_data.get("vision_response", "")

    # Read from config (step-specific settings)
    threshold = config.get("threshold", 0.5)

    # Do your work...
    result = await self._call_some_service(vision_output, threshold)

    # Return results. Keys in data={} are merged into pipeline_data.
    return StepResult(
        success=True,
        data={
            "your_key": result,
            "your_score": 0.85,
        },
    )
```

### Key types

- **`TriggerContext`**: carries trigger metadata:
  - `trigger_type`: `"sensor_event"`, `"cron"`, or `"manual"`
  - `sensor_id`, `room_name`: where the event came from
  - `media_paths`: list of media file paths
  - `media_type`: type of media

- **`StepResult`**: carries step output:
  - `success`: whether the step succeeded
  - `data`: dict merged into `pipeline_data` for downstream steps
  - `should_continue`: set to `False` to halt the pipeline
  - `next_step_id`: for conditional branching (jump to a specific step)
  - `wait_until`: for delayed resume (pause and resume later)

## Step 3: Frontend Step Palette

Add an entry to the `groups` array in `frontend/src/components/pipeline/StepPalette.vue`. Steps are organized by category:

```javascript
const groups = [
  {
    title: "Perception",
    steps: [
      { type: "person_identification", label: "Person ID", icon: "mdi-face-recognition" },
      { type: "vision_analysis", label: "Vision Analysis", icon: "mdi-eye" },
      { type: "activity_detection", label: "Activity Detection", icon: "mdi-run" },
      // Add perception steps here
    ],
  },
  {
    title: "Reasoning",
    steps: [
      { type: "logic_reasoning", label: "Logic Reasoning", icon: "mdi-brain" },
      { type: "condition", label: "Condition", icon: "mdi-call-split" },
      { type: "verification", label: "Verification", icon: "mdi-check-decagram" },
      // Add reasoning steps here
    ],
  },
  {
    title: "Action",
    steps: [
      { type: "notification", label: "Notification", icon: "mdi-bell" },
      { type: "ha_action", label: "HA Action", icon: "mdi-home-automation" },
      { type: "translation", label: "Translation", icon: "mdi-translate" },
      // Add action steps here
    ],
  },
  {
    title: "Flow",
    steps: [
      { type: "wait", label: "Wait", icon: "mdi-timer-sand" },
      // Add flow control steps here
    ],
  },
];
```

Choose an appropriate [Material Design Icon](https://pictogrammers.com/library/mdi/) for your step type.

## Step 4: Frontend Config Dialog

In `frontend/src/components/pipeline/StepConfigDialog.vue`, make three additions:

### (a) Add the config form

```html
<template v-if="localStep.step_type === 'your_new_type'">
  <v-text-field
    v-model="cfg.some_field"
    label="Some Field"
    variant="outlined"
    hint="Description of what this field controls"
  />
  <v-slider
    v-model="cfg.threshold"
    label="Threshold"
    :min="0"
    :max="1"
    :step="0.1"
  />
</template>
```

### (b) Add default values

```javascript
const defaults = {
  // ... existing defaults ...
  your_new_type: {
    some_field: "",
    threshold: 0.5,
  },
};
```

### (c) Handle arrays (if needed)

If your config uses arrays stored as comma-separated strings (see the `target_persons` pattern), add normalization in the `watch` callback and the `save()` function.

## Step 5: Test

1. Delete `data/cognitive_companion.db` and restart the backend
2. Create a rule in the admin console
3. Add your new step type from the palette
4. Configure the step settings
5. Trigger the pipeline (manually or via sensor event)
6. Check the **Workflows** view for execution results
7. Inspect `pipeline_data` in the **Events** log

## Other Extension Points

### Adding a New Context Filter Type

1. Add a handler in `rules_engine.py` `_matches_context()` method
2. Update the `RuleContext` docstring in `backend/models/rule.py`
3. Add form support in `frontend/src/views/admin/RuleDetailView.vue`

### Adding a New API Endpoint

1. Create or edit a router file in `backend/routers/`
2. Add Pydantic request/response schemas in `backend/schemas/`
3. Register the router in `backend/main.py`
4. Add permission patterns in `config/auth.yaml`

### Adding a New MCP Tool

1. Add a `_tool_<name>` method to `MCPToolRegistry` in `backend/mcp/server.py`
2. Add the tool definition to `_build_tool_definitions()`
3. Add the tool name to `config/settings.yaml` under `mcp.tools`

### Adding a New Notification Channel

1. Create an integration client in `backend/integrations/`
2. Register it in `NotificationDispatcher`
3. Add channel configuration in `config/notifications.yaml`

### Adding a New LLM Provider

1. Implement the `LLMProvider` interface from `backend/integrations/llm/base.py`
2. Register it in `backend/integrations/llm/__init__.py`
3. Add config in `config/settings.yaml` under the appropriate `llm.*` section

### Adding a New Database Model

1. Define the model in `backend/models/` (inherit from `Base`)
2. Import it in `backend/models/__init__.py` and add to `__all__`
3. Delete `data/cognitive_companion.db`. Tables are auto-created on restart.
