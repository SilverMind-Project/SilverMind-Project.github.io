# API Reference

All endpoints are under `/api/v1`. Endpoints require authentication unless the route uses a documented device key or webhook secret flow.

Authentication is resolved from API keys, device keys, or route-specific secrets. Authorization uses permission patterns from `config/auth.yaml`.

## Execution observability

Use `GET /workflows/{execution_id}/detail` for inspection. Use `/pipeline/runs` for lightweight live lists and dashboards.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/workflows` | List executions with optional `rule_id`, `status`, and `limit` filters |
| `GET` | `/workflows/{execution_id}` | Return raw execution data and `pipeline_data_json` |
| `GET` | `/workflows/{execution_id}/detail` | Return the canonical execution inspector model |
| `POST` | `/workflows/{execution_id}/cancel` | Cancel a running or waiting execution |
| `POST` | `/workflows/{execution_id}/rerun` | Start a new execution from the original trigger |
| `GET` | `/pipeline/runs` | List recent runs. `status=active` returns running and waiting runs |
| `GET` | `/pipeline/runs/{execution_id}` | Return one lightweight run envelope |
| `GET` | `/pipeline/ingest/activity` | Return recent frame and rule-trigger activity |
| `WS` | `/ws/pipeline` | Stream live execution events |

### Execution detail fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | integer | Workflow execution ID |
| `rule_id` | integer | Rule that ran |
| `status` | string | `running`, `waiting`, `completed`, `failed`, or `cancelled` |
| `started_at` | datetime or null | Start time |
| `completed_at` | datetime or null | Completion time |
| `rule_name` | string | Rule display name |
| `trigger_type` | string | Trigger type from the execution payload |
| `trigger_summary` | string | Server-computed trigger summary |
| `graph` | object or null | Immutable graph snapshot captured at execution start |
| `timeline` | list | Step timeline, including skipped graph nodes |
| `cooloff_triggered` | boolean | Whether the run consumed the rule cool-off window |
| `error` | string or null | Execution error |
| `can_cancel` | boolean | Whether cancel is available |
| `can_rerun` | boolean | Whether rerun is available |

### Pipeline run fields

| Field | Type | Description |
| --- | --- | --- |
| `execution_id` | integer | Workflow execution ID |
| `rule_id` | integer | Rule ID |
| `rule_name` | string | Rule display name |
| `status` | string | Execution status |
| `started_at` | datetime | Start time |
| `completed_at` | datetime or null | Completion time |
| `error` | string or null | Error summary |
| `nodes` | list | DAG nodes with `id`, `label`, `step_type`, and `status` |
| `edges` | list | DAG edges with source and target handles |

## Rules

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/rules` | List rules with recent execution counts |
| `POST` | `/rules` | Create a rule |
| `GET` | `/rules/{rule_id}` | Get a rule with steps, contexts, dependencies, and cron triggers |
| `PUT` | `/rules/{rule_id}` | Update a rule |
| `DELETE` | `/rules/{rule_id}` | Delete a rule and related executions |
| `POST` | `/rules/{rule_id}/execute` | Manually trigger a rule |
| `GET` | `/rules/{rule_id}/export` | Export a portable rule bundle |
| `POST` | `/rules/import/preview` | Validate an import bundle |
| `POST` | `/rules/import` | Import a bundle |

### Rule fields

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Rule name |
| `description` | string or null | Optional description |
| `enabled` | boolean | Whether the rule can run |
| `trigger_types` | list[string] | Trigger types: `sensor_event`, `cron`, `manual`, `webhook`, `telegram`, `occupancy_duration`, `cts_window`, `dementia_signal` |
| `cron_trigger_ids` | list[integer] | Shared cron schedules linked to the rule |
| `primary_sensor_id` | string or null | Fallback sensor for context and manual media lookup |
| `cool_off_minutes` | integer | Minimum time between completed cool-off-worthy runs |
| `max_daily_triggers` | integer | Daily execution cap |
| `max_concurrent_executions` | integer | Concurrent execution cap |
| `execution_timeout_minutes` | integer | Execution timeout |
| `webhook_config` | object or null | Webhook secret and settings |
| `occupancy_config` | object or null | Occupancy duration settings |
| `telegram_trigger_config` | object or null | Telegram command settings |

