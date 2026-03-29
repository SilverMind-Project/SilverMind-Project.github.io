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

### LLM Configuration {#llm}

The system uses three distinct LLM providers for different tasks:

```yaml
llm:
  vision:
    provider: vllm
    model: nvidia/Cosmos-Reason2-8B
    base_url: ${VISION_MODEL_URL}
    max_tokens: 2048
    temperature: 0.3

  logic:
    provider: ollama
    model: gemma3:4b
    base_url: ${LOGIC_MODEL_URL}
    max_tokens: 1024
    temperature: 0.3

  translation:
    provider: vllm
    model: google/TranslateGemma-12b
    base_url: ${TRANSLATE_MODEL_URL}
    max_tokens: 1024
    temperature: 0.1

  realtime:
    provider: gemini
    model: gemini-2.5-flash
    api_key: ${GEMINI_API_KEY}
```

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
channels:
  telegram:
    targets:
      - name: Caregiver
        chat_id: ${TELEGRAM_CAREGIVER_CHAT_ID}
        alert_levels: [emergency, warning]

  eink:
    default_template: alert
    expiry_minutes: 30

alert_levels:
  emergency:
    channels: [websocket, telegram, eink, tts, ha]
    escalation:
      interval_minutes: 5
      repeat_count: 3

  warning:
    channels: [websocket, telegram, eink]
    escalation:
      interval_minutes: 10

  info:
    channels: [websocket]

  reminder:
    channels: [websocket, tts, eink]
```

| Level | Default Channels | Escalation |
|-------|-----------------|------------|
| `emergency` | WebSocket, Telegram, eInk, TTS, HA | Every 5 min, 3x repeat |
| `warning` | WebSocket, Telegram, eInk | Every 10 min |
| `info` | WebSocket only | None |
| `reminder` | WebSocket, TTS, eInk | None |
