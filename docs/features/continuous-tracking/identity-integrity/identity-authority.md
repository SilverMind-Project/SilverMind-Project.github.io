# Identity authority and Unknown

Status: accepted architecture decision, June 19, 2026.

This decision defines which evidence may assign a household identity to a PH. It favors a visible
Unknown state when evidence cannot resolve a conflict safely.

::: info Implementation status
The authority order is accepted. The independent-evidence clock, 30-second prior, calibrated
ArcFace authority, and final duplicate-active enforcement are implemented by later milestones.
The [identity integrity baseline](/features/continuous-tracking/identity-integrity) lists current
behavior.
:::

## Decision

Identity authority follows this order:

1. An operator correction inside its explicit observation-bounded range.
2. Direct ArcFace evidence with unambiguous face-to-observation association, compatible model and
   preprocessing versions, and calibrated confidence above the authority threshold.
3. A PH posterior supported by operator-verified, version-compatible ReID entries.
4. A temporal prior no older than 30 seconds from the last independent qualifying evidence.

Raw ArcFace cosine similarity, propagated face hints, height, pending or rejected ReID entries, and
PH-local appearance prototypes may support tracking or corroborate evidence. They cannot create an
effective identity.

## Resolve conflicts as Unknown

When material evidence conflicts and the authority order does not resolve the conflict, the
effective identity is `Unknown`. Unknown is an explicit decision with provenance, not a missing
default.

This rule keeps an uncertain frame visible for review without presenting a confident identity
swap to a caregiver.

## Keep an independent evidence clock

The identity prior is measured from the last independent qualifying evidence. Resolver evaluation
time, persistence time, and ordinary identity update time are separate timestamps.

The following inputs do not refresh the independent-evidence clock:

- prior-only maintenance;
- height;
- propagated face evidence;
- an ordinary PH persistence write.

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

## Operational consequences

- An increase in Unknown is acceptable during a safe rollout and must be measured.
- Raw inference stays immutable; corrections change the effective projection.
- Resolver releases require reviewed two-person replay coverage.
- A duplicate-active invariant violation blocks release even when card-level output appears stable.

## Review checklist

- [ ] Non-authoritative evidence cannot create an effective identity.
- [ ] Only independent qualifying evidence advances the evidence clock.
- [ ] Unresolved conflict becomes `Unknown`.
- [ ] Active occupancy includes incumbents outside the current frame.
- [ ] Raw similarity is never displayed as calibrated confidence.

## Related pages

- [ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance)
- [Identity revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)