## Pipeline authoring

Pipelines are directed graphs. `order` is a deterministic tiebreaker, not the runtime sequence.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/rules/{rule_id}/steps` | List steps |
| `POST` | `/rules/{rule_id}/steps` | Add a step |
| `PUT` | `/rules/{rule_id}/steps/{step_id}` | Update a step |
| `DELETE` | `/rules/{rule_id}/steps/{step_id}` | Delete a step |
| `PUT` | `/rules/{rule_id}/steps/positions` | Batch update canvas positions |
| `GET` | `/rules/{rule_id}/edges` | List graph edges |
| `PUT` | `/rules/{rule_id}/edges` | Replace all graph edges atomically |
| `POST` | `/rules/{rule_id}/validate` | Validate templates and graph structure |

### Pipeline step fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | integer | Step ID |
| `rule_id` | integer | Parent rule ID |
| `order` | integer | Stable ordering and graph tiebreaker |
| `step_type` | string | Registered step type |
| `label` | string or null | Slug label used by template references |
| `config_json` | object | Step-specific configuration |
| `enabled` | boolean | Whether the step can run |
| `position_x` | number | Canvas x-coordinate |
| `position_y` | number | Canvas y-coordinate |

### Pipeline edge fields

| Field | Type | Description |
| --- | --- | --- |
| `source_step_id` | integer | Source step |
| `source_port` | string | Source output port. Defaults to `main` |
| `target_step_id` | integer | Target step |
| `target_port` | string | Target input port. Defaults to `main` |

The validator rejects unknown step IDs, unknown ports, invalid graph structure, and duplicate outgoing edges for the same source port.

## Pipeline metadata

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/pipeline/step-types` | Registered step types with schemas, UI hints, output schemas, tags, and output ports |
| `GET` | `/pipeline/channel-types` | Registered notification channel types |
| `GET` | `/pipeline/filter-types` | Registered context filter types |
| `GET` | `/pipeline/llm-models` | Named LLM registry entries |
| `GET` | `/pipeline/data-keys` | Template autocomplete variables and step output schemas |
| `POST` | `/pipeline/cron/preview` | Validate a cron expression and preview next runs |

## Contexts, dependencies, and cron

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/rules/{rule_id}/contexts` | List context filters |
| `POST` | `/rules/{rule_id}/contexts` | Add a context filter |
| `DELETE` | `/rules/{rule_id}/contexts/{context_id}` | Delete a context filter |
| `GET` | `/rules/{rule_id}/dependencies` | List dependencies |
| `POST` | `/rules/{rule_id}/dependencies` | Add a dependency |
| `DELETE` | `/rules/{rule_id}/dependencies/{dependency_id}` | Delete a dependency |
| `GET` | `/cron-triggers` | List cron triggers |
| `POST` | `/cron-triggers` | Create a cron trigger |
| `PUT` | `/cron-triggers/{trigger_id}` | Update a cron trigger |
| `DELETE` | `/cron-triggers/{trigger_id}` | Delete a cron trigger |

## Rooms and sensors

| Resource | Endpoints |
| --- | --- |
| Rooms | `GET /rooms`, `POST /rooms`, `PUT /rooms/{id}`, `DELETE /rooms/{id}` |
| Sensors | `GET /sensors`, `POST /sensors`, `PUT /sensors/{id}`, `DELETE /sensors/{id}` |
| Home Assistant sync | `POST /ha/sync/rooms`, `POST /ha/sync/sensors`, `GET /ha/entities`, `GET /ha/media-players` |

## People and presence

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/persons` | List household members |
| `POST` | `/persons` | Create a member |
| `GET` | `/persons/{person_id}` | Get member details |
| `PATCH` | `/persons/{person_id}` | Update a member |
| `DELETE` | `/persons/{person_id}` | Delete a member |
| `POST` | `/persons/{person_id}/enroll` | Upload face enrollment photos |
| `GET` | `/persons/{person_id}/enrollment` | Get enrollment status |
| `DELETE` | `/persons/{person_id}/enrollment` | Delete enrollment |
| `GET` | `/persons/locations` | Current location envelopes for all tracked members |
| `GET` | `/persons/{person_id}/location` | Current location envelope for one member |
| `GET` | `/persons/{person_id}/presence-history` | Presence history |
| `GET` | `/rooms/{room_id}/occupants` | Current room occupants |
| `GET` | `/persons/{person_id}/dwell` | Dwell summary |

