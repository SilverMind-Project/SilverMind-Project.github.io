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
interchangeable, and consumers must branch on `authority` for authority questions rather than
inferring authority from `decision_source`.

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

- [ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)
- [Face confidence calibration](/development/face-confidence-calibration)

