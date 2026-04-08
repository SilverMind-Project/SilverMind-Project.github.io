# TTS Service

The [TTS Service](https://github.com/SilverMind-Project/tts-service) is a self-hosted text-to-speech microservice that provides an OpenAI-compatible API for speech synthesis. It supports multiple TTS engines optimized for Indian languages and integrates with Home Assistant via the Wyoming protocol.

## Engine Comparison

| Engine | Model | Languages | Voice Cloning | Streaming | VRAM |
| --- | --- | --- | --- | --- | --- |
| **svara** (default) | kenpath/svara-tts-v1 | 22 Indian languages + English | No | Token-level | ~8 GB |
| **parler** | ai4bharat/indic-parler-tts | 11 Indian languages | No (text prompts) | Chunked | ~4 GB |
| **fish_speech** | fishaudio/s2-pro | 80+ languages | Yes | Chunked | ~8-12 GB |
| **seamless** | facebook/seamless-m4t-v2-large | 36 languages | No | No | ~6-8 GB |
| **edge_tts** | travisvn/openai-edge-tts | 40+ languages | No | Proxied | None (remote) |

**Svara** is the recommended engine for Indian English and Tamil. It produces the highest quality speech for the Cognitive Companion's primary use case.

**Edge TTS** is the best option when no GPU is available. It proxies requests to a remote Microsoft Edge TTS service.

## Streaming Architecture

The service supports true streaming for reduced time-to-first-audio:

### Token-Level Streaming (Svara)

Svara uses a SNAC (neural audio codec) decoder. During generation, tokens are intercepted via a custom streamer and grouped into 7-token SNAC frames. Frames are accumulated into batches of `stream_frame_buffer` frames (default 21 = ~210ms) and decoded together through SNAC. Batching is essential because SNAC's convolutional decoder needs temporal context from neighboring frames for artifact-free audio.

The decoded PCM is clipped to [-1, 1] before int16 conversion to prevent overflow, and yielded as a single chunk per batch. On the frontend, all chunks are accumulated until the stream ends, then played as a single contiguous buffer via the Web Audio API. This avoids audible gaps when inference is slower than real-time.

### Proxied Streaming (Edge TTS)

The Edge TTS engine opens a streaming HTTP connection to the remote openai-edge-tts service and proxies PCM chunks directly to the client with no local decoding.

### Chunked Fallback

Engines without native streaming support (parler, fish_speech, seamless) generate audio in full, then chunk the result into PCM segments.

## API

The service exposes an OpenAI-compatible API:

### `POST /v1/audio/speech`

```bash
curl -X POST http://tts-service:8200/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "svara",
    "input": "Hello, how are you today?",
    "voice": "speaker_0",
    "response_format": "mp3"
  }' \
  --output speech.mp3
```

**Streaming:**

```bash
curl -X POST http://tts-service:8200/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model": "svara", "input": "Hello", "stream": true}' \
  --output stream.pcm
```

Returns raw PCM int16 at 24kHz mono with headers `X-Sample-Rate`, `X-Sample-Width`, `X-Channels`.

### `GET /v1/models`

Lists loaded TTS engines.

### `GET /api/v1/voices`

Lists all available voices (built-in + custom voice samples).

### `GET /health`

Returns GPU status, loaded engines, and voice sample count.

## Voice Cloning

Fish Speech supports voice cloning from short (10-30 second) reference audio samples:

1. Upload a reference sample via `POST /api/v1/voices/upload`
2. Use the `voice_id` in synthesis requests with `model: "fish_speech"`

Samples are stored in `data/voice_samples/` with a `meta.json` metadata file alongside each reference audio file.

## Integration with Cognitive Companion

The TTS service integrates with Cognitive Companion through two notification channels:

### TTS Channel (Home Assistant playback)

The `tts` channel generates MP3 audio, uploads it to MinIO, and plays it on a configured Home Assistant media player entity. This is the traditional announcement path for smart speakers.

### Announcement Channel (PWA streaming)

The `announcement` channel streams TTS audio directly to connected PWA clients via WebSocket. The `TTSClient.stream_audio()` method opens a streaming connection to the TTS service. PCM chunks are broadcast to all connected WebSocket clients as binary frames, and the frontend plays them in real-time using the Web Audio API.

This channel also supports file mode, where a pre-rendered audio URL is sent to the frontend for playback via the HTML5 Audio API.

**Configuration in Cognitive Companion:**

```yaml
tts:
  url: "${TTS_API_URL}"
  default_model: svara
  default_voice: speaker_0
  default_speed: 0.85
  default_language: ta
  default_style: clear
```

## Wyoming / Home Assistant

The service integrates with Home Assistant's voice pipeline via a [wyoming_openai](https://github.com/roryeckel/wyoming_openai) sidecar that bridges the OpenAI-compatible API to the Wyoming protocol:

```
Home Assistant (Wyoming) <-> wyoming-openai (:10300) <-> tts-service (:8200)
```

Start with `docker compose --profile wyoming up -d`, then add the Wyoming integration in Home Assistant (host IP, port 10300).
