# Multi-Channel Notifications

Cognitive Companion routes alerts across notification channels via a plugin system, with escalation and repeat policies driven by alert severity. Each channel is a self-contained plugin in `backend/channels/builtin/` and is auto-discovered at startup via `ChannelRegistry`. Built-in channels currently include `websocket`, `telegram`, `eink`, `tts`, `realtime_voice`, `homeassistant`, and `webhook`. See [Extending the Pipeline](/development/extending-pipeline#adding-a-notification-channel) for how to add custom channels.

## Channels

### WebSocket

Real-time push notifications to connected admin console clients. Every alert, regardless of level, includes a WebSocket notification.

**How it works:** The `ConnectionManager` tracks active WebSocket connections and broadcasts alert payloads. Clients see alerts in the dashboard and can take action (dismiss, request assistance).

### Telegram

Bot-based notifications to caregiver Telegram chats via the standard Bot API. Supports multiple recipients with different alert level filters.

**Configuration:**

```yaml
telegram:
  bot_token: "${TELEGRAM_BOT_TOKEN}"
  max_image_side: 1920
  targets:
    - name: Caregiver
      chat_id: ${TELEGRAM_CAREGIVER_CHAT_ID}
      alert_levels: [emergency, warning, info]
    - name: OpenClaw Agent
      chat_id: ${TELEGRAM_OPENCLAW_CHAT_ID}
      alert_levels: [emergency, warning]
```

**Capabilities:** HTML-formatted text messages. If an image is provided, the channel internally fetches the image from MinIO, optionally downscales it, and sends it as a photo enclosure.

### Outbound Webhook

Dispatches an HTTP `POST` request to an external system such as Home Assistant automations, n8n, or a custom webhook receiver.

**Configuration:**

```yaml
webhook:
  url: "${WEBHOOK_DEFAULT_URL}"
  timeout_seconds: 10
  headers:
    Authorization: "Bearer ${WEBHOOK_AUTH_TOKEN}"
```

**Payload behavior:**

- If the `notification` step's `webhook_template` renders valid JSON, that JSON is sent as the request body.
- Otherwise the channel sends a fallback JSON object with `message`, `alert_level`, `room`, and `image_url`.
- A step-level `webhook_url` overrides the default `webhook.url` value from `notifications.yaml`.

## Message Templates

When a `notification` pipeline step broadcasts an alert, you can customize the formatting natively across all outputs. You define a base `message_template` parameter using Python template syntax mapping to `pipeline_data` (`{message} in {room} at {vision_response}`).

Channel-level template overrides optionally specialize formatting for that specific medium:

- `telegram_template`: Ideal for including safe HTML wrappers.
- `eink_template`: Ideal for reducing text footprint for the smaller e-ink display size.
- `tts_template`: Enhances readability with a more natural conversational flow for the spoken text-to-speech announcement.
- `webhook_template`: Lets you shape the outbound webhook JSON body directly.

Individual template overrides smoothly fall back to the generic `message_template` when omitted.

### E-Ink Display

Rendered notification images for color e-ink displays. Each device gets its own image based on a configurable template with text regions.

See [E-Ink Display Pipeline](/features/eink-display) for full details.

### Text-to-Speech (TTS)

Audio announcements played through Home Assistant media players. The [TTS service](https://github.com/SilverMind-Project/tts-service) provides multi-engine speech synthesis with an OpenAI-compatible API.

**Configuration (`config/settings.yaml`):**

```yaml
tts:
  url: "${TTS_API_URL}"
  default_model: svara
  default_voice: speaker_0
  default_speed: 0.85
```

**How it works:**

1. The `TTSChannel` calls `TTSClient.generate_and_upload()` to synthesize MP3 audio and upload it to MinIO.
2. The resulting presigned URL is passed to `HomeAssistantClient.play_audio()`, which calls `media_player.play_media` on the target entity.
3. The target media player is set per-rule via the `ha_media_player` field in the notification step's config. If not set, it falls back to `media_player.living_room_speaker`.

**Selecting the media player in the pipeline builder:**

When `tts` is included in a notification step's channel list, the pipeline step config dialog shows a **TTS Media Player** autocomplete populated from `GET /api/v1/ha/media-players` (all `media_player.*` entities in HA). Select the device for this rule, or type an entity ID directly.

```json
{
  "step_type": "notification",
  "config_json": {
    "alert_level": "reminder",
    "channels": ["tts"],
    "ha_media_player": "media_player.kitchen_display"
  }
}
```

**Fallback behavior:** If MinIO or Home Assistant is not configured, the channel generates audio locally and returns `True` without playback. If the TTS service is not configured, the channel logs a warning and returns `False`.

### Realtime Voice (`realtime_voice`)

Interactive voice check-ins via Google Gemini Live. Unlike TTS, which is a one-way announcement, this channel initiates a two-way conversation where the AI asks the person a question and waits for a spoken response.

**How it works:** The channel queues a prompt on the WebSocket backend task queue. When an active Gemini Live session picks it up, the AI speaks the prompt and processes the person's reply. Any response is logged against the originating alert.

**Transcript delineation:** Orchestrator-initiated prompts are tagged as internal turns and are **not** shown in the senior's conversation transcript. The senior only sees the agent's spoken response, keeping the UI clean. Three actors are tracked in the conversation log:

| Actor | Source tag | Visible in transcript? |
| --------------- | --------------- | -------------------------------- |
| Senior (user) | `user` | Yes, right-aligned bubble |
| Gemini agent | `assistant` | Yes, left-aligned bubble |
| Orchestrator | `orchestrator` | No, internal only |

**Use cases:**

- Occupancy safety alerts: *"You've been in the bathroom a while, do you need any help?"*
- Medication reminders: *"It's time for your afternoon medication, have you taken it yet?"*

**Configuration:** `realtime_voice` is included in the default `warning` routing in `notifications.yaml`. You can also add or remove it per rule through the `notification` step's `channels` field.

> **Note:** This channel requires an active Gemini Live WebSocket connection (i.e., the companion UI must be open). If no session is active, the message is silently dropped. Pair it with `websocket` or `telegram` to ensure delivery when the voice UI is not in use.

### Home Assistant Announcements

Leverages HA services to announce notifications through smart speakers, tablets, or other media devices in specific rooms. In channel lists and rule overrides, this channel is named `homeassistant`.

## Alert Levels

| Level | Severity | Use Case |
| ------- | ---------- | ---------- |
| `emergency` | Critical, requires immediate attention | Person hasn't been seen for hours, fall detected |
| `warning` | Important, should be reviewed soon | Unusual behavior, extended bathroom occupancy |
| `info` | Informational, no action needed | Activity summary, system status |
| `reminder` | Gentle prompt for the senior | Lunch time, medication reminder |

## Routing

Alert level to channel routing is configured in `config/notifications.yaml`:

| Level | Default Channels | Escalation |
| ------- | ----------------- | ---------- |
| `emergency` | WebSocket, Telegram, eInk, TTS, Home Assistant | Every 5 min, 3x repeat |
| `warning` | WebSocket, Telegram, eInk, Realtime Voice | Every 10 min |
| `info` | WebSocket only | None |
| `reminder` | WebSocket, TTS, eInk | None |

The outbound `webhook` channel is available but not enabled in the default level mappings. Add it to `notification_defaults.<level>.channels` or opt into it on a per-rule basis.

## Escalation

For critical alerts, the system automatically re-sends notifications if they are not acknowledged:

```yaml
notification_defaults:
  emergency:
    channels: [websocket, telegram, eink, tts, homeassistant]
    escalation_minutes: 5
    repeat_count: 3
```

This means an unacknowledged emergency alert will be re-sent 3 times at 5-minute intervals before the escalation stops.

## Pipeline Integration

Notifications are triggered by `notification` pipeline steps:

```json
{
  "step_type": "notification",
  "config_json": {
    "alert_level": "warning",
    "channels": ["websocket", "telegram", "webhook"],
    "webhook_url": "https://example.internal/hooks/cognitive-companion",
    "webhook_template": "{\"message\": \"{message}\", \"room\": \"{room}\", \"severity\": \"warning\"}"
  }
}
```

The notification step reads the message from upstream pipeline data (typically from `logic_reasoning` or `translation` steps) and routes it through the `NotificationDispatcher`.

### Channel Override

By default, a notification step uses the channel list from `notifications.yaml` for the given alert level. The `channels` config field overrides this, allowing per-rule customization. When `channels` is specified in the step config, it **completely replaces** the default channel list for that dispatch; the defaults are not merged.

### Cool-Off Triggering

The `notification` step also exposes `trigger_cooloff`, which defaults to `true`. When enabled, a successful notification marks the workflow's event log as `completed`, causing the rule's `cool_off_minutes` window to apply. Disable it for informational fan-out paths that should not suppress the next trigger.

### Alert Management

Alerts are persisted in the database and can be managed via the admin console or API:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/alerts` | List alerts (filter by `resolved`, `room_name`, `alert_type`) |
| `GET` | `/alerts/{id}` | Get a single alert |
| `POST` | `/alerts/{id}/action` | Dismiss or request assistance |
