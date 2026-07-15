# Identity data reset

The reset script removes all derived CTS and Cognitive Companion tracking state
from a development environment while preserving household configuration and
ArcFace enrollments. Use it to start a fresh identity-learning cycle without
rebuilding the stack.

## When to use this

Run the reset when:

- Accumulated test frames have produced a polluted ReID gallery.
- An identity was misassigned over many sessions and needs to be cleared, not corrected.
- You want a clean baseline before running a private golden replay dataset.
- You changed camera geometry or enrollment images and need the derived pipeline to re-learn.

The reset is intentionally destructive for derived data. There is no restore path. After the
reset, the system relearns identity from new frames through normal operation.

## Prerequisites

- `CTS_ENV=development` is set in your shell.
- Docker Compose is running and `cts-orchestrator` appears in `docker ps`.
- You are inside the `continuous-tracking` project directory.
- The Python venv is activated (`tracking-orchestrator/.venv/bin/python`) or accessible.
- The following environment variables are set: `DATABASE_URL` (CTS), `POSTGRES_HOST`,
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (Cognitive Companion), `MINIO_ENDPOINT_URL`,
  `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, and `MINIO_SECURE`.

The CC variables describe the Cognitive Companion database, which is separate from CTS on the
same PostgreSQL host. With the standard compose stack they are `POSTGRES_USER=cc_user`,
`POSTGRES_DB=cognitive_companion`.

When you run the script from the host (not inside a container), set `POSTGRES_HOST=localhost`.
The compose default `postgres` only resolves on the internal Docker network. `MINIO_SECURE`
matches the `minio.secure` setting the orchestrator uses; the script also accepts the older
`MINIO_USE_SSL` name.

`CC_API_KEY` is optional. Set it to a key with `cts.identity.view` access to include the
correction-targets endpoint in the post-apply smoke check. Without it, that probe is skipped and the
auth-free identities-count check remains the authoritative proof that both household members survive.

### Migration head

The script expects the CTS database at migration head `0007_keyframe_read_indexes`. If the
deployed orchestrator image predates the identity-integrity milestones, some allowlisted tables
will not exist yet. The script does not fail in that case: it operates only on tables that exist
and lists the absent ones under `cts_delete_tables_missing` in the report. Treat a non-empty
`cts_delete_tables_missing` as a signal that the stack is behind, not as an error.

After you rebuild the orchestrator to head `0007`, run the orphan-FK integration test
(`pytest tests/test_reset_identity_dev_data.py -m integration`) once before the first full apply.
The foreign-key safety check can only validate tables that exist, so the full allowlist is verified
only after every table is present.

## Dry run

The default mode is dry run. No data is deleted. The script prints before-counts
for all tables and MinIO prefixes.

```bash
CTS_ENV=development ./scripts/reset-identity-dev-data.sh
```

Review the JSON output. Confirm that:

- `preserved_pre_counts` shows the expected `identities`, `cameras`, and `streams` counts.
- `cts_pre_counts` and `cc_pre_counts` reflect only derived rows you expect to delete.
- `cts_delete_tables_missing` is empty (or the absences match a stack you know is behind).
- `minio.reid-candidates/` and `minio.reid-candidates-frames/` list only crop objects.

## Apply

Applying the reset requires the exact confirmation phrase. Pass it on the command line:

```bash
CTS_ENV=development ./scripts/reset-identity-dev-data.sh \
    --apply \
    --confirm "RESET DEVELOPMENT IDENTITY DATA"
```

To also clear Redis tracking streams (`tracking.revisions` and `cc.identity_assertions`),
add the Redis flags:

```bash
CTS_ENV=development ./scripts/reset-identity-dev-data.sh \
    --apply \
    --confirm "RESET DEVELOPMENT IDENTITY DATA" \
    --include-redis \
    --redis-confirm "RESET REDIS STREAMS"
```

## Write a report to disk

```bash
CTS_ENV=development ./scripts/reset-identity-dev-data.sh \
    --apply \
    --confirm "RESET DEVELOPMENT IDENTITY DATA" \
    --report /tmp/reset-report.json
