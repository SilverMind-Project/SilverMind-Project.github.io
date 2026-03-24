# Voice Companion

The Voice Companion provides real-time conversational AI for seniors, powered by Google Gemini Live with WebSocket audio streaming. It's designed for natural, empathetic conversation, not command-and-control interaction.

## Overview

The companion is accessible via the frontend at `/` (the root path). It uses a WebSocket connection to stream audio between the browser and the backend, which in turn streams to and from Google Gemini's Live API.

```text
Browser Microphone → WebSocket → Backend Audio Handler → Gemini Live API
                                                              ↓
Browser Speaker   ← WebSocket ← Backend Audio Handler ← Gemini Live API
```

## How It Works

### Audio Pipeline

1. The frontend captures audio from the browser's microphone
2. Audio chunks are sent over a WebSocket connection to the backend
3. The `AudioHandler` in `backend/websocket/audio_handler.py` manages the Gemini Live session
4. Audio is streamed to Gemini's Live API, which processes speech in real-time
5. Gemini's audio responses stream back through the same WebSocket to the browser
6. The frontend plays the audio through the browser's speakers

### Session Management

- Each WebSocket connection creates a new Gemini Live session
- The `ConversationManager` maintains conversation history with configurable TTL and max turns
- Sessions are isolated per connection, so multiple clients can have independent conversations
- The WebSocket connection manager (`backend/websocket/connection_manager.py`) tracks active connections and handles cleanup

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
    model: gemini-2.5-flash
    api_key: ${GEMINI_API_KEY}
    system_instruction: "You are a compassionate companion..."

websocket:
  max_connections: 5
  audio_backend: gemini
  lazy_connect: true

conversation:
  history_ttl_minutes: 30
  max_turns: 50
```

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `websocket.max_connections` | 5 | Maximum concurrent WebSocket connections |
| `websocket.lazy_connect` | true | Only connect to Gemini when audio starts |
| `conversation.history_ttl_minutes` | 30 | How long to keep conversation history |
| `conversation.max_turns` | 50 | Maximum turns before history is trimmed |

## Tamil Language Support

The system supports Tamil language interaction:

- The **TranslateGemma** model handles Tamil translation in pipeline steps
- Voice TTS uses Azure Neural voices (default: `en-IN-NeerjaExpressiveNeural`)
- The Gemini system instruction can be customized to respond in Tamil

## Frontend Interface

The Companion View (`frontend/src/views/CompanionView.vue`) provides:

- **Push-to-talk** or **continuous listening** modes
- **Visual audio level indicator** showing when the system is listening/speaking
- **Conversation transcript** display
- **Connection status** indicator

## Optional: Gemini Dependency

The Gemini Live integration requires the `google-genai` package, which is an optional dependency:

```bash
pip install -e ".[gemini]"
```

The import is intentionally lazy in `backend/integrations/llm/gemini_live.py`. The system starts without Gemini if the package isn't installed. This allows deployments that don't need voice to skip the dependency entirely.
