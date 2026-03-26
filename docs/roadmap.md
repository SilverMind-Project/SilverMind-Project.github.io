# Roadmap

Proposed features and integration pathways for future development. We welcome community input. If you're interested in working on any of these, [open an issue](https://github.com/SilverMind-Project/cognitive-companion/issues) to discuss your approach.

## ~~Home Assistant Webhook Triggers~~ :white_check_mark:

**Status:** Implemented

Rules can now be triggered via `POST /api/v1/webhooks/{rule_id}` with an `X-Webhook-Secret` header. Secrets are generated per-rule via `POST /api/v1/webhooks/{rule_id}/generate-secret` and validated with HMAC constant-time comparison. The JSON request body becomes `pipeline_data["trigger_input"]` for downstream steps.

See [API Reference: Webhooks](/api/reference#webhooks) for details.

## ~~Enhanced Pipeline Triggers with Input Parameters~~ :white_check_mark:

**Status:** Implemented

`TriggerContext` now includes a `webhook_payload` field. Webhook payloads and manual trigger parameters are available in `pipeline_data["trigger_input"]` for downstream steps to reference.

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
