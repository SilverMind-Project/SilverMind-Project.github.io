# Multi-Channel Notifications

Cognitive Companion routes alerts across five notification channels, with automatic escalation and repeat policies based on alert severity.

## Channels

### WebSocket

Real-time push notifications to connected admin console clients. Every alert, regardless of level, includes a WebSocket notification.

**How it works:** The `ConnectionManager` tracks active WebSocket connections and broadcasts alert payloads. Clients see alerts in the dashboard and can take action (dismiss, request assistance).

### Telegram

Bot-based notifications to caregiver Telegram chats. Supports multiple recipients with different alert level filters.

**Configuration:**
```yaml
channels:
  telegram:
    targets:
      - name: Caregiver
        chat_id: ${TELEGRAM_CAREGIVER_CHAT_ID}
        alert_levels: [emergency, warning]
      - name: Remote Monitor
        chat_id: ${TELEGRAM_REMOTE_CHAT_ID}
        alert_levels: [emergency]
```

**Capabilities:** Text messages with optional annotated images (from `person_identification` steps with `include_annotated_image` enabled).

### E-Ink Display

Rendered notification images for color e-ink displays. Each device gets its own image based on a configurable template with text regions.

See [E-Ink Display Pipeline](/features/eink-display) for full details.

### Text-to-Speech (TTS)

Audio announcements through Home Assistant media players. Uses Azure Neural voices with configurable speed.

**Configuration:**
```yaml
tts:
  voice: en-IN-NeerjaExpressiveNeural
  speed: 0.85
```

**How it works:** The TTS integration sends text to the TTS service endpoint, receives audio, and plays it through HA media player entities.

### Home Assistant Announcements

Leverages HA's `tts.speak` or `media_player.play_media` services to announce notifications through smart speakers, tablets, or other media devices in specific rooms.

## Alert Levels

| Level | Severity | Use Case |
|-------|----------|----------|
| `emergency` | Critical, requires immediate attention | Person hasn't been seen for hours, fall detected |
| `warning` | Important, should be reviewed soon | Unusual behavior, extended bathroom occupancy |
| `info` | Informational, no action needed | Activity summary, system status |
| `reminder` | Gentle prompt for the senior | Lunch time, medication reminder |

## Routing

Alert level → channel routing is configured in `config/notifications.yaml`:

| Level | Default Channels | Escalation |
|-------|-----------------|------------|
| `emergency` | WebSocket, Telegram, eInk, TTS, HA | Every 5 min, 3x repeat |
| `warning` | WebSocket, Telegram, eInk | Every 10 min |
| `info` | WebSocket only | None |
| `reminder` | WebSocket, TTS, eInk | None |

## Escalation

For critical alerts, the system automatically re-sends notifications if they aren't acknowledged:

```yaml
alert_levels:
  emergency:
    channels: [websocket, telegram, eink, tts, ha]
    escalation:
      interval_minutes: 5
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
    "channels": ["websocket", "telegram", "eink"],
    "eink_targets": ["hallway_display"]
  }
}
```

The notification step reads the message from upstream pipeline data (typically from `logic_reasoning` or `translation` steps) and routes it through the `NotificationDispatcher`.

### Channel Override

By default, a notification step uses the channel list from `notifications.yaml` for the given alert level. The `channels` config field overrides this, allowing per-rule customization.

### Alert Management

Alerts are persisted in the database and can be managed via the admin console or API:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/alerts` | List alerts (filter by `resolved`, `room_name`, `alert_type`) |
| `GET` | `/alerts/{id}` | Get a single alert |
| `POST` | `/alerts/{id}/action` | Dismiss or request assistance |
