# Person Identification and Tracking

Cognitive Companion uses GPU-accelerated face recognition to identify household members across camera feeds, then fuses those detections with Home Assistant presence sensors for whole-house location tracking.

## Face Recognition

The person identification system runs as a [companion microservice](https://github.com/SilverMind-Project/person-identification-service) using InsightFace (buffalo_l model pack) with ArcFace 512-dimensional embeddings.

### Enrollment

Upload 5-10 reference photos per person through the admin UI (**Members & Enrollment** page) or via the API. No model fine-tuning is needed because ArcFace generalizes from pretrained weights.

**Enrolling from the Admin UI:**

1. Go to **Members & Enrollment** in the admin console
2. Click the face-recognition icon next to a member
3. Upload reference photos (drag-and-drop or file picker)
4. The backend proxies the images to the person-ID service, which extracts face embeddings

**Best practices for reference photos:**

- Use photos with varied lighting conditions
- Include different angles (frontal, 3/4 profile)
- Ensure the face is clearly visible and unobstructed
- Avoid group photos; use one person per reference image
- Photos from deployment cameras give the best domain match

### Identification Pipeline

The v2 backend sends batched frames to the person-ID service:

1. Camera uploads a frame via `POST /api/v1/device/recamera`
2. The event aggregator batches frames (configurable size/window)
3. When a `person_identification` pipeline step executes, it sends the batch to `POST /api/v1/identify-batch`
4. The service returns per-frame face detections with:
   - **Identity**: matched person name or "unknown"
   - **Confidence**: similarity score (0.0 to 1.0)
   - **Bounding box**: face location in the frame [x1, y1, x2, y2]

### Annotated Images

When `include_annotated_image` is enabled in a pipeline step's config, the person-ID service returns a copy of each frame with bounding boxes and name labels drawn over detected faces. These annotated images are:

- Stored in `pipeline_data` under the `annotated_images` key
- Available for forwarding to downstream notification steps
- Useful for visual confirmation in Telegram and WebSocket alerts

### Confidence Thresholds

The default confidence threshold is configured in `settings.yaml` under `person_id.confidence_threshold`. Detections below this threshold are reported as "unknown". You can override the threshold per-step in the pipeline config.

### Guest Image Saving

When the `save_guest_images` flag is set to `true` on an identification request, the person-ID service saves the **full frame image** to disk whenever unidentified guests are detected. Images are organized by date under `data/guests/`:

```text
data/guests/
├── 2026-03-23/
│   ├── 143022-123456_f0_2guests.jpg
│   └── 143022-234567_f1_1guests.jpg
└── ...
```

This is useful for:

- **Reviewing visitors**: see who has been at the door
- **Building enrollment datasets**: identify frequent visitors and enroll them
- **Auditing false negatives**: check if known members were misclassified as guests

The flag defaults to `false` and can be enabled per-request on both the single (`/identify`) and batch (`/identify-batch`) endpoints.

## Motion Direction Detection

Cross-frame centroid tracking classifies movement direction:

| Direction | Description |
|-----------|-------------|
| `left-to-right` | Moving across the frame from left to right |
| `right-to-left` | Moving across the frame from right to left |
| `towards-camera` | Face/body getting larger (approaching) |
| `away-from-camera` | Face/body getting smaller (leaving) |
| `stationary` | No significant movement between frames |

**Use case:** Door-mounted cameras can infer entering vs. leaving a room based on movement direction relative to camera placement.

## Whole-House Location Tracking

The `PersonTrackingService` maintains a real-time location state for each household member by fusing two data sources:

### Camera Detections

When a person is identified by a camera, their location is updated to the room where that camera is installed. This is the primary, high-confidence location signal.

### Home Assistant Presence Sensors

For rooms without cameras (e.g., bathrooms), HA presence sensors (PIR/mmWave) provide occupancy data. The tracking service correlates presence sensor activations with the most recent camera sighting:

1. A person is last seen by a camera in the hallway
2. The bathroom presence sensor activates
3. The tracking service infers that person is now in the bathroom
4. When the bathroom sensor deactivates and a camera picks them up again, the location updates

### Location State

Each person's current location is stored as a `PersonLocationState` record:

- **Room name**: current room
- **Source**: `camera` or `ha_sensor` (indicates confidence level)
- **Last updated**: timestamp of the most recent detection
- **Stale timeout**: locations older than the configured timeout (default from `person_tracking.stale_timeout_minutes`) are considered stale

### Location History

Every location change creates a `PersonLocationHistory` entry, providing a full timeline of where a person has been throughout the day. Query via `GET /api/v1/persons/{id}/history?hours=24`.

### Home Assistant Propagation

Person locations are pushed to Home Assistant `input_text` helpers:

```text
input_text.cc_{person_id}_location = "kitchen"
```

This allows HA automations and dashboards to display person locations and use them in conditions.

## API Endpoints

### Member Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/persons` | List all household members |
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

### Location Tracking

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/persons/locations` | Current location of all tracked members |
| `GET` | `/persons/{id}/location` | Current location of a specific member |
| `GET` | `/persons/{id}/history` | Location timeline (`?hours=24`) |
| `GET` | `/persons/{id}/sightings` | Recent camera sightings (`?limit=20`) |

## Activity Tracking

The `activity_detection` pipeline step records detected activities for tracked persons:

| Activity Type | Description |
|--------------|-------------|
| `eating` | Person detected eating a meal |
| `sleeping` | Person detected sleeping or resting |
| `medication` | Person detected taking medication |

Activities are recorded as `PersonActivity` records and can be used as context filters in downstream rules. For example, a lunch reminder rule can check whether an `eating` activity was recently recorded before sending a reminder.

Query activities via `GET /api/v1/activities?person_id=...&activity_type=...`.
