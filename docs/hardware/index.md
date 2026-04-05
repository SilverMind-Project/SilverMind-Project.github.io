# Hardware Integration

Cognitive Companion is designed to work with affordable, readily available edge hardware. This page covers the supported devices and how they integrate with the system.

## Supported Devices

### Seeed reCamera

<div style="padding: 1rem; background: var(--vp-c-bg-soft); border-radius: 8px; margin-bottom: 1rem;">

**Type:** Compact Linux camera module
**Purpose:** Image capture and upload
**Interface:** REST API (POST /api/v1/device/recamera)
**Auth:** 8-character device key in JSON body

</div>

The reCamera is a compact Linux-based camera module from Seeed Studio. It captures images and uploads them to the Cognitive Companion backend for processing.

**Integration flow:**

1. reCamera runs its on-device YOLO11 model and produces a JSON payload containing the JPEG image and detection results
2. The payload is POSTed to `/api/v1/device/recamera` with the device key as the `?api_key=` query parameter
3. The backend optionally rotates the image and applies a label filter before uploading to MinIO
4. The event aggregator batches the frame with others from the same sensor
5. When a batch is ready, matching rules are evaluated and pipelines execute

**Payload format:**

The reCamera posts a JSON object with this structure:

```json
{
  "code": 0,
  "data": {
    "image": "<base64-encoded JPEG>",
    "labels": ["person"],
    "boxes": [[x1, y1, x2, y2, score, class_id]],
    "count": 287,
    "perf": [[model_id, preprocess_ms, inference_ms]],
    "resolution": [1280, 720]
  },
  "name": "invoke",
  "type": 1
}
```

`data.labels` lists the object classes detected by the YOLO11 model and can be used to filter which images are forwarded to the pipeline.

**Device key configuration:**

```yaml
# In config/auth.yaml
device_keys:
  - key: "RCAM0001"
    name: "Kitchen reCamera"
    device_type: recamera
    sensor_id: recamera_kitchen
    permissions:
      - "device:recamera"
```

**Per-camera options:**

Configure per-camera behaviour in `config/settings.yaml` under the `cameras` key, using the `sensor_id` as the key:

```yaml
cameras:
  recamera_kitchen:
    rotate: 90           # clockwise rotation before storage (90, 180, 270)
    label_filter:
      labels: ["person"] # labels to match against payload.data.labels
      mode: "any"        # "any": at least one match; "all": every label must match
```

| Option | Description |
| ------ | ----------- |
| `rotate` | Rotates the JPEG clockwise before uploading to MinIO. Useful for cameras mounted at non-standard angles. Accepted values: `90`, `180`, `270`. Omit to skip rotation. |
| `label_filter.labels` | List of YOLO11 label strings. Images are only forwarded when the detected labels satisfy the filter. |
| `label_filter.mode` | `"any"` (default): pass if at least one label matches. `"all"`: pass only when every configured label is detected. |

When a label filter is configured and the image does not match, the endpoint returns `{"status": "filtered", "reason": "label_filter"}` and the image is not saved or forwarded to the pipeline.

**Placement tips:**

- Mount at doorways to leverage motion direction detection (entering vs. leaving)
- Ensure adequate lighting for face recognition. ArcFace works best with even illumination.
- Consider the field of view. Wider angles capture more context but reduce face resolution.
- For multi-camera setups, assign each camera to a room for location tracking
- Use `rotate` when the camera must be mounted sideways or upside-down due to physical constraints

### Seeed reTerminal

<div style="padding: 1rem; background: var(--vp-c-bg-soft); border-radius: 8px; margin-bottom: 1rem;">

**Type:** Linux SBC with 5" touchscreen and eInk display
**Purpose:** Notification display and physical button input
**Interfaces:**
- Image polling: GET /api/v1/image/active (device key auth)
- Button input: POST /api/v1/device/reterminal

</div>

The reTerminal is a Linux single-board computer with a built-in color e-ink display. It serves as the household's notification display and physical interaction point.

**E-ink display integration:**

1. The reTerminal polls `GET /api/v1/image/active` at regular intervals
2. The backend identifies the device by its device key and returns its specific active image
3. When a notification is sent to the e-ink channel, the image updates on the next poll
4. Expired images automatically fall back to the default template

**Button integration:**

1. Physical button presses on the reTerminal are sent to `POST /api/v1/device/reterminal`
2. Button events can trigger rules (e.g., "request assistance" button)
3. Button presses can also acknowledge/dismiss active alerts

**Configuration:**

```yaml
# In config/auth.yaml
device_keys:
  RTRM0001:
    sensor_id: hallway_display
    device_type: reterminal
```

### Home Assistant Sensors

<div style="padding: 1rem; background: var(--vp-c-bg-soft); border-radius: 8px; margin-bottom: 1rem;">

**Type:** Various smart home sensors via HA REST API
**Purpose:** Presence detection, light levels, audio playback
**Interface:** Polled via Home Assistant REST API

</div>

The backend polls Home Assistant entities at a configurable interval (default: 30 seconds). Supported sensor types:

#### Presence Sensors (PIR/mmWave)

Binary sensors that detect room occupancy. Used for:

- **Room occupancy tracking**: determine which rooms are occupied
- **Person location inference**: correlate presence sensor data with camera sightings to track people in rooms without cameras (e.g., bathrooms)
- **Bathroom monitoring**: configurable time limit triggers alerts for extended bathroom occupancy

#### Light Sensors

Illuminance sensors used for context-aware rules:

- Available as context data in pipeline steps
- Queryable via the `get_light_level` MCP tool
- Can inform vision analysis prompts (e.g., "analyze this low-light image")

#### Media Players

Smart speakers, tablets, and other audio devices used for:

- **TTS announcements**: speak notification messages aloud
- **Home Assistant announce service**: broadcast to multiple rooms

## Network Requirements

All devices must be on the same local network as the Cognitive Companion backend. There is no cloud relay; communication is direct.

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  reCamera   │────►│              │     │ Home Assistant   │
│  (WiFi)     │     │  Cognitive   │◄───►│ (REST API)      │
└─────────────┘     │  Companion   │     └─────────────────┘
                    │  Backend     │
┌─────────────┐     │  (port 8000) │     ┌─────────────────┐
│ reTerminal  │◄───►│              │     │ MinIO           │
│ (Ethernet)  │     │              │◄───►│ (S3 Storage)    │
└─────────────┘     └──────────────┘     └─────────────────┘
```

**Recommended network setup:**

- Dedicated VLAN or subnet for IoT/camera devices
- Backend server on the same subnet (or with routing configured)
- Home Assistant accessible from the backend via its REST API
- MinIO accessible from the backend for media storage

## Adding New Hardware

The system is designed to accommodate new edge devices. Any device that can make HTTP requests can integrate:

1. **Define a device key** in `config/auth.yaml` with the appropriate sensor ID and type
2. **Create a sensor** in the admin console matching the device
3. **Implement the upload.** POST images to `/api/v1/device/recamera` or a custom endpoint.
4. For display devices, poll `GET /api/v1/image/active` with the device key

For truly custom integrations, you can also create a new router endpoint in `backend/routers/` following the [adding a new API endpoint](/development/extending-pipeline#adding-a-new-api-endpoint) guide.
