# API Reference

All endpoints are under `/api/v1/` and require authentication unless otherwise noted. Authentication is resolved from `X-API-Key` header, `?api_key` query parameter, or `device_key` in the JSON body.

## Rooms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rooms` | List all rooms |
| `POST` | `/rooms` | Create a room |
| `PUT` | `/rooms/{id}` | Update a room |
| `DELETE` | `/rooms/{id}` | Delete a room |

Rooms represent physical spaces in the household (kitchen, bedroom, hallway). Each sensor and rule context filter references a room.

## Sensors

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sensors` | List sensors (filter by `room_id`, `sensor_type`, `source`) |
| `POST` | `/sensors` | Register a sensor |
| `PUT` | `/sensors/{id}` | Update a sensor |
| `DELETE` | `/sensors/{id}` | Delete a sensor |

### Sensor Types

| Type | Description |
|------|-------------|
| `camera` | Video camera (reCamera or IP camera) |
| `presence` | PIR/mmWave occupancy sensor (via Home Assistant) |
| `button` | Physical button (reTerminal) |
| `light` | Illuminance sensor (via Home Assistant) |
| `eink` | E-ink display device |

## Rules

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rules` | List all rules |
| `POST` | `/rules` | Create a rule |
| `GET` | `/rules/{id}` | Get a rule with pipeline steps, contexts, and dependencies |
| `PUT` | `/rules/{id}` | Update a rule |
| `DELETE` | `/rules/{id}` | Delete a rule and its pipeline steps |
| `POST` | `/rules/{id}/execute` | Manually trigger a rule's pipeline (returns execution ID) |

### Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Rule name |
| `description` | string | Human-readable description |
| `enabled` | boolean | Whether the rule is active |
| `trigger_type` | string | `sensor_event`, `cron`, `manual`, or `webhook` |
| `primary_sensor_id` | string | Sensor that triggers this rule |
| `schedule_cron` | string | Cron expression (for `cron` trigger type) |
| `cool_off_minutes` | integer | Minimum minutes between triggers |
| `max_daily_triggers` | integer | Maximum triggers per day |
| `webhook_config` | object | Webhook settings: `{secret, created_at}` (for `webhook` trigger type) |

### Pipeline Steps

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rules/{id}/steps` | List pipeline steps for a rule (ordered) |
| `POST` | `/rules/{id}/steps` | Add a step (auto-assigned to end of sequence) |
| `PUT` | `/rules/{id}/steps/{step_id}` | Update a step's type, config, label, or enabled flag |
| `DELETE` | `/rules/{id}/steps/{step_id}` | Remove a step (remaining steps re-ordered) |
| `PUT` | `/rules/{id}/steps/reorder` | Bulk reorder steps: `[{id, order}, ...]` |

### Pipeline Step Fields

| Field | Type | Description |
|-------|------|-------------|
| `step_type` | string | One of the 10 step types |
| `label` | string | Display label |
| `config_json` | object | Step-type-specific configuration |
| `enabled` | boolean | Whether the step is active |
| `order` | integer | Execution order within the pipeline |
| `next_step_on_true` | integer | Step ID to jump to when condition is true |
| `next_step_on_false` | integer | Step ID to jump to when condition is false |

### Contexts and Dependencies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rules/{id}/contexts` | List context filters |
| `POST` | `/rules/{id}/contexts` | Add a context filter |
| `DELETE` | `/rules/{id}/contexts/{ctx_id}` | Remove a context filter |
| `GET` | `/rules/{id}/dependencies` | List rule dependencies |
| `POST` | `/rules/{id}/dependencies` | Add a dependency on another rule |
| `DELETE` | `/rules/{id}/dependencies/{dep_id}` | Remove a dependency |

### Context Filter Types

| Type | Description |
|------|-------------|
| `room` | Rule only fires for events from specified rooms |
| `time_range` | Rule only fires within a time window (e.g., 08:00-22:00) |
| `day_of_week` | Rule only fires on specified days |
| `person_presence` | Rule requires specified persons to be present (or absent) |
| `person_activity` | Rule requires a recent activity (or absence thereof) for a person |

## Workflows

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workflows` | List workflow executions (filter by `rule_id`, `status`, `limit`) |
| `GET` | `/workflows/{id}` | Get execution detail with full pipeline data |
| `POST` | `/workflows/{id}/cancel` | Cancel a running or waiting execution |

### Workflow Statuses

| Status | Description |
|--------|-------------|
| `running` | Pipeline is actively executing |
| `waiting` | Paused at a wait step, will resume at `resume_at` |
| `completed` | All steps finished successfully |
| `failed` | A step failed and pipeline halted |
| `cancelled` | Manually cancelled |

## Pipeline Metadata

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pipeline/step-types` | List all registered step types with metadata and config schemas |
| `GET` | `/pipeline/channel-types` | List all registered notification channel types |
| `GET` | `/pipeline/filter-types` | List all registered context filter types |

