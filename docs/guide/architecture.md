# Architecture

Cognitive Companion follows a layered architecture with clear separation between edge devices, AI processing, rule evaluation, and output dispatch. Every component runs on-premise.

## System Overview

```text
 Edge Devices                         AI Pipeline                              Outputs
 ───────────                         ───────────                              ───────

 reCamera ──┐                    ┌─► Person ID Service   ──┐
            │    ┌────────────┐  │   (InsightFace/ArcFace) │
 reTerminal─┼──► │   Event    │──┤                         ├─► Rules Engine
            │    │ Aggregator │  │   ┌──────────────────┐  │   (context/deps/rate-limit)
 HA Sensors─┘    └────────────┘  ├─► │ Vision LLM       │  │        │
                   MinIO ◄───────┘   │ (Cosmos Reason2) │──┘        ▼
                  (media)            └──────────────────┘    ┌─────────────┐
                                           │                 │  Logic LLM  │
                                           ▼                 │  (Gemma3)   │
                                  ┌────────────────┐         └──────┬──────┘
                                  │ Translation    │                │
                                  │(TranslateGemma)|◄───────────────┘
                                  └────────┬───────┘
                                           │
                ┌──────────────────────────┼──────────────────────────┐
                ▼              ▼           ▼           ▼              ▼
           WebSocket      Telegram     eInk Display   TTS      Home Assistant
           (frontend)     (caregiver)  (reTerminal)  (speaker) (actions + announce)
```

## Data Flow

### 1. Event Ingestion

Edge devices send data to the backend via REST endpoints:

- **reCamera** devices POST image frames to `/api/v1/device/recamera` using device key authentication
- **Home Assistant** sensors are polled at a configurable interval (default: 30 seconds)
- **reTerminal** devices report button presses to `/api/v1/device/reterminal`
- **Occupancy duration events** are generated internally by the `SensorPollingService` when a presence sensor has been continuously occupied for at least the threshold configured in a matching rule (`occupancy_duration` trigger type)

### 2. Event Aggregation

The `EventAggregator` batches incoming sensor events before rule evaluation. This prevents individual frames from flooding the pipeline:

- **Batch size**: configurable number of frames per batch (default: 5)
- **Window**: maximum time to wait for a full batch (default: 10s)
- **Cooldown**: per-sensor minimum interval between batches (default: 30s)
- **Media lifecycle**: frames are stored in MinIO with pre-signed URLs and automatically cleaned up after a retention period

### 3. Rule Matching

The `RulesEngine` evaluates each event batch against all enabled rules. A rule matches when:

- **Context filters** pass: room matches, current time is within the allowed range, day of week matches, required persons are present (or absent), required activities have (or haven't) occurred
- **Dependencies** are satisfied: dependent rules must have fired (or not fired) within their lookback window
- **Rate limits** allow: cool-off period has elapsed, daily trigger count hasn't been exceeded

### 4. Pipeline Execution

Each matched rule triggers its own composable pipeline via the `PipelineExecutor`. Step handlers are self-contained plugins in `backend/steps/builtin/`, each inheriting from `StepHandler` and auto-discovered via `StepRegistry` at startup. Steps execute in the configured order, sharing a `pipeline_data` dictionary that accumulates results:

```python
@dataclass
class TriggerContext:
    trigger_type: str       # "sensor_event", "cron", "manual", "webhook"
    sensor_id: str | None
    room_name: str | None
    media_paths: list[str]
    media_type: str | None
    webhook_payload: dict | None  # Payload from webhook triggers

@dataclass
class StepResult:
    success: bool = True
    data: dict = field(default_factory=dict)   # Merged into pipeline_data
    should_continue: bool = True
    next_step_id: int | None = None            # For conditional branching
    wait_until: datetime | None = None         # For wait/resume
```

The same plugin pattern applies to notification channels (`ChannelRegistry`) and context filters (`FilterRegistry`). See [Composable Pipelines](/features/pipeline) for the full step type reference and [Extending the Pipeline](/development/extending-pipeline) for how to add new plugins.

### 5. Output Dispatch

The `NotificationDispatcher` routes alerts to channels based on the alert level defined in `notifications.yaml`:

- **WebSocket**: pushed to connected admin console clients in real-time
- **Telegram**: sent to caregiver chat IDs via bot API
- **E-Ink Display**: rendered as notification images for specific devices
- **TTS**: announced through Home Assistant media players
- **Home Assistant**: any HA service call (turn on lights, lock doors, etc.)

## Service Architecture

Services are instantiated in the FastAPI lifespan function and attached to `app.state`. The `PipelineExecutor` receives a `ServiceContainer` that bundles all shared services (LLM providers, HA client, DB session factory, etc.) and passes it to step plugins during execution. Routers access services via `app.state`:

```python
# In backend/main.py (lifespan):
services = ServiceContainer(
    db_session_factory=get_session,
    person_id_client=person_id_client,
    notification_dispatcher=notification_dispatcher,
    # ... other dependencies
)
app.state.pipeline_executor = PipelineExecutor(services)

# In a router:
pipeline_executor = request.app.state.pipeline_executor
```

This pattern ensures:

- **Single instances**: each service is created once and shared
- **Explicit wiring**: dependencies are visible in the lifespan function
- **Testability**: services can be replaced with mocks by modifying `app.state`
- **No circular imports**: routers never import service modules directly

## Core Foundation Layer

Every other backend package depends on a small, deliberately boring layer at
`backend/core/`. It is the part of the codebase most tightly held to the
quality bar you would expect from a company shipping medical-adjacent
infrastructure.

| Module | Responsibility | Public surface |
| --- | --- | --- |
| `config.py` | YAML configuration with `${ENV_VAR}` interpolation | `Settings` class, `settings` singleton |
| `database.py` | SQLAlchemy engine, session factory, SQLite pragma wiring | `Database` class, `Base`, `init_db`, `get_db`, `get_session` |
| `auth.py` | API + device key resolution, fnmatch permission checks | `KeyStore` class, `AuthContext`, `get_auth_context`, `require_permission` |
| `exceptions.py` | HTTP-aware error hierarchy and FastAPI handler | `AppError`, `NotFoundError`, `ConflictError`, `AuthenticationError`, `PermissionDeniedError`, `ValidationError` |
| `logging.py` | Structured stdlib logging wrapper | `BoundLogger`, `get_logger`, `setup_logging` |
| `template.py` | `\{\{dotted.path\}\}` renderer used by pipeline step prompts | `render_template`, `resolve_path` |

### Design invariants

The layer is held to three invariants that are enforced by code review, by the
package test suite, and by a stricter per-module mypy override in
`pyproject.toml`:

1. **No upward dependencies.** Modules in `backend.core` do not import from
   `backend.services`, `backend.routers`, `backend.channels`, `backend.steps`,
   or any other higher-level package. `backend.models` is imported lazily only
   inside `Database.create_all` so that `Base.metadata` is populated before
   DDL is issued.
2. **No framework imports except at the FastAPI edge.** Only `auth.py` and
   `exceptions.register_exception_handlers` are allowed to touch FastAPI
   types. Everything else in `backend.core` is usable from CLI scripts,
   workers, and tests without dragging FastAPI into the import graph.
3. **Testability by construction.** Every stateful module-level singleton
   (`settings`, the default `Database`, the default `KeyStore`) is a thin
   facade over a class that can be instantiated directly in a test with no
   global reset. For example:

   ```python
   from backend.core.config import Settings
   from backend.core.database import Database
   from backend.core.auth import KeyStore

   s = Settings.from_dict({"llm": {"model": "fake"}})
   db = Database("sqlite:///:memory:")
   ks = KeyStore(api_keys=[{"key": "K1", "name": "admin", "permissions": ["*"]}])
   ```

### Quality bar

| Metric | Status |
| --- | --- |
| Tests | 113 pytest cases in `backend/tests/core/` |
| Branch coverage | ~98% on `backend/core/` |
| Typing | Strict mypy (`disallow_untyped_defs = true`) for `backend.core.*` only |
| Lint | `ruff` clean, including the enabled `B`, `SIM`, `PIE`, `PT`, `C4`, `T20`, `RUF` rule sets |
| Build | `make check` runs lint, strict type-check, and the core test suite as a single fast gate |

### Services layer

The `backend/services/` package is the next layer up and holds the business
logic: scheduling, condition evaluation, notification dispatch, workflow
orchestration, conversation management, RAG lookup, and media processing.

| Metric | Status |
| --- | --- |
| Tests | 177 pytest cases in `backend/tests/services/` |
| Branch coverage | 89-100% across 7 dedicated test suites |
| Scheduler | Refactored: module-level globals lifted into a `Scheduler` class for testability |
| Build | `make test-services` or `make check-all` (adds services to the pre-commit gate) |

The remaining services (person tracking, sensor polling, telegram trigger) are
integration-heavy and are on a separate pass with substantial HTTP mocking
investment.

## Database

SQLite with SQLAlchemy 2.0 ORM in WAL mode. Tables are auto-created from model definitions on startup. There are no migrations. For schema changes, delete `data/cognitive_companion.db` and restart.

Key models:

| Model | Purpose |
|-------|---------|
| `Rule` | Automation rule with trigger type, schedule, and rate limits |
| `PipelineStep` | One step in a rule's pipeline with type, config, and ordering |
| `WorkflowExecution` | Tracks a single pipeline run including paused/waiting state |
| `EventLog` | Audit trail for every rule execution with full pipeline data |
| `HouseholdMember` | Registered person with face-ID enrollment |
| `PersonSighting` | Camera detection record with location and confidence |
| `PersonActivity` | Detected activity (eating, sleeping, medication) |
| `ActiveImageState` | Per-device e-ink display state |
| `ImageTemplate` | E-ink template with background image and text regions |
| `MediaCache` | MinIO object tracking with pre-signed URLs and expiry timestamps |

## Security Model

### Authentication

Three key types with different resolution methods:

| Type | Format | Resolution |
|------|--------|-----------|
| API Key | Arbitrary string | `X-API-Key` header or `?api_key` query param |
| Device Key | 8-char uppercase alphanumeric | `device_key` in JSON body |
| MCP Key | Arbitrary string | `X-API-Key` header |

### Authorization

Permissions use `fnmatch` patterns matching against `METHOD /path`:

```yaml
caregiver:
  - "GET /api/v1/*"                    # Read everything
  - "POST /api/v1/alerts/*/action"     # Dismiss/assist alerts
```

### Network Model

The system is designed for local network deployment:

- No public endpoints required
- All LLM inference runs locally
- MCP tools are accessed over the local network
- External services (Telegram, Gemini) are optional outbound-only connections