## CTS endpoints

CTS routes cover camera admin, calibration, PH identity review, presence, signals, trajectories, live data, overlap groups, and CTS window triggers. They require CTS enablement and the appropriate API permissions.

Representative paths include:

| Path | Purpose |
| --- | --- |
| `/cts/cameras` | CTS camera registration and health |
| `/cts/calibration/*` | Homography, visibility, privacy zones, and adjacency |
| `/cts/ph/*` | Person hypothesis lists, details, corrections, merges, splits, and deletes |
| `/cts/identity/correction-targets` | Active household members an operator may assign, with optional gallery decoration |
| `/cts/identity/corrections/*` | Shared correction workflow: propose, apply, compensate, and job status |
| `/cts/keyframes` | Grouped physical-frame keyframe cards with effective identity per bbox |
| `/cts/presence/*` | Presence configuration and snapshots |
| `/cts/signals/*` | Dementia and routine-change signals |
| `/cts/window-triggers` | CTS window trigger configuration |
| `/cts/decisions/*` | Decision detail and explicit provenance retrieval |
| `/cts/evidence/*` | Evidence history and diagnostics retrieval by PH, observation, or keyframe |

### Grouped keyframes

`GET /api/v1/cts/keyframes` returns one card per physical source frame, even when several Person
Hypotheses triggered sampling of the same frame. Each card carries every visible bounding box with
its server-computed effective identity, so a frame that shows two people returns two identities
rather than only the identity of the PH that triggered the capture.

The orchestrator owns identity semantics. The card summary, Unknown count, and conflict count are
derived once at the BFF from the per-bbox provenance; the browser computes none of them. Effective
identity maps onto Cognitive Companion's internal `person_id` at the BFF boundary.

| Field | Type | Description |
| --- | --- | --- |
| `keyframes` | array | Physical-frame cards for the page |
| `keyframes[].physical_frame_id` | string | Deterministic ID from `(camera_id, minio_key, captured_at)` |
| `keyframes[].image_url` | string or null | Presigned URL for the raw frame, resolved per request |
| `keyframes[].triggers` | array | Audit trigger rows (`keyframe_id`, `ph_id`, `tag_reason`) |
| `keyframes[].identity_summary` | array | Effective identities on the card with `count` and `source_badges` |
| `keyframes[].unknown_count` | integer | Bounding boxes with no effective identity |
| `keyframes[].conflict_count` | integer | Bounding boxes in identity conflict |
| `keyframes[].pending_review_count` | integer | Bounding boxes whose PH has a pending ReID candidate |
| `keyframes[].bboxes` | array | Every deduplicated bbox with `inferred_identity_id`, `effective_identity_id`, `person_id`, `authority`, `decision_source`, `calibrated_confidence`, `conflict`, `revision_id`, and `pending_review` |
| `count` | integer | Cards on this page |
| `total` | integer | Cards matching the filters before pagination |
| `truncated` | boolean | True when the upstream scan hit its window cap, so `total` counts only the most recent window |