```

The report contains per-table before/after counts, MinIO prefix object counts,
and the smoke-check result. Credentials are redacted before writing.

## Verification

After applying, the script runs a smoke check automatically and prints the result.
To verify manually:

1. **Gallery empty**: open the ReID gallery tab in the dashboard. No candidates appear.
2. **Identities intact**: the correction-targets panel lists both household members.
3. **No active hypotheses**: the live view shows no tracked persons until new frames arrive.
4. **Raw frames survive**: open any keyframe from before the reset. The underlying
   `frames/...` object is still present in MinIO.
5. **Enrollments intact**: the person-identification-service health endpoint reports
   the expected enrolled-member count.

## What is preserved

| Category | Tables and objects |
| --- | --- |
| Household identity registry | `identities` |
| Camera topology | `cameras`, `streams`, `camera_topology_edges` |
| CC household config | `household_members`, `rooms`, `cts_cameras`, `cts_camera_overlap_groups`, `room_zones`, `household_settings`, `sensors`, all rule/pipeline/quiz/knowledge tables |
| ArcFace enrollments | `members`, `embeddings`, `centroids` in the person-identification-service database |
| Raw frames | All `frames/...` objects in MinIO |

## What is deleted

| Category | Tables and objects |
| --- | --- |
| CTS derived tracking | `person_hypotheses`, `world_observations`, `person_trajectories`, `room_dwells`, `co_presence_links` |
| Keyframe metadata | `tagged_keyframes`, `keyframe_bbox_annotations` |
| Revision history | `ph_revisions`, `ph_merges` |
| Signal and gait | `dementia_signals`, `agitation_windows`, `gait_bouts`, `gait_daily` |
| Identity decisions | `identity_decisions`, `identity_evidence_items`, `identity_decision_gallery_hits` |
| Corrections and jobs | `identity_corrections`, `identity_revision_ranges`, `identity_revision_jobs`, `identity_projection_acks` |
| ReID gallery | `reid_gallery`, `gallery_review_events` |
| ReID crop objects | `reid-candidates/...` and `reid-candidates-frames/...` in MinIO |
| CC derived state | `person_location_history`, `person_location_state`, `location_observations`, `presence_segments`, `room_occupancy_state`, `person_sightings`, `person_activities`, `transit_zones`, `cts_dementia_signals`, `cts_identity_revision_log` |
| Redis (optional) | `tracking.revisions`, `cc.identity_assertions` streams |

## Troubleshooting

**`CTS_ENV is not set` or `reset is development-only`**: export `CTS_ENV=development` before
running the script.

**`cts-orchestrator not running`**: start the stack with `docker compose up -d` from the
`continuous-tracking/` directory.

**Orphan FK violation**: the script detected a table that references a delete-target but
is not in the allowlist. This indicates a schema change that the reset script does not yet
account for. File an issue and do not proceed until the allowlist is updated.

**`cts_delete_tables_missing` is non-empty**: the database is behind the migration head, so
some allowlisted tables do not exist yet. The reset still runs against the tables that exist.
To reset the full set, rebuild the orchestrator image and let it migrate to
`0007_keyframe_read_indexes`, then re-run.

**Smoke check `overall_ok: false`**: one or more services did not report healthy after the
reset. Check the `smoke_check` block in the JSON output for which assertion failed, then
inspect the relevant service logs.

**MinIO objects not deleted (`failed > 0`)**: the reset completed for the database but some
crop objects could not be removed. Re-run the script (it is idempotent). The database state
is consistent; missing objects are reported, not fatal.

## Recovery

There is no automated restore path. The reset is designed for development environments only
and has no backfill. To recover specific household data:

- Household members and enrollments: re-run the enrollment flow.
- Room and camera configuration: already preserved.
- Identity decisions: re-accumulate through normal frame processing.

If the reset was run in error against a database with useful data, restore from a database
snapshot taken before the reset.

## Related guides

- [Identity integrity verification](./identity-integrity-verification.md)
- [Private identity replay dataset](./private-identity-replay.md)
- [Face confidence calibration](./face-confidence-calibration.md)
