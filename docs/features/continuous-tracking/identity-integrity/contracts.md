# Cross-repository identity contracts

This reference identifies the producer, wire field, consumer, owner, and compatibility rule for
identity data that crosses Continuous Tracking System (CTS), Cognitive Companion, and the person
identification service.

::: info Implementation status
The current payload and the accepted direction are shown separately. Fields in the accepted
direction are not available until their producer and every consumer ship the corresponding change.
Calibration fields (`raw_similarity`, `calibrated_confidence`, calibration status, and version
fields) are now deployed on the person identification service HTTP responses and consumed by the
CTS face identity client.
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
| `tracking.events` | Tracking orchestrator, CTS | `event`: raw `TrackingEvent` protobuf with explicit `decision_id`, `inferred_identity_id`, `effective_identity_id`, `authority` (bounded vocabulary: `operator`, `direct_face`, `posterior`, `temporal_prior`, `none`, plus `reid_gallery` reserved and `unknown`/`height_proxy` legacy members never emitted by the current producer; wire type unchanged, still a string), `decision_source`, `conflict`, `calibrated_confidence`, and evidence reference | CC tracking and world-observation subscribers | Maintain exact protobuf fields and semantics | One coordinated deployment after canonical fields are consumed |
| `tracking.revisions` | Tracking orchestrator, CTS | `revision`: raw `IdentityRevision` protobuf with typed fields 18 to 25 for revision kind, range start and end, range authority, range and correction IDs, required projections, and revision schema version | CC identity revision subscriber | Typed range and projection fields deployed; older readers ignore them | Old readers supported for one coordinated deployment |
| `scene.samples` | Tracking orchestrator, CTS | `sample`: raw `SceneSample` protobuf | CC scene sample subscriber | Keep the physical frame key; aggregate trigger rows and bbox effective identities in the read model | Current fields stay for one coordinated deployment after grouped reads ship |
| `tracking.signals` | Tracking orchestrator, CTS | `signal`: raw `DementiaSignal` protobuf | CC dementia signal subscriber | Reference revision lineage instead of relabeling inference in place | Additive |
| `tracking.presence` | Tracking orchestrator, CTS | `presence`: raw `PresenceEvent` protobuf | CC presence projection | Project effective identity by revision ID; keep `person_id` inside CC | One coordinated deployment after revision-aware projection ships |
| `tracking.dwell` | Tracking orchestrator, CTS | `dwell`: raw `DwellEvent` protobuf | CC dwell projection | Use the same effective identity and revision rule as presence | One coordinated deployment after revision-aware projection ships |
| `cc.identity_assertions` | Cognitive Companion | One raw `CCIdentityAssertion` protobuf field (`assertion`) with source, `raw_similarity`, nullable `calibrated_confidence`, model versions, and calibration status | CTS assertion subscriber and face identity stage | Maintain explicit protobuf schema over Redis streams | Zero-period producer and consumer cutover |
| MinIO `frames/...` | RTSP ingress, CTS | Raw JPEG referenced by `minio_key` | CTS fetch and keyframe stages, CC frame proxy | Keep the physical source-frame key stable | Through object retention |
| Governed ReID crop | CTS gallery service | Immutable crop object with content hash and state (`pending_review`, `operator_verified`, `rejected`) | Authorized CC review surface | Immutable crop object with content hash; rejection deletes the crop and vector but keeps audit metadata | No legacy contract |

::: warning
`cc.identity_assertions` is the known baseline exception to the protobuf-only stream rule. New text
fields must not be added. Conversion requires a coordinated publisher and subscriber deployment.
:::

## HTTP and persisted projections

