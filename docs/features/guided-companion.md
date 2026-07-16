# Guided Companion

The Guided Companion walks a resident through a routine one small step at a time. It is built for dementia care, where effective help is continuous and in small bites: one instruction, then a wait for the resident to finish that step before the next. The canonical routine is making tea.

Unlike a one-shot reminder, a guided session is long-lived and stateful. It holds its place across interruptions, speaks to the resident in her own language through the realtime voice agent, advances only when she confirms a step, and notifies the caregiver when she is stuck.

The Guided Companion is also a working answer to the hardest question in deploying autonomous agents: how much authority to give the model. Here the split is explicit. The voice agent handles the conversation; deterministic code owns advancement, escalation, and safety; and every session writes an auditable event timeline a caregiver can review. The same pattern generalizes to any setting where an agent acts around people who depend on it.

## Mental model: deterministic spine, agent per turn

A guided session is a deterministic state machine over a linear list of steps.

- The **code** owns the journey: which step is current, the attempt count, timeouts, and the decision to advance, retry, skip, escalate, or abandon.
- The **live voice agent** owns the conversation within a step: it speaks in the resident's language and proposes "step done" by calling a tool.
- The state machine validates that proposal before advancing.

The agent never owns advancement, escalation, or safety. Those are code decisions, which keeps the experience predictable and auditable for a vulnerable user while staying natural in the moment.

```text
Rule fires guided_task_start
        │
        ▼
Presence gate ── resident not present ──► summon (speaker / popup), recheck
        │ present at a surface with a live session
        ▼
State machine: enter step 0 ──► agent speaks the step in Tamil
        │                              │
        │   resident confirms          │ resident confused / stuck
        ▼                              ▼
mark_guided_step_complete       repeat_guided_step / request_caregiver_help
        │                              │
        ▼                              ▼
advance / complete             retry, then notify caregiver
```

## Routines and steps

A routine is a linear script owned by one household member. The data model lives in `backend/models/guided_task.py`.

| Model | Purpose |
| ----- | ------- |
| `Routine` | The script: name, owning `person_id`, enabled flag, and optional policy overrides (language and voice, step timeout, max attempts, resume grace, escalation and summon channels). |
| `RoutineStep` | One ordered step: `ord`, a prompt template, the completion gate, an optional skip condition, an optional minimum duration (for timed steps such as steeping), and per-step timeout and attempt overrides. |
| `GuidedSession` | One run: routine, person, status, current step, attempts, timestamps, and the companion surface. |
| `GuidedSessionEvent` | The auditable timeline: step entered, completed, skipped, retried, escalated, and so on. This is the metrics source and the caregiver audit trail. |

Routines are linear with an optional skip-ahead. A step may declare a skip condition that jumps forward (for example, "the kettle is already hot"), but there is no arbitrary branching. This matches the "one thing at a time" pacing and makes a session easy to resume after an interruption.

### Configuration precedence

Every timing and policy value resolves most-specific-first: a per-step override, then a per-routine override, then the global default in `settings.yaml`. A `null` override inherits the next level up. This lets a single long step (letting the tea steep) carry a longer timeout than the rest of the routine without changing the global default.

```yaml
guided_task:
  max_step_attempts: 3        # rephrase twice before escalating
  step_timeout_s: 300         # time within one step attempt
  resume_grace_s: 600         # how long a paused session waits for her return
  transcript_retention_days: 30
  escalation_channels: ["telegram", "pwa_popup_text"]
  summon_channels: ["ha_speaker_tts", "pwa_popup_text"]
  rephrase_via: "agent"
```

## Completion: the response gate

A step advances on the resident's response by default. The agent listens, and when she tells it (or later, shows it) that she has done the step, it calls `mark_guided_step_complete`. The completion evaluator confirms the proposal, and the state machine advances.

Reliable fine-grained computer vision does not exist for every step, so the conversation is the dependable gate. A step may additionally require a vision confirm (see below) or an activity or zone signal, but the response gate is always present so a step can always advance on her confirmation. Vision is never the sole gate.

## Vision-confirm gates (callable gate graphs)

A step can carry an optional vision-confirm gate that checks, from the cameras, whether the step looks done. Rather than a single fixed model call, a vision gate is authored and run like a small pipeline: a reusable graph of read-only perception and reasoning steps that ends on exactly one verdict.

