# Camera setup and tuning guide

Configure your RTSP cameras for reliable tracking before the system sees its first frame. The choices that matter most are exposure time, stream resolution, and mount angle: each controls a different failure mode in the detection and identity pipeline.

## Prerequisites

- go2rtc and rtsp-ingress running and reachable by the tracking orchestrator
- Admin UI accessible (typically `http://<host>:8080/admin/cts/cameras`)
- Camera added to the Admin UI with its RTSP URL set (main stream for face-producing cameras; substream acceptable only when `face_id_enabled` is off)

## Exposure and shutter

Cap auto-exposure shutter speed at 1/60 s or faster for indoor use. Motion blur is a harder problem for the detector and ReID model than sensor noise: a slightly grainy image preserves body keypoints and clothing texture; a smeared one loses both.

When a camera exposes for longer than 1/60 s under indoor lighting, two failure modes appear:

| Symptom | Root cause | Effect on tracking |
| --- | --- | --- |
| Blurred limb edges in fast clips | Long shutter captures limb arc, not position | RTMPose keypoint estimate flickers between frames; posture signals become noisy |
| Smeared crop around a moving torso | Motion blur washes out clothing texture | SOLIDER ReID embedding changes frame-to-frame; identity flaps between UNKNOWN and committed |

Prefer increasing sensor gain or camera brightness over extending exposure. Most indoor cameras have an auto-gain-priority mode: set it and verify that the shutter never exceeds 1/60 s in the camera's on-screen OSD or telnet shell.

## Day/night and IR behavior

Cameras that auto-switch between color and infrared-cut (IR-cut) modes introduce an embedding discontinuity each time the transition fires. At dusk and dawn, the IR-cut filter can toggle back and forth repeatedly within a single hour if the camera is pointed at a window.

Configure the camera one of two ways:

- **Pin to color mode** during hours when the resident is typically active (usually 06:00 to 22:00) and allow auto-switch only outside that window.
- **Use a fixed schedule** for the IR-cut transition, not the camera's automatic light-level sensor.

The reason: SOLIDER ReID is trained on color images. A full-body appearance embedding in grayscale (IR mode) is numerically different from the same person's embedding in color, even at the same confidence level. If the IR-cut fires mid-track, the identity resolver sees a sudden embedding shift and may treat it as a different person entering the frame.

**Gallery seeding.** When an operator introduces a resident by walking slowly through each camera's view (seeding the gallery for ArcFace and SOLIDER), do this during color hours. An IR-mode gallery embedding collected at 23:00 will not match that person's color embedding at 08:00.

## Resolution, codec, and substream

### Which stream the system polls

rtsp-ingress registers the RTSP URL you set in Admin UI with go2rtc, then polls JPEG frames via go2rtc's HTTP API (`GET /api/frame.jpeg`). go2rtc owns the RTSP session and decodes video; rtsp-ingress never touches the raw RTSP stream. The URL stored in `cts_cameras.rtsp_url` in the database is exactly what go2rtc connects to.

This means resolution is controlled entirely by which URL you configure in Admin. If you store the main-stream URL (e.g. 2560x1440), every poll decodes a 4K frame. If you store the substream URL (e.g. 1280x720), every poll decodes that.

### Main stream vs. substream

Person detection and face recognition have different resolution requirements:

- **Person detection** letterboxes every frame to a 640x640 canvas (`DETECTOR_INPUT_SIZE = 640` in `triton-shared/triton_shared/inference/detection.py`). A 1280x720 substream is enough for body bounding boxes, posture, and room occupancy.
- **Face recognition** crops each detected person from the full-resolution ingested frame before sending it to `person-identification-service`. Switching a camera from a 2560x1440 main stream to a 1280x720 substream cuts interocular pixels in half, shrinking usable face recognition range from roughly 2.7 m to 1.3 m on a 103 degree lens.

Use the **main stream** (2560x1440 or higher) on every camera with `face_id_enabled: true`. Reserve the 1280x720 substream for cameras where `face_id_enabled` is turned off (for example, top-down cameras where faces are never visible).

### Camera profile and placement calculator

Every CTS camera carries a hardware-neutral profile in Admin UI (`Admin > CTS > Cameras`), synced live to the tracking orchestrator:

| Field | Meaning |
| --- | --- |
| `role` | `face_capable` (identification point: uses `face_id.identification_point_cooldown_s`, default `1.0 s`), `mixed` (standard `face_id.cooldown_s`, default `5.0 s`), or `surveillance` (tracking-first, standard cooldown). Role never disables face ID; `face_id_enabled` is the single per-camera switch. |
| `horizontal_fov_deg` | Lens horizontal field of view in degrees (from the spec sheet; multiply diagonal FOV by roughly 0.8 on 16:9 sensors). |
| `mounting_height_m` | Lens height above the floor in meters. |
| `tilt_deg` | Downward tilt angle in degrees (`0` horizontal, `-90` straight down). |
| `ir_capable` | Whether the camera uses infrared illumination at night (grayscale IR degrades face and clothing-color matching). |
| `frame_natural_width`, `frame_natural_height` | Read-only native stream resolution reported back from the orchestrator's first observed frame. |

Open the **Geometry** tab in the camera editor to view the placement calculator (`GET /api/v1/cts/cameras/{camera_id}/optics` and `POST /api/v1/cts/cameras/optics-preview`). Under the pinhole approximation (`focal_px = (width_px / 2) / tan(hfov_deg / 2)` and `iod_px = focal_px * 0.063 / distance_m`), interocular pixel bands are poor (`< 16 px`), marginal (`16 to 24 px`), good (`24 to 40 px`), and excellent (`>= 40 px`):