| Contract | Producer and owner | Current fields | Consumer | Accepted direction | Compatibility |
| --- | --- | --- | --- | --- | --- |
| `POST /identify` and `POST /identify-batch` | Person identification | `person_id`, `name`, `confidence` (raw similarity alias, deprecated), `similarity`, `raw_similarity`, nullable `calibrated_confidence`, `calibration_status`, `calibration_artifact_version`, `arcface_model_version`, `model_profile`, `preprocessing_version`, recognition state, bbox, and pose | CTS face identity client | Maintain all calibration fields; `calibrated_confidence` is null in any degraded state and for non-recognized faces | Deprecated `confidence` mirrors raw similarity for one coordinated deployment and is never authoritative |
| CTS keyframe list | CTS `GET /internal/keyframes/grouped` | One card per physical frame keyed by `(camera_id, minio_key, captured_at)`: `physical_frame_id`, trigger audit rows, every deduplicated bbox with `inferred_identity_id`, `effective_identity_id`, `authority`, `decision_source`, `calibrated_confidence`, `conflict`, `revision_id`, and `pending_review`, plus explicit unknown and conflict counts and server pagination | CC keyframe BFF and `list_keyframe_frames` MCP tool | Server-side filters by effective identity, authority, source, conflict, pending review, camera, trigger reason, and time, applied before grouped-frame pagination | Old per-trigger `GET /internal/keyframes` stays for one coordinated deployment, then ends after usage review |
| CTS correction endpoints | CTS | `POST /internal/corrections/propose`, `/apply`, and `/{correction_id}/compensate` return segment proposals, correction and revision IDs, range ID, and job status; `GET /internal/corrections/jobs/{revision_id}` returns job status, required projections, row counts, attempts, and last error | CC correction BFF | Frame or observation-bounded segment, expected version, reason code, note, job ID, revision ID, and projection status | Whole-PH `POST /internal/corrections` adapter stays for one coordinated deployment, then ends after usage review |
| CC correction proxy | CC `POST /api/v1/cts/identity/corrections/propose`, `/apply`, `/{correction_id}/compensate`, and `GET /api/v1/cts/identity/corrections/jobs/{revision_id}` | Browser-facing segment proposal, correction result, and projection-job status; effective identity mapped to `person_id` at the boundary | Correction UI and `propose_identity_correction` / `get_identity_correction_job` MCP tools | Audited actor injected from the auth context, never the browser; upstream `409 correction.stale_version` and `422` preserved, upstream 5xx mapped to `502` | Stable while the correction workflow exists |
| CTS ReID review endpoints | CTS `GET/POST /internal/reid-review/*` | Candidate list with filters and total, candidate detail with eligibility and review history, counts by state, and approve/relabel/reject/batch-reject/compensate; approve and relabel re-check live eligibility and the optimistic `audit_version` | CC ReID review BFF | Individual approve and relabel only; batch exposes reject; stale or ineligible returns `409` | No legacy contract |
| CC ReID review proxy | CC `GET/POST /api/v1/cts/identity/reid-review/*` | Browser-facing candidate list, detail, counts, and review actions; effective identity mapped to `person_id`; crop and frame media presigned only for a live object | ReID review UI (`/admin/cts/reid-review`) | Gated by the strict `cts.identity.gallery_review` token, not by broad role globs; audited actor injected from the auth context; intentionally no MCP parity | Stable while the review queue exists |
| `POST /internal/projection-acks` | CC identity revision subscriber | `revision_id`, `consumer`, `schema_version`, `status`, and counts | CTS correction service | Acknowledge a projection by revision ID; a failed ack marks the job failed for idempotent retry | Stable while the projection-job model exists |
| Correction targets | CC household roster | `GET /api/v1/cts/identity/correction-targets` returns active household members with optional gallery decoration | Correction UI | Authoritative active-member list independent of gallery population; gallery counts are decoration and `gallery_available` flags upstream errors | Stable |
| `ph_revisions` to `cts_identity_revision_log` | CTS revision publisher | Stable revision ID, PH, old and new identity, actor, reason, and evidence with revision-range lineage | CC identity rewriter | Range and lineage carried in the audit log while keeping idempotency by revision ID | Audit IDs are permanent |
| `person_location_history` projection | CC identity rewriter | `person_id`, PH, and superseding revision | CC location reads | Supersede the affected observation range, retain originals, and acknowledge the revision ID | Historical audit is permanent |
| `cts_dementia_signals` projection | CC identity rewriter | `person_id`, window, and `superseded_by_revision_id` | CC signal reads | Supersede signals under the prior identity within the corrected range, retain originals, and insert replacements under the corrected identity with a re-derived `signal_id` | Historical audit is permanent |
| Revision horizon config | CTS resolver, `resolver.revision_horizon_s` (default 600 s) | Bounds how far back an automatic (range-less) revision may supersede prior rows | CC `IdentityRewriter`, mirrored as `cts.revision_horizon_s` | Both constants must express the same bound | Change both together; a drift lets CC rewrite more or less history than the resolver's own revision contract promises |
| `inferred_backfill` revision projection | CTS `RevisionsStage` / `UnknownBackfillService` | `revision_kind=inferred_backfill` with empty `previous_identity_id` and explicit range | CC `BackfillProjector` | Idempotent insert of presence segments over the range | Acknowledgment loop required to mark CTS job complete |
| Visitor clustering API | Person identification service | `GET /clusters`, `GET /clusters/{id}`, `POST /clusters/{id}/name`, `POST /clusters/{id}/dismiss` | CC BFF (Visitor review surface) | Naming moves biometric data from the visitor dataset into the enrollment dataset and creates a `HouseholdMember` | Stable API shape for one coordinated deployment |

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

