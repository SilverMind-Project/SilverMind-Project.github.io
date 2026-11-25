# Optional wearables and RF receivers

Continuous Tracking treats wearable tags as optional, hardware-neutral location and identity evidence alongside cameras. Every RF ingress adapter publishes the same `TagFix` protobuf contract onto Redis Streams, so switching tags, receivers, or ranging radios does not change the tracking orchestrator or Cognitive Companion.

## Hardware-neutral wire contract

Every RF adapter normalises its hardware packets into two protobuf messages defined in `continuous-tracking/proto/continuoustracking/v1/wearable.proto`:

| Message | Redis stream | Purpose |
| --- | --- | --- |
| `TagFix` | `wearable.fixes` | One location, room, or proximity fix for a registered `tag_id` on the active household floor plan, carrying 2x2 floor covariance (`cov_xx_m2`, `cov_xy_m2`, `cov_yy_m2`) or room probability plus optional wear-state, motion-state, and battery metadata |
| `AdapterCapability` | `wearable.capabilities` | Adapter heartbeat advertising supported `FixKind` values, nominal update rate, and covariance, elevation, wear-state, and motion-state reporting |

A third stream, `position.tracks`, is reserved for future anonymous floor-plane sensors (`AnonymousPositionTrack` in `position_sensor.proto`, such as multi-target mmWave radars) that report anonymous person positions without carrying an identity.

Because every fix reports its own 2x2 floor covariance (`cov_xx_m2`, `cov_xy_m2`, `cov_yy_m2`) and `FixKind` (`position`, `room`, `proximity`), downstream fusion weighs a 15 cm UWB fix and a multi-metre BLE fix through the same geometric model without branching on vendor names.

## The `rf-ingress` service

`continuous-tracking/rf-ingress/` (port `8095`, opt-in Docker Compose profile `wearables`) converts RF adapter reports into validated `TagFix` messages on `wearable.fixes` and 60-second `AdapterCapability` heartbeats on `wearable.capabilities`.

- **Adapter boundary and conformance kit:** every hardware source implements `RangeAdapter`, `PositionAdapter`, or `RoomAdapter` behind `AdapterRegistry`. The core ships with a deterministic seeded `simulator` adapter (covering UWB, BLE Channel Sounding, BLE RSSI with body-shadow steps, burst-batched delivery, native-frame positions, room reports, and JSONL replay), `ble_scanner_mqtt` (`payload_profile: espresense_node_v1`, subscribing to `espresense/devices/+/+` for fixed BLE room receivers with per-epoch 1.0 s median RSSI aggregation, calibrated log-distance range/variance, and RSSI-variability motion inference), `device_ranging_mqtt` (`payload_profile: device_ranging_v1`, subscribing to `rf/devices/+/ranges` for micro-batched smartwatch UWB bursts), `anchor_ranging_mqtt` (`payload_profile: fira_anchor_v1`, subscribing to `rf/anchors/+/ranges` for mains-powered FiRa UWB anchors reporting standalone deep-sleep tag ranges and charging state), and an adapter conformance suite under `rf-ingress/tests/conformance/` that every hardware adapter must pass unchanged.
- **Per-epoch multilateration with covariance:** `EpochBuilder` groups ranges per tag over a 0.25 s window or adapter `epoch_seq` (the BLE adapter emits explicit 1.0 s `epoch_seq` buckets) closes an epoch once it has been idle for that window on the server clock (so the last epoch of a short UWB burst is published immediately), and drops open epochs whenever Cognitive Companion's site-config `version` changes. `MultilaterationSolver` weights each range by its reported `variance_m2`, down-weighted further when the radio reports low line-of-sight confidence, solves 3D when four or more anchors have vertical spread (otherwise, or when the vertical axis is poorly constrained, 2D at an assumed 1.0 m wrist height with height uncertainty propagated into the covariance), rejects single-anchor NLOS outliers on four or more nodes, and ignores wrist-local azimuth so solves remain invariant to wrist rotation. Solved positions also carry the nearest RF node's room with a probability, and epochs with fewer than three nodes emit a `room` fix from the nearest RF node's configured room.
- **Burst clock alignment and registration gating:** `BurstClockOffsetTracker` estimates per-tag clock offset from minimum transport delay (`arrival - sent_at`) so micro-batched wireless bursts do not look like multi-second clock skew. Old samples expire after 30 minutes, and a device clock that steps backward is re-learned after two consistent batches. Fixes are published only for registered, active devices with a binding covering `measured_at`, and `wearable.fixes` trims raw fixes to 72 hours with `XADD ... MINID`.
- **Health, metrics, replay, and bench tools:** `GET /health` reports adapter status, site-config version and age, publisher state, per-node last-seen ages (`node_last_seen_age_s`), per-tag last-seen ages (`tag_last_seen_age_s`), and reported tag battery fractions (`tag_battery_fraction`); `GET /metrics` exposes Prometheus counters, solve duration, fix sigma, and clock offset gauges. `python -m rf_ingress.replay` records raw adapter reports (capped at 60 minutes) and replays them through the simulator, and `python -m rf_ingress.bench` evaluates UWB bench battery runtime projections and 30-day shared-room necessity gates.

