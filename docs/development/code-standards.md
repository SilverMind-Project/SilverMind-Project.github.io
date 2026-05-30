# Code Standards

This document outlines the coding standards and conventions used in Cognitive Companion. Following these ensures consistency and helps AI coding agents work effectively with the codebase.

## Python (Backend)

### Style

- **Linter/Formatter**: ruff with `E`, `F`, `I`, `W`, `UP`, `B`, `SIM`, `RUF`, `PIE`, `PT`, `C4`, `T20` rules
- **Type checker**: mypy with `enable_error_code = ["import"]` (catches broken imports)
- **Line length**: 100 characters
- **Target**: Python 3.14
- **Async**: Use `async`/`await` for all I/O operations

### Foundation Layer: `backend.core.*`

The `backend/core/` package holds a higher bar than the rest of the tree and
is the reference implementation new contributors should read first. A
dedicated `[[tool.mypy.overrides]]` section in `backend/pyproject.toml` applies
`disallow_untyped_defs = true` and `disallow_incomplete_defs = true` to
`backend.core.*` only; the rest of the tree remains on gradual adoption.

Rules specific to code under `backend/core/`:

- Every function must carry full type annotations.
- No imports from higher-level packages (`backend.services`, `backend.routers`,
  `backend.channels`, `backend.steps`, etc.). `backend.models` may only be
  imported lazily inside `Database.create_all`.
- Framework imports are allowed only at FastAPI-facing leaves: `auth.py` and
  `exceptions.register_exception_handlers`.
- Every stateful module-level singleton must be a thin facade over a class
  (`Settings`, `Database`, `KeyStore`) that can be constructed in a test
  without touching process globals.
- Public API changes require a corresponding update to `backend/tests/core/`.

The canonical test suite for this layer lives at `backend/tests/core/` and
covers over 200 test cases across multiple modules. Treat it
as the contract: if a refactor changes a public behavior in
`backend.core.*`, those tests should be updated in the same commit.

### Running the developer gates

```bash
make test              # full backend suite
make test-core         # backend.core only
make test-services     # backend.services only
make coverage          # backend.core with branch coverage (terminal)
make coverage-services # backend.services with branch coverage
make coverage-html     # + HTML report under ./htmlcov
make lint              # ruff (no fixes)
make lint-fix          # ruff with --fix
make format            # ruff format
make typecheck         # mypy over the full backend tree
make typecheck-core    # strict mypy over backend.core only
make check             # lint + typecheck-core + test-core (fast gate)
make check-all         # lint + typecheck-core + test-core + test-services
```

### Imports

All imports must be at the top of the file, following PEP 8:

```python
# Standard library
import json
from datetime import datetime, timezone
from pathlib import Path

# Third-party
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from PIL import Image

# Local
from backend.core.config import settings
from backend.core.logging import get_logger
```

**Exception**: Optional dependencies (e.g., `google-genai`) may use guarded lazy imports with a comment explaining why:

```python
# In the function that needs it:
from google import genai  # Lazy import: google-genai is an optional dependency
```

### Logging

Use `get_logger()` from `backend.core.logging`. Never use `print()`. The logger
wraps Python's stdlib `logging` module and accepts keyword context arguments
that are appended to the log line as `key=value` pairs:

```python
from backend.core.logging import get_logger
logger = get_logger(__name__)

logger.info("event_processed", sensor_id=sid, rule=rule.name)
# → "event_processed sensor_id=cam1 rule=Motion Alert"

logger.error("pipeline_step_failed", step_type=step.step_type, error=str(e))
logger.exception("flush_db_error", sensor_id=sensor_id)  # includes traceback
```

### Error Handling

Raise custom exceptions from `backend/core/exceptions.py`:

| Exception | HTTP Status |
|-----------|-------------|
| `AuthenticationError` | 401 |
| `PermissionDeniedError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |

**Do not** catch these in routers. Let the global exception handlers convert them to HTTP responses.

In backend service code, always log errors:

```python
try:
    result = await some_operation()
except SomeError as e:
    logger.error("operation_failed", error=str(e))
    raise
```

### Service Pattern

Services are instantiated in the FastAPI lifespan and attached to `app.state`:

```python
# In backend/main.py (lifespan):
app.state.my_service = MyService(dependencies...)

# In a router:
my_service = request.app.state.my_service
```

**Do not** instantiate services inside routers or import them at module level in router files.

### Configuration

Access config values via dot-notation:

```python
from backend.core.config import settings

url = settings.get("person_id.url")
interval = settings.get("homeassistant.poll_interval_seconds", 30)
```

Store secrets in environment variables, referenced in YAML via `${ENV_VAR}` syntax. Never hardcode secrets.

## JavaScript/Vue (Frontend)

### Framework

- **Vue 3** with Composition API (`<script setup>`)
- **Vuetify 3** for Material Design components
- **Pinia** for state management
- **Vite** for build tooling

### User Feedback

Use composables instead of browser dialogs:

```javascript
// Instead of alert() / confirm():
import { useNotify } from "@/composables/useNotify";
import { useConfirm } from "@/composables/useConfirm";

const { notify } = useNotify();
const { showConfirm } = useConfirm();

// Success notification
notify("Item saved successfully");

// Error notification
notify("Failed to save: " + error.message, "error");

// Confirmation dialog
const confirmed = await showConfirm("Delete Item", "Are you sure?");
if (confirmed) {
  await deleteItem();
}
```

### Error Handling

Never swallow errors silently. Bare `catch {}` blocks must log:

```javascript
// Bad
try { await fetchData(); } catch {}

