# Cross-repository identity contracts

This reference identifies the producer, wire field, consumer, owner, and compatibility rule for
identity data that crosses Continuous Tracking System (CTS), Cognitive Companion, and the person
identification service.

::: info Implementation status
The current payload and the accepted direction are shown separately. Fields in the accepted
direction are not available until their producer and every consumer ship the corresponding change.
:::

## Compatibility rules

- CTS Redis stream entries use one named field containing raw protobuf bytes.
- Protobuf changes are additive. Existing tag numbers are not reused; removed fields are reserved.
- A compatibility field stays for one complete coordinated deployment after every consumer reads
  the canonical field, unless the contract row states otherwise.
- A zero-period cutover deploys producer and consumer together. Two codecs are not supported on one
  stream.
- CTS owns identity revisions. Cognitive Companion acknowledges the same `revision_id`.

## Redis and object references

| Channel or object | Producer and owner | Current payload | Consumer | Accepted direction | Compatibility |
| --- | --- | --- | --- | --- | --- |
| `frames.ready` | RTSP ingress, CTS | `frame`: raw `FrameReady` protobuf | Tracking orchestrator | Keep camera, object key, frame index, timestamps, dimensions, and sample FPS additive | Additive |
| `tracking.events` | Tracking orchestrator, CTS | `event`: raw `TrackingEvent` protobuf with explicit `decision_id`, `inferred_identity_id`, `effective_identity_id`, `authority`, `decision_source`, `conflict`, `calibrated_confidence`, and evidence reference | CC tracking and world-observation subscribers | Maintain exact protobuf fields and semantics | One coordinated deployment after canonical fields are consumed |
| `tracking.revisions` | Tracking orchestrator, CTS | `revision`: raw `IdentityRevision` protobuf | CC identity revision subscriber | Add observation range, lineage, expected version, and projection-job metadata with new tag numbers | Old readers supported for one coordinated deployment |
| `scene.samples` | Tracking orchestrator, CTS | `sample`: raw `SceneSample` protobuf | CC scene sample subscriber | Keep the physical frame key; aggregate trigger rows and bbox effective identities in the read model | Current fields stay for one coordinated deployment after grouped reads ship |
| `tracking.signals` | Tracking orchestrator, CTS | `signal`: raw `DementiaSignal` protobuf | CC dementia signal subscriber | Reference revision lineage instead of relabeling inference in place | Additive |
| `tracking.presence` | Tracking orchestrator, CTS | `presence`: raw `PresenceEvent` protobuf | CC presence projection | Project effective identity by revision ID; keep `person_id` inside CC | One coordinated deployment after revision-aware projection ships |
| `tracking.dwell` | Tracking orchestrator, CTS | `dwell`: raw `DwellEvent` protobuf | CC dwell projection | Use the same effective identity and revision rule as presence | One coordinated deployment after revision-aware projection ships |
| `cc.identity_assertions` | Cognitive Companion | One raw `CCIdentityAssertion` protobuf field (`assertion`) with source, `raw_similarity`, nullable `calibrated_confidence`, model versions, and calibration status | CTS assertion subscriber and face identity stage | Maintain explicit protobuf schema over Redis streams | Zero-period producer and consumer cutover |
| MinIO `frames/...` | RTSP ingress, CTS | Raw JPEG referenced by `minio_key` | CTS fetch and keyframe stages, CC frame proxy | Keep the physical source-frame key stable | Through object retention |
| Governed ReID crop | CTS gallery service | Not yet available | Authorized CC review surface | Immutable crop object with content hash; rejection deletes the crop and vector but keeps audit metadata | No legacy contract |

::: warning
`cc.identity_assertions` is the known baseline exception to the protobuf-only stream rule. New text
fields must not be added. Conversion requires a coordinated publisher and subscriber deployment.
:::

## HTTP and persisted projections

| Contract | Producer and owner | Current fields | Consumer | Accepted direction | Compatibility |
| --- | --- | --- | --- | --- | --- |
| `POST /identify` and `POST /identify-batch` | Person identification | `person_id`, `name`, `confidence`, `similarity`, recognition state, bbox, and pose | CTS face identity client | `raw_similarity`, nullable `calibrated_confidence`, calibration status and version, model profile, preprocessing version, and face detection confidence | Deprecated `confidence` may mirror raw similarity for one coordinated deployment and is never authoritative |
| CTS keyframe list and detail | CTS | Trigger PH, trigger `person_id`, annotations, and raw frame key | CC keyframe BFF | Physical-frame ID, all bbox inferred and effective identities, authority, source, conflict, aggregate counts, revision ID, and server pagination | Trigger fields stay for one coordinated deployment after grouped reads ship |
| CTS correction endpoints | CTS | Whole-PH identity correction and revision response | CC correction BFF | Frame or observation-bounded segment, expected version, reason, note, job ID, revision ID, and projection status | Whole-PH adapter stays for one coordinated deployment, then ends after usage review |
| `ph_revisions` to `cts_identity_revision_log` | CTS revision publisher | Stable revision ID, PH, old and new identity, actor, reason, and evidence | CC identity rewriter | Add range and lineage while keeping idempotency by revision ID | Audit IDs are permanent |
| `person_location_history` projection | CC identity rewriter | `person_id`, PH, and superseding revision | CC location reads | Supersede the affected observation range and acknowledge the revision ID | Historical audit is permanent |

## Change checklist

When a change affects a row in this reference:

1. Update the producer and all consumers in the same change set.
2. Add producer and consumer contract tests.
3. State the compatibility end condition.
4. Update this page and the related architecture decision.
5. Verify that Redis stream values remain raw protobuf bytes.

## Related pages

- [Identity integrity architecture](/features/continuous-tracking/identity-integrity)
- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Identity integrity change verification](/development/identity-integrity-verification)

