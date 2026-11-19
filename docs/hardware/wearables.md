# Optional wearables and RF receivers

Continuous Tracking treats wearable tags as optional, hardware-neutral location and identity evidence alongside cameras. Every RF ingress adapter publishes the same `TagFix` protobuf contract onto Redis Streams, so switching tags, receivers, or ranging radios does not change the tracking orchestrator or Cognitive Companion.

## Hardware-neutral wire contract

Every RF adapter normalises its hardware packets into two protobuf messages defined in `continuous-tracking/proto/continuoustracking/v1/wearable.proto`:

| Message | Redis stream | Purpose |
| --- | --- | --- |
| `TagFix` | `wearable.fixes` | One location or proximity fix for a registered `tag_id` on the active household floor plan, carrying 2x2 floor covariance (`cov_xx`, `cov_xy`, `cov_yy`) or room/zone weights plus optional wear-state, motion-state, and battery metadata |
| `AdapterCapability` | `wearable.capabilities` | Adapter heartbeat advertising supported `FixKind` values, nominal position accuracy, update cadence, wear/motion reporting, and online RF node IDs |

A third stream, `position.tracks`, is reserved for future anonymous floor-plane sensors (`AnonymousPositionTrack` in `position_sensor.proto`, such as multi-target mmWave radars) that report anonymous person positions without carrying an identity.

Because every fix reports its own 2x2 floor covariance (`sigma_x`, `sigma_y`, correlation) and `FixKind` (`point_2d`, `point_3d`, `room_distribution`, `zone_presence`), downstream fusion weighs a 15 cm UWB fix and a room-level BLE fix through the same geometric model without branching on vendor names.

## Recommended hardware path

### Tier 1: room-level BLE beacons and fixed ESP32 receivers (start here)

Start with low-cost, long-battery BLE tags and wall-plugged room receivers before adding higher-precision radios:

- **Tags:** small BLE beacon wristbands, clips, or pendants (such as Minew, HolyIOT, or Blue Charm iBeacon / Eddystone beacons) transmitting a static non-rotating UUID/major/minor or local beacon ID. Typical battery life is 1 to 2 years on a coin cell, with no daily charging burden for a resident.
- **Receivers:** wall-powered ESP32 or ESP32-C3 room nodes running ESPHome `bluetooth_proxy` or MQTT RSSI scanning on the home LAN (roughly one receiver per covered room, or two in large open rooms).
- **What it gives you:** room-level presence and camera-track corroboration across hallways, doorways, and living spaces where ceiling cameras see backs or profiles.

### Tier 1 + Tier 2: dual-mode smartwatch (for example Pixel Watch 5)

Residents or caregivers who already wear a Wear OS smartwatch can pair it as two logical tags or a dual-capability watch device:

- **Always-on BLE beacon mode (Tier 1):** a lightweight foreground or companion service advertises a static local beacon ID picked up by the same ESP32 room receivers.
- **Optional motion-duty-cycled UWB ranging (Tier 2):** short 12-second UWB ranging bursts triggered on motion rather than continuous ranging preserve daily battery life while supplying sub-metre floor coordinates whenever the wearer moves through UWB-covered rooms. Keep UWB duty-cycling behind a real-device battery and Android UWB API probe before enabling it full-time.

### Optional Tier 2: USB-powered FiRa UWB anchors

When a deployment needs decimetre floor coordinates in open-plan rooms where multiple household members frequently cross paths, add USB-powered FiRa 2.0 / IEEE 802.15.4z UWB anchors (for example DW3000 or SR150 modules mounted high on walls with clear line of sight). Register each anchor in Cognitive Companion (`Admin > CTS > Wearables`) with its `floor_plan_id`, `(x_m, y_m, z_m)` coordinates, and optional FiRa `uwb_short_addr`, `uwb_channel` (`5` or `9`), and `antenna_delay_ns`.

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
