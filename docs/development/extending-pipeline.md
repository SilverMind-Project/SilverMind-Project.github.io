# Extending the Pipeline

Cognitive Companion uses a plugin architecture for pipeline steps, notification channels, and context filters. Each plugin is a single file that is auto-discovered at startup.

## Adding a Pipeline Step

Use the scaffolding CLI to generate boilerplate:

```bash
uv run --project backend python -m backend.steps._scaffold new your_step --category action
```

This creates `backend/steps/builtin/your_step.py` and `backend/tests/steps/test_your_step.py`.

Or write manually:

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
            display_name="Your Step",
            category="action",        # perception | reasoning | action | state | flow
            icon="mdi-icon-name",
            description="What this step does.",
            config_schema={
                "type": "object",
                "properties": {
                    "some_field": {
                        "type": "string",
                        "default": "",
                        "description": "Field description",
                    },
                },
            },
            default_config={"some_field": ""},
            # Output contract: every data-emitting step must declare its outputs
            output_schema={
                "type": "object",
                "properties": {
                    "your_key": {
                        "type": "string",
                        "description": "Result value produced by this step",
                    },
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
        # services.llm_model_registry, services.ha_client, etc.
        result = await some_service.do_thing(prompt)

        # Keys in data={} are merged into pipeline_data for downstream steps
        return StepResult(
            success=True,
            data={"your_key": result},
        )
```

That's it. The step is auto-discovered at startup and appears in the rule canvas palette, loaded dynamically from `GET /api/v1/pipeline/step-types`.

### StepMetadata Fields

| Field | Required | Description |
| --- | --- | --- |
| `type_name` | Yes | Lower snake_case identifier, e.g. `"your_step"` |
| `display_name` | Yes | Human-readable name for the UI |
| `category` | Yes | `perception`, `reasoning`, `action`, `state`, or `flow` |
| `icon` | Yes | Material Design icon name, e.g. `"mdi-star"` |
| `description` | Yes | One-line description for tooltips |
| `config_schema` | Yes | JSONSchema for config validation and form generation |
| `default_config` | Yes | Default config values for new steps |
| `output_schema` | **Required** for data-emitting steps | JSONSchema describing step outputs; feeds autocomplete and contract tests |
| `output_ports` | No (default `("main",)`) | Output ports available in the graph canvas |
| `schema_version` | No (default 1) | Bump when `config_schema` shape changes; enables migration chains |
| `ui_hints_version` | No (default 1) | Version of `x-ui` widget hints; frontend falls back to generic editor for unknown versions |
| `ui_hints` | No | `x-ui` widget hints for the `SchemaForm` generic renderer |
| `tags` | No | Tuple of strings for palette grouping and search |

### Custom Frontend Config Form

For a richer editing experience, either use `x-ui` hints in your `config_schema` (consumed by `SchemaForm.vue`), or add a custom component. `x-ui` hints are preferred for new step types as they require zero frontend edits.

```json
{
  "type": "object",
  "properties": {
    "threshold": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.5,
      "x-ui": {"widget": "slider", "min": 0, "max": 1, "step": 0.05, "label": "Confidence Threshold"}
    }
  }
}
```

Supported widgets: `text`, `textarea`, `template-textarea`, `template-text`, `number`, `slider`, `checkbox`, `select`, `multiselect`, `chips`, `code-json`, `cron`, `time-of-day`, `step-label-ref`. Unknown widgets fall back to the generic JSON editor.

### Key Types

All core types live in `backend/steps/base.py`:

- **`StepHandler`** (ABC): base class for step plugins. Requires `metadata()` classmethod and `execute()` async method.
- **`StepMetadata`**: step name, description, icon, and config JSONSchema. The schema drives the generic JSON editor.
- **`StepResult`**: step output with these fields:
  - `success`: whether the step succeeded
  - `data`: dict merged into `pipeline_data` for downstream steps
  - `should_continue`: set to `False` to halt the pipeline
  - `output_ports`: tuple of runtime output ports to traverse. Defaults to `("main",)`
  - `wait_until`: for delayed resume (pause and resume later)
- **`TriggerContext`**: trigger metadata:
  - `trigger_type`: `"sensor_event"`, `"cron"`, `"manual"`, `"webhook"`, `"telegram"`, `"occupancy_duration"`, `"cts_window"`, `"dementia_signal"`, or `"resume"`
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
6. Check the **Executions** view for live and historical results

### Branching and graph ports

Branching is graph-based. Do not store downstream step IDs in a step's config. Declare ports in `StepMetadata.output_ports`, return the activated port from `StepResult.output_ports`, and connect those ports through `PUT /api/v1/rules/{rule_id}/edges`.

For example, a condition-like step can expose two ports:

```python
return StepMetadata(
    type_name="your_condition",
    display_name="Your Condition",
    category="flow",
    icon="mdi-source-branch",
    description="Branch based on a custom check.",
    config_schema={...},
    default_config={...},
    output_ports=("true", "false"),
)
```

At runtime:

```python
return StepResult(
    data={"your_condition": {"result": matched}},
    output_ports=("true",) if matched else ("false",),
)
```

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

Browser-visible endpoints follow the BFF API design rule.

1. Define a Pydantic response envelope in `backend/schemas/`
2. Implement the business logic once in `backend/services/`
3. Wire the service in `backend/main.py` lifespan and expose a typed router dependency when useful
4. Create or edit a router file in `backend/routers/`
5. Add permission patterns in `config/auth.yaml`
6. If agents need the same data, expose an MCP tool that calls the same service function
7. Add router tests, and add MCP parity tests when the endpoint has an MCP counterpart

### Adding a New MCP Tool

1. Add a `@_register` decorated async function in `backend/mcp/server.py`. Type hints on parameters auto-generate JSON schemas.
2. Add the tool name to `config/settings.yaml` under `mcp.tools`.
3. If the tool should be available in voice conversations, also add it to `mcp.gemini_tools`.
4. Add the tool name to the smoke test in `backend/tests/mcp/` so the registry assertion stays current.

MCP tools must call a service method; they may not query a repository directly (import-linter enforces this).

### Live pipeline events

CC pipeline steps publish live execution events through the `PipelineExecutor` event publisher. Events are typed as `PipelineExecutionEvent` and include execution ID, rule ID, step ID, step label, status, output port, elapsed milliseconds, and a sequence number. The `/ws/pipeline` WebSocket channel broadcasts these events to the frontend.

Rich inspection data comes from `GET /api/v1/workflows/{execution_id}/detail`. Lightweight live lists come from `GET /api/v1/pipeline/runs`.

### Adding a New Database Model

1. Define the model in `backend/models/` (inherit from `Base`)
2. Import it in `backend/models/__init__.py` and add to `__all__`
3. Generate an Alembic migration with `make migration`
4. Review the migration and apply it with `make migrate`
5. Add model, service, or router tests that exercise the new table

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