// Good
try {
  await fetchData();
} catch (e) {
  console.error("Failed to load data:", e);
  items.value = [];
}
```

### Component Cleanup

Always clean up event listeners and intervals:

```javascript
import { onMounted, onUnmounted } from "vue";

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
```

## CTS-specific standards

CTS code under `backend/services/cts/` and `backend/routers/cts*.py` follows additional rules:

### Shared utilities

Three files are the single authoritative source for functions that were historically duplicated across the codebase:

| Utility | Import from | Replaces |
| --- | --- | --- |
| `ns_to_iso()` | `backend.services.cts._time` | 4 copies across subscriber files |
| `parse_ts()` | `backend.services.cts._time` | 3 divergent copies across service files |
| `ensure_aware()` | `backend.services.cts._time` | 1 copy in source_authority |
| `cts_enabled()` | `backend.routers.cts_deps` | 8 copies across router files |

Import these; never redefine them.

### Protocol-based dependency injection

CTS subscribers and services use structural `Protocol` classes from `backend/services.cts._types` instead of `Any`:

- `ConnectionManager`: WebSocket broadcast and disconnect
- `PipelineExecutor`: event firing interface
- `MinioClient`: presigned URL generation and object retrieval
- `SceneAnalysisClient`: YOLO, Florence-2, CLIP analysis
- `SemanticMemoryClient`: observation creation and queries
- `DBSessionFactory`: `Callable[[], Session]` type alias for `db_factory` parameters

### StreamConsumer contract

All four CTS subscribers extend `StreamConsumer[T]`. The `decode` parameter uses `dict[bytes | str, bytes | str]` because Redis returns bytes when `decode_responses=False`. Messages are protobuf-encoded; the compiled bindings live in `backend/integrations/proto/continuoustracking/v1/`.

### Extraction threshold

When the same logic appears in three or more places, extract it to a shared module. For CTS, this rule produced `_time.py`, `cts_deps.py`, and `_types.py`. For the frontend, it produced `useCtsSeverity.js`, `useFormatRelative.js`, and `useCtsWebSocket.js`.

## No-silent-fallback rule

Every failure path must be explicit. This rule is enforced by the `BLE001` (blind-except) ruff rule at error severity in both CTS and CC. An allowlist of permitted catch-all sites is maintained in each repo's `pyproject.toml`.

| Forbidden | Required instead |
|-----------|-----------------|
| `except Exception: pass` | Log and return a typed error or raise `AppError` |
| `.get("required_key", default_value)` for a required field | Direct dict access or Pydantic validation; raise on missing |
| `try-old-then-new` fallback shims | Explicit version-aware decoding at the boundary |
| Returning fabricated zero/empty on missing data | Raise a typed exception or return a documented `None` |

CTS stream consumers that cannot process a message dead-letter it: they XACK the message, log at warning level, and increment a Prometheus counter. The message is never silently skipped.

## MCP and BFF parity (D6)

Any data exposed to the Vue UI through a FastAPI router must be exposed to MCP tools by reading the **same** service function. MCP tools may not contain query logic; they call service methods and adapt the result. Import-linter contracts in `pyproject.toml` enforce that `backend.mcp` may not import from `backend.models` or repository modules directly.

## Frontend visualisation rules (D2/D3)

- **One shared component per data shape.** Time series, bars, heatmaps, scatter, and DAGs are rendered by the shared ECharts components in `components/charts/` and `components/process/`. No view hand-rolls a chart of the same shape.
- **ECharts via `vue-echarts`, explicit imports only.** No full-bundle ECharts import; no second charting library.
- **Bespoke canvas only for spatial domains.** Floor-plan overlays and bounding-box-on-keyframe views may use SVG/Canvas, but they must consume `--cc-` design tokens and the `useChartTheme` composable.
- **Quality is a first-class field (D5).** Confidence, quality, staleness, and source fields travel from CTS through the BFF envelope to the UI. The UI renders them; it never computes them client-side. Use `CcProvenanceBadge` to display source information.

## Do NOT

- **Run migrations by hand in production.** Use Alembic via `make migrate`.
- **Use `print()`.** Use `get_logger()` from `backend.core.logging`.
- **Instantiate services in routers.** Access them from `request.app.state`.
- **Add dependencies without updating `pyproject.toml` and running `uv lock`** (backend) or `package.json` (frontend).
- **Skip permission checks.** All new endpoints need entries in `config/auth.yaml`.
- **Catch `AuthenticationError` or `PermissionDeniedError` in routers.** Let global handlers deal with them.
- **Store secrets in config files.** Use `${ENV_VAR}` interpolation.
- **Hardcode pipeline step order.** Use the `PipelineStep` model with its `order` field.
- **Use `eval()` for condition expressions.** Use `evaluate_condition()` from `backend.core.template` (Lark-based grammar).
- **Use lazy imports for required dependencies.** All imports belong at the top of the file.
- **Use `alert()` or `confirm()` in Vue views.** Use composables.
- **Swallow errors silently.** Bare `catch {}` blocks must log.
- **Duplicate `_cts_enabled()` in CTS router files.** Import from `backend.routers.cts_deps`.
- **Duplicate `ns_to_iso()` or `parse_ts()` in CTS service files.** Import from `backend.services.cts._time`.
- **Use `Any` for injected service parameters in CTS code.** Use protocol types from `backend.services.cts._types`.
- **Hardcode hex color values in Vue templates.** Use `var(--cc-*)` design tokens or Vuetify theme colors.
- **Duplicate `severityColor` or `formatRelative` in Vue views.** Import from `frontend/src/composables/`.
