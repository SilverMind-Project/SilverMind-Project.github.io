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

1. reCamera captures an image on a trigger (motion, interval, or external signal)
2. Image is POSTed to `/api/v1/device/recamera` with the device key
3. The event aggregator batches the frame with others from the same sensor
4. When a batch is ready, matching rules are evaluated and pipelines execute

**Configuration:**

```yaml
# In config/auth.yaml
device_keys:
  RCAM0001:
    sensor_id: kitchen_camera
    device_type: recamera
  RCAM0002:
    sensor_id: hallway_camera
    device_type: recamera
```

**Placement tips:**

- Mount at doorways to leverage motion direction detection (entering vs. leaving)
- Ensure adequate lighting for face recognition. ArcFace works best with even illumination.
- Consider the field of view. Wider angles capture more context but reduce face resolution.
- For multi-camera setups, assign each camera to a room for location tracking

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