## Recommended hardware path

### Tier 1: room-level BLE beacons and fixed ESP32 receivers (start here)

Start with coin-cell BLE beacons that require no daily charging and wall-plugged ESP32 room receivers connected to the local Eclipse Mosquitto broker (`docker compose --profile wearables up -d`):

#### Selection rules (required)

- **Beacons:** static non-rotating identifier (iBeacon UUID, major, and minor), advertising interval configurable to 1.0 s or faster (start at 500 ms, 0 dBm), IP67 water resistance for daily wear and showers, replaceable coin cell (or low-cost replacement), and preferably an onboard accelerometer for motion detection.
- **Receivers:** USB-powered ESP32 boards (ESP32, ESP32-C3, ESP32-C6, or ESP32-S3) running open-source ESPresense firmware publishing per-node reports over LAN MQTT with authentication enabled. Home Assistant, the ESPresense companion, and Bermuda are not required.

#### Example parts

| Role | Example models | Power | Notes |
| --- | --- | --- | --- |
| Primary senior wristband | Feasycom FSC-BP107D, MOKO W6, Lansitec i5 | Replaceable CR3032 or CR2032 coin cell | IP67 silicone band; MOKO W6 adds an accelerometer; target 6 months or more projected life at 500 ms interval |
| Alternate clip or pendant | Blue Charm BC04P, DX-CP27 single-use band | CR2477 or sealed CR2032 | Useful as a second bound tag on a shoe, pendant, walker, or garment for a wearer who removes wristbands |
| Fixed room receivers | Seeed Studio XIAO ESP32-C3 / C6 / S3 or generic ESP32 dev boards | Wall USB power (5 V) | Plan one receiver per room, two in large open living areas, plus one spare |

#### Receiver placement, beacon programming, and walk test

1. **Flash and configure receivers.** Flash ESPresense from the browser installer, assign each receiver a clear node ID (matching its `anchor_id` in Cognitive Companion), point it at the local Mosquitto broker (`port 1883`) using `MQTT_USERNAME` and `MQTT_PASSWORD`, and record the firmware version in Cognitive Companion's RF Node form.
2. **Mount receivers.** Place one receiver per room at 1.0 to 1.5 m height on USB power, away from large metal appliances and televisions; mount two receivers at opposite sides of a large open-plan living area. Measure each receiver's coordinates with a tape measure, place it on the floor plan, and verify with the tape-distance survey check.
3. **Program beacons.** Using the vendor app, set a static iBeacon UUID, major, and minor, configure a 500 ms advertising interval at 0 dBm (or the calibrated interval from bench testing), label the band physically, and enter its reported identifier (`iBeacon:<uuid>-<major>-<minor>`) as the device's `hardware_key` in Cognitive Companion.
4. **Run the walk test.** Have one person wear a bound tag and spend 60 seconds in each covered room. Confirm that every room emits fixes for the tag, at least 90% of in-room fixes report that room, `rf_ingress_unregistered_tag_total` counts nearby non-household Bluetooth devices without emitting fixes for them, and every receiver shows a recent **Last heard** timestamp.
5. **Monitor readiness and replace batteries.** On `Admin > Identity Setup`, the optional **Wearables** readiness step reports how many registered RF nodes were heard in the last 5 minutes, how many active tags were heard, and the lowest reported beacon battery percentage. Replace coin cells before they drop below 20%, and check wristband comfort and skin weekly.

