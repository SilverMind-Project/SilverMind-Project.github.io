# ReID gallery governance

Status: accepted architecture decision, June 19, 2026.

This decision defines how a body-appearance embedding becomes reviewed identity evidence. It keeps
tracking appearance, ArcFace enrollment, and labeled ReID data in separate stores with separate
trust rules.

::: info Implementation status
The four-state ReID gallery lifecycle is fully deployed (identity-continuity M02). Operator-verified
and machine-minted auto-verified entries both vote in identity resolution, at different trust
levels; pending and rejected entries never vote. Legacy `face_confirmed` entries have been
backfilled to `pending_review` and no longer automatically vote.

`ReIDCandidateStage` is the only pipeline path that writes to the gallery. It runs late in the
frame pipeline, after identity resolution and provenance persistence and ahead of the per-camera
publish throttle, so candidate creation is never silently dropped on a throttled frame. A
face-derived candidate is created only when the direct recognized ArcFace identity equals the
resolved PH identity and the face evidence carries a calibrated confidence; without a deployed
calibration artifact, the stage produces no candidates at all (fail closed) rather than falling
back to uncalibrated similarity. A candidate whose calibrated confidence is at or above
`reid_candidates.auto_verify_min_confidence` (default `0.90`) mints directly into `auto_verified`
instead of `pending_review`; every other eligible candidate still lands `pending_review`. The
per-identity, per-orientation cap on gallery growth counts `pending_review`, `auto_verified`, and
`operator_verified` rows together, so a backlog of unreviewed or machine-verified candidates cannot
exceed the cap either.
:::

## Use four states

Every `reid_gallery` entry has one state.

| State | Resolver vote | Retention |
| --- | --- | --- |
| `pending_review` | Never | Keep vector, crop, and provenance for review |
| `auto_verified` | Eligible, at a reduced trust multiplier | Keep vector, crop, provenance, and review event |
| `operator_verified` | Eligible, at full trust | Keep vector, crop, provenance, and review event |
| `rejected` | Never | Delete vector and dedicated crop; keep audit metadata and fingerprint |

`auto_verified` is minted at candidate-creation time, never by a review action: it exists precisely
because the calibrated evidence at creation already cleared a strict bar (the ArcFace authority
threshold plus a margin), so the row deserves machine trust with operator veto rather than operator
trust with machine suggestion. Operators can approve, relabel, reject, or **demote** an
`auto_verified` row from the same review queue used for `pending_review`. Only `operator_verified`
and `auto_verified` entries may reach resolver queries or caches; pending and rejected entries never
vote, including through caches, fallback queries, or compatibility code.

## Require crop provenance

Candidate creation requires a finite L2-normalized embedding, compatible model and preprocessing
versions, a high-quality crop, acceptable truncation and occlusion, and valid orientation.

Each candidate records:

- immutable source frame key and crop key;
- frame and crop content hashes;
- pixel bbox and image dimensions;
- camera and capture time;
- source PH, observation, keyframe, and creation-decision IDs;
- proposed identity and creation evidence;
- model and preprocessing versions.

A face-derived candidate is labeled only when the direct recognized ArcFace identity equals the
candidate identity. A held PH label cannot override a different recognized face.

## Record immutable review actions

| Action | Result |
| --- | --- |
| Approve | Promote `pending_review` or `auto_verified` to `operator_verified` |
| Relabel | Record the old proposal and corrected identity, then promote to `operator_verified` |
| Demote | Un-trust `auto_verified` back to `pending_review`; keeps the vector, unlike reject |
| Reject | Record the reason and fingerprint, then delete the vector and crop |
| Undo | Add a compensating event; restore the state the row was promoted from (`auto_verified` or `pending_review`), not always `pending_review`; keep the original review event |

Identity correction and gallery verification are separate actions. Correcting a bbox does not
promote its embedding. A crop that fails a quality gate cannot be approved through an override.
Approve, relabel, and reject all act on a row in `pending_review` or `auto_verified`; demote acts
only on `auto_verified`.

## Review the queue in the admin UI

The review queue is deployed at `/admin/cts/reid-review`. It lists candidates filtered by state (a
visually distinct chip marks `auto_verified` apart from `operator_verified` and `pending_review`)
with their pending age, proposed identity, camera and capture time, crop quality, orientation,
model version, and source type. Selecting a candidate opens a detail drawer with the body crop, the
source frame with its bounding box, nearby observations from the same PH, the full provenance
table, the server-computed eligibility, and the immutable review history.

Camera frames are blurred by default. Unblurred access uses the same `BlurToggle` and media behavior
as the rest of the tracking admin, gated by the gallery-review permission below.

The queue exposes only individual approve, individual relabel, individual demote, and reject
(single or batch). There is no bulk approve control or endpoint: every candidate that becomes
`operator_verified` passes through a single deliberate approve or relabel action.

### Approval is gated on live server eligibility

The server computes eligibility for each candidate from its current state, crop truncation and
occlusion, and model and preprocessing compatibility. The detail drawer disables Approve when
eligibility is false and lists the reasons. The server re-checks eligibility and the optimistic
`audit_version` on every approve and relabel, so a stale or now-ineligible candidate returns `409`
(`reid_review.stale` or `reid_review.ineligible`) and the browser refreshes rather than forcing the
change through. The browser cannot fabricate eligibility or override a failed quality gate.

