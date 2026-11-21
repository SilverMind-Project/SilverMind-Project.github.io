# Identity authority and Unknown

Status: accepted architecture decision, June 19, 2026.

This decision defines which evidence may assign a household identity to a PH. It favors a visible
Unknown state when evidence cannot resolve a conflict safely.

::: info Implementation status
The authority order is accepted. The independent-evidence clock, 30-second prior, calibrated
ArcFace authority, and final duplicate-active enforcement are now deployed with identity provenance fields.
The calibration toolchain is deployed: `calibrated_confidence` is populated from a versioned
artifact when one is present and version-compatible; the service returns `calibrated_confidence: null`
in `degraded_missing`, `degraded_incompatible`, or `degraded_invalid` states.
The evidence clock gate is identity-matched: it advances only when the frame's evidence names the
PH's own committed identity, not merely when any evidence is present in the frame. The `authority`
field on every identity decision is a bounded vocabulary naming the authority-ladder rung that
decided the frame, never a raw identity id.
The [identity integrity baseline](/features/continuous-tracking/identity-integrity) lists historical behavior.
:::

## Decision

Identity authority follows this order:

1. An operator correction inside its explicit observation-bounded range.
2. Direct ArcFace evidence with unambiguous face-to-observation association, compatible model and
   preprocessing versions, and calibrated confidence above the authority threshold.
3. A PH posterior supported by version-compatible ReID gallery entries, either operator-verified
   (full trust) or auto-verified (a calibrated high-confidence match, machine-minted at a reduced
   trust).
4. A temporal prior no older than 30 seconds from the last independent qualifying evidence.

Raw ArcFace cosine similarity, propagated face hints, height, pending or rejected ReID entries, and
PH-local appearance prototypes may support tracking or corroborate evidence. They cannot create an
effective identity.

::: info Amended decision (2026-07-18)
ReID gallery entries are pending, auto-verified, operator-verified, or rejected. Only auto-verified
and operator-verified entries vote; operator review outranks auto-verification (an operator can
approve, relabel, reject, or demote an auto-verified row at any time). This amends the original
three-state text of this decision. See
[ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance)
for the full state machine.
:::

A verified-ReID vote is same-wardrobe-window evidence by construction: a hard 12-hour vote-age
cutoff excludes any gallery entry older than that from every resolver
query and the tracker's disagreement probe, so rung 3 above never rests on yesterday's clothing.

## Resolve conflicts as Unknown

When material evidence conflicts and the authority order does not resolve the conflict, the
effective identity is `Unknown`. Unknown is an explicit decision with provenance, not a missing
default.

This rule keeps an uncertain frame visible for review without presenting a confident identity
swap to a caregiver.

