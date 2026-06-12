# Camera setup and tuning guide

Configure your RTSP cameras for reliable tracking before the system sees its first frame. The choices that matter most are exposure time, stream resolution, and mount angle: each controls a different failure mode in the detection and identity pipeline.

## Prerequisites

- go2rtc and rtsp-ingress running and reachable by the tracking orchestrator
- Admin UI accessible (typically `http://<host>:8080/admin/cts/cameras`)
- Camera added to the Admin UI with its RTSP substream URL already set

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

### Recommended substream: 1280x720

Configure the substream URL in Admin. The person detector letterboxes every frame to a 640x640 canvas before inference, regardless of input size:

```python
# triton-shared/triton_shared/inference/detection.py
DETECTOR_INPUT_SIZE = 640
```

A 4K input does not improve detection accuracy: it letterboxes to the same 640x640 canvas as a 720p input. What it does add is JPEG decode latency on the go2rtc proxy, MinIO upload size, and Redis stream payload size. A 1280x720 frame gives the detector enough pixel density for full-body crops while keeping the pipeline light.

### Codec preference: H.264 over H.265

Where the camera offers a choice, prefer H.264. go2rtc runs on the same host as the tracking orchestrator or on the Jetson (for the Jetson deployment shape). H.264 decoding is cheaper in software and supported by hardware decoders on a wider range of SoCs. H.265 stream at the same bitrate provides no accuracy benefit downstream, since the detector never sees the compressed stream.

## Placement

### Mount height and angle

Mount cameras at 2.2 to 2.6 meters above the floor, angled 15 to 30 degrees downward. At this height:

- The full torso of an adult at 1 to 4 meters from the camera occupies enough pixels for a reliable ReID crop.
- The top of the head is visible, which matters for the floor-plane homography (you need the contact point, not the head centroid, for the floor projection).
- Extreme downward angles (more than 40 degrees) foreshorten the body and degrade keypoint localization.

### Cover doorways and transit lines

Place cameras to capture people as they cross room boundaries, not as they sit in a chair. The topology learner records transit times between cameras at each handoff. Doorway coverage is the data source for that learning: a camera pointed at a couch records presence, not movement direction.

### Window and backlight

Avoid pointing cameras directly at windows unless the camera has wide dynamic range (WDR) enabled. A window in the background compresses the foreground histogram and produces silhouettes rather than texture-rich crops. Enable WDR if available, or angle the camera 45 degrees away from the window axis.

### Camera overlap and adjacency

When two cameras share a physical zone (e.g. two angles of the same doorway), declare them as an overlap group in Admin UI (Admin > CTS > Adjacency). The system uses overlap groups to merge simultaneous detections from different angles into one PersonHypothesis rather than spawning two.

Cameras that are adjacent but do not share a view (e.g. hallway camera and bedroom camera) need an adjacency edge, not an overlap group. See [Camera Calibration](/features/continuous-tracking/camera-calibration) for how overlap inference and manual adjacency configuration work, and for what makes homography calibration accurate: floor texture, six or more reference points spread across the camera frame, and a clean shot without people in frame.

## Frame cadence and motion gate

rtsp-ingress polls each camera at the rate set by `frame_interval_ms` and drops frames that show little grayscale change between successive polls. Three settings control this behavior, with their defaults documented in the [Jetson CTS deployment settings table](/hardware/jetson-cts#understand-the-incoming-workload):

| Setting | What it does |
| --- | --- |
| `frame_interval_ms` | How often (in ms) the worker polls go2rtc for a new JPEG. Lower values increase detector load; higher values reduce temporal resolution for fast motion. |
| `motion_threshold` | Fractional mean pixel difference below which a frame is dropped as static. A room with a ceiling fan may need a slightly higher value to avoid constantly publishing fan-blade movement. |
| `static_sample_interval_s` | Forces a frame through even when the motion gate would drop it, as long as this many seconds have elapsed since the last published frame. This captures still presence (seated, sleeping) for downstream analysis. Set to 0 to disable. |

Per-camera overrides are not exposed in the Admin UI today; the defaults from `rtsp-ingress/config/settings.yaml` apply to all cameras. Adjust them carefully: lowering `frame_interval_ms` on all cameras raises worst-case detector throughput demand proportionally.

## Time synchronization

Run NTP on every camera and on every host running rtsp-ingress. Two timing values matter in the pipeline:

1. **Frame timestamp.** The ingress worker stamps each published frame with the ingress host's wall clock (`time.Now()` in Go, written to `capture_time_unix_ns` in the protobuf). If the ingress host clock is off, displayed frame times in the Admin UI will be off by the same amount.

2. **Cross-camera transit time.** When a PersonHypothesis closes on one camera and a revival candidate appears on another, the tracker computes `elapsed_s = now - closed_at` using the orchestrator's wall clock. For this estimate to be accurate, the orchestrator host must have a correct clock. Camera clocks do not directly feed into this computation, but a camera with a drifted clock can produce RTSP stream PTS values that cause go2rtc to delay or reorder frame delivery, which may shift the effective ingest time.

**How to spot clock skew.** In the Admin UI person inspector, check whether doorway crossings between two cameras show transit times that are implausibly long or short (under half a second or over a minute for adjacent rooms). One-sided misses (camera A never successfully hands off to camera B but the reverse works) often indicate a clock or topology misconfiguration rather than an appearance problem.

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

- [Camera Calibration](/features/continuous-tracking/camera-calibration): homography, visibility polygons, overlap groups, and adjacency edges
- [Jetson CTS Deployment](/hardware/jetson-cts): ingress settings table, model throughput targets, and TensorRT build instructions
- [Frame Processing Pipeline](/features/continuous-tracking/frame-pipeline): how ingested frames move through detection, ReID, pose, and tracking
