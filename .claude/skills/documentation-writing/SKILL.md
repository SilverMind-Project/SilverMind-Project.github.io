---
name: documentation-writing
description: Write, review, and improve SilverMind Project VitePress documentation, including public product pages, technical guides, feature pages, API references, and page-level layout/style. Use for docs language cleanup, structure revisions, reader journey improvements, and documentation quality reviews.
---

# Documentation Writing Standards

SilverMind documentation has two jobs: help families and care partners understand why Cognitive Companion matters, and help technical readers deploy, operate, or extend it. Write with empathy, precision, and a clear reader journey.

## 1. Start With The Reader

Identify the primary reader before editing:

| Reader | What they need first | What can come later |
| --- | --- | --- |
| Family caregiver | Safety, dignity, privacy, what the system does at home | Architecture, APIs, model names |
| Care partner or health plan | Aging-in-place value, risk signals, caregiver burden, privacy posture | Internal implementation details |
| Operator | Setup path, prerequisites, configuration, verification | Deep internals and extension points |
| Developer | Contracts, files, data flow, extension seams, tests | Product narrative |
| API user | Endpoint behavior, auth, schemas, errors | Architecture background |

Do not force one page to serve every reader at once. If a page mixes overview, task, architecture, and reference material, split it or add clear sections.

Use "care partners", "health plans", "senior-care providers", or "care organizations" for non-family audiences. Do not target fundraising audiences unless the user asks for fundraising material.

## 2. Voice And Tone

Write like professional product and platform documentation: clear, calm, specific, and respectful.

- **Lead with outcomes, then mechanisms.** Say what a capability helps the reader do before naming the services and models behind it.
- **Use direct language.** Prefer short sentences and concrete verbs.
- **Avoid hype.** Do not use "revolutionary", "seamless", "powerful", "incredible", or similar filler.
- **Avoid fear-based messaging.** Senior care copy should be reassuring, not alarmist.
- **Use clinical humility.** Cognitive Companion supports care and caregiver awareness. It does not replace professional judgment or clinical diagnosis.
- **Use American English.** Use `behavior`, `color`, `customize`, and `on-premise` consistently.
- **Avoid first person.** Use "Cognitive Companion" or "the system", not "we".
- **Avoid exclamation marks and em dashes.** Use periods, commas, colons, or separate sentences.
- **Document what exists.** Do not describe planned features as shipped.

### Replace This With That

| Avoid | Use |
| --- | --- |
| "seamlessly integrates with your home" | "connects to Home Assistant over the LAN" |
| "powerful AI insights" | "detects changes in room presence, dwell time, and activity patterns" |
| "keeps your loved one safe" | "helps caregivers notice when a routine changes" |
| "cloud-grade intelligence" | "local inference for vision, language, embeddings, and recognition" |
| "revolutionary value-based care" | "aging-in-place infrastructure for earlier risk signals and lower caregiver burden" |

## 3. Page Types

### Public Overview Pages

Use for the home page and high-level introductions.

Structure:

```markdown
# Outcome-focused title

One or two sentences that explain who the system helps and what changes for them.

## Why it matters

Care context in plain language.

## What it does

Three to five outcome-led capabilities.

## Privacy and trust

Local-first, caregiver review, limits, and clinical humility.

## Where to go next

Family, care partner, operator, and developer paths when relevant.
```

Keep implementation names out of the first screen unless they are essential for trust.

### Guide Pages

Use for tasks such as setup, deployment, configuration, and operation.

Required shape:

```markdown
# Task title

One-sentence outcome.

## Prerequisites

What the reader needs before starting.

## Steps

Numbered steps with commands, expected output, and verification.

## Troubleshooting

Common failure modes and fixes.

## Next steps

Links to related guides or references.
```

Every guide should tell readers how to verify success.

### Feature Pages

Use for capabilities such as pipelines, continuous tracking, voice companion, notifications, and knowledge repository.

Start with:

1. What the feature does.
2. When to use it.
3. What data or services it depends on.
4. A small example or common workflow.
5. Detailed reference sections.

Put architecture diagrams, field tables, and plugin internals after the reader understands the capability.

### Architecture Pages

Use architecture pages to explain boundaries, data flow, ownership, and deployment shape.

Good architecture pages include:

- A short "system at a glance" summary.
- One focused diagram per concept.
- Clear boundaries: what owns data, what publishes events, what consumes events.
- Operational implications: what must be running, what fails closed, what degrades.

Avoid giant all-in-one diagrams unless the page first gives readers a simpler mental model.

### API References

Use references for exact contracts.

- Endpoint tables use: Method, Path, Description.
- Response field tables use: Field, Type, Description, Default when useful.
- List required fields before optional fields.
- Document explicit errors. Do not invent silent fallbacks.
- State auth exceptions explicitly. Otherwise assume endpoints require auth.

## 4. Layout And Scannability

Inner documentation pages should feel lighter than raw implementation notes.

- Use short openings: one to three paragraphs before the first heading.
- Prefer headings that describe reader tasks or concepts, not internal class names.
- Keep paragraphs under five lines in the rendered page.
- Use tables for three or more related fields.
- Use bullets for options, not for long explanations.
- Use numbered steps only for ordered tasks.
- Add "When to use this" near the top of complex feature pages.
- Add "Related pages" or "Next steps" at the end of every substantial page.
- Keep one primary idea per section.

### VitePress Presentation

