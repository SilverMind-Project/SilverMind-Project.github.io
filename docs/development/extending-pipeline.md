# Extending the Pipeline

Cognitive Companion uses a plugin architecture for pipeline steps, notification channels, and context filters. Each plugin is a single file that is auto-discovered at startup.

## Adding a Pipeline Step

Create a single file in `backend/steps/builtin/` (or `backend/steps/contrib/` for third-party plugins):

```python
# backend/steps/builtin/your_step.py
from backend.steps import StepRegistry
from backend.steps.base import StepHandler, StepMetadata, StepResult


@StepRegistry.register
class YourStepHandler(StepHandler):
    @classmethod
    def metadata(cls) -> StepMetadata:
        return StepMetadata(
            type_name="your_step",
            name="Your Step",
            description="What this step does",
            icon="mdi-icon-name",
            config_schema={
                "some_field": {
                    "type": "string",
                    "default": "",
                    "description": "Field description",
                },
            },
        )

    async def execute(self, step, execution, pipeline_data, trigger, services):
        config = step.config_json or {}

        # Read from pipeline_data (upstream results)
        vision_output = pipeline_data.get("vision_response", "")

        # Read from config (step-specific settings)
        threshold = config.get("threshold", 0.5)

        # Access shared services via the ServiceContainer
        # services.vision_llm, services.logic_llm, services.ha_client, etc.
        result = await services.logic_llm.generate(prompt)

        # Keys in data={} are merged into pipeline_data for downstream steps
        return StepResult(
            success=True,
            data={"your_key": result},
        )
```

That's it. The step is auto-discovered at startup and appears in the frontend StepPalette (loaded dynamically from `GET /api/v1/pipeline/step-types`). Unknown step types get a generic JSON config editor in StepConfigDialog automatically.

### Custom Frontend Config Form

For a richer editing experience, add a `<template v-if>` block in `frontend/src/components/pipeline/StepConfigDialog.vue`:

```html
<template v-if="localStep.step_type === 'your_step'">
  <v-text-field v-model="cfg.some_field" label="Some Field" variant="outlined" />
</template>
```

### Key Types

All core types live in `backend/steps/base.py`:

- **`StepHandler`** (ABC): base class for step plugins. Requires `metadata()` classmethod and `execute()` async method.
- **`StepMetadata`**: step name, description, icon, and config JSONSchema. The schema drives the generic JSON editor.
- **`StepResult`**: step output with these fields:
  - `success`: whether the step succeeded
  - `data`: dict merged into `pipeline_data` for downstream steps
  - `should_continue`: set to `False` to halt the pipeline
  - `next_step_id`: for conditional branching (jump to a specific step)
  - `wait_until`: for delayed resume (pause and resume later)
- **`TriggerContext`**: trigger metadata:
  - `trigger_type`: `"sensor_event"`, `"cron"`, `"manual"`, or `"webhook"`
  - `sensor_id`, `room_name`: where the event came from
  - `media_paths`: list of media file paths
  - `media_type`: type of media
  - `webhook_payload`: payload from webhook triggers (also in `pipeline_data["trigger_input"]`)
- **`ServiceContainer`**: holds all shared services (LLM providers, HA client, DB session factory, notification dispatcher, etc.)

### Test Your Step

1. Restart the backend (discovery runs at startup)
2. Create a rule in the admin console
3. Add your new step type from the palette
4. Configure the step settings
5. Trigger the pipeline (manually or via sensor event)
6. Check the **Workflows** view for execution results

## Adding a Notification Channel

Create a single file in `backend/channels/builtin/` (or `backend/channels/contrib/`):

```python
# backend/channels/builtin/your_channel.py
from backend.channels import ChannelRegistry
from backend.channels.base import NotificationChannel, ChannelMetadata


@ChannelRegistry.register
class YourChannel(NotificationChannel):
    @classmethod
    def metadata(cls) -> ChannelMetadata:
        return ChannelMetadata(
            channel_type="your_channel",
            name="Your Channel",
            description="Where notifications go",
        )

    async def send(self, message, level, services) -> bool:
        # Use services to access integration clients
        return True
```

The channel is auto-discovered and available to the `NotificationDispatcher`. Add routing config in `config/notifications.yaml` to map alert levels to your channel.

## Adding a Context Filter

Create a single file in `backend/filters/builtin/` (or `backend/filters/contrib/`):

```python
# backend/filters/builtin/your_filter.py
from backend.filters import FilterRegistry
from backend.filters.base import ContextFilter, FilterMetadata


@FilterRegistry.register
class YourFilter(ContextFilter):
    @classmethod
    def metadata(cls) -> FilterMetadata:
        return FilterMetadata(
            context_type="your_filter",
            name="Your Filter",
            description="What this filter checks",
            config_schema={"field": {"type": "string"}},
        )

    def evaluate(self, config: dict, trigger_context) -> bool:
        return config.get("field") == trigger_context.room_name
```

The filter is auto-discovered and used by `RulesEngine._matches_context()` when a rule has a context with `context_type="your_filter"`. Add form support in `frontend/src/views/admin/RuleDetailView.vue` for the filter's config fields.

### Context Filter Negation

Every context filter supports negation via the `negate` flag on `RuleContext`. When `negate` is `True`, the filter result is inverted. For example, a room filter with `negate=True` means "NOT in this room". This is handled generically by the rules engine; individual filter implementations don't need to be aware of it.

```json
{
  "context_type": "room",
  "config_json": { "room_name": "Kitchen" },
  "negate": true
}
```

The above means: "fire this rule when the event is NOT in the Kitchen."

Composition rules remain the same: within a `context_type` group, contexts are ORed; across groups, they are ANDed. Negation is applied per-context before the OR grouping.

## Adding an LLM Provider

1. Implement the `LLMProvider` interface from `backend/integrations/llm/base.py`
2. Register it via `register_provider(name, provider)` in `backend/integrations/llm/__init__.py`
3. Add config in `config/settings.yaml` under the appropriate `llm.*` section
4. Optionally configure as part of a chain (fallback) or pool (load balancing) in `settings.yaml`

## Other Extension Points

### Adding a New API Endpoint

1. Create or edit a router file in `backend/routers/`
2. Add Pydantic request/response schemas in `backend/schemas/`
3. Register the router in `backend/main.py`
4. Add permission patterns in `config/auth.yaml`

### Adding a New MCP Tool

1. Add a `_tool_<name>` method to `MCPToolRegistry` in `backend/mcp/server.py`
2. Add the tool definition to `_build_tool_definitions()`
3. Add the tool name to `config/settings.yaml` under `mcp.tools`

### Adding a New Database Model

1. Define the model in `backend/models/` (inherit from `Base`)
2. Import it in `backend/models/__init__.py` and add to `__all__`
3. Delete `data/cognitive_companion.db`. Tables are auto-created on restart.

### Frontend Widget System

The CompanionView uses a widget registry for extensibility. Register a new widget:

```javascript
// frontend/src/components/companion/your_widget.js
import { registerWidget } from "./WidgetRegistry.js";
import YourWidget from "./YourWidget.vue";

registerWidget({
  id: "your_widget",
  name: "Your Widget",
  icon: "mdi-icon-name",
  component: YourWidget,
  position: "sidebar", // "main", "sidebar", or "overlay"
  priority: 10,
});
```

Import this file in `frontend/src/components/companion/index.js` to auto-register at startup. Widget props and events are mapped in `CompanionView.vue` via `getWidgetProps()` and `getWidgetEvents()`.
