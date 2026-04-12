# E-Ink Display Pipeline

Cognitive Companion renders notification images for color e-ink displays (800x480, targeting Seeed reTerminal). Each device gets its own active image, and ESPHome-based devices poll a static URL to fetch their current display.

## Overview

The e-ink system consists of:

1. **Image Templates**: background images with configurable text regions (bounding boxes)
2. **Renderer**: PIL-based engine that renders text into template regions
3. **Per-device state**: each display device has its own active image with expiry and delivery tracking
4. **Pipeline integration**: notification steps can target specific displays

## Templates

Templates define where text can be placed on a background image. Each template has:

- A **background image** (typically 800x480 PNG for reTerminal displays)
- One or more **text regions** defined as bounding boxes
- **Font configuration** with size range for auto-fitting

### Region Properties

Each region in a template specifies:

| Property | Description |
| --- | --- |
| `name` | Region identifier (e.g., "title", "body", "footer") |
| `x`, `y` | Top-left corner position in pixels |
| `width`, `height` | Region dimensions in pixels |
| `font_size_max` | Maximum font size for text rendering |
| `font_size_min` | Minimum font size (text truncates if it still does not fit) |
| `align` | Text alignment: `left`, `center`, or `right` |
| `bg_color` | Background color for the region |
| `text_color` | Text color |

### Template Editor

The admin console provides a visual template editor at `/admin/eink-templates`:

- Upload background images
- Draw text regions with bounding boxes on a canvas overlay
- Configure font sizes, colors, and alignment per region
- Preview renders before saving
- Set a default template for fallback display

## Rendering

The `EInkRenderer` (`backend/integrations/eink_renderer.py`) handles image generation:

1. Resolves the target template (from DB or filesystem)
2. Opens the background image with PIL
3. For each text region, auto-fits text by stepping down font size from max to min
4. Renders text with the configured font, alignment, and colors
5. Saves the final image as a PNG per target device

### Preview

You can preview a render without saving using the preview endpoint:

```http
POST /api/v1/image/preview
```

This returns a PNG image directly for inspection before committing to a device.

## Per-Device Image Serving

Each e-ink display device is identified by its `sensor_id` (derived from the device key during authentication). Devices poll for their active image at `GET /api/v1/image/active`.

### Fallback Behavior

When a device polls for its image:

1. If an active image exists and has not expired: compute its SHA-256 hash and check the refresh window (see below)
2. If the active image has expired: fall back to the default template
3. If no active image file exists: fall back to the default template
4. If neither exists: respond with `404 Not Found`

### Refresh Suppression

E-ink displays perform a full pixel refresh on every image they receive. This is visually disruptive, so the endpoint suppresses redundant refreshes:

- On each poll, the server computes a SHA-256 hash of the image it would serve.
- If the hash matches the hash from the previous delivery **and** fewer than `refresh_window_minutes` minutes have elapsed since that delivery, the endpoint returns `204 No Content`.
- The device driver must treat `204` as a no-op and skip its refresh cycle.
- When content changes, or when the refresh window elapses, the full image is delivered and the delivery record is updated.

Configure the window in `config/settings.yaml`:

```yaml
image:
  refresh_window_minutes: 60   # default; set to 0 to always deliver
```

The delivery record (`last_served_hash`, `last_served_at`) is stored in the `ActiveImageState` row for each device. A new device's first poll always receives the image.

### Image Expiry

Active images have an `expires_at` timestamp. When a notification image expires, the device automatically reverts to its default display. The default expiry duration is set per-rule via `eink_expiry_minutes` in a notification step (default: 30 minutes).

Expiry and refresh suppression are independent: an image that has passed its `expires_at` causes the default template to be served. The default template is subject to the same hash-based suppression as any other image.

## Pipeline Integration

The `notification` pipeline step supports e-ink targeting via the `eink_targets` config field:

```json
{
  "alert_level": "warning",
  "channels": ["pwa_popup_text", "telegram", "eink"],
  "eink_targets": ["hallway_display", "kitchen_display"],
  "eink_template_id": 5,
  "eink_expiry_minutes": 60
}
```

When `eink` is included in the notification channels, the `NotificationDispatcher`:

1. Formats the notification text
2. Resolves the image template (from `eink_template_id` or the fallback default)
3. Calls `EInkRenderer.render()` with the text, template, and target sensor IDs
4. Each target device's `ActiveImageState` is updated with an expiration based on `eink_expiry_minutes`
5. Devices pick up the new image on their next poll; the hash will differ, so a refresh is triggered

If `eink_targets` is omitted, all registered e-ink sensors are targeted.

## API Reference

### Template Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/image/templates` | List all templates |
| `POST` | `/api/v1/image/templates` | Create a template (multipart: image + metadata) |
| `PUT` | `/api/v1/image/templates/{id}` | Update regions or metadata |
| `PUT` | `/api/v1/image/templates/{id}/image` | Replace the background image |
| `DELETE` | `/api/v1/image/templates/{id}` | Remove a template |
| `GET` | `/api/v1/image/templates/{id}/preview` | Serve the raw template image |

### Render Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/image/render` | Render text onto a template for target devices |
| `POST` | `/api/v1/image/preview` | Preview a render without saving (returns PNG) |
| `POST` | `/api/v1/image/preview-form` | Live preview with uploaded image or template overrides |
| `POST` | `/api/v1/image/reset` | Reset a device's display to the default template |

### State Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/image/active` | Serve the active image for the authenticated device |
| `GET` | `/api/v1/image/states` | List active image state for all devices (admin) |
| `GET` | `/api/v1/image/fonts` | List available font files (admin) |

## Adding a New E-Ink Device

1. Add a device key in `config/auth.yaml` with `image:read` permission and a `sensor_id`:

   ```yaml
   device_keys:
     EINK0002:
       sensor_id: bedroom_display
       device_type: reterminal
   ```

2. On next startup, the sensor is auto-upserted with `sensor_type: "eink"` via `_upsert_device_key_sensors()`.

3. The device will be automatically included when `eink_targets` is omitted in notification steps.

4. Point the device firmware at `GET /api/v1/image/active` and send the device key as an `Authorization` header. Handle `204 No Content` responses as a no-op (skip the pixel-refresh cycle).