- Prefer Markdown over inline HTML for normal content.
- Use custom HTML only when the page needs a product-style layout or embedded media.
- Put reusable styling in `.vitepress/theme/custom.css`, not inline `style` attributes.
- Keep custom CSS scoped with page-specific class names.
- Use responsive grids with `minmax()`, `clamp()`, and explicit breakpoints.
- Do not use emoji as the primary visual language for polished public pages.
- Use VitePress custom containers sparingly:

```markdown
::: tip
Use for shortcuts or best practices.
:::

::: warning
Use for prerequisites, gotchas, or potentially destructive behavior.
:::

::: info
Use for non-obvious context.
:::
```

Use `::: danger` only for data-loss, security, or safety-critical warnings.

## 5. Formatting Conventions

### Code Blocks

Always specify a language:

```yaml
cts:
  enabled: true
```

Use `bash` for commands, `python` for Python, `yaml` for configuration, `json` for API payloads, `typescript` for Vue or TS code, and `text` for logs or plain output.

### File Paths And Identifiers

Use backticks for files, directories, config keys, endpoints, class names, and identifiers:

- `config/settings.yaml`
- `backend/routers/rules.py`
- `GET /api/v1/pipeline/step-types`
- `PersonLocationService`

### Links

- Use relative links for internal pages: `[Composable Pipelines](/features/pipeline)`.
- Use full URLs for external links.
- Link meaningful text, not "click here".
- Keep next-step links short and curated.

### Tables

Use tables for reference data. Column order should be predictable:

- Config: Name, Type, Default, Description.
- API fields: Field, Type, Description, Default.
- Endpoints: Method, Path, Description.
- Concepts: Term, Meaning.

## 6. Diagrams

Use Mermaid for documentation diagrams. Do not embed raster images or unreviewable SVGs for architecture/reference content.

| Type | Mermaid directive | Use for |
| --- | --- | --- |
| Data flow | `flowchart TB` or `flowchart LR` | Component relationships and pipelines |
| Sequence | `sequenceDiagram` | Request/response and event order |
| State machine | `stateDiagram-v2` | Presence states and signal lifecycle |
| Entity relationship | `erDiagram` | Database relationships |

Rules:

- One diagram per concept.
- Prefer `LR` for pipelines and `TB` for layered systems.
- Use sentence case labels with no trailing periods.
- Split diagrams that require long wrapped labels.
- Explain the diagram in one paragraph before or after it.

## 7. Accuracy And Verification

Verify claims against the codebase before publishing.

| Claim type | Where to verify |
| --- | --- |
| Step types | `backend/steps/builtin/` and step registry code |
| API endpoints | `backend/routers/` and route registration |
| Config keys | `config/settings.yaml`, `config/*.yaml`, and settings models |
| Models and columns | `backend/models/` and migrations |
| Defaults | Source code and config files |
| Frontend behavior | Vue components and API calls |
| CTS streams and schemas | `continuous-tracking/` proto, transport, and migrations |

Numbers must match across the docs. If a page says "22 step types", grep the docs for every related count before changing it.

Do not expose internal deployment details:

- Internal IP addresses.
- Private hostnames.
- Real-looking secrets.
- Personal machine paths.

Use `example.com`, `llama-server-host:8100`, or descriptive placeholders.

## 8. Language Cleanup Checklist

Remove filler:

| Remove | Better |
| --- | --- |
| "basically", "essentially", "simply" | Delete |
| "really", "very", "just" | Delete unless needed for meaning |
| "it is important to note that" | Delete |
| "as mentioned previously" | Delete |
| "in order to" | "to" |
| "due to the fact that" | "because" |

Prefer verbs over nominalizations:

- "configure" instead of "perform configuration of".
- "decide" instead of "make a decision".
- "describe" instead of "provide a description of".
- "detect" instead of "perform detection of".

Keep terminology consistent:

| Term | Use |
| --- | --- |
| Cognitive Companion | The system as a whole |
| cognitive-companion | The repository or Docker image |
| Continuous Tracking System | Full name on first mention |
| CTS | Abbreviation after first mention |
| PersonHypothesis / PH | World-level tracked-person entity |
| `ph_id` | Single physical-track identifier on the wire |
| PersonLocationService | Source of truth for person location in CC |

## 9. Review Workflow

When reviewing or updating docs:

1. Read the page source and, when layout matters, view the rendered page.
2. Identify the primary reader and job-to-be-done.
3. Move outcome and usage context above implementation details.
4. Split long sections with task-focused headings.
5. Convert long prose lists into tables where appropriate.
6. Verify technical claims against code before changing them.
7. Check links, code fences, terminology, and build output.

If the user asks for a "review", lead with findings ordered by impact. If the user asks to "update" or "apply", make the edits and verify them.

## 10. Publishing Checklist

Before finishing a documentation change:

- [ ] The page has a clear primary reader.
- [ ] The first section explains the outcome before internals.
- [ ] Headings are scannable and task- or concept-oriented.
- [ ] Paragraphs are short in the rendered page.
- [ ] Code blocks have language tags.
- [ ] Tables use consistent column order.
- [ ] Internal links are relative and meaningful.
- [ ] Public copy avoids hype, fear, and fundraising-oriented targeting.
- [ ] Privacy and care claims are accurate and not overstated.
- [ ] Technical claims are verified against source.
- [ ] No internal IPs, hostnames, or secrets appear.
- [ ] New pages are added to `.vitepress/config.mts` when needed.
- [ ] `npm run docs:build` passes.