| Stream width and lens HFOV | Focal length | 1 m | 2 m | 3 m | 4 m | 5 m | Good range (>= 24 px) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2560 px, 55 deg (6 mm on 1/2.8" sensor) | 2459 px | 154.9 px | 77.5 px | 51.6 px | 38.7 px | 31.0 px | 6.45 m |
| 2560 px, 70 deg (4 mm on 1/2.8" sensor) | 1828 px | 115.2 px | 57.6 px | 38.4 px | 28.8 px | 23.0 px | 4.80 m |
| 2560 px, 90 deg (standard wide) | 1280 px | 80.6 px | 40.3 px | 26.9 px | 20.2 px | 16.1 px | 3.36 m |
| 2560 px, 103 deg (room corner wide) | 1018 px | 64.1 px | 32.1 px | 21.4 px | 16.0 px | 12.8 px | 2.67 m |
| 2560 px, 110 deg (ultra-wide) | 896 px | 56.5 px | 28.2 px | 18.8 px | 14.1 px | 11.3 px | 2.35 m |
| 1280 px, 103 deg (720p substream) | 509 px | 32.1 px | 16.0 px | 10.7 px | 8.0 px | 6.4 px | 1.34 m |

### Codec preference: H.264 over H.265

Where the camera offers a choice, prefer H.264. go2rtc runs on the same host as the tracking orchestrator or on the Jetson (for the Jetson deployment shape). H.264 decoding is cheaper in software and supported by hardware decoders on a wider range of SoCs. H.265 stream at the same bitrate provides no accuracy benefit downstream, since the detector never sees the compressed stream.

## Placement

### Mount height and angle

Mount cameras at 2.2 to 2.6 meters above the floor, angled 15 to 30 degrees downward. At this height:

- The full torso of an adult at 1 to 4 meters from the camera occupies enough pixels for a reliable ReID crop.
- The top of the head is visible, which matters for the floor-plane homography (you need the contact point, not the head centroid, for the floor projection).
- Extreme downward angles (more than 40 degrees) foreshorten the body and degrade keypoint localization.

### Identification-point placement

Wide-angle ceiling cameras cover a whole room, so faces beyond 2 m often fall under 20 interocular pixels. Adding one or two dedicated identification-point cameras (`role: face_capable`, `face_id_enabled: true`) at chokepoints produces 40 to 80 interocular pixels on passing faces:

- **Location:** aim along a daily walking path toward the lens, such as the end of a hallway, a kitchen entrance, or facing a favorite chair.
- **Mount height and pitch:** mount at 1.5 to 1.8 m above the floor with near-level tilt (`0` to `-10` degrees) so faces arrive frontal and low-pitch.
- **Lens and stream:** pick any RTSP H.264 camera with a 4 to 6 mm lens on a 1/2.8 inch sensor (roughly 55 to 75 degrees horizontal FOV) or an 8 MP sensor configured on its main stream at 2560x1440 or higher. Cap auto-exposure shutter at 1/60 s or faster so walking faces stay sharp.
- **Floor calibration and shared views:** calibrate the camera's floor homography and register it in an overlap group with any room camera that shares its view. Without a homography, CTS logs `identification_camera_uncalibrated` and faces land on isolated camera-local tracks.

### Cover doorways and transit lines

Place cameras to capture people as they cross room boundaries, not as they sit in a chair. The topology learner records transit times between cameras at each handoff. Doorway coverage is the data source for that learning: a camera pointed at a couch records presence, not movement direction.

### Window and backlight

Avoid pointing cameras directly at windows unless the camera has wide dynamic range (WDR) enabled. A window in the background compresses the foreground histogram and produces silhouettes with no usable texture. Enable WDR if available, or angle the camera 45 degrees away from the window axis.

### Cameras that share a view

When two cameras see the same floor area (e.g. two angles of the same doorway), declare them as a shared view in Admin UI (Admin > CTS > Shared Views). The system uses shared views to merge simultaneous detections from different angles into one PersonHypothesis instead of spawning two, which matters most when at least one of the cameras is not calibrated.

Cameras along a walking route that do not share a view (e.g. hallway camera and bedroom camera) need no configuration. See [Camera Calibration](/features/continuous-tracking/camera-calibration) for shared views and learned camera handoffs, and for what makes homography calibration accurate: floor texture, six or more reference points spread across the camera frame, and a clean shot without people in frame.

## Frame cadence and motion gate

rtsp-ingress polls each camera at the rate set by `frame_interval_ms` and evaluates a motion gate before uploading to MinIO. The settings below control this behavior, with their defaults documented in `rtsp-ingress/config/settings.yaml` and the [Jetson CTS deployment settings table](/hardware/jetson-cts#understand-the-incoming-workload):

| Setting | What it does |
| --- | --- |
| `frame_interval_ms` | How often (in ms) the worker polls go2rtc for a new JPEG. Lower values increase detector load; higher values reduce temporal resolution for fast motion. |
| `capture_latency_ms` | Per-camera capture-to-fetch latency offset (ms, default 0) subtracted from the HTTP fetch start time when stamping `capture_time_unix_ns`. |
| `motion_mode` | `cells` (default) divides the 320x180 grayscale thumbnail into a 16x9 grid of 20x20 px cells so a person walking several metres away triggers motion even when the whole-frame average barely changes; `frame_mean` compares only the whole-frame mean. |
| `motion_cell_threshold` | Fractional per-cell mean difference (default `0.04`) against either the previous polled frame or the last published frame required for a cell to count as active. |
| `motion_min_cells` | Number of active cells (default `1`) required to trigger motion in `cells` mode. Raise this for a camera that sees a television or moving curtain. |
| `motion_hold_s` | Seconds (default `3.0`) to keep publishing polled frames after motion is detected, so a person walking across a room produces a continuous track instead of isolated keyframes. |
| `motion_threshold` | Fractional whole-frame mean pixel difference (default `0.02`) that also triggers motion in both modes (for example, when room lighting changes). |
| `static_sample_interval_s` | Forces a frame through even when the motion gate reports no change, as long as this many seconds have elapsed since the last published frame. This captures still presence (seated, sleeping) for downstream analysis. Set to 0 to disable. |

Per-camera overrides are not exposed in the Admin UI today; the defaults from `rtsp-ingress/config/settings.yaml` apply to all cameras. Adjust them carefully: lowering `frame_interval_ms` on all cameras raises worst-case detector throughput demand proportionally.

### Reading the "No frames" badge

On the **Tracking Cameras** page (`/admin/cts/cameras`), an enabled camera displays a **No frames** badge next to its status when its last published frame is older than 60 seconds (`health.last_frame_age_s > 60`). Because `static_sample_interval_s` defaults to 5 seconds, a healthy enabled camera publishes at least one frame every 5 seconds even in an empty room. A **No frames** badge therefore means `rtsp-ingress` is not receiving valid frames from `go2rtc` (and is backing off by `health.fetch_backoff_s` between retries). Check the camera's power, Wi-Fi/Ethernet link, and RTSP URL using the **Test RTSP** button.

## Time synchronization

Run NTP on every camera and on every host running rtsp-ingress. Two timing values matter in the pipeline:

1. **Frame timestamp.** The ingress worker records the host wall clock (`time.Now()` in Go) immediately before requesting the JPEG from go2rtc, subtracts `capture_latency_ms`, and writes the result to `capture_time_unix_ns` in the `FrameReady` protobuf (while `received_time_unix_ns` records the post-decode instant). If the ingress host clock is off, displayed frame times in the Admin UI will be off by the same amount.

2. **Cross-camera transit time.** When a PersonHypothesis closes on one camera and a revival candidate appears on another, the tracker computes `elapsed_s = now - closed_at` using the orchestrator's wall clock. For this estimate to be accurate, the orchestrator host must have a correct clock. Camera clocks do not directly feed into this computation, but a camera with a drifted clock can produce RTSP stream PTS values that cause go2rtc to delay or reorder frame delivery, which may shift the effective ingest time.

**How to spot clock skew.** In the Admin UI person inspector, check whether doorway crossings between two cameras show transit times that are implausibly long or short (under half a second or over a minute for adjacent rooms). One-sided misses (camera A never successfully hands off to camera B but the reverse works) are more often a clock or topology misconfiguration than an appearance problem.

## Privacy zones

The system supports two kinds of privacy zones, and they behave differently:

| Type | Where enforced | Auditable | Effect |
| --- | --- | --- | --- |
| Camera-side mask | In camera firmware, before encoding | No | The system never receives pixels from that area. Cannot be verified by the orchestrator. |
| System-side privacy zone | In the pipeline's PrivacyStage, per frame | Yes | Detections whose center falls inside the zone are dropped before any model sees the crop. Logged and attributable. |

Prefer system-side zones for areas that need an auditable privacy boundary (bathrooms, bedroom corners, common-area screens). Camera-side masks are useful for blocking a neighbor's window from the raw video feed, but they give the operator no confirmation that the zone is active or correctly positioned.

Configure system-side zones in Admin UI (Admin > CTS > Cameras > Privacy Zones). Zones are stored as polygons in normalized image coordinates and enforced in the pipeline before ReID or face processing.

## 10-minute validation checklist

After mounting and configuring a new camera, run through this procedure before considering setup complete.

**1. Confirm the live view shows one PersonHypothesis per person.**

In Admin UI, open the live view for the new camera. Walk through the camera's field of view at a normal pace. Confirm that one PersonHypothesis appears per physical person. Two PHs per person usually means the camera overlaps an adjacent camera and the overlap group is not yet declared, or the floor-plane dedup threshold needs adjustment.

**2. Verify the floor point lands in the correct room polygon.**

In Admin UI, open the floor plan overlay. The PH marker should land inside the room polygon that corresponds to where you physically are. If the marker is in the wrong room or floating outside all polygons, re-run homography calibration (Admin > CTS > Calibration) using at least six reference points spread across the camera frame, including corners and near-center floor points.

**3. Check that identity commits at a doorway crossing.**

Walk briskly through the camera's view of a doorway while the gallery has your face enrolled. Within a few seconds of the crossing, the PH label in the live view should change from UNKNOWN to your name. A committed identity requires face or body evidence above the confidence threshold; temporal continuity alone is not enough. If identity never commits, check gallery enrollment and that the crop at the doorway is sharp.

**4. Spot-check keyframe sharpness.**

In Admin UI, open a recent PH and view its keyframes. Limb edges should be sharp enough to distinguish clothing texture. If keyframes look uniformly blurred, revisit the shutter setting. A blurred keyframe is a blurred ReID embedding.

**5. Confirm the motion gate is not over-triggering.**

In the Admin UI metrics or logs, check `frames_filtered_total` for the new camera. If the filter rate is above 95%, the camera may be so static that `static_sample_interval_s` is the only source of frames. Lower it if needed for rooms where the resident sits still for extended periods.

## Next steps

- [Camera Calibration](/features/continuous-tracking/camera-calibration): homography, visibility polygons, shared views, and learned camera handoffs
- [Jetson CTS Deployment](/hardware/jetson-cts): ingress settings table, model throughput targets, and TensorRT build instructions
- [Frame Processing Pipeline](/features/continuous-tracking/frame-pipeline): how ingested frames move through detection, ReID, pose, and tracking
