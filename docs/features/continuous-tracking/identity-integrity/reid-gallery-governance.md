# ReID gallery governance

Status: accepted architecture decision, June 19, 2026.

This decision defines how a body-appearance embedding becomes reviewed identity evidence. It keeps
tracking appearance, ArcFace enrollment, and labeled ReID data in separate stores with separate
trust rules.

::: info Implementation status
The current `reid_gallery` has a `face_confirmed` field but no persisted lifecycle state or durable
crop provenance. The three-state lifecycle on this page is implemented by the governed-gallery
milestone. Existing rows enter `pending_review`; they are not treated as verified.
:::

## Use three states

Every `reid_gallery` entry has one state.

| State | Resolver vote | Retention |
| --- | --- | --- |
| `pending_review` | Never | Keep vector, crop, and provenance for review |
| `operator_verified` | Eligible when versions match | Keep vector, crop, provenance, and review event |
| `rejected` | Never | Delete vector and dedicated crop; keep audit metadata and fingerprint |

Only `operator_verified` entries may reach resolver queries or caches.

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
| Approve | Promote the proposal to `operator_verified` |
| Relabel | Record the old proposal and corrected identity, then promote |
| Reject | Record the reason and fingerprint, then delete the vector and crop |
| Undo | Add a compensating event; keep the original review event |

Identity correction and gallery verification are separate actions. Correcting a bbox does not
promote its embedding. A crop that fails a quality gate cannot be approved through an override.

## Weight verified evidence

Verified hits receive a trust multiplier of `2.0` before identity aggregation. The multiplier does
not change cosine similarity.

Recency uses exponential decay with a seven-day half-life and no floor:

```text
recency_factor = 2 ** (-(age_days / 7))
```

Queries use only entries with compatible model and preprocessing versions. Near-duplicate votes
are capped or clustered by source episode, camera, and orientation. Decision provenance records
the entry IDs, raw similarities, trust multipliers, recency factors, and weighted contributions.

## Keep learning boundaries explicit

- ArcFace enrollment is the golden face dataset.
- PH `gallery_mean` and view prototypes are inferred tracking state.
- ReID review data is a separate governed dataset.
- Identity correction does not add an enrollment or gallery sample.
- A rejected crop is deleted without erasing the audit event.

## Review checklist

- [ ] Pending and rejected entries are excluded at repository and cache boundaries.
- [ ] Every candidate points to an immutable frame and crop.
- [ ] Direct face identity equals the candidate label.
- [ ] Model and preprocessing partitions are enforced.
- [ ] Rejection deletes the vector and crop while retaining audit metadata.
- [ ] Undo creates a compensating event.

## Related pages

- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)

