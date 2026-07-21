# Verify an identity integrity change

Use this guide to record evidence that an identity change preserves authority, audit history, wire
compatibility, and private-data boundaries across the three repositories.

## Prerequisites

- The Continuous Tracking, Cognitive Companion, person identification, and documentation
  repositories are available.
- Project virtual environments and locked dependencies are installed.
- Docker is available for tests that use PostgreSQL, Redis, or MinIO-compatible containers.
- The affected [architecture decisions](/features/continuous-tracking/identity-integrity) and
  [contract rows](/features/continuous-tracking/identity-integrity/contracts) have been identified.

## 1. Record the change scope

Create a verification record with these fields:

```text
Change:
Commit or change set:
Date and timezone:
Verifier:
Repositories and branches:
Relevant architecture decisions:
Expected runtime changes:
Expected schema changes:
Expected wire or API changes:
Expected configuration changes:
Explicit exclusions:
```

Record unrelated dirty worktree files before editing. Confirm that private media, captured
embeddings, populated manifests, credentials, and presigned URLs are absent.

## 2. Run repository checks

Run the checks that match the changed surface. Record each command exactly as executed.

```bash
cd continuous-tracking
make check

cd ../cognitive-companion
make check-all

cd ../person-identification-service
uv run ruff check .
uv run mypy app/
uv run pytest

cd ../silvermind-project.github.io
npm run test
npm run docs:build
```

Use this table for results:

| Repository | Command | Result | Passed | Failed | Xfailed | Xpassed | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Continuous Tracking |  |  |  |  |  |  |  |
| Cognitive Companion backend |  |  |  |  |  |  |  |
| Cognitive Companion frontend |  |  |  |  |  |  |  |
| Person identification |  |  |  |  |  |  |  |
| Documentation |  |  |  |  |  |  |  |

A strict xfail must name the change that replaces it with a positive assertion. An unexpected pass
is a failure until the xfail marker is removed.

## 3. Verify migration state

Record:

- CTS migration head before and after;
- Cognitive Companion Alembic head before and after;
- person identification migration head before and after;
- schema qualification for every CTS object;
- up and down behavior, or baseline recreation behavior;
- whether production data was mutated.

Use `not applicable: documentation-only change` when no schema changed.

Every CTS DDL object belongs to `continuous_tracking`. A CTS migration starts with
`SET search_path = continuous_tracking, public;` and schema-qualifies references.

## 4. Verify wire compatibility

For every changed stream or API contract, record:

- protobuf files and new tag numbers;
- generated bindings in CTS and Cognitive Companion;
- producer contract test result;
- consumer contract test result;
- old-reader and new-writer result;
- new-reader and old-writer result;
- compatibility end condition and owner;
- confirmation that Redis values are raw protobuf bytes.

Do not leave a dual-codec reader in place as a compatibility shortcut.

## 5. Record replay and metrics

Use synthetic fixtures for committed tests. A private replay manifest stays local and may be
referenced only by a non-sensitive hash.

| Measurement | Result |
| --- | --- |
| Replay scenarios | `uv run pytest tests/integration/test_unknown_backfill_postgres.py` (backfill) <br/> `uv run pytest tests/test_visitor_store.py -k test_milestone_completion_criterion` (visitor) |
| Identity swaps |  |
| Duplicate-active violations |  |
| Unknown rate and baseline delta |  |
| Failed projection acknowledgements |  |
| Correction projection latency |  |
| Pending, verified, and rejected gallery counts |  |
| Calibration degraded states |  |

An authoritative identity swap in a reviewed two-person replay blocks release. A higher Unknown
rate may be acceptable when it replaces an unsafe confident label, but it must be reported.

## 6. Verify UI states

For a browser-visible change, record desktop and mobile screenshots and check:

- loading, empty, partial, error, forbidden, stale, and retry states;
- keyboard operation and focus restoration;
- identity authority and confidence labels from server fields;
- browser console warnings and errors.

Use `not applicable: no UI change` for backend and documentation changes.

## 7. Write rollback notes

The record must state:

- rollback trigger;
- code or documentation revert;
- flag rollback and expected behavior;
- schema downgrade or compensating migration;
- projection reconciliation by `revision_id`;
- object-retention consequences;
- verification commands after rollback.

Rollback keeps immutable correction and review history. Disabling ReID voting is safer than
restoring unreviewed gallery seeding.

## Troubleshooting

### A Cognitive Companion test cannot start PostgreSQL

The backend test suite uses Docker testcontainers. Confirm Docker is running and that the current
user can access the Docker socket. Do not replace the database fixture with a mock.

### A protobuf test passes in one repository only

Regenerate bindings in both CTS and Cognitive Companion, then rerun producer and consumer contract
tests. Check that new fields use unused tag numbers.

### The documentation build reports a dead link

Use a root-relative VitePress link such as
`/features/continuous-tracking/identity-integrity/contracts`. Do not link to a developer's local
filesystem.

## Completion checklist

- [ ] Relevant architecture review items pass.
- [ ] Every changed contract row names producer, consumer, owner, and compatibility end.
- [ ] Expected tests pass and strict xfails name their removal change.
- [ ] Test counts and migration status are recorded.
- [ ] Metrics, screenshots, and rollback notes are present or marked not applicable.
- [ ] Repository status contains no private or unrelated files.
- [ ] Public documentation describes deployed behavior and labels accepted future behavior.

## Next steps

- [Cross-repository identity contracts](/features/continuous-tracking/identity-integrity/contracts)
- [Identity authority and Unknown](/features/continuous-tracking/identity-integrity/identity-authority)
- [ReID gallery governance](/features/continuous-tracking/identity-integrity/reid-gallery-governance)