### Tier 1 + Tier 2: dual-mode smartwatch (for example Pixel Watch 5)

Residents or caregivers who already wear a Wear OS smartwatch can run the standalone companion app (`continuous-tracking/wear-companion/`), built in two Gradle product flavors:

- **`bleOnly` flavor (Tier 1 default, zero network permissions):** a foreground service advertises a static local iBeacon (2 Hz on-body, 1 Hz screen-off, stopped immediately off-body via Wear OS off-body detection) picked up by the same ESP32 room receivers. Its Android manifest declares zero network or UWB permissions (`android:allowBackup="false"`), and its Wear OS tile shows the current advertising state.
- **`dualMode` flavor (opt-in Tier 2 UWB burst controller):** adds `UWB_RANGING` and LAN-only MQTT permissions, while still defaulting to `BLE_ONLY` at runtime until FiRa anchors, a LAN MQTT broker, and a pre-shared STS key are configured. When enabled and the wearer walks, the locomotion duty-cycle controller filters seated wrist fidgets and triggers 12-second UWB ranging bursts (60-second same-walk cooldown, 10-second stop-walk reset, token-bucket 120 s/hour cap with a 20% battery and thermal cutoff) and flushes 3-second JSON micro-batches (`device_ranging.v1` on `rf/devices/{tag_id}/ranges`) to `rf-ingress`'s `device_ranging_mqtt` adapter. Keep Tier 2 disabled until real-device UWB API and battery probes pass on the target watch model.

### Optional Tier 2: USB-powered FiRa UWB anchors and precision tags

Room-level BLE evidence is enough when people spend most of their time in separate rooms. Add the UWB precision tier only after BLE wearables have run for 30 days and live counters show that 25% or more of the senior's worn, in-coverage time is rejected as `room_only_shared_room` in rooms that already have calibrated floor-plane cameras. If the responsible rooms lack calibrated cameras, calibrate the cameras first because decimetre UWB positions require calibrated floor trajectories to match against.

#### Unified anchor architecture

Install four USB-powered, programmable FiRa MAC 1.3 DS-TWR anchors (for example Qorvo DWM3001CDK, NXP SR150 modules, or DW3000 + ESP32-S3 boards running a FiRa Static STS responder stack) only in the gated shared rooms. The same anchors serve two wearable endpoints without changes to the tracking orchestrator:

- **Dual-mode smartwatch bursts (`device_ranging_mqtt`, `device_ranging.v1`):** a Pixel Watch 5 wakes the room's anchors with a 10-byte BLE broadcast (`PreSharedStsNegotiator`), runs a 12-second UWB burst while walking, and publishes micro-batched ranges on `rf/devices/+/ranges`.
- **Standalone deep-sleep clip or pendant tags (`anchor_ranging_mqtt`, `fira_anchor.v1`):** a battery tag wakes only its UWB radio (never Wi-Fi) so the wall-powered anchors publish per-anchor ranges, motion state, battery fraction, and charger state on `rf/anchors/+/ranges`.

#### Battery rule and charging routine

Every rechargeable UWB wearable must pass a bench power-profiler check before household wear:

- **General wearable gate:** projected runtime of at least 36 hours on the chosen LiPo cell (a full day plus margin) over a scripted hour (20 minutes moving, 40 minutes still), verified with `python -m rf_ingress.bench battery`.
- **Senior wearable target:** projected runtime of at least 72 hours, enclosed under 40 g with no exposed electronics, worn as a clip or pendant alongside the zero-charging BLE wristband, and charged via a single-step cable or cradle.
- **Charger safety (`OFF_BODY`):** whenever a tag is docked on its charger (`charging: true`), `anchor_ranging_mqtt` forces `wear_state` to `OFF_BODY` so fixes from a charging cradle never act as identity evidence.

