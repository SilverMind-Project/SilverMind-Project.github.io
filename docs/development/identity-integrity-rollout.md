# Identity integrity rollout

Use this guide to take the identity authority model from accepted architecture to enabled behavior
in a development instance, prove it prevents authoritative identity swaps, measure the resulting
Unknown rate honestly, and keep an emergency path to disable learned voting without restoring unsafe
legacy behavior.

::: info Implementation status
The rollout machinery (replay gate, metrics, page-now alerts, and the emergency disable path)
is delivered. The two-person golden acceptance run and the production flag flip are operator-gated:
they require the private replay dataset and a running stack, so they happen in a separate, recorded
change. Do not read this page as a record that authoritative voting is deployed.
:::

## When to use this

Read this before enabling the identity authority gates together, before flipping
`world.enable_reid_disagreement_cost`, or when an identity-integrity alert pages. It assumes the
[identity authority](/features/continuous-tracking/identity-integrity/identity-authority),
[ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance),
and [revision projections](/features/continuous-tracking/identity-integrity/revision-projections)
decisions, and the [contract matrix](/features/continuous-tracking/identity-integrity/contracts).

## Release policy

An authoritative identity swap in any reviewed two-person replay scenario blocks rollout. An
authoritative swap is a bounding box whose authority is an operator correction or a qualifying
calibrated direct ArcFace recognition whose household identity flips between adjacent authoritative
frames without an intervening operator correction. Sub-threshold, ReID, and temporal-prior wobble
are not swaps, and an operator correction that deliberately changes identity is not a swap.

A higher `Unknown` rate is acceptable at first. It must be measured and reported, never hidden by
lowering the confidence, margin, quality, or conflict thresholds. Lowering a threshold to suppress
Unknown is a release-blocking change, not a fix.

## What is already enabled

Most authority gates landed and run in earlier milestones. The rollout verifies them together rather
than flipping them for the first time.

| Gate | Setting | State |
| --- | --- | --- |
| Resolver quality gate | `resolver.enable_quality_gate` | On |
| Duplicate active identity guard | `resolver.enable_duplicate_active_identity_guard` | On |
| Sticky maintenance | `resolver.enable_sticky_maintenance` | On |
| Appearance outlier rejection | `world.enable_appearance_outlier_rejection` | On |
| Covariance validation | `world.enable_covariance_validation` | On |
| Governed gallery voting | enforced in SQL (`state = 'operator_verified'`) | On |
| Multiview-gallery shadow compare | `resolver.multiview_shadow_sample_rate` (`config/settings.yaml`, default `0.0`) | Off; a nonzero fraction runs the shadow comparison for measurement only, no output change |
| Coherence-boost shadow compare | `coherence_shadow_sample_rate` on `ResolverConfig` (default `0.0`; not yet exposed as a `settings.yaml` key) | Off; same measurement-only shadow pattern |
| Governed candidate creation | `reid_candidates.enabled` (`config/settings.yaml`, default `true`) | On, fail-closed: `require_calibrated_face: true` rejects every candidate until a calibration artifact is deployed |

## Verified-ReID association cost

`world.enable_reid_disagreement_cost` stays `false`. The plumbing is complete: when the flag is
true, the world tracker resolves each observation's identity from the operator-verified gallery
before association and passes it in, so a body whose verified-ReID identity disagrees with a
person hypothesis's committed identity pays `world.reid_disagreement_cost`. While the flag is false
the pre-association gallery lookup does not run, so association behavior is unchanged and no extra
per-frame gallery query is issued.

Flip this flag only after the two-person golden acceptance run passes with the flag on, because the
flip turns on the per-observation gallery lookup on the hot path. The flag is left off here so the
rollout note does not claim a behavior that has not cleared acceptance.

## Run the replay gate

The release gate reads effective identity through the correction overlay, never the stored decision
column, so an operator correction changes the verdict. The synthetic gate runs without a database or
private data:

```bash
cd continuous-tracking
tracking-orchestrator/.venv/bin/python -m pytest \
  tracking-orchestrator/tests/integration/test_identity_replay_evaluator.py \
  tracking-orchestrator/tests/integration/test_identity_replay_two_person.py -v
```

The evaluator reports the authoritative-swap count (the gate), the Unknown rate and Unknown
durations, fragmentation, duplicate-active frames, correction-boundary accuracy, and source
attribution completeness. The gate passes when the authoritative-swap count is zero.