Server-side query parameters: `person_id` (effective household identity), `camera_id`, `tag_reason`,
`after`, `before`, `explicit_unknown`, `authority`, `decision_source`, `conflict_only`,
`pending_review_only`, `limit`, and `offset`. Filters apply before grouped-frame pagination; a
matching frame still returns all of its bboxes for context. A malformed upstream envelope returns
`502` with code `keyframe.upstream_contract` rather than an empty list. Requires
`cts.keyframes.view`. The `list_keyframe_frames` MCP tool reads the same service function.

### Identity correction workflow

A correction runs in two steps. The client first requests a segment proposal, then applies an
explicit observation-bounded correction guarded by the proposal version token. The correction
service writes the revision range, creates a projection job, and publishes one revision. A job
completes only after every required projection acknowledges the same `revision_id`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/internal/corrections/propose` | Return an advisory segment proposal and its version token |
| `POST` | `/internal/corrections/apply` | Apply a frame or observation-bounded correction, or an explicit Unknown |
| `POST` | `/internal/corrections/{correction_id}/compensate` | Undo a correction with a compensating revision |
| `POST` | `/internal/projection-acks` | Acknowledge a projection by `revision_id` |

`apply` returns `409` when the version token is stale and `422` when a non-Unknown correction has no
target identity. The whole-PH `POST /internal/corrections` endpoint is deprecated: it proposes the
current segment and applies it, and is removed once the correction UI calls the explicit `apply`
endpoint. The endpoint returns a `Deprecation` response header while it remains.

The Cognitive Companion BFF exposes the browser-facing side of this workflow. Both the Keyframes
surface and the Person Hypothesis inspector call it through one service and one Vue component.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/cts/identity/corrections/propose` | Return a segment proposal with its version token |
| `POST` | `/api/v1/cts/identity/corrections/apply` | Apply a frame or observation-bounded correction, or explicit Unknown |
| `POST` | `/api/v1/cts/identity/corrections/{correction_id}/compensate` | Undo a correction with a compensating revision |
| `GET` | `/api/v1/cts/identity/corrections/jobs/{revision_id}` | Projection-job status, polled until terminal |

The BFF injects the audited actor from the authentication context; the apply request schema rejects a
browser-supplied actor. It preserves the upstream `409 correction.stale_version` and `422` statuses
and maps an upstream 5xx to `502 correction.upstream`. Proposing and reading job status require
`cts.identity.view`; applying and compensating require `cts.identity.correct`. The job response
includes `status` (`pending`, `applying`, `completed`, or `failed`), `required_projections`,
`row_counts`, `attempts`, and `last_error`. The `propose_identity_correction` and
`get_identity_correction_job` MCP tools read the same service functions.

## Knowledge and resident content

| Resource | Representative endpoints |
| --- | --- |
| Knowledge documents | `POST /knowledge`, `GET /knowledge`, `GET /knowledge/{doc_id}`, `PATCH /knowledge/{doc_id}`, approval, archive, restore, delete, re-embed |
| Knowledge images | `POST /knowledge/{doc_id}/images`, `PATCH /knowledge/{doc_id}/images/{img_id}`, `DELETE /knowledge/{doc_id}/images/{img_id}` |
| Info cards | CRUD, approve, archive, restore, suggest, and slot update endpoints under `/info-cards` |
| Interactions | `GET /knowledge-interactions/queries`, `/quiz-sessions`, and `/info-card-deliveries` |

## Webhooks

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/webhooks/{rule_id}` | Trigger a rule with the configured webhook secret |
| `POST` | `/webhooks/{rule_id}/generate-secret` | Generate or rotate the rule webhook secret |

Webhook requests use `X-Webhook-Secret`. The JSON body is available to the pipeline as `trigger_input`.

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid operation for the resource state |
| `401` | Missing or invalid authentication |
| `403` | Authenticated key lacks permission |
| `404` | Resource not found |
| `409` | Conflict, such as a duplicate rule name or step label |
| `422` | Validation error, including template or graph validation failures |
| `503` | Required service unavailable |

## Related pages

- [Architecture](/guide/architecture)
- [Composable Pipelines](/features/pipeline)
- [Extending the Pipeline](/development/extending-pipeline)
