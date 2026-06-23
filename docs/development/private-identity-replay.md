# Private identity replay dataset

A private replay dataset lets you replay recorded household scenarios through
the CTS tracking pipeline to verify that the system identifies the right person,
handles edge cases correctly, and does not regress after algorithm changes.

## Why replay testing matters

The tracking pipeline makes identity decisions that affect how care signals are
generated and attributed. A unit test cannot verify that the full pipeline
correctly identifies a person walking between two cameras, or that a prior
entry expiry is handled without producing a ghost PH. Replay datasets fill
that gap.

Because the dataset contains images of real household members, it cannot be
committed to the repository. The manifest schema, synthetic example, and test
harness are committed. The actual household images and populated manifests
stay on the developer's local machine.

## Required replay cases

A production-ready private dataset must cover:

- Both persons visible with clear frontal faces.
- Both visible with one person profile or back-facing.
- Crossings and partial occlusion between two persons.
- Seated and standing arrangement from a confirmed misidentification incident.
- Camera overlap zone and transition between cameras.
- Face absent, weak ReID confidence, and prior expiry.
- Frames with explicit Unknown persons (visitors, new entrants).
- Duplicate PersonHypothesis candidates for the same person.
- Bad geometry, high covariance, and appearance outliers.
- Operator correction examples and handoff boundary frames.

## Directory structure

```text
tracking-orchestrator/tests/private_identity_replay/
  manifest.py          # Pydantic manifest model (committed)
  loader.py            # Loader and leakage validator (committed)
  test_harness.py      # pytest harness (committed; skips when data absent)
  example/
    manifest.json      # Synthetic fictional example (committed)
    README.md
  data/                # git-ignored; place household datasets here
    <dataset-name>/
      manifest.json    # Populated manifest (git-ignored)
      frames/          # Raw frames (git-ignored)
```

## Creating a manifest

1. Copy `example/manifest.json` as a starting template.
2. Replace the fictional identities with real `identity_id` values from the
   `identities` table in the CTS database.
3. For each episode, record:
   - The `camera_id` matching the `cameras.camera_id` column.
   - The `frame_index` within the episode sequence.
   - The sha256 hex digest of the raw frame JPEG bytes (`sha256sum <file>`).
   - Bounding boxes in pixel coordinates (top-left origin, width, height).
   - The `identity_id` for each annotated bbox, or leave `identity_ids` empty
     and set `has_explicit_unknown: true` for visitor frames.
4. Assign each episode to a `split`: `train`, `val`, or `test`. The same
   household members may appear across all splits, but no raw frame
   (identified by its sha256) may appear in more than one split (the loader
   enforces this).

### Split assignment guidelines

| Split | Use for |
| --- | --- |
| `train` | Routine, clean scenarios; both persons clearly visible |
| `val` | Edge cases used for threshold tuning |
| `test` | Held-out scenarios; never used for tuning |

## Validation

Run the loader against your manifest before using it in tests:

```bash
python -c "
from pathlib import Path
from tests.private_identity_replay.loader import load_manifest
m = load_manifest(Path('tests/private_identity_replay/data/<dataset-name>/manifest.json'), require_hashes=True)
print(f'loaded {len(m.episodes)} episodes, {len(m.identities)} identities')
"
```

The loader rejects:

- Missing or empty sha256 fields (with `require_hashes=True`).
- Invalid label values or bboxes with zero width or height.
- Overlapping frame indices within a single episode.
- Frame sha256 leakage across train/val/test splits (same captured frame in two splits).
- Episodes that reference identity IDs not declared in the manifest header.

## Running the test harness

```bash
# From tracking-orchestrator/ with the venv active:
pytest tests/private_identity_replay/test_harness.py -v
```

When private data is absent, all parametrized private-data tests skip with
a clear message pointing to this guide. The synthetic example tests always run.

When private data is present at `tests/private_identity_replay/data/`, the
harness validates all manifests found there and runs scenario-level assertions.

## Privacy boundaries

These patterns are git-ignored in `continuous-tracking/.gitignore`:

| Pattern | Reason |
| --- | --- |
| `tests/private_identity_replay/data/` | All household frames and populated manifests |
| `**/*.households.json` | Any file with a `.households.json` suffix |
| `tests/private_identity_replay/**/*.jpg` and similar | Household image files |
| `tests/private_identity_replay/**/*.npy` and similar | Embedding and calibration arrays |
| `**/reset-report*.json` | Generated reset reports (may contain object keys) |

Never commit household images, embeddings, calibration arrays, or populated
manifests. Verify with `git check-ignore -v <path>` before staging.

## After a development reset

Running `reset-identity-dev-data.sh` clears the ReID gallery and all derived
tracking state. Replay data is unaffected because it lives on disk, not in the
database. After the reset, running the test harness exercises the pipeline
against a clean gallery, which is the intended starting state for replay.

## Related guides

- [Identity data reset](./identity-data-reset.md)
- [Face confidence calibration](./face-confidence-calibration.md)
- [Identity integrity verification](./identity-integrity-verification.md)
