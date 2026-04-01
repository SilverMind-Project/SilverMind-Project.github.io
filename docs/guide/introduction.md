# Introduction

Cognitive Companion is a privacy-first, on-premise AI system designed for senior care in multigenerational households. It processes camera feeds and sensor data through composable rule-based pipelines, using vision and language models running entirely on local hardware, to deliver context-aware reminders and alerts.

## The Problem

Seniors experiencing cognitive decline face a difficult tradeoff: full-time monitoring that strips away independence, or no monitoring at all. Existing solutions tend toward one extreme:

- **Basic motion sensors** trigger too many false alarms and lack context awareness
- **Cloud-based AI cameras** send private footage off-premises and require internet connectivity
- **Full automation systems** remove the daily routines that maintain cognitive function

## The Approach

Cognitive Companion takes a different path:

1. **Understand context, not just motion.** Vision LLMs analyze *what is happening* in camera frames, not just whether something moved. A person standing in the kitchen at noon means something different than at 3 AM.

2. **Composable rules, not rigid triggers.** Each rule defines its own pipeline of steps (person identification, vision analysis, logic reasoning, conditional branching, wait/resume) assembled in any order. No two rules need to follow the same pattern.

3. **Gentle reminders, not automation.** The system suggests and reminds rather than acting autonomously. A lunch reminder is a reminder, not a robot bringing food. The goal is to preserve agency.

4. **Privacy by architecture.** All AI inference runs on-premise via vLLM and Ollama. Camera frames are processed locally and stored in your own MinIO instance. Nothing leaves your network unless you explicitly configure an external notification channel.

## How It Works

```text
 Edge Devices                         AI Pipeline                              Outputs
 ───────────                         ───────────                              ───────

 reCamera ──┐                    ┌─► Person ID Service ──┐
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

**Event flow:**

1. **Edge devices** (cameras, sensors) send data to the backend
2. The **Event Aggregator** batches frames by sensor with configurable windowing and cooldown
3. The **Rules Engine** matches events against rules using context filters, dependencies, and rate limits
4. Each matching rule's **composable pipeline** executes independently via the `PipelineExecutor`
5. Pipeline steps can identify people, analyze scenes, reason about context, branch conditionally, wait and resume, and dispatch notifications
6. **Outputs** flow to any combination of channels: WebSocket push, Telegram, e-ink displays, TTS speakers, realtime voice prompts, Home Assistant services, and outbound webhooks

## Key Capabilities

| Capability | Description |
|-----------|-------------|
| **10 pipeline step types** | Person ID, vision analysis, logic reasoning, translation, notification, HA action, activity detection, wait, condition, verification |
| **Person tracking** | ArcFace face recognition + Home Assistant sensor fusion for whole-house location |
| **Activity tracking** | Detect and record activities (eating, sleeping, medication) for use in downstream rule context filters |
| **Motion direction** | Classify movement direction at doorways (left/right, towards/away) |
| **Voice companion** | Real-time conversations via Google Gemini Live with WebSocket audio |
| **E-ink displays** | Per-device notification images with template editor and automatic expiry |
| **Multi-channel alerts** | WebSocket, Telegram, e-ink, TTS, realtime voice, Home Assistant, and outbound webhook delivery with escalation policies |
| **MCP tool server** | 16 read-only tools plus rule triggering for AI agent integration via Model Context Protocol |
| **RBAC authentication** | API keys, device keys, and fnmatch permission patterns |
| **Tamil language support** | Translation and voice interaction in Tamil |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic 2.0, APScheduler |
| Frontend | Vue 3, Vuetify 3, Vite, Pinia |
| Database | SQLite (WAL mode) |
| Vision LLM | Cosmos-Reason2-8B via vLLM |
| Logic LLM | Gemma3 4B via Ollama |
| Translation LLM | TranslateGemma-12B via vLLM |
| Voice | Google Gemini 2.5 Flash (Live API) |
| Face Recognition | InsightFace buffalo_l with ArcFace embeddings |
| Object Storage | MinIO (S3-compatible) |
| Logging | Python stdlib logging with key=value context |

## Next Steps

- [Quick Start](/guide/getting-started): Install and run the system
- [Architecture](/guide/architecture): Deep dive into the system design
- [Composable Pipelines](/features/pipeline): Understand the pipeline step system
- [Development Setup](/development/setup): Set up a development environment
