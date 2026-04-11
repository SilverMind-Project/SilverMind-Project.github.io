# Configuration

Cognitive Companion uses YAML configuration files with environment variable interpolation. All config files live in the `config/` directory.

## Environment Variables

Variables are interpolated into YAML config files using `${ENV_VAR}` syntax. Define them in your `.env` file or set them in your environment.

### Required Variables

| Variable | Description |
|----------|-------------|
| `VISION_MODEL_URL` | Vision model endpoint  -  Cosmos Reason2 (OpenAI-compatible) |
| `TRANSLATE_MODEL_URL` | Translation model endpoint  -  TranslateGemma (OpenAI-compatible) |
| `LOGIC_MODEL_URL` | Logic/reasoning model endpoint  -  Gemma3 (OpenAI-compatible) |
| `HOME_ASSISTANT_URL` | Home Assistant base URL |
| `HOME_ASSISTANT_TOKEN` | HA long-lived access token |
| `MINIO_ENDPOINT` | MinIO / S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `PERSON_ID_SERVICE_URL` | Person identification service URL |
| `CC_ADMIN_API_KEY` | Admin API key |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (real-time voice) |
| `TTS_API_URL` | Text-to-speech service endpoint |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CAREGIVER_CHAT_ID` | Caregiver Telegram chat ID |
| `TELEGRAM_OPENCLAW_CHAT_ID` | Optional second Telegram target |
| `WEBHOOK_DEFAULT_URL` | Default outbound webhook destination |
| `WEBHOOK_AUTH_TOKEN` | Bearer token for outbound webhook auth headers |
| `CC_CAREGIVER_API_KEY` | Caregiver API key (read-only + alerts) |
| `CC_MCP_API_KEY` | MCP/AI agent API key (read-only) |

## settings.yaml {#settings}

The main application configuration file. Access any value in code via dot-notation:

```python
from backend.core.config import settings
url = settings.get("person_id.url")
interval = settings.get("homeassistant.poll_interval_seconds", 30)
```

### Sections

| Section | Controls |
|---------|----------|
| `app` | Application name, version, timezone, debug mode |
| `server` | Host and port binding |
| `cors` | Allowed origins for frontend access |
| `database` | SQLite database URL |
| `llm` | Vision, logic, translation, and realtime LLM provider configs |
| `tts` | TTS voice and speed settings |
| `homeassistant` | HA URL, token, polling interval |
| `minio` | Object storage credentials and presigned URL expiry |
| `event_aggregator` | Batch size, window, cooldown, media retention |
| `conversation` | History TTL and max turns per session |
| `websocket` | Max connections, audio backend, lazy connect |
| `mcp` | Enabled tools list |
| `person_id` | Person-ID service URL, confidence threshold, motion detection |
| `person_tracking` | Location stale timeout, HA propagation toggle |
| `rag` | Optional RAG index configuration |
| `image` | eInk template and font paths |
| `logging` | Log level |

### Timezone

`app.timezone` is the single source of truth for local time across the entire stack. Set it to any valid IANA timezone string (e.g. `"America/New_York"`, `"Europe/London"`, `"Asia/Kolkata"`). It defaults to `"UTC"` and affects:

- **Admin UI.** Every timestamp in the admin interface is displayed in this timezone. DST transitions are handled automatically by the browser's `Intl` API.
- **Cron rules.** A cron expression like `0 8 * * *` fires at 08:00 local time. APScheduler resolves DST transitions so "8 AM" always means 8 AM local.
- **Time range and day-of-week context filters.** Filter windows are interpreted in local time, not UTC.
- **Daily trigger limits.** The `max_daily_triggers` counter resets at local midnight, not UTC midnight.
- **Pipeline context.** `system.local_time`, `system.local_date`, `system.local_day_of_week`, and `system.timezone` in pipeline data are derived from this setting.

All timestamps are stored in the database as UTC. The timezone setting affects scheduling and display only, never the underlying data.

To change the timezone: update `app.timezone` in `config/settings.yaml` and restart the server. The frontend re-reads it on the next page load via `GET /api/v1/admin/app-info`.

### LLM Configuration {#llm}

The `llm` section contains two independent subsystems: the legacy per-role providers used by the `vision_analysis`, `logic_reasoning`, and `translation` steps, and the named model registry used by the `llm_call` step.

#### Named model registry (`llm.models`)

The `llm_call` pipeline step selects a model by `id` from this list. Each entry is an independently reachable server with its own endpoint, API type, and capability declaration.

```yaml
llm:
  models:
    - id: cosmos_reason2
      name: "Cosmos Reason2 8B (Vision)"
      api_type: openai          # openai = /v1/chat/completions; ollama = /api/chat
      base_url: ${VISION_MODEL_URL}
      model: "nvidia/Cosmos-Reason2-8B"
      capabilities: [text, vision]
      max_tokens: 4096
      timeout: 120
      guided_decoding: true     # vLLM: sends guided_json in payload

    - id: gemma4_26b
      name: "Gemma 4 26B (General)"
      api_type: openai
      base_url: "http://192.168.1.31:8100"   # llama.cpp llama-server
      model: "gemma-4-26B-A4B-it-GGUF"
      capabilities: [text, vision, translation]
      max_tokens: 4096
      timeout: 60
      guided_decoding: false    # schema injected as prompt instruction

    - id: translate_gemma
      name: "TranslateGemma 12B"
      api_type: openai
      base_url: ${TRANSLATE_MODEL_URL}
      model: "Infomaniak-AI/vllm-translategemma-12b-it"
      capabilities: [translation]
      max_tokens: 4096
      timeout: 60
      guided_decoding: true

    - id: gemma3_4b
      name: "Gemma 3 4B (Logic)"
      api_type: ollama
      base_url: ${LOGIC_MODEL_URL}
      model: "gemma3:4b"
      capabilities: [text]
      max_tokens: 4096
      timeout: 60
