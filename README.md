# Cognitive Companion Documentation Site

VitePress documentation site for the [Cognitive Companion](../cognitive-companion) project. Deployed to GitHub Pages via GitHub Actions.

## Local development

```bash
npm install
npm run docs:dev       # dev server at http://localhost:5173
npm run docs:build     # production build (output in docs/.vitepress/dist/)
npm run docs:preview   # preview the built site
```

## Content

Documentation lives in `docs/`. Content must be verified against the actual codebase before publishing; the code is the source of truth.

See [AGENTS.md](AGENTS.md) for the full contributor guide including site structure, content guidelines, and style rules.