The full two-person acceptance over the private golden dataset is operator-local. Place the dataset
as described in the [private identity replay guide](/development/private-identity-replay); the
harness skips with an explicit reason when the data is absent. Never commit private frames,
embeddings, populated manifests, or object keys.

## Metrics

Identity-integrity metrics live in two registries: the orchestrator exposes them at `GET /metrics`,
and Cognitive Companion exposes the projection metrics. Labels are bounded; person hypothesis,
decision, and identity IDs stay in structured logs, never in labels.

| Metric | Meaning |
| --- | --- |
| `cts_identity_unknown_after_known_total` | Person hypotheses that lost a known identity to Unknown |
| `cts_identity_duplicate_active_blocks_total` | New assignments demoted by the duplicate-active guard |
| `cts_identity_duplicate_active_breach_total` | Invariant breach: one identity held by more than one active PH. Stays zero |
| `cts_reid_rejected_vector_vote_attempts_total` | Non-verified gallery vectors that reached the vote. Stays zero |
| `cts_identity_prior_only_updates_total` | Temporal-prior maintenance updates |
| `cts_identity_prior_only_evidence_advance_total` | Invariant breach: a prior-only decision advanced evidence time. Stays zero |
| `cts_worldtracker_association_rejections_total` | Gated association pairs by reason |
| `cts_correction_projection_lag_seconds` | Seconds from a revision to its CC projection |
| `cts_correction_projection_failures_total` | Projection applies or acks that failed |
| `cts_reid_candidate_rejected_total{reason}` | Governed candidates `ReIDCandidateStage` rejected, by bounded reason (for example `calibration_not_authoritative`) |
| `cts_identity_shadow_mismatch_total{feature}` | Shadow-versus-live decision disagreement, by shadowed feature (`multiview_gallery`, coherence boost). Stays low; a sustained rise means the shadowed config would change production decisions if enabled |

Build a dashboard, without paging thresholds at first, for the Unknown rate and durations, the
conflict distribution, association rejection and batch skew, the review-queue age and action rates,
and the resolver authority mix. Define thresholds only after a representative baseline.

## Alerts

Four conditions page immediately because each is an authority-safety invariant whose value must stay
zero (projection failures must stay below the retry objective). The rules are in
`tracking-orchestrator/app/observability/alerts/identity_integrity_alerts.yml`; load them through
`rule_files` in `prometheus.yml`.

| Alert | Fires when |
| --- | --- |
| `IdentityDuplicateAuthoritativeAfterCommit` | A household identity is held by more than one active PH after commit |
| `RejectedVectorParticipatedInVote` | A non operator-verified gallery vector reached the resolver vote |
| `PriorOnlyAdvancedEvidenceTime` | A prior-only decision advanced independent identity evidence time |
| `CorrectionProjectionFailuresBeyondRetry` | Correction projections fail past the retry objective |

## Rollout steps

1. Run the repository checks and the replay gate. Record results with the
   [verification guide](/development/identity-integrity-verification).
2. Start the development stack, apply migrations, and run the
   [identity data reset](/development/identity-data-reset) so the gallery starts empty and derived
   state is clean.
3. Confirm both household identities resolve, calibration health is reported, and the gallery is
   empty before processing frames.
4. Process the two-person golden replay and confirm the authoritative-swap count is zero. Record the
   Unknown rate and durations as the baseline.
5. Load the alert rules and confirm each fires against a synthetic series in a staging Prometheus.
6. Enable the authority gates together in one reviewed configuration change. Keep shadow metrics for
   comparison and threshold tuning.

## Emergency disable

Disable learned voting first while keeping the safe authority sources:

1. Set `world.enable_reid_disagreement_cost` to `false` if it was enabled.
2. Stop automatic ReID candidate creation and ReID gallery voting.
3. Keep direct calibrated ArcFace authority, operator corrections, provenance, and Unknown behavior.

This returns the system to direct-recognition and operator authority without learned body voting.

## Rollback boundaries

Never roll back to a state the program was built to remove:

- no polluted legacy gallery rows or ungoverned seeding;
- no raw cosine similarity treated as authority;
- no self-refreshing temporal prior;
- no duplicate active identities.

Recovery from a bad rollout is reprocessing future frames under the safe configuration, not
restoring derived rows.

## Related pages

- [Identity integrity architecture](/features/continuous-tracking/identity-integrity)
- [Identity integrity verification](/development/identity-integrity-verification)
- [Identity data reset](/development/identity-data-reset)
- [Private identity replay dataset](/development/private-identity-replay)
