# E-Ink Display Pipeline

Cognitive Companion renders notification images for color e-ink displays (800x480, targeting Seeed reTerminal). Each device gets its own active image, and ESPHome-based devices poll a static URL to fetch their current display.

## Overview

The e-ink system consists of:

1. **Image Templates**: background images with configurable text regions (bounding boxes)
2. **Renderer**: PIL-based engine that renders text into template regions
3. **Per-device state**: each display device has its own active image with expiry
4. **Pipeline integration**: notification steps can target specific displays

## Templates

Templates define where text can be placed on a background image. Each template has:

- A **background image** (typically 800x480 PNG for reTerminal displays)
- One or more **text regions** defined as bounding boxes
- **Font configuration** with size range for auto-fitting

### Region Properties

Each region in a template specifies:

| Property | Description |
|----------|-------------|
| `name` | Region identifier (e.g., "title", "body", "footer") |
| `x`, `y` | Top-left corner position in pixels |
| `width`, `height` | Region dimensions in pixels |
| `font_size_max` | Maximum font size for text rendering |
| `font_size_min` | Minimum font size (text truncates if it still doesn't fit) |
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

```
POST /api/v1/image/preview
```

This returns a PNG image directly for inspection before committing to a device.

## Per-Device Image Serving

Each e-ink display device is identified by its `sensor_id` (derived from the device key during authentication). Devices poll for their active image:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/image/active` | Serve the active image for the authenticated device |
| `GET` | `/image/active/{sensor_id}` | Serve the active image for a specific sensor (admin) |

### Fallback Behavior

When a device polls for its image:

1. If an active image exists and hasn't expired → serve it
2. If the active image has expired → fall back to the default template
3. If no active image exists → fall back to the default template

### Image Expiry

Active images have an `expires_at` timestamp. When a notification image expires, the device automatically reverts to its default display. Expiry duration is configured per alert level in `notifications.yaml` (default: 30 minutes).

## Pipeline Integration

The `notification` pipeline step supports e-ink targeting via the `eink_targets` config field:

```json
{
  "alert_level": "warning",
  "channels": ["websocket", "telegram", "eink"],
  "eink_targets": ["hallway_display", "kitchen_display"]
}
```

When `eink` is included in the notification channels, the `NotificationDispatcher`:

1. Formats the notification text
2. Calls `EInkRenderer.render()` with the text, template, and target sensor IDs
3. Each target device's `ActiveImageState` is updated
4. Devices pick up the new image on their next poll

If `eink_targets` is omitted, all registered e-ink sensors are targeted.

## API Reference

### Templates

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/image/templates` | List all templates |
| `POST` | `/image/templates` | Create a template (multipart: image + metadata) |
| `PUT` | `/image/templates/{id}` | Update regions or metadata |
| `DELETE` | `/image/templates/{id}` | Remove a template |

### Rendering

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/image/render` | Render text onto a template for target devices |
| `POST` | `/image/preview` | Preview a render without saving (returns PNG) |
| `POST` | `/image/reset` | Reset a device's display to the default template |

## Adding a New E-Ink Device

1. Add a device key in `config/auth.yaml` with `image:read` permission and a `sensor_id`:
   ```yaml
   device_keys:
     EINK0002:
       sensor_id: bedroom_display
       device_type: reterminal
   ```
2. Create a sensor with `sensor_type: "eink"` via the admin UI or API
3. The device will be automatically included when `eink_targets` is omitted in notification steps
