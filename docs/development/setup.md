# Development Setup

This guide covers setting up a development environment for contributing to Cognitive Companion.

## Prerequisites

- **Python 3.14** (required by backend)
- **[uv](https://docs.astral.sh/uv/)** (Python package manager)
- **Node.js 24.16.x** with npm
- **Git**
- **NVIDIA GPU** with 10 GB+ VRAM (for running models locally)
- **Docker** + NVIDIA Container Toolkit (for person-ID service)

## Clone the Repository

```bash
git clone https://github.com/SilverMind-Project/cognitive-companion.git
cd cognitive-companion
```

## Backend Setup

### Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Install Dependencies

```bash
cd backend
uv sync --extra dev --extra gemini
```

This creates a `.venv` automatically and installs all dependencies from the lockfile (`uv.lock`). The `dev` extra includes `ruff`, `mypy`, `pytest`, `pytest-asyncio`, `pytest-cov`, and `coverage`. The `gemini` extra adds the `google-genai` package for voice companion support.

### Run the developer gates

A top-level `Makefile` wraps the common developer tasks so you can exercise the full quality gate with one command:

```bash
cd ..                   # back to the repository root
make help               # list all targets
make test               # full backend test suite
make test-core          # backend.core only (113 tests)
make test-services      # backend.services only (177 tests)
make coverage           # backend.core with branch coverage
make coverage-services  # backend.services with branch coverage
make coverage-html      # + HTML report under ./htmlcov
make typecheck-core     # strict mypy over backend.core only
make check              # lint + typecheck-core + test-core (fast pre-commit gate)
make check-all          # lint + typecheck-core + test-core + test-services
```

The `check` target is the minimum bar before opening a pull request that touches anything under `backend/core/`.

### Configure Environment

```bash
cp .env.example .env
# Edit .env with your local service URLs and API keys
```

At minimum, you need:
- A vLLM instance serving Cosmos-Reason2-8B
- A llama.cpp `llama-server` instance with Gemma 4
- A MinIO instance for media storage
- The person-ID service running (or mock it for UI development)

### Run the Backend

```bash
cd ..  # back to project root
uv run --directory backend uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables hot-reloading on file changes. The backend connects to PostgreSQL at the URL specified in `config/settings.yaml`.

### Lint, Type Check, and Format

```bash
cd backend

# All-in-one check (ruff + ruff format + mypy)
./scripts/lint.sh

# Auto-fix ruff issues
./scripts/lint.sh --fix

# Or run individually
uv run ruff check .             # Lint
uv run ruff format .            # Format
cd .. && backend/.venv/bin/mypy backend/ --config-file backend/pyproject.toml  # Type check
```

Ruff is configured in `pyproject.toml` with rules `E`, `F`, `I`, `W`, `UP`, `B`, `SIM`, `RUF`, `PIE`, `PT`, `C4`, `T20` and a 100-character line length. mypy is configured with `enable_error_code = ["import"]` to catch broken imports at type-check time.

### Run Tests

```bash
cd backend
uv run pytest
```

Tests use `pytest-asyncio` for async test support. Place test files in `tests/` mirroring the `backend/` directory structure.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev                     # Dev server at http://localhost:5173 with HMR
```

The frontend proxies API calls to `http://localhost:8000` during development.

### Build for Production

```bash
npm run build                   # Output in dist/
```

## Database

PostgreSQL 18 via `timescale/timescaledb-ha:pg18` with SQLAlchemy 2.0 ORM. The shared database instance hosts `cognitive_companion`, `continuous_tracking`, and `semantic_memory` databases. Schema changes go through Alembic:

```bash
make migration        # Autogenerate a new migration from model changes
make migrate          # Apply pending migrations
```

For local development, start the shared database:

```bash
docker compose -f docker-compose.db.yml -p nanai up -d
```

Or use the `standalone` profile for a self-contained Postgres: `docker compose --profile standalone up -d`.

For tests, use PostgreSQL testcontainers. Do not use SQLite; the production schema uses PostgreSQL features.

## Person Identification Service

The person-ID service is a separate repository. Clone and run it alongside the main backend:

```bash
git clone https://github.com/SilverMind-Project/person-identification-service.git
cd person-identification-service

# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (GPU build by default)
uv sync

# CPU-only for development without a GPU
uv sync --extra cpu

# Run
uv run uvicorn app.main:app --host 0.0.0.0 --port 8200 --reload
```

Configuration is in `config/settings.yaml`. Override individual values via environment variables (e.g. `CUDA_DEVICE_ID=-1` for CPU fallback). See the service README for the full list.

### Code Quality

```bash
cd person-identification-service

uv run ruff check .            # Lint
uv run ruff format .           # Format
uv run mypy app/               # Type check
uv run pytest                  # Tests
```

### Docker (GPU)

```bash
docker compose up -d
curl http://localhost:8200/health
```

Requires NVIDIA Container Toolkit. See the person-ID service README for Kubernetes manifests.

## External Services

For local development, you need these services running:

| Service | Default URL | Purpose |
| --- | --- | --- |
| vLLM (Cosmos Reason2) | `http://localhost:8001/v1` | Vision model serving |
| llama.cpp (Gemma 4) | `http://localhost:8080/v1` | General reasoning |
| MinIO | `http://localhost:9000` | Media storage |
| Person ID Service | `http://localhost:8200` | Face recognition |
| Home Assistant | `http://homeassistant.local:8123` | Sensor integration |

::: tip
For frontend-only development, you can run the backend without all external services. The backend will start with degraded functionality. LLM calls will fail, but the admin UI, database, and API endpoints will work.
:::

## Project Structure

```text
cognitive-companion/
├── backend/
│   ├── core/                   # Config, auth, database, exceptions, logging
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response schemas
│   ├── services/               # Business logic and pipeline execution
│   ├── integrations/           # External service clients (HA, MinIO, LLMs)
│   ├── routers/                # FastAPI route handlers
│   ├── mcp/                    # MCP tool registry
│   ├── websocket/              # WebSocket connection and audio handling
│   └── main.py                 # App factory and service wiring
├── frontend/src/
│   ├── views/                  # Vue 3 pages
│   ├── components/             # Reusable components (pipeline builder, eink editor)
│   ├── composables/            # Vue composables (useNotify, useConfirm)
│   ├── services/               # API client, WebSocket client
│   ├── router/                 # Route definitions
│   └── stores/                 # Pinia state management
├── config/                     # YAML configuration files
├── data/                       # Runtime data, media cache
├── backend/pyproject.toml      # Python project metadata
└── backend/uv.lock             # Locked dependency versions
```

## Key Files to Read First

| File | Why |
| ------ | ----- |
| `backend/main.py` | Lifespan wires all services and shows how everything connects |
| `backend/services/pipeline_executor.py` | The composable pipeline executor |
| `backend/models/pipeline.py` | PipelineStep, WorkflowExecution, STEP_TYPES |
| `backend/services/rules_engine.py` | How rules are matched |
| `backend/core/config.py` | How YAML config and env vars work |
| `backend/core/auth.py` | How API keys and permissions work |
| `config/settings.yaml` | All available configuration options |
