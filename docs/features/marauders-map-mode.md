# Marauder's Map mode

Marauder's Map mode is an optional cosmetic theme for the Cognitive Companion admin console. When enabled, it re-skins the entire admin UI to a parchment and hand-drawn aesthetic: ink-colored text on aged paper, room polygons and bounding boxes rendered as rough sketched lines, live person tracks shown as fading footstep glyphs, and photographs filtered to look like illustrations.

The mode is a per-user toggle. It has no effect on data, pipelines, tracking, or any backend service. Toggling it off restores the previous `ccDark` or `ccLight` theme exactly.

## What changes when the mode is on

| Area | Appearance |
| --- | --- |
| App chrome (nav drawer, app bar, cards, dialogs, inputs) | Parchment background, sepia ink text, hand-drawn borders via the `ccMarauders` Vuetify theme |
| Room polygons and bounding boxes | Rendered as rough.js ink sketches keyed to a stable seed per shape |
| Live person tracks | Fading footstep glyphs driven by real CTS tracking data, plus a clearly decorative ambient layer |
| Presence heatmap | Rendered as ink and smoke presence stains |
| Images app-wide (keyframes, evidence, avatars) | Passed through a painterly SVG filter so photographs read as illustrations |
| Font | Kalam (handwritten cursive), loaded from `@fontsource/kalam` |

Nothing beneath the UI changes: the same pipelines run, the same tracking data arrives, the same API contracts hold.

## How to enable it

The toggle appears in two places:

1. The app bar at the top of any admin page. Look for the wand or map icon next to the theme toggle.
2. The live floor-plan view header.

Click the toggle once to enable; click it again to disable. The preference persists across browser sessions in `localStorage`.

::: info
The mode is per-browser, not per-account. Clearing browser storage or switching browsers resets it to off.
:::

## Dependencies

Marauder's Map mode has no backend prerequisites. It requires only:

- The admin console running (any deployment).
- The `Kalam` font, which loads automatically from the bundled `@fontsource/kalam` package. No external CDN is needed.

## Accessibility

The parchment color palette passes WCAG AA contrast requirements for body text at the values shipped in the initial release. The mode also respects the `prefers-reduced-motion` media query: footprint animations and ink draw-on effects are replaced with static renders when the user has reduced motion enabled.

## Architecture note

The mode is implemented as a third registered Vuetify theme (`ccMarauders`) alongside the existing `ccDark` and `ccLight` themes. All theme-specific render components live under `components/marauders/` in the frontend source. The single state owner is `composables/useMaraudersMode.js`, which reads `localStorage` key `cc_marauders` and captures the prior theme in `cc_theme` for restore on toggle-off.

For implementation patterns, the seed rule for rough.js sketches, and guidance on adding future themes, see the front-end engineering skill at `.claude/skills/front-end/SKILL.md` (the "Alternate themes and the Marauder's Map mode" section) in the `cognitive-companion` repository.

## Next steps

- [Composable Pipelines](/features/pipeline) -- what runs underneath the themed UI
- [Person Tracking](/features/person-tracking) -- the tracking data that drives live footstep glyphs
- [Continuous Tracking (CTS)](/features/continuous-tracking) -- the CTS integration that feeds floor-plan presence data