#### Anchor placement and verification

1. **Mount anchors at varied heights.** Place four USB-powered anchors around each gated room at heights spanning at least 0.5 m (for example 1.2 m to 2.4 m) with clear line of sight into the room's walking area and away from metal cabinets.
2. **Register anchors in Cognitive Companion.** Under `Admin > CTS > Wearables`, add each anchor with role `ranging_anchor`, technology `uwb`, its `(x_m, y_m, z_m)` coordinates, and its FiRa `uwb_address_hex` (`XX:XX`), `uwb_channel` (`5` or `9`), and `uwb_preamble_index` (`9` to `32`). Confirm the tape-distance survey residual stays at or below 0.20 m.
3. **Calibrate worn-tag variance before enabling.** Run a 12-point, 4-direction worn-tag bench walk (pass: median horizontal error at or below 0.30 m, 95th percentile at or below 1.00 m, fix availability at least 80%) and enter the measured worn-tag standard deviation as `uwb_default_sigma_m` (never the optimistic datasheet figure) on the second adapter instance in `rf-ingress/config/settings.yaml`.
4. **Compare for 14 days.** Keep the BLE adapter running alongside the UWB adapter and compare `room_only_shared_room` share, trajectory-grade attested minutes per day, spot-checked precision (must stay at or above 99%), and any `swap_suspected` events. Keep the UWB tier only if shared-room rejections drop by half or more in the gated rooms.

### Why consumer item trackers (Pixel Tags, AirTags) are excluded

Consumer find-my trackers such as Google Pixel Tags and Apple AirTags are not supported as household identity tags:

- **Rotating privacy identifiers:** Fast Pair and Find My rotate BLE MAC addresses and encrypted payload keys on a schedule controlled by a cloud account key, so a local home receiver cannot stably track the tag without tying into a cloud account.
- **Coin-cell UWB limits:** consumer coin-cell tags only activate UWB briefly during user-initiated phone-finder sessions, not for continuous or motion-triggered indoor ranging.

## Registering devices, consent, and RF nodes

Manage devices and fixed receivers in Cognitive Companion at `Admin > CTS > Wearables`:

1. **Calibrate the household floor plan first.** Upload a floor plan and set its scale (`metres per pixel`) under `Admin > CTS > Floor Plan`. RF node placement is blocked until a calibrated floor plan exists.
2. **Place RF nodes on the floor plan.** Add each fixed BLE receiver, UWB anchor, or dual-radio node by clicking the floor plan or entering `(x_m, y_m, z_m)` coordinates, then drag markers to refine positions.
3. **Run the tape-distance survey check.** Measure the real physical distance between two placed nodes with a tape measure and enter it in the **Survey check** panel (`POST /api/v1/wearables/nodes/survey-check`). The backend compares the tape measurement against the Euclidean distance on the floor plan and flags discrepancies above 0.15 m before tracking relies on anchor geometry.
4. **Register tags and record consent.** Register each wearable device (`tag_id`, `device_kind`, `label`, `adapter_id`, optional `hardware_key`). A member can wear multiple devices at once (for example a wristband and a watch), while each device can have only one open binding at a time. Binding a device to a household member requires explicit confirmation (`consent_confirmed`) and the name of the person who recorded consent (`consent_recorded_by`).
5. **Preserve history when re-binding.** Unbinding or assigning a tag to another member closes the previous binding interval (`valid_to`) and opens a new interval rather than overwriting the old record, so historical tracks stay attributed to whoever wore the tag at that time.

## Site configuration sync

Cognitive Companion serves the active site configuration (RF nodes in metres on the active floor plan, active devices, and open bindings) at `GET /api/v1/wearables/site-config`, protected by the `wearables:site_config` permission token.

- The tracking orchestrator polls this endpoint on its normal config sync interval, converts coordinates to millimetres internally, and keeps its last valid snapshot if Cognitive Companion is temporarily unreachable.
- Deleting a household member closes their open wearable bindings in Cognitive Companion and immediately clears those bindings from the tracking orchestrator's in-memory map.