```

**Field reference:**

| Field | Required | Description |
| ----- | -------- | ----------- |
| `id` | yes | Unique identifier; used as `model_id` in step config. |
| `name` | no | Display name shown in the pipeline builder UI. |
| `api_type` | yes | `openai` for any `/v1/chat/completions` server; `ollama` for Ollama `/api/chat`. |
| `base_url` | yes | Server endpoint (no trailing slash). |
| `model` | yes | Model name string passed in the request payload. |
| `capabilities` | yes | One or more of `text`, `vision`, `translation`. The UI filters the model selector by capability. Vision image attachment is skipped automatically when `vision` is absent. |
| `max_tokens` | no | Maximum tokens to generate (default `4096`). |
| `timeout` | no | HTTP request timeout in seconds (default `60`). |
| `guided_decoding` | no | `true` injects the JSON Schema as `guided_json` (vLLM). `false` appends it as a prompt instruction (llama.cpp and others). Default `false`. |
| `max_retries` | no | Hallucination retry attempts (default `3`). |

#### Legacy per-role providers

Used by the `vision_analysis`, `logic_reasoning`, and `translation` steps. These remain functional for existing pipelines.

```yaml
llm:
  vision:
    provider: vllm_vision
    url: ${VISION_MODEL_URL}
    model: "nvidia/Cosmos-Reason2-8B"
    timeout: 120

  logic:
    provider: ollama
    url: ${LOGIC_MODEL_URL}
    model: "gemma3:4b"
    timeout: 60

  translation:
    provider: vllm_translation
    url: ${TRANSLATE_MODEL_URL}
    model: "Infomaniak-AI/vllm-translategemma-12b-it"
    timeout: 60

  realtime:
    provider: gemini_live
    api_key: ${GEMINI_API_KEY}
    model: "gemini-3.1-flash-live-preview"
