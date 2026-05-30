# AGENTS.md

Guide for AI coding agents working on the Cognitive Companion documentation site.

## Project overview

This is a VitePress documentation site for the Cognitive Companion project: a privacy-first, on-premise AI system for senior care. The site is deployed to GitHub Pages via GitHub Actions.

**Framework**: VitePress 1.x (Vue 3-based static site generator)
**Content**: Markdown files in `docs/`
**Build**: `npm run docs:build` (output in `docs/.vitepress/dist/`)
**Deploy**: GitHub Actions on push to `main`

## Site structure

```text
docs/
├── .vitepress/
│   ├── config.mts           # VitePress configuration (nav, sidebar, theme)
│   └── theme/
│       ├── index.ts          # Theme entry point
│       └── custom.css        # Custom CSS (brand colors, hover effects)
├── public/
│   └── favicon.svg           # Site favicon/logo
├── index.md                  # Landing page (hero, feature grid)
├── guide/
│   ├── introduction.md       # Project overview, capabilities, tech stack
│   ├── getting-started.md    # Installation and first-run guide
│   ├── deployment.md         # Docker Compose and Kubernetes deployment
│   ├── configuration.md      # settings.yaml, auth.yaml, notifications.yaml
│   └── architecture.md       # System design, data flow, service patterns
├── features/
│   ├── pipeline.md           # Composable pipeline step types, conditions, workflows
│   ├── person-tracking.md    # Face recognition, location tracking, activities
│   ├── continuous-tracking.md           # CTS overview: architecture, Redis streams, DB schema
│   ├── continuous-tracking/
│   │   ├── frame-pipeline.md            # 15-stage frame processing pipeline
│   │   ├── tracking-concepts.md         # Kalman filter, BoT-SORT, PH, cross-camera dedup
│   │   ├── camera-calibration.md        # Homography calibration, privacy zones, adjacency
│   │   ├── dementia-signals.md          # Signal kinds, hysteresis, baseline computation
│   │   └── cc-integration.md           # Enabling CTS, subscribers, rule examples
│   ├── mcp-integration.md    # 39-tool MCP server for AI agent integration
│   ├── voice-companion.md    # Gemini Live voice integration
│   ├── eink-display.md       # E-ink template system and rendering
│   ├── notifications.md      # Multi-channel alert routing and escalation
│   ├── knowledge-repository.md # Info cards, quizzes, RAG knowledge base
│   └── tts-service.md        # TTS microservice integration
├── development/
│   ├── setup.md              # Dev environment setup
│   ├── extending-pipeline.md # How to add new pipeline step types, MCP tools
│   ├── code-standards.md     # Python and Vue coding conventions
│   └── contributing.md       # Contribution guidelines
├── api/
│   └── reference.md          # Full REST API reference (all endpoints, CTS envelopes)
├── hardware/
│   └── index.md              # Supported hardware devices
└── roadmap.md                # Proposed features; delivered items marked with checkmark
```

## Content source

All documentation content is derived from the main Cognitive Companion and Continuous Tracking codebases. The authoritative source for technical details is the code itself.

- **Cognitive Companion codebase**: `../cognitive-companion/`
- **Continuous Tracking codebase**: `../continuous-tracking/`
- **Config files**: `../cognitive-companion/config/`

When updating documentation, verify technical details against the actual codebase. Do not assume documentation is more current than code. For API endpoints, read `backend/routers/`; for step types, read `backend/steps/builtin/`; for default values, read the source.

## Adding new pages

### 1. Create the Markdown file

Add a new `.md` file in the appropriate directory under `docs/`. Use VitePress markdown features:

```markdown
# Page Title

One-sentence description.

## Section

Context paragraph.

### Sub-section

Code block, table, or step-by-step list.
```

### 2. Register in the sidebar

Edit `docs/.vitepress/config.mts` and add the page to the appropriate sidebar section:

```typescript
sidebar: {
  "/guide/": [
    {
      text: "Getting Started",
      items: [
        { text: "Your Page Title", link: "/guide/your-page" },
      ],
    },
  ],
}
```

### 3. Add navigation (if top-level)

For top-level sections, also add a nav entry:

```typescript
nav: [
  { text: "Your Section", link: "/your-section/first-page" },
],
```

## Content guidelines

The `.claude/skills/documentation-writing/SKILL.md` skill is the authoritative writing guide. Key points:

- **Technical but accessible**: assume the reader is a developer but not one familiar with this project.
- **Concrete over abstract**: use code examples, configuration snippets, and architecture diagrams.
- **Action-oriented**: tell the reader what to do, not just what exists.
- **No marketing language**: state capabilities factually.
- **No em-dashes**: use colons, periods, semicolons, or commas. Restructure sentences where needed.
- **No milestone labels in feature descriptions**: write "the cross-camera dedup pass" not "the U1 cross-camera dedup pass". Labels belong in changelogs, not reference docs.
- **Verify tech stack details against the codebase** before updating reference tables.
- **American spelling**: `behavior`, `color`, `customize`.

### Terminology

| Term | Correct usage |
|------|--------------|
| PersonHypothesis / PH | World-level tracked-person entity (not "global track") |
| ph_id | The single physical-track identifier on the wire |
| PersonLocationService | The SSOT for person location in CC |
| `tracking-orchestrator` | The Python ML pipeline service |
| CTS | Continuous Tracking System |

### Structure

- Every page starts with an `# H1` title.
- Use `## H2` for major sections and `### H3` for subsections.
- Include a brief introduction paragraph after the H1.
- Code examples should be complete enough to copy-paste.
- Tables for reference data (endpoints, config fields, step types).
- Link to related pages at the end of each page.

### VitePress features to use

**Custom containers:**

```markdown
::: tip
Helpful hint for the reader.
:::

::: warning
Something to be cautious about.
:::

::: details Click to expand
Hidden details that aren't always needed.
:::
```

**Code blocks with language tags (required):**

````markdown
```yaml
cts:
  enabled: true
```
````

**Internal links (relative paths):**

```markdown
See [Composable Pipelines](/features/pipeline) for details.
```

## Development

### Local preview

```bash
npm install
npm run docs:dev       # Dev server at http://localhost:5173
```

### Build

```bash
npm run docs:build     # Output in docs/.vitepress/dist/
npm run docs:preview   # Preview the built site
```

`npm run docs:build` must pass before marking any documentation change complete. A broken internal link or missing sidebar entry is a build failure.

### Deployment

The site deploys automatically via GitHub Actions on push to `main`. No manual deployment is needed.

## Do NOT

- **Invent technical details**: verify against the actual codebase before documenting.
- **Duplicate content** across pages: link to the authoritative page instead.
- **Add raster images or SVG diagrams**: use Mermaid for all diagrams.
- **Use em-dashes**: use colons, commas, semicolons, or separate sentences.
- **Add milestone or sprint labels** (U1, R2, M3, WTR5) to feature descriptions.
- **Document aspirational behavior**: every statement must match the merged code.
- **Modify the GitHub Actions workflow** without testing locally first.
