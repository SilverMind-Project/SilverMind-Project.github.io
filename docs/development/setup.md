# Development Setup

This guide covers setting up a development environment for contributing to Cognitive Companion.

## Prerequisites

- **Python 3.11+** (3.12 recommended)
- **Node.js 18+** with npm
- **Git**
- **NVIDIA GPU** with 10 GB+ VRAM (for running models locally)
- **Docker** + NVIDIA Container Toolkit (for person-ID service)

## Clone the Repository

```bash
git clone https://github.com/SilverMind-Project/cognitive-companion.git
cd cognitive-companion
```

## Backend Setup

### Install Dependencies

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate

# Install with all optional dependencies
pip install -e ".[dev,gemini]"
```

The `[dev]` extra includes `ruff`, `pytest`, and `pytest-asyncio`. The `[gemini]` extra adds the `google-genai` package for voice companion support.

### Configure Environment

```bash
cp .env.example .env
# Edit .env with your local service URLs and API keys
```

At minimum, you need:
- A vLLM instance serving Cosmos-Reason2-8B
- An Ollama instance with gemma3:4b
- A MinIO instance for media storage
- The person-ID service running (or mock it for UI development)

### Run the Backend

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag enables hot-reloading on file changes. The SQLite database is auto-created at `data/cognitive_companion.db` on first startup.

### Lint and Format

```bash
ruff check backend/             # Lint
ruff format backend/            # Format
```

Ruff is configured in `pyproject.toml` with rules `E`, `F`, `I`, `W` and a 100-character line length.

### Run Tests

```bash
pytest
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

SQLite with SQLAlchemy 2.0 ORM. Tables are auto-created from model definitions on startup.

**For schema changes:** Delete `data/cognitive_companion.db` and restart the backend. There are no migrations. The schema is defined entirely by the ORM models.

## External Services

For local development, you need these services running:

| Service | Default URL | Purpose |
|---------|-------------|---------|
| vLLM (Cosmos) | `http://localhost:8001/v1` | Vision analysis |
| vLLM (Translate) | `http://localhost:8002/v1` | Language translation |
| Ollama | `http://localhost:11434` | Logic reasoning |
| MinIO | `http://localhost:9000` | Media storage |
| Person ID Service | `http://localhost:8100` | Face recognition |
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
├── data/                       # Runtime data (SQLite DB, media cache)
└── pyproject.toml              # Python project metadata
```

## Key Files to Read First

| File | Why |
|------|-----|
| `backend/main.py` | Lifespan wires all services and shows how everything connects |
| `backend/services/pipeline_executor.py` | The composable pipeline executor |
| `backend/models/pipeline.py` | PipelineStep, WorkflowExecution, STEP_TYPES |
| `backend/services/rules_engine.py` | How rules are matched |
| `backend/core/config.py` | How YAML config and env vars work |
| `backend/core/auth.py` | How API keys and permissions work |
| `config/settings.yaml` | All available configuration options |