### Rejected candidates show a deleted-crop state

Rejection nulls the embedding and removes the dedicated crop object, then keeps the crop key, hashes,
and review history as a fingerprint. The queue never presigns a rejected candidate's crop, so its
detail view renders an explicit deleted-crop state instead of a broken image.

## Permission separation

Gallery review is a distinct biometric-admin grant, `cts.identity.gallery_review`, separate from
`cts.identity.correct`. A caller that can view tracking data or correct identities cannot reach the
review queue without this grant. The backend enforces it with a strict token check that ignores the
broad `GET /api/v1/*` and `POST /api/v1/cts/identity/*` role patterns, so those wildcards do not
unlock the review surface on their own. The grant is held by the caregiver-admin role and the admin
role, not by the read-only caregiver role.

The review queue is an operational biometric-admin surface, not caregiver-facing domain data, so it
is intentionally not exposed as an MCP agent tool. See the
[API reference](/api/reference) for the endpoints and this exemption.

## Weight verified evidence

`operator_verified` hits receive a trust multiplier of `2.0` before identity aggregation;
`auto_verified` hits receive `1.5`. Neither multiplier changes cosine similarity; both are applied
by the same shared scorer described below, so a query regression that leaks a pending or rejected
row into scoring is loud (a backstop counter increments) rather than silently miscounted.

Recency uses exponential decay with a seven-day half-life and no floor:

```text
recency_factor = 2 ** (-(age_days / 7))
```

Queries use only entries with compatible model and preprocessing versions. Near-duplicate votes
are capped or clustered by source episode, camera, and orientation.

The schema for per-hit decision provenance (`IdentityDecisionGalleryHit`: entry ID, raw
similarity, trust multiplier, recency factor, and weighted contribution) exists end to end
(domain type, Postgres table, repository read/write), but no gallery query path populates it
today; `IdentityProvenanceDecision.gallery_hits` is always empty. Wiring population is separate,
deferred work, not part of the shared scorer.

A single shared scorer (`app/tracking/identity/gallery_scoring.py`) applies the trust multiplier,
recency decay, and vote caps on every gallery query path: the per-orientation multiview query, the
single-query fallback, and the shadow comparison. No path scores hits inline. The trust multiplier
and recency half-life are configurable via `resolver.gallery_verified_trust_multiplier`,
`resolver.gallery_auto_verified_trust_multiplier`, and `resolver.gallery_recency_half_life_days` in
`config/settings.yaml`.

## Keep learning boundaries explicit

- ArcFace enrollment is the golden face dataset.
- PH `gallery_mean` and view prototypes are inferred tracking state.
- ReID review data is a separate governed dataset.
- Identity correction does not add an enrollment or gallery sample.
- A rejected crop is deleted without erasing the audit event.

## Review checklist

- [x] Pending and rejected entries are excluded at repository and cache boundaries
      (`tests/storage/test_gallery_state_parity.py`, InMemory and Postgres).
- [x] Every candidate points to an immutable frame and crop, and carries `origin_tracklet_id`,
      `ph_id`, and `source_episode_id`
      (`tests/pipeline/stages/test_reid_candidate_stage.py`,
      `tests/integration/test_gallery_state_parity_postgres.py::test_create_review_candidate_round_trips_and_is_idempotent`).
- [x] Direct face identity equals the candidate label; a held PH label cannot override a different
      recognized face (`tests/characterization/test_gallery_seed_identity_mismatch.py`, a strict
      positive test since M04, no longer `xfail`).
- [x] Model and preprocessing partitions are enforced (`candidate_eligibility.py::evaluate_candidate`).
- [x] Rejection deletes the vector and crop while retaining audit metadata.
- [x] Undo creates a compensating event.
- [x] The gallery has exactly one pipeline write path, `ReIDCandidateStage` →
      `create_review_candidate` (`tests/contracts/test_gallery_write_path.py`).
- [x] The per-(identity, orientation) cap counts pending, auto-verified, and verified rows and
      engages against Postgres
      (`tests/pipeline/stages/test_reid_candidate_stage.py::test_cap_counts_pending_and_verified_rows`,
      `test_count_gallery_entries_defaults_to_pending_and_verified`).
- [x] A calibrated confidence at or above `auto_verify_min_confidence` mints `auto_verified`; raw
      (uncalibrated) confidence never does (fail-closed)
      (`tests/unit/tracking/test_candidate_minting.py`).
- [x] `auto_verified` votes at its configured trust multiplier and never trips the non-voting-state
      backstop counter (`tests/unit/tracking/test_gallery_scoring.py::test_trust_multiplier_by_state`,
      `tests/unit/tracking/test_identity_resolver_multiview.py::test_auto_verified_votes_at_1_5_no_backstop`).
- [x] Demote, and undo-of-approve-from-`auto_verified`, both restore the correct prior state, proven
      against both repository peers
      (`tests/storage/test_gallery_state_parity.py::TestAutoVerifiedLifecycle`,
      `tests/integration/test_gallery_state_parity_postgres.py`).

## Related pages

- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)