- **A gate is a callable graph.** It is stored as a rule with no triggers (so it never fires on its own) and is referenced from a routine step. Because it reuses the normal pipeline canvas and steps, a gate can be as simple as "poll the cameras, ask one vision model, decide" or a cheap-first cascade ("detect the kettle cheaply, and only run the heavy vision model when one is present"). Only side-effect-free steps are allowed in a gate, so it can run often and safely.
- **One verdict, fail-closed.** The graph ends on a single `gate_verdict` step that produces `{complete, confidence, reason}`. If the verdict is not reached, cannot be parsed, or the confidence is below the configured threshold, the result is `complete = false`. The confidence threshold is one setting, overridable per step or per routine; raising it makes the gate stricter.
- **Two profiles: Confirm and Watch.** The same graph runs in two modes. **Confirm** is the heavy, authoritative check that runs when the resident says she is done. **Watch** is a cheap, advisory check on a background tick; it is off by default. When on, Watch suppresses unnecessary nagging while she is clearly making progress and warms the verdict cache. Watch can optionally advance a step on its own, but only after several consecutive high-confidence readings, only when a caregiver opts in, and never on a safety-critical step.
- **Bounded disagreement.** The conversation stays authoritative. If the resident says she is done but the vision gate disagrees, the companion records the disagreement; after a small number of disagreements it defers to her word and advances (or escalates, if configured) rather than trapping her behind a camera that will not agree.
- **One camera control, both sources.** Cameras are resolved once through the selection cascade, which spans both the continuous-tracking cameras and the reCamera sensors, and are injected into the gate. There is a single camera picker on the step; leaving it empty auto-selects.
- **Preset first, canvas for power users.** A caregiver normally picks a vision gate from a small preset library (for example a generic vision confirm, or the kettle-on-hob cascade) without ever seeing a graph. A power user can open the gate in a scoped canvas to edit its logic and test-run it.

## Presence gating and summoning

A routine must not talk to an empty room. When a rule starts a routine through the `guided_task_start` step, the service checks where the resident is using the continuous-tracking presence data and the companion surface registry:

- If she is in a room with an enabled companion surface and a live voice session, the session begins immediately.
- Otherwise the session enters a `summoning` state and announces over the configured summon channels (a room speaker or an on-screen popup) to draw her to the surface, then rechecks.
- If she does not arrive within the summon timeout, the session is abandoned with a `summon_timeout` outcome and the owning pipeline resumes so the rule can take a fallback path.

When a realtime voice session opens (she walks up and taps the mic), the companion immediately rechecks any summoning sessions so the start feels instant. The scheduled recheck remains the robust fallback.

### Companion surfaces

A companion surface is a tablet, speaker, or display that the resident interacts with. Surfaces are first class so presence gating knows where each one is.

- A fixed surface has a stable room.
- A movable tablet's room is caregiver-set and treated as authoritative, because a human moves it deliberately. A continuous-tracking cross-check flags a stale setting (`room_mismatch`) rather than silently overwriting the caregiver's value. Auto-inference only fills the room when no human ever set it.

Surfaces are managed through `GET/POST/PATCH /api/v1/companion-surfaces`, with a device-key `POST /api/v1/companion-surfaces/{id}/heartbeat` that the room kiosk calls.

## Agent tools

The voice agent drives the per-turn conversation through a small set of MCP tools. Each is thin and calls the guided-task service; the agent proposes, the code decides.

| Tool | Purpose |
| ---- | ------- |
| `get_active_guided_step` | Return the current step descriptor (step number, total, prompt text). |
| `mark_guided_step_complete` | Propose that the resident finished a step. Takes the `step_ord` being confirmed so a repeated call for an already-advanced step is ignored instead of skipping the next step. |
| `repeat_guided_step` | Re-read the current step in simpler words without changing state. |
| `report_step_blocked` | Record that the resident appears stuck. |
| `request_caregiver_help` | Escalate to the caregiver. |

These tools are added to the `mcp.gemini_tools` allowlist in `settings.yaml`. They mirror the quiz tools, reusing the same prompt-injection and pipeline-park-and-resume primitives in `backend/services/interactive_session/`.

## Language and voice

Language is configurable per resident and per routine, overriding the global default (Chennai Tamil, Tanglish, or simple English). The coach persona is configured in `config/knowledge_voice.yaml` under `guided_task_default`, not hardcoded. The agent speaks the resident's language; any vision reasoning happens in English. Translation is left to the agent, never done in code.

## Escalation and the caregiver safety net

The companion never leaves the resident without help. Within a step the agent rephrases and retries up to the attempt cap. When the cap is reached, or when she asks for help, the caregiver is notified over the configured escalation channels with context: the routine name, the current instruction, and the reason. Emergencies add a Home Assistant speaker announcement.

The escalation message is sent through the existing notification dispatcher, so it reaches the same channels as other alerts (Telegram, on-screen popup, and so on).

## Privacy and retention

The companion stores transcripts (through the conversation manager), step events, and outcomes. It does not store raw audio. Events and transcripts are pruned after `guided_task.transcript_retention_days` (default 30). Caregiver interventions are spoken in the same agent voice and are never surfaced to the resident as "a human", while every turn is attributed internally for a full caregiver audit trail.

## What ships and what comes later

The conversational core is shippable today: a rule can run a routine end to end, the agent speaks each step in Tamil, the resident confirms, the state machine advances, and a request for help notifies the caregiver.

Layered on top of that spine are spatial grounding (sub-room zones), vision-confirm completion as callable gate graphs with Confirm and Watch profiles, a continuous safety watch (abandonment, hazard-left-active, possible fall, repeated confusion), live caregiver takeover, the caregiver Routine Builder UI, metrics, and the always-on kiosk. These are assists behind clean interfaces, so the conversational spine works and is testable independently of any of them.