```

Each legacy provider also supports **chain** (primary with fallback) and **pool** (round-robin load balancing) modes. See the `LLM provider chains and pools` feature in the README for syntax.

### Event Aggregator {#event-aggregator}

Controls how sensor events are batched before rule evaluation:

```yaml
event_aggregator:
  batch_size: 5              # Frames per batch
  window_seconds: 10         # Max time to wait for a full batch
  cooldown_seconds: 30       # Per-sensor cooldown between batches
  media_retention_hours: 24  # How long to keep media files
```

### Home Assistant {#home-assistant}

```yaml
homeassistant:
  url: ${HOME_ASSISTANT_URL}
  token: ${HOME_ASSISTANT_TOKEN}
  poll_interval_seconds: 30  # Sensor polling frequency
  bathroom_time_limit: 20    # Minutes before bathroom occupancy alert
```

## auth.yaml {#auth}

Authentication uses a role-based model with three key resolution methods.

### API Keys

```yaml
api_keys:
  - key: ${CC_ADMIN_API_KEY}
    name: admin
    permissions:
      - admin

  - key: ${CC_CAREGIVER_API_KEY}
    name: caregiver
    permissions:
      - caregiver

  - key: ${CC_MCP_API_KEY}
    name: mcp_agent
    permissions:
      - mcp_readonly
```

### Device Keys

8-character uppercase alphanumeric strings for hardware devices that cannot set HTTP headers:

```yaml
device_keys:
  RCAM0001:
    sensor_id: kitchen_camera
    device_type: recamera
  RTRM0001:
    sensor_id: hallway_display
    device_type: reterminal
```

### Permission Map

Permissions use `fnmatch` patterns to control endpoint access:

```yaml
permissions:
  admin:
    - "*"                                    # Full access

  caregiver:
    - "GET /api/v1/*"                        # Read everything
    - "POST /api/v1/alerts/*/action"         # Dismiss/assist alerts

  mcp_readonly:
    - "GET /api/v1/*"                        # Read everything
    - "POST /api/v1/mcp/tools/*"            # Execute MCP tools
    - "POST /api/v1/rules/*/execute"         # Trigger rules
```

### Key Resolution

Keys are resolved from (in priority order):

1. `X-API-Key` HTTP header
2. `?api_key` query parameter
3. `device_key` field in JSON request body

## notifications.yaml {#notifications}

Maps alert levels to notification channels with escalation policies.

```yaml
telegram:
  bot_token: "${TELEGRAM_BOT_TOKEN}"
  max_image_side: 1920
  targets:
    - name: Caregiver
      chat_id: ${TELEGRAM_CAREGIVER_CHAT_ID}
      alert_levels: [emergency, warning, info]

webhook:
  url: "${WEBHOOK_DEFAULT_URL}"
  timeout_seconds: 10
  headers:
    Authorization: "Bearer ${WEBHOOK_AUTH_TOKEN}"

eink:
  default_targets: []
  default_template: alert
  default_expiry_minutes: 30

notification_defaults:
  emergency:
    channels: [websocket, telegram, eink, tts, homeassistant]
    escalation_minutes: 5
    repeat_count: 3

  warning:
    channels: [websocket, telegram, eink, realtime_voice]
    escalation_minutes: 10

  info:
    channels: [websocket]

  reminder:
    channels: [websocket, tts, eink]
```

| Level | Default Channels | Escalation |
|-------|-----------------|------------|
| `emergency` | WebSocket, Telegram, eInk, TTS, Home Assistant | Every 5 min, 3x repeat |
| `warning` | WebSocket, Telegram, eInk, Realtime Voice | Every 10 min |
| `info` | WebSocket only | None |
| `reminder` | WebSocket, TTS, eInk | None |

The `webhook` channel is configured globally here but is opt-in by default. Add `webhook` to a level's `channels` list, or set it per `notification` step through the pipeline builder. A step-level `webhook_url` overrides `webhook.url`.
