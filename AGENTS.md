# AGENTS.md

Guide for AI coding agents working on the Cognitive Companion documentation site.

## Project Overview

This is a VitePress documentation site for the Cognitive Companion project — a privacy-first, on-premise AI system for senior care. The site is deployed to GitHub Pages via GitHub Actions.

**Framework**: VitePress 1.x (Vue 3-based static site generator)
**Content**: Markdown files in `docs/`
**Build**: `npm run docs:build` → output in `docs/.vitepress/dist/`
**Deploy**: GitHub Actions workflow on push to `main`

## Site Structure

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
│   ├── voice-companion.md    # Gemini Live voice integration
│   ├── eink-display.md       # E-ink template system and rendering
│   ├── notifications.md      # Multi-channel alert routing and escalation
│   └── mcp-integration.md    # MCP tool server for AI agent integration
├── development/
│   ├── setup.md              # Dev environment setup
│   ├── extending-pipeline.md # How to add new pipeline step types (4-file guide)
│   ├── code-standards.md     # Python and Vue coding conventions
│   └── contributing.md       # Contribution guidelines
├── api/
│   └── reference.md          # Full REST API reference (all endpoints)
├── hardware/
│   └── index.md              # Supported hardware devices
└── roadmap.md                # Proposed features and integration pathways
```

## Content Source

All documentation content is derived from the main Cognitive Companion codebase. The authoritative source for technical details is:

- **Codebase**: `../cognitive-companion/` (relative to this repo root)
- **README**: `../cognitive-companion/README.md`
- **AGENTS.md**: `../cognitive-companion/AGENTS.md`
- **Config files**: `../cognitive-companion/config/`

When updating documentation, always verify technical details against the actual codebase. Do not assume documentation is more current than code.

## Adding New Pages

### 1. Create the Markdown File

Add a new `.md` file in the appropriate directory under `docs/`. Use VitePress markdown features:

```markdown
# Page Title

Content here. VitePress supports:

- Standard markdown
- Code blocks with syntax highlighting
- Custom containers (tip, warning, danger, details)
- Frontmatter (title, description, outline)
```

### 2. Register in the Sidebar

Edit `docs/.vitepress/config.mts` and add the page to the appropriate sidebar section:

```typescript
sidebar: {
  "/guide/": [
    {
      text: "Getting Started",
      items: [
        // Add your page here:
        { text: "Your Page Title", link: "/guide/your-page" },
      ],
    },
  ],
}
```

### 3. Add Navigation (if top-level)

For top-level sections, also add a nav entry:

```typescript
nav: [
  { text: "Your Section", link: "/your-section/first-page" },
],
```

## Content Guidelines

### Voice and Tone

- **Technical but accessible**: assume the reader is a developer but don't assume deep familiarity with the project
- **Concrete over abstract**: use code examples, configuration snippets, and architecture diagrams
- **Action-oriented**: tell the reader what to do, not just what exists
- **No marketing language**: state capabilities factually
- **No em-dashes (—)**: use colons, periods, semicolons, or commas instead. Restructure sentences where needed. Em-dashes read as AI-generated; professional technical writing from companies like Apple and Google avoids them.

### Structure

- Every page starts with an `# H1` title
- Use `## H2` for major sections and `### H3` for subsections
- Include a brief introduction paragraph after the H1 explaining what the page covers
- Code examples should be complete enough to copy-paste
- Tables for reference data (endpoints, config fields, step types)
- Link to related pages at the end of each page

### VitePress Features to Use

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

**Code blocks with line highlighting:**

````markdown
```python{3}
def example():
    data = load()
    process(data)  # This line is highlighted
```
````

**Internal links:**

```markdown
See [Composable Pipelines](/features/pipeline) for details.
See the [configuration section](/guide/configuration#llm) for LLM settings.
```

## Development

### Local Preview

```bash
npm install
npm run docs:dev       # Dev server at http://localhost:5173
```

### Build

```bash
npm run docs:build     # Output in docs/.vitepress/dist/
npm run docs:preview   # Preview the built site
```

### Deployment

The site deploys automatically via GitHub Actions on push to `main`. The workflow:

1. Checks out the repo
2. Installs dependencies with `npm ci`
3. Builds with `npm run docs:build`
4. Uploads to GitHub Pages

No manual deployment is needed.

## Do NOT

- **Invent technical details**: verify against the actual codebase before documenting
- **Duplicate content** across pages: link to the authoritative page instead
- **Add images without purpose**: diagrams should clarify, not decorate
- **Use relative file paths to the codebase** in user-facing content: use GitHub URLs with the `SilverMind-Project` organization name
- **Modify the GitHub Actions workflow** without testing locally first
- **Use em-dashes (—)** anywhere in documentation: use colons, periods, semicolons, commas, or restructure the sentence. For `**Bold** — desc` patterns, use `**Bold**: desc` or `**Bold.** Desc` instead