A qualifying first `direct_face` commit out of Unknown can also backfill the PH's preceding
Unknown history. A backfilled label carries `range_authority=inferred`,
is subordinate to any operator range over the same window, and is reversible: undoing it is a
matter of restoring the relabelled rows, not overwriting a trusted human decision, because nothing
non-NULL was ever changed. See
[Unknown-segment backfill](/features/continuous-tracking/identity-integrity/revision-projections#unknown-segment-backfill)
for the trigger, range, and rollout detail.

## Keep an independent evidence clock

The identity prior is measured from the last independent qualifying evidence. Resolver evaluation
time, persistence time, and ordinary identity update time are separate timestamps.

Evidence age is measured from the capture time of the newest contributing face. For a face seen in
the current frame (or a ReID vote) that is the current round. A face template, which several faces
of one track form and which the person-ID service matches in the background, is as old as its
newest member face, even when it is applied a few seconds later, so a late template never extends
the 30-second window. The clock never moves backwards for an identity the PH already holds.

The clock gate is identity-matched, not presence-only: it advances only when a frame carries a
direct recognized ArcFace anchor whose person matches the PH's committed identity, or a ReID vote
whose top candidate matches that identity. Evidence for a different, unrelated identity appearing
in the same frame never refreshes the clock, even though a likelihood distribution's smoothing
mass may technically assign that identity a nonzero probability. Checking for evidence presence
alone, without confirming the evidence names the held identity, was a defect (an incumbent
identity could renew its own clock from a bystander's face); the gate now requires an explicit
identity match.

The following inputs do not refresh the independent-evidence clock:

- prior-only maintenance;
- height;
- propagated face evidence;
- an ordinary PH persistence write;
- evidence that identifies a different person than the one currently held.

Verified ReID may refresh the clock only after it clears PH confidence, margin, quality, version,
and conflict gates.

## Enforce one active holder

At most one open global PH may hold a household identity. Several same-time camera observations may
update that PH after cross-camera deduplication.

When active contenders claim one identity:

- retain one winner only when its independent evidence is clearly stronger;
- set every other contender to `Unknown`;
- set every contender to `Unknown` when the evidence is effectively tied;
- persist conflict provenance and increment the invariant metric.

The occupancy check includes open incumbent PHs that were not observed in the current frame.
Shadow comparison may help tune a threshold, but the accepted invariant is authoritative.

## ArcFace authority requirements

ArcFace authority requires all of the following:

| Requirement | Reason |
| --- | --- |
| Direct evidence | A propagated hint cannot prove which body owns the face |
| Unambiguous association | The face must be attached to one observation |
| `calibrated_confidence` | Raw cosine similarity is not a probability |
| Compatible artifact | Model profile and preprocessing changes invalidate old calibration |
| Authority threshold | Recognition state alone does not grant authority |

`recognized`, `candidate`, and `unrecognized` may remain as raw-threshold compatibility states.
They do not replace the authority decision.

ArcFace enrollment remains a separate golden dataset. PH inference, identity correction, and ReID
review never enroll a face automatically.

## Face quality weighting

A recognized face's weight in the posterior depends on how trustworthy that image is, not only on
how similar it is to an enrolled face. The person-ID service scores each face's image quality
(resolution, sharpness, detection score, pitch), and the tracker carries the score on the face
anchor as `face_quality`, separately from `quality`, the evidence-path weight (1.0 for a face seen
in this frame, attenuated for propagated evidence, the assertion's own quality for external
evidence).

`resolver.face_quality_mode` decides whether the score is used:

| Mode | Live decision | Measurement |
| --- | --- | --- |
| `off` | `quality` only | none |
| `shadow` (default in `settings.yaml`) | `quality` only | a quality-weighted evaluation counts each disagreement in `cts_identity_shadow_mismatch_total{feature="face_quality"}` and logs `face_quality_shadow_mismatch` |
| `enabled` | `quality` times `face_quality` | none |

Quality comes only from the service. A face the service did not score is treated as quality 0.5
(`resolver.face_quality_missing_default`), never 1.0, once the mode is not `off`, so an unmeasured
face never outranks a measured good one. External evidence is not discounted twice. Face quality
does not grant or remove ArcFace authority, which still requires a calibrated confidence. Flip to
`enabled` only after reviewed shadow mismatches show the quality-weighted decision moves a correct
commit to Unknown no more often than it removes a wrong one.

## How faces are weighed

One setting, `face_id.evidence_policy`, decides both which recognized faces the tracker emits and
how the resolver weighs them, so emission and weighting cannot disagree.

| Policy | Faces emitted | Weight of a recognized face |
| --- | --- | --- |
| `legacy` | Recognized faces at or above `face_id.min_raw_similarity` (0.6), or the camera's own floor when one is set | `_p_face`, an uncalibrated heuristic of raw similarity and quality |
| `shadow` (default in `settings.yaml`) | As `legacy` for every live decision | As `legacy`, plus a calibrated decision measured alongside |
| `calibrated` | Every recognized face, unless the camera sets a floor | Its calibrated confidence; a face without one is capped and only corroborates |

Under `calibrated`, the calibrated confidence is used directly as the face's likelihood: it is
already a probability that the face belongs to that resident, and face quality is one of its
fitted features, so neither `_p_face` nor face quality is applied again. Frontality (head yaw)
still scales it, because yaw is not a calibration feature.

A recognized face without a calibrated confidence weighs at most
`resolver.uncalibrated_face_max_likelihood` (0.55). That covers a resident outside the
calibration artifact's coverage (anyone with too few holdout faces at fit time, or enrolled after
the fit), propagated evidence, and external assertions. Such a face is corroboration only: it can
tip a posterior that ReID or a calibrated face already supports, but it never commits an Unknown
PH, never switches a held identity, and never refreshes the independent-evidence clock. Candidate
faces follow the same rule under `calibrated`. The cap alone would not be enough: a single 0.55
face still lifts a one-resident posterior to 0.96, so the evidence rule is the guarantee.

Under `shadow`, a recognized face below the legacy floor is emitted only to the measurement: it
never reaches association, the gallery, authority, the evidence clock, or duplicate ranking. For
every PH with a recognized face, the resolver decides the frame as `calibrated` would and counts
the outcome in `cts_face_shadow_outcomes_total`:

| Outcome | Meaning |
| --- | --- |
| `agrees` | Both policies decide the same identity (or both Unknown) |
| `would_commit_new` | Live leaves the PH Unknown; calibrated names someone |
| `would_change_identity` | The two policies name different residents |
| `would_become_unknown` | Live names a resident; calibrated leaves the PH Unknown |

Each disagreement is also logged as `calibrated_face_shadow_mismatch` with the PH id, which is
what the keyframe review uses. `would_become_unknown` is expected for residents outside the
artifact's coverage: their faces stop establishing identity on their own.

The shadow decides each frame from the live PH state, and under `shadow` the live
independent-evidence clock is still refreshed by uncalibrated faces. A held identity therefore
stays inside its maintenance window in the shadow too, while after a flip it would expire 30
seconds after its last calibrated face or ReID vote. The outcome counts are a lower bound on the
Unknown-rate cost; a replay under `calibrated` measures the rest.

## Face templates

A person walking past a camera gives many small faces that are weak one at a time; a seated
person gives a few good ones. With `face_templates.mode` on, the tracker keeps the best faces seen
on each person (up to 8, for 15 seconds) and asks the person-ID service to match them together as
one template. The service averages the faces' embeddings, weighted by face quality, and reports a
recognition state, a raw similarity, and a calibrated confidence from its own `template`
calibration artifact. A single-face calibration is never applied to a template.

| Rule | Why |
| --- | --- |
| A template is weighed as calibrated evidence under every evidence policy | Averaging several faces raises raw similarity, so single-face raw thresholds do not apply |
| Without a template calibration it is capped at 0.55 and only corroborates | Raw template similarity is not a probability |
| It grants `direct_face` authority only when every member face the service recognized on its own names the same resident | A template mixing two people's faces must not decide on its own |
| It never enters association, the contradiction check, the duplicate-guard bypass, or face propagation | It describes several frames, not one face in this frame |
| Only faces attributed to the person join, and a face unlike the others is rejected | An overlapping neighbour's face or an association swap must not be averaged in |
| A merge, split, correction, identity change, or purge drops the faces and any template computed before it | The faces may belong to someone else now |

The setting ships `off`. In `shadow`, templates are matched and the decision with them is counted
in `cts_face_template_shadow_outcomes_total` without changing any live decision. Embeddings stay in
the tracker's memory and are never logged or stored.

## How evidence is combined

The identity resolver evaluates an ordered sequence of evidence channels (`FaceChannel`,
`GalleryChannel`, and `HeightChannel`) and combines them with the temporal prior through
`combine_channels`. Each channel emits a likelihood distribution, a support multiplier, and the
newest capture time (`evidence_at`) for any identity it is allowed to refresh on the evidence
clock.

| Channel | Source | Support multiplier | Refreshes evidence clock |
| --- | --- | --- | --- |
| `face` | Direct, template, propagated, and spatially matched external face anchors | `resolver.face_weight_multiplier` (3.0) | Yes, only for grades that allow clock refresh |
| `gallery` | Verified ReID gallery entries (`operator_verified`, `auto_verified`) within 12 hours | 1.0 | Yes, when top match clears 0.3 |
| `height` | Enrolled height profiles (currently uniform when no height estimates exist) | `resolver.height_weight_multiplier` (1.5) | No |
| `wearable` | Accepted wearable-to-PH localization associations when `wearable.mode == "enabled"` | `1.0` (power-weighted `p ** 2.0` over full support) | Yes, using physical `newest_fix_at` |
| `closed_world` | Household presence and spatially separated incumbent elimination when `closed_world.mode == "enabled"` and `roster_complete` is true | `1.0` (prior shaping only; `counts_as_commit_evidence = False`) | No |

Governance for every evidence grade lives in one registry (`EvidenceGrade`):

| Grade | Authority | Clock refresh | Duplicate guard | Association and dedup | Attachment precedence |
| --- | --- | --- | --- | --- | --- |
| `native_frame` | Yes (when calibrated) | Yes | Yes (ranks and bypasses) | Yes | 2 |
| `native_template` | Yes (calibrated, agreeing members) | Yes (uses newest member time) | No | No | 2 |
| `cc_assertion` | No | No | No | No | 1 |
| `wearable` | No | Yes (uses `newest_fix_at`) | Ranks only (no incumbent bypass) | No | N/A (separate channel) |
| `closed_world` | No | No (`counts_as_commit_evidence = False`) | No | No | N/A (separate channel) |

When a native face anchor and an external assertion anchor land on the same detection, the higher
attachment precedence wins and the overlap is counted in `cts_face_anchor_grade_overlap_total`;
`cts_face_anchor_duplicate_detection_total` counts only same-grade collisions.

## Closed-world prior shaping

In a small household, physical facts narrow who an unidentified person can be: someone reported away
is less likely to be standing in the living room, and someone currently confirmed in the kitchen is
less likely to be the adult seen at the same second in a separate bedroom. `ClosedWorldChannel`
turns those two physical constraints into bounded prior-shaping factors (`away_factor = 0.3` for
high-confidence `away` members without a fresh non-parked wearable fix in the last 10 minutes, and
`occupied_factor = 0.2` for an identity held by another simultaneously observed, spatially distinct
open PH with fresh non-room-wearable evidence).

Three structural safeguards keep closed-world reasoning from inventing identities:

- **Priors only, never commits alone.** The `CLOSED_WORLD` grade sets
  `counts_as_commit_evidence = False` and `refreshes_evidence_clock = False`. Even if every other
  household member is away or occupied, an Unknown PH with no sensory face, ReID, or wearable
  evidence stays Unknown.
- **Roster completeness gate.** Cognitive Companion publishes household presence and
  `roster_complete` on `cc.household_presence` on any change and every 60 seconds, failing closed
  (`roster_complete = false`) if the face service is unreachable. When `roster_complete` is false,
  the channel returns an empty distribution and increments
  `cts_closed_world_inactive_total{reason="roster_incomplete"}`. Presence snapshots older than
  180 seconds treat every member as unknown.
- **Explicit guest slot and spatial separation.** Normalized `UNKNOWN` probability never drops
  below `closed_world.guest_floor` (`0.10`), rising to `closed_world.guest_floor_visitors`
  (`0.30`) whenever Cognitive Companion reports visitors present (an active named guest or a
  surfaced visitor cluster seen in the last hour). Joint elimination fires only when both PHs were
  observed within `1.0 s` (never coasting) and are proven spatially distinct (calibrated floor
  distance at least `2.0 m` with no active `CoPresenceLink`, or different rooms whose cameras share
  no overlap group).

`closed_world.mode` defaults to `shadow`, recording `cts_closed_world_shadow_outcomes_total`
(`would_name_unknown`, `would_change`, `agrees`) and
`cts_identity_shadow_mismatch_total{feature="closed_world"}` without altering live decisions.

## Authority vocabulary

Every identity decision carries an `authority` field naming which rung of the authority order
decided it. `authority` is a bounded vocabulary, never a raw identity id or name:

| `authority` | Meaning |
| --- | --- |
| `operator` | An operator correction decided the frame, inside its explicit range. |
| `direct_face` | Calibrated, unambiguous ArcFace evidence cleared the authority threshold. |
| `posterior` | The PH's Bayesian posterior over verified ReID evidence decided the frame. |
| `temporal_prior` | The bounded temporal prior held the identity with no new independent evidence this frame. |
| `none` | No authority decided an identity this frame (conflict, demotion, or no PH identity). |
| `reid_gallery` | Reserved for a future governed-gallery authority rung; not yet emitted. |
| `unknown`, `height_proxy` | Legacy members kept for backward compatibility; the current resolver never emits either. |

A card or API response never renders an `authority` value as a person's name. `decision_source`
(which evidence type led the frame) is a related but distinct field; the two are not
interchangeable, and consumers must branch on `authority` for authority questions and never infer authority from `decision_source`.

## Operational consequences

- An increase in Unknown is acceptable during a safe rollout and must be measured.
- Raw inference stays immutable; corrections change the effective projection.
- Resolver releases require reviewed two-person replay coverage.
- A duplicate-active invariant violation blocks release even when card-level output appears stable.

## Review checklist

- [ ] Non-authoritative evidence cannot create an effective identity.
- [ ] Only independent, identity-matched qualifying evidence advances the evidence clock; evidence
      for a different identity never does, even if present in the same frame.
- [ ] Unresolved conflict becomes `Unknown`.
- [ ] Active occupancy includes incumbents outside the current frame.
- [ ] Raw similarity is never displayed as calibrated confidence.
- [ ] `authority` is always a member of the bounded vocabulary above, never an identity id; the
      repository boundary rejects out-of-vocabulary values.

## Related pages

- [Wearable identity evidence](/features/continuous-tracking/identity-integrity/wearable-evidence)
- [ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)
- [Face confidence calibration](/development/face-confidence-calibration)

