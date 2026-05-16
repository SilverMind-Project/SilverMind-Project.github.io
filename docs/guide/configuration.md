# Configuration

Cognitive Companion uses YAML configuration files with environment variable interpolation. All config files live in the `config/` directory.

## Environment Variables

Variables are interpolated into YAML config files using `${ENV_VAR}` syntax. Define them in your `.env` file or set them in your environment.

### Required Variables

| Variable | Description |
| ---------- | ------------- |
| `VISION_MODEL_URL` | Vision model endpoint (vLLM, Cosmos Reason2, OpenAI-compatible) |
| `GEMMA_MODEL_URL` | General reasoning model endpoint (llama.cpp, Gemma 4, OpenAI-compatible) |
| `HOME_ASSISTANT_URL` | Home Assistant base URL |
| `HOME_ASSISTANT_TOKEN` | HA long-lived access token |
| `MINIO_ENDPOINT` | MinIO / S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `PERSON_ID_SERVICE_URL` | Person identification service URL |
| `CC_ADMIN_API_KEY` | Admin API key |

### Optional Variables

| Variable | Description |
| ---------- | ------------- |
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
| --------- | ---------- |
| `app` | Application name, version, timezone, debug mode |
| `server` | Host and port binding |
| `cors` | Allowed origins for frontend access |
| `database` | PostgreSQL connection URL and pool settings |
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
- **Pipeline context.** The `system.*` namespace in `pipeline_data` is derived from this setting. Templates can reference time variants (`system.local_time`, `system.local_time_24h`, `system.local_hour_12h`, `system.local_hour_24h`, `system.local_minute`, `system.local_ampm`), day and date components (`system.local_date`, `system.local_day_of_week`, `system.local_day_ordinal`, `system.local_month_name`, `system.local_year`), and friendly composites (`system.local_date_long`, `system.local_date_friendly`). See [Composable Pipelines](/features/pipeline) for the complete list.

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
    channels: [pwa_popup_text, telegram, eink, ha_speaker_tts]
    escalation_minutes: 5
    repeat_count: 3

  warning:
    channels: [pwa_popup_text, telegram, eink, pwa_realtime_ai]
    escalation_minutes: 10

  info:
    channels: [pwa_popup_text]

  reminder:
    channels: [pwa_popup_text, ha_speaker_tts, eink]
```

| Level | Default Channels | Escalation |
| ------- | ----------------- | ------------ |
| `emergency` | PWA Popup Text, Telegram, eInk, HA Speaker TTS | Every 5 min, 3x repeat |
| `warning` | PWA Popup Text, Telegram, eInk, PWA Realtime AI | Every 10 min |
| `info` | PWA Popup Text only | None |
| `reminder` | PWA Popup Text, HA Speaker TTS, eInk | None |

The `webhook` channel is configured globally here but is opt-in by default. Add `webhook` to a level's `channels` list, or set it per `notification` step through the pipeline builder. A step-level `webhook_url` overrides `webhook.url`.

## knowledge_layouts.yaml {#knowledge-layouts}

Defines image layout specs for info cards and quiz questions. See [Knowledge Repository: Info Cards](/features/knowledge-repository#info-cards) for how layouts drive the image pipeline.

```yaml
layouts:
  - id: text_only
    display_name: "Text only"
    applies_to: [info_card]
    surfaces: [pwa, eink]
    min_images: 0
    max_images: 0
    image_slots: []

  - id: single_hero
    display_name: "Single hero image"
    applies_to: [info_card]
    surfaces: [pwa, eink]
    min_images: 1
    max_images: 1
    image_slots:
      - slot_id: hero
        variants:
          pwa:
            target_width: 1280
            target_height: 720
            fit_mode: cover
            color_mode: rgb
            format: webp
            quality: 85
          eink:
            target_width: 800
            target_height: 480
            fit_mode: contain
            color_mode: bw_dither
            format: png
```

Each layout defines: which surfaces it targets (PWA, e-ink), how many images are required, and per-slot variant specs (target dimensions, fit mode, color mode, output format). Layouts are validated at startup; unknown enum values raise immediately.

Five layouts ship by default: `text_only`, `single_hero`, `side_by_side`, `gallery_grid_2x2`, `quiz_with_optional_image`.

## knowledge_voice.yaml {#knowledge-voice}

Default voice instructions for Gemini Live during knowledge delivery. Overridden per-resource when the caregiver sets a custom `voice_instruction` on the info card, quiz, or pipeline step.

```yaml
interactive_prompt_default: ""

info_card_default: >
  You are now delivering an information card to the senior. Read the
  following content aloud in a warm, clear voice. After reading, ask
  if they have any questions about this information.

quiz_default: >
  You are now conducting a quiz with the senior. Read each question
  aloud clearly. Provide brief, encouraging feedback after each answer.
  Do NOT reveal correct answers during the quiz.
```

Voice instructions compose in 3 layers: step override → resource column → YAML default → base system instruction from `settings.yaml` (`llm.realtime.system_instruction`). See [Knowledge Repository: Voice Instruction System](/features/knowledge-repository#voice-instruction-system) for the full composition rule.

## Embedding and knowledge settings {#knowledge-settings}

Added to `settings.yaml` under the `embedding:` and `knowledge:` keys:

```yaml
embedding:
  triton_url: "triton.nanai.khoofia.com:8701"
  model_name: "embeddinggemma-300m"
  tokenizer_path: "/opt/models/embeddinggemma/tokenizer.json"
  dim: 768
  max_seq_len: 2048
  batch_size: 16

knowledge:
  chunk_size_tokens: 400
  chunk_overlap_tokens: 60
  retrieval_top_k: 8
  min_similarity: 0.55
  answer_model: "gemma4_26b"
  paraphrase_model: "gemma4_26b"
  quiz_generation_model: "gemma4_26b"
  max_upload_bytes: 15728640
  max_pixels: 40000000
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/heic"]
  layouts_file: "config/knowledge_layouts.yaml"
  voice_config_file: "config/knowledge_voice.yaml"
```

| Setting | Default | Description |
| --- | --- | --- |
| `embedding.dim` | 768 | Must match the deployed model. Change requires migration + re-embed. |
| `knowledge.min_similarity` | 0.55 | Cosine threshold for RAG answers. Lower = more answers, higher = stricter. |
| `knowledge.chunk_size_tokens` | 400 | Approximated as 4× characters. |
| `knowledge.retrieval_top_k` | 8 | Chunks retrieved per query. |
| `knowledge.max_upload_bytes` | 15 MB | Per-image upload limit. |
| `knowledge.max_pixels` | 40 MP | Decoded image dimension cap. |
