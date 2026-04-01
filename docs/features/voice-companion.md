# Voice Companion

The Voice Companion provides real-time conversational AI for seniors, powered by Google Gemini Live with WebSocket audio streaming. It's designed for natural, empathetic conversation, not command-and-control interaction.

## Overview

The companion is accessible via the frontend at `/` (the root path). It uses a WebSocket connection to stream audio between the browser and the backend, which in turn streams to and from Google Gemini's Live API.

```text
Browser Microphone → WebSocket → Backend Audio Handler → Gemini Live API
                                                              ↓
Browser Speaker   ← WebSocket ← Backend Audio Handler ← Gemini Live API
```

The WebSocket connection also carries push notifications (alerts, reminders, medication prompts) from the rule engine to the frontend. These are delivered regardless of whether the user has started a voice session.

## How It Works

### WebSocket Lifecycle

The frontend connects to `/ws/audio` immediately on page load. This keeps the channel open for push notifications (alerts, reminders) without touching Gemini Live. A Gemini session is opened only when the first audio chunk, text message, or orchestrator prompt arrives. After each session ends naturally (e.g. due to provider-side inactivity), the backend waits for the next burst of activity before reconnecting. No keepalive messages are sent.

```text
Page load       → WebSocket connects   → push notifications delivered
User taps mic   → audio flows          → Gemini session opens lazily
User stops      → Gemini session ends  → WebSocket stays open for notifications
User taps mic   → audio flows          → new Gemini session opens
```

### Audio Pipeline

1. The frontend captures microphone audio through a high-pass filter (cutoff: 150 Hz) that removes fan and AC hum before the signal reaches the VAD or the backend.
2. A 2.5-second ambient calibration pass adjusts the VAD threshold to the filtered noise floor after the mic opens.
3. Audio chunks are sent over the WebSocket only while the user has tapped the mic button (recording mode).
4. The `AudioHandler` in `backend/websocket/audio_handler.py` manages the Gemini Live session.
5. Audio is streamed to Gemini's Live API, which processes speech in real-time.
6. Gemini's audio responses stream back through the same WebSocket to the browser.
7. The frontend plays the audio through the browser's speakers.

### Session Management

- Each WebSocket connection creates one conversation session in the database.
- The `ConversationManager` maintains conversation history with configurable TTL and max turns.
- Sessions are isolated per connection, so multiple clients can have independent conversations.
- The WebSocket connection manager (`backend/websocket/connection_manager.py`) tracks active connections and handles broadcast delivery.
- Gemini Live sessions open and close as needed within the lifetime of the WebSocket connection. Conversation history is injected into each new Gemini session as context.

### Transcript Actor Delineation

The voice session tracks three distinct actors in the conversation:

- **User (senior):** Speech from the person using the companion. Shown as right-aligned bubbles in the transcript.
- **Assistant (Gemini agent):** The AI's spoken responses. Shown as left-aligned bubbles.
- **Orchestrator (system):** Prompts injected by the Cognitive Companion rule engine (e.g., medication reminders, safety check-ins via the `realtime_voice` notification channel). These are **never shown** in the frontend transcript. The senior only hears and sees the agent's response, not the system instruction that triggered it.

This separation ensures the senior has a natural conversation experience without seeing internal automation. The full conversation log, including orchestrator turns, is persisted for caregiver review.

### System Instruction

The Gemini model is configured with a system instruction tailored for senior care:

> You are a compassionate companion for an elderly person. Speak clearly, patiently, and with warmth. Use simple language. If they seem confused, gently redirect the conversation. Never rush them.

This instruction is configured in `settings.yaml` under `llm.realtime`.

## Configuration

### settings.yaml

```yaml
llm:
  realtime:
    provider: gemini
    model: gemini-3.1-flash-live-preview
    api_key: ${GEMINI_API_KEY}
    system_instruction: "You are a compassionate companion..."

websocket:
  max_connections: 5

conversation:
  history_ttl_minutes: 30
  max_turns: 50
```

### Key Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `websocket.max_connections` | 5 | Maximum concurrent WebSocket connections |
| `conversation.history_ttl_minutes` | 30 | How long to keep conversation history |
| `conversation.max_turns` | 50 | Maximum turns before history is trimmed |

## Background Noise Filtering

The frontend applies a 150 Hz high-pass BiquadFilter before any audio reaches the VAD or the backend. Low-frequency hum from fans, air conditioning, and HVAC (typically 50-120 Hz) is removed at the signal level, not just masked by threshold tuning. After the filter, a 2.5-second calibration window samples the remaining ambient noise to set a per-session VAD threshold, so the system adapts to each room's acoustic conditions.

## Tamil Language Support

The system supports Tamil language interaction:

- The **TranslateGemma** model handles Tamil translation in pipeline steps.
- Voice TTS uses Azure Neural voices (default: `en-IN-NeerjaExpressiveNeural`).
- The Gemini system instruction can be customized to respond in Tamil.

## Frontend Interface

The Companion View (`frontend/src/views/CompanionView.vue`) provides:

- **Push-to-talk** mode with visual audio level indicator.
- **Status pill** showing the current state: Ready, Listening, You're speaking, or System is responding. The pill shows "You're speaking" only after the user has tapped the mic button, never from background noise during standby.
- **Conversation transcript** display.
- **Connection status** indicator.
- **Alert overlay** for emergency, warning, reminder, and info notifications delivered from the rule engine via WebSocket, visible regardless of audio session state.

## Tool Calling

The voice companion supports function calling via Gemini Live. A configurable subset of MCP tools is exposed as Gemini function declarations, allowing the companion to answer factual queries using real system data.

### Tool Call Flow

1. When a Gemini Live session opens, the `GeminiToolAdapter` converts MCP tool schemas into Gemini `FunctionDeclaration` objects and includes them in the session config.
2. When the senior asks something like "what's the weather?" or "where is everyone?", Gemini recognizes that a tool call is needed.
3. Audio generation pauses while the backend executes the tool (synchronous function calling).
4. The tool result is sent back to Gemini, which incorporates it into a natural spoken response.
5. The senior hears the answer as part of the conversation; raw tool data is never displayed.

### Available Voice Tools

The tool subset is configured in `settings.yaml` under `mcp.gemini_tools`:

```yaml
mcp:
  gemini_tools:
    - "get_rooms"
    - "get_room_occupancy"
    - "get_person_locations"
    - "get_alerts"
    - "get_weather"
    - "get_local_datetime"
    - "get_person_activities"
    - "get_enrolled_persons"
```

Only read-only tools are included by default. Destructive tools like `trigger_rule` are excluded to prevent unintended actions during voice conversations.

### Example Queries

- "What time is it?" calls `get_local_datetime`
- "What's the weather like?" calls `get_weather`
- "Where is grandma?" calls `get_person_locations`
- "Are there any alerts?" calls `get_alerts`

### Conversation Logging

Tool calls are persisted in the conversation database as `system` turns with the tool name, arguments, and result stored in the `metadata_json` field. This provides a full audit trail for caregiver review.

## Optional: Gemini Dependency

The Gemini Live integration requires the `google-genai` package, which is an optional dependency:

```bash
cd backend
uv sync --extra gemini
```

The import is intentionally lazy in `backend/integrations/llm/gemini_live.py`. The system starts without Gemini if the package isn't installed. This allows deployments that don't need voice to skip the dependency entirely. When Gemini is not configured, the WebSocket connection stays open and continues to deliver push notifications.