These endpoints return metadata from the plugin registries (StepRegistry, ChannelRegistry, FilterRegistry). The frontend uses `/pipeline/step-types` to dynamically populate the step palette and config editor.

## Webhooks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/{rule_id}` | Trigger a rule's pipeline via webhook |
| `POST` | `/webhooks/{rule_id}/generate-secret` | Generate or regenerate a webhook secret for a rule |

Webhook requests require an `X-Webhook-Secret` header matching the rule's configured secret (validated via HMAC constant-time comparison). The JSON request body becomes `pipeline_data["trigger_input"]` in the triggered pipeline.

## Activities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/activities` | List detected person activities (filter by `person_id`, `activity_type`, `room_name`) |

## Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/alerts` | List alerts (filter by `resolved`, `room_name`, `alert_type`) |
| `GET` | `/alerts/{id}` | Get a single alert |
| `POST` | `/alerts/{id}/action` | Dismiss or request assistance for an alert |

### Alert Actions

| Action | Description |
|--------|-------------|
| `dismiss` | Mark the alert as resolved |
| `assist` | Request assistance (escalates the alert) |

## Events

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/events` | List event logs (filter by `rule_name`, `status`, `limit`) |

Event logs contain the full `pipeline_data_json` from each rule execution, providing a complete audit trail.

## Persons

### Member Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/persons` | List all household members (includes enrollment status) |
| `POST` | `/persons` | Register a new member |
| `GET` | `/persons/{id}` | Get member details |
| `PATCH` | `/persons/{id}` | Update a member |
| `DELETE` | `/persons/{id}` | Remove a member and their data |

### Face Enrollment

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/persons/enrolled` | List face enrollment status from person-ID service |
| `POST` | `/persons/{id}/enroll` | Upload reference photos to enroll a face (multipart) |
| `GET` | `/persons/{id}/enrollment` | Get enrollment details (embedding count, created date) |
| `DELETE` | `/persons/{id}/enrollment` | Remove face enrollment data |

The enrollment endpoints proxy requests to the [person-identification-service](https://github.com/SilverMind-Project/person-identification-service). Upload 5-10 reference photos per person through the admin UI (**Members & Enrollment** page) or via the API.

### Location Tracking

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/persons/locations` | Current location of all tracked members |
| `GET` | `/persons/{id}/location` | Current location of a specific member |
| `GET` | `/persons/{id}/history` | Location timeline (`?hours=24`) |
| `GET` | `/persons/{id}/sightings` | Recent camera sightings (`?limit=20`) |

## Device Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/device/recamera` | Upload image from reCamera (device key auth) |
| `POST` | `/device/reterminal` | reTerminal button/command endpoint |

Device endpoints accept authentication via `device_key` in the JSON body.

## Image (E-Ink Display)

### Active Image

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/image/active` | Active image for the authenticated device |
| `GET` | `/image/active/{sensor_id}` | Active image for a specific sensor (admin) |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/image/templates` | List all templates |
| `POST` | `/image/templates` | Create a template (multipart upload) |
| `PUT` | `/image/templates/{id}` | Update regions or metadata |
| `DELETE` | `/image/templates/{id}` | Remove a template |

### Rendering

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/image/render` | Render text onto a template for target devices |
| `POST` | `/image/preview` | Preview a render without saving (returns PNG) |
| `POST` | `/image/reset` | Reset a device's display to default template |

## Occupancy

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/occupancy` | Room occupancy from presence sensors |

## MCP Tools

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/mcp/tools` | List available MCP tools with schemas |
| `POST` | `/mcp/tools/{name}` | Execute an MCP tool |

See [MCP Integration](/features/mcp-integration) for the full tool reference.

## Home Assistant Sync

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ha/sync/rooms` | Import rooms (areas) from Home Assistant |
| `POST` | `/ha/sync/sensors` | Import sensors from Home Assistant areas |

## Other Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth required) |
| `WS` | `/ws` | WebSocket for audio streaming and notifications |
| `GET` | `/admin/config` | Inspect active configuration |

## Authentication

### Request Authentication

Keys are resolved in priority order:

1. `X-API-Key` HTTP header
2. `?api_key` query parameter
3. `device_key` field in JSON request body

### Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full access to all endpoints |
| `caregiver` | Read access + alert actions |
| `mcp_readonly` | Read access + MCP tools + rule triggering |

### Permission Patterns

Permissions use `fnmatch` syntax matching against `METHOD /path`:

```yaml
caregiver:
  - "GET /api/v1/*"
  - "POST /api/v1/alerts/*/action"
```

## Error Responses

All errors follow a consistent format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

| Status Code | Meaning |
|-------------|---------|
| 401 | Authentication required or invalid API key |
| 403 | Permission denied for this endpoint |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate resource) |
| 422 | Validation error (invalid request body) |
| 500 | Internal server error |
