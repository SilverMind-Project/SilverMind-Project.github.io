# Roadmap

Proposed features and integration pathways for future development. We welcome community input. If you're interested in working on any of these, [open an issue](https://github.com/SilverMind-Project/cognitive-companion/issues) to discuss your approach.

## Home Assistant Webhook Triggers

**Status:** Proposed

**Problem:** Home Assistant automations can't trigger Cognitive Companion pipelines. Communication is one-way: CC polls HA, never the reverse.

**Design:** Add per-rule `webhook_id` and `webhook_secret` fields. A new `POST /api/v1/webhook/{webhook_id}?secret=...` endpoint would accept a JSON body that becomes `pipeline_data["trigger_input"]`. Webhook endpoints bypass API key auth in favor of per-rule webhook secrets.

**Use cases:**
- HA automation detects a door opening → triggers a camera analysis pipeline
- HA detects bedtime routine started → triggers a medication reminder pipeline
- HA detects unusual energy usage → triggers an investigation pipeline

**Impact:** Enables bidirectional HA integration, turning CC into a first-class HA automation target.

## Enhanced Pipeline Triggers with Input Parameters

**Status:** Proposed

**Problem:** The `trigger_rule` MCP tool and manual execute endpoint accept no input parameters. All context must come from sensor events or pipeline steps.

**Design:** Add `input_params: dict` to `TriggerContext`. Modify `POST /rules/{id}/execute` and the MCP `trigger_rule` tool to accept an `input_params` JSON body. Parameters become available in `pipeline_data["trigger_input"]` for downstream steps.

**Use cases:**
- External AI agent triggers a reminder pipeline with a custom message
- HA webhook passes sensor data as pipeline input
- Manual triggers with pre-filled parameters for testing

## Gemini Live Tool Calling

**Status:** Proposed

**Problem:** The voice agent can only converse. It can't look up information or take actions mid-conversation.

**Design:** Extend `GeminiLiveProvider.build_config()` to include tool definitions built from the MCP registry. Add RAG as a `lookup_knowledge` tool. In the audio session handler, detect `FunctionCall` parts from Gemini responses, route to the appropriate MCP tool or RAG service, and send `FunctionResponse` back.

All execution is client-side, so no public endpoint is needed. The voice agent could:

- "Let me check where grandma is" calls `get_person_locations`, then responds with the result
- "What happened today?" calls `get_event_logs`, then summarizes recent activity
- "Turn off the kitchen lights" calls `trigger_rule`, then confirms the action

**Impact:** Transforms the voice companion from a conversational AI into an agentic assistant.

## Pipeline Templates / Presets

**Status:** Proposed

**Problem:** Creating pipelines from scratch is complex for new users. Each of the 10 step types has its own configuration, and choosing the right combination requires understanding the system.

**Design:** Ship JSON fixtures with preset pipeline definitions:

| Template | Steps |
|----------|-------|
| Camera Alert | person_id → vision → logic → translation → notification |
| Periodic Check | vision → logic → condition → notification |
| Medication Reminder | activity_detection → wait → verification → notification |
| Door Monitor | person_id → condition → notification → ha_action |

A `GET /rules/templates` endpoint lists presets, and `POST /rules/from-template` creates a rule from one. A "Use Template" button in the rule creation dialog would allow one-click setup.

**Impact:** Dramatically lowers the barrier to entry for new users.

## Activity Timeline

**Status:** Proposed

**Problem:** `PersonActivity` records exist but there is no timeline visualization. Caregivers must manually correlate activities, sightings, and alerts.

**Design:**

- Backend: `GET /persons/{id}/timeline?date=YYYY-MM-DD` endpoint merging activities, sightings, and alerts into a unified chronological view
- Frontend: Vuetify `v-timeline` component in the person detail drawer showing the day's events with icons, timestamps, and room information

**Use cases:**
- Caregiver reviews grandma's day at a glance
- Identify patterns (always in kitchen at noon, late medication on Tuesdays)
- Spot anomalies (no activity detected for an unusual period)

**Impact:** Provides the "daily story" that caregivers need to feel confident about their family member's wellbeing.

---

## Contributing to the Roadmap

Have an idea that's not listed here? We'd love to hear it. The best way to propose a new feature is to [open a GitHub issue](https://github.com/SilverMind-Project/cognitive-companion/issues) with:

1. **Problem statement**: what limitation does this address?
2. **Proposed design**: how would you implement it?
3. **Use cases**: who benefits and how?
4. **Impact**: what does this unlock for the project?

We prioritize features that maintain the project's core values: privacy-first, on-premise, composable, and accessible to multigenerational households.
