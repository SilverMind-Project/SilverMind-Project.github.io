# Introduction

Cognitive Companion is a privacy-first, on-premise AI system designed for senior care in multigenerational households. It processes camera feeds and sensor data through composable rule-based pipelines, using vision and language models running entirely on local hardware, to deliver context-aware reminders and alerts.

## The problem

Seniors experiencing cognitive decline face a difficult tradeoff: full-time monitoring that strips away independence, or no monitoring at all. Existing solutions tend toward one extreme:

- **Basic motion sensors** trigger too many false alarms and lack context awareness.
- **Cloud-based AI cameras** send private footage off-premises and require internet connectivity.
- **Full automation systems** remove the daily routines that maintain cognitive function.

## The approach

Cognitive Companion takes a different path:

1. **Understand context, not just motion.** Vision LLMs analyze *what is happening* in camera frames, not just whether something moved. A person standing in the kitchen at noon means something different than at 3 AM.
2. **Composable rules, not rigid triggers.** Each rule defines its own pipeline of steps assembled in any order. No two rules need to follow the same pattern.
3. **Gentle reminders, not automation.** The system suggests and reminds rather than acting autonomously. The goal is to preserve agency.
4. **Privacy by architecture.** All inference runs on-premise via vLLM, llama.cpp, and the sibling AI services. Camera frames are stored in your own MinIO and never leave your network unless you configure an outbound channel.
5. **Multigenerational by default.** Caregivers receive Telegram or webhook alerts; seniors interact via voice, popup, e-ink display, and TTS.

## How it works

```text
            ┌─────────── Edge devices ───────────┐
            │  reCamera (HTTP push)              │
            │  reTerminal (e-ink + button)       │
            │  Home Assistant sensors (poll)     │
            │  RTSP cameras → continuous-tracking│
            └──────────────────┬─────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────┐
              │   Cognitive Companion (FastAPI)  │
              │                                  │
              │  EventAggregator → RulesEngine   │
              │              ↓ matched rules     │
              │       PipelineExecutor           │
              │   (18 step types, plugin-based)  │
              │              ↓                   │
              │       NotificationDispatcher     │
              │   (7 channels, plugin-based)     │
              │                                  │
              │  CTSRuntime (Redis Streams)      │
              │  PresenceService (fused)         │
              │  MCP server (FastMCP, /mcp)      │
              │  WebSocket audio (Gemini Live)   │
              └────┬──────────┬──────────┬───────┘
                   │          │          │
                   ▼          ▼          ▼
            person-id    scene-analysis  semantic-memory
            service       service          service
            (ArcFace)    (YOLO+Florence-2 (pgvector
                          +CLIP)            observations)
                   │
                   ▼
            tts-service (svara / fish_speech / edge_tts)

            continuous-tracking/  (separate service family)
            ├── rtsp-ingress (Go) → go2rtc + motion gate + MinIO
            ├── tracking-orchestrator → YOLO26L + SOLIDER-REID
            │                             + RTMPose + BoT-SORT
            │                             + Bayesian identity
            │                             + dementia signal worker
            └── Redis Streams → CC subscribers
                tracking.events / tracking.revisions / tracking.signals
```

**Event flow:**

1. Edge devices (cameras, sensors, RTSP streams) send data to the backend or stream into the continuous-tracking service.
2. The `EventAggregator` batches frames per sensor with windowing and cooldown.
3. The `RulesEngine` matches each event against enabled rules using context filters, dependencies, and rate limits.
4. Each matching rule's composable pipeline executes via the `PipelineExecutor`.
5. Pipeline steps perform person identification, scene analysis, presence queries, LLM reasoning, condition branching, wait and resume, activity recording, daily reports, and so on.
6. Outputs flow to any combination of channels: PWA popup, Telegram, e-ink display, HA Speaker TTS, PWA TTS announcement, PWA Realtime AI, and outbound webhooks.

## Key capabilities

| Capability | Description |
| --- | --- |
| 18 pipeline step types | `llm_call`, `person_identification`, `scene_analysis`, `semantic_memory_query`, `semantic_memory_write`, `object_trend_analysis`, `presence_query`, `home_state`, `notification`, `ha_action`, `activity_detection`, `activity_session_start`, `activity_session_end`, `daily_report`, `verification`, `condition`, `wait`, `interactive_prompt`. |
| 7 notification channels | `pwa_popup_text`, `pwa_realtime_ai`, `pwa_tts_announcement`, `telegram`, `eink`, `ha_speaker_tts`, `webhook`. |
| 13 context filters | `room`, `time_range`, `day_of_week`, `person_presence`, `person_activity`, `room_transition`, `person_movement_memory`, `scene_contains`, `scene_trend`, `home_state`, `presence_status`, `presence_dwell`, `dementia_signal`. |
| 6 trigger types | `sensor_event`, `cron`, `manual`, `webhook` (HMAC), `telegram` (bot command), `occupancy_duration`. |
| Person tracking | ArcFace face recognition fused with HA presence sensors, with whole-house location. |
| Multi-camera tracking | Optional `continuous-tracking-service` for BoT-SORT tracking, Bayesian identity resolution, and dementia signal generation. |
| Activity tracking | Detect and record activities; duration-aware sessions; end-of-day wellness rollup with optional LLM summary. |
| Voice companion | Realtime conversations via Google Gemini Live with WebSocket audio and tool calling. |
| E-ink displays | Per-device notification images with template editor and refresh suppression. |
| MCP tool server | 24 tools (read-only plus rule triggering and interactive response recording). |
| Plugin systems | Step handlers, channels, and filters auto-discovered as Python files. |
| RBAC | API keys, hardware device keys, and `fnmatch` permission patterns. |

## Technology stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic 2, APScheduler |
| Frontend | Vue 3, Vuetify 3, Vite |
| Database | PostgreSQL 17 with Alembic migrations |
| Vision LLM | Cosmos-Reason2-8B via vLLM |
| General LLM | Gemma 4 26B via llama.cpp `llama-server` |
| Voice | Google Gemini 2.5 Flash (Live API) |
| Face recognition | InsightFace `buffalo_l` with ArcFace embeddings |
| Scene analysis | YOLO11x, Florence-2-large, CLIP ViT-L/14 |
| Semantic memory | PostgreSQL + pgvector |
| Multi-camera tracking | YOLO26L + SOLIDER-REID + RTMPose + BoT-SORT (Triton) |
| Object storage | MinIO (S3-compatible) |
| Logging | Python stdlib logging via a thin `BoundLogger` |

## Next steps

- [Quick Start](/guide/getting-started): install and run the system.
- [Architecture](/guide/architecture): deep dive into the system design.
- [Composable Pipelines](/features/pipeline): full pipeline step reference and worked examples.
- [Continuous Tracking](/features/continuous-tracking): multi-camera tracking and dementia signals.
- [Development Setup](/development/setup): set up a development environment.
