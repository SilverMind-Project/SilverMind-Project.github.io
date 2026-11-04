import { defineConfig } from "vitepress";

export default defineConfig({
  appearance: false,
  markdown: {
    config: (md) => {
      const defaultRender = md.renderer.rules.fence?.bind(md.renderer.rules);
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        if (token.info.trim() === "mermaid") {
          return `<ClientOnly><Mermaid id="mermaid-${idx}" code="${encodeURIComponent(token.content)}" /></ClientOnly>`;
        }
        return defaultRender ? defaultRender(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      };

      // Wrap tables in a scrollable container so wide tables get a scrollbar
      // while normal-width tables stretch to fill the parent.
      md.renderer.rules.table_open = () =>
        '<div class="vp-table-wrapper"><table>';
      md.renderer.rules.table_close = () =>
        "</table></div>";
    },
  },
  title: "Cognitive Companion",
  description:
    "Privacy-first, on-premise AI system for senior care in multigenerational households",

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Cognitive Companion" }],
    ["meta", { property: "og:title", content: "Cognitive Companion: agentic AI for aging in place" }],
    ["meta", { property: "og:description", content: "AI agents that notice changes in a daily routine and act through workflows caregivers approve, on hardware the family owns." }],
    ["meta", { property: "og:image", content: "https://silvermind-project.github.io/og-card.jpg" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: "A woman in her kitchen talks to a small tablet while she makes tea" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],

  themeConfig: {
    logo: { light: "/logo-mark.svg", dark: "/logo-mark-inverse.svg" },

    nav: [
      { text: "For families", link: "/families/overview" },
      { text: "Vision", link: "/vision" },
      {
        text: "Developers",
        items: [
          { text: "Guide", link: "/guide/introduction" },
          { text: "Features", link: "/features/pipeline" },
          { text: "Hardware", link: "/hardware/" },
          { text: "API", link: "/api/reference" },
          { text: "Development", link: "/development/setup" },
        ],
      },
      { text: "Roadmap", link: "/roadmap" },
      {
        text: "v0.7.147",
        items: [
          {
            text: "Code",
            link: "https://github.com/SilverMind-Project/cognitive-companion",
          },
          {
            text: "Contributing",
            link: "/development/contributing",
          },
        ],
      },
    ],

    sidebar: {
      "/families/": [
        {
          text: "For families",
          items: [
            { text: "Overview", link: "/families/overview" },
            { text: "What the senior experiences", link: "/families/what-the-senior-experiences" },
            { text: "What caregivers see", link: "/families/what-you-see" },
            { text: "Privacy and trust", link: "/families/privacy" },
            { text: "Is this right for us?", link: "/families/is-this-right-for-us" },
            { text: "FAQ", link: "/families/faq" },
          ],
        },
      ],
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Quick start", link: "/guide/getting-started" },
            { text: "Deployment", link: "/guide/deployment" },
            { text: "Configuration", link: "/guide/configuration" },
            { text: "Architecture", link: "/guide/architecture" },
          ],
        },
      ],
      "/features/": [
        {
          text: "Core features",
          items: [
            { text: "Composable pipelines", link: "/features/pipeline" },
            { text: "Knowledge repository", link: "/features/knowledge-repository" },
            { text: "Person tracking", link: "/features/person-tracking" },
            {
              text: "Continuous tracking (CTS)",
              link: "/features/continuous-tracking",
              collapsed: true,
              items: [
                { text: "Overview", link: "/features/continuous-tracking" },
                { text: "Tracking concepts", link: "/features/continuous-tracking/tracking-concepts" },
                { text: "Frame pipeline", link: "/features/continuous-tracking/frame-pipeline" },
                {
                  text: "Identity integrity",
                  link: "/features/continuous-tracking/identity-integrity",
                  collapsed: true,
                  items: [
                    { text: "Architecture and baseline", link: "/features/continuous-tracking/identity-integrity" },
                    { text: "Identity authority", link: "/features/continuous-tracking/identity-integrity/identity-authority" },
                    { text: "ReID gallery governance", link: "/features/continuous-tracking/identity-integrity/reid-gallery-governance" },
                    { text: "Revision projections", link: "/features/continuous-tracking/identity-integrity/revision-projections" },
                    { text: "Visitor identities", link: "/features/continuous-tracking/identity-integrity/visitor-identities" },
                    { text: "Cross-repository contracts", link: "/features/continuous-tracking/identity-integrity/contracts" },
                  ],
                },
                { text: "Camera calibration", link: "/features/continuous-tracking/camera-calibration" },
                { text: "Camera to floor basics", link: "/features/continuous-tracking/01-camera-to-floor-basics" },
                { text: "Why one dot jitters", link: "/features/continuous-tracking/02-why-one-dot-jitters" },
                { text: "Measurement uncertainty", link: "/features/continuous-tracking/03-measurement-uncertainty" },
                { text: "Multi-camera fusion", link: "/features/continuous-tracking/04-multi-camera-fusion" },
                { text: "Posture fusion", link: "/features/continuous-tracking/05-posture-fusion" },
                { text: "Floor region and visibility", link: "/features/continuous-tracking/06-floor-region-and-visibility" },
                { text: "Operations and drift", link: "/features/continuous-tracking/07-operations-drift-and-recalibration" },
                { text: "Dementia signals", link: "/features/continuous-tracking/dementia-signals" },
                { text: "CC integration", link: "/features/continuous-tracking/cc-integration" },
              ],
            },
            { text: "Voice companion", link: "/features/voice-companion" },
            { text: "Guided companion", link: "/features/guided-companion" },
            { text: "Daily living", link: "/features/daily-living" },
            { text: "E-ink displays", link: "/features/eink-display" },
            { text: "Notifications", link: "/features/notifications" },
            { text: "TTS service", link: "/features/tts-service" },
            { text: "MCP integration", link: "/features/mcp-integration" },
            { text: "Marauder's Map mode", link: "/features/marauders-map-mode" },
          ],
        },
      ],
      "/development/": [
        {
          text: "Developer guide",
          items: [
            { text: "Development setup", link: "/development/setup" },
            { text: "Extending the pipeline", link: "/development/extending-pipeline" },
            { text: "Code standards", link: "/development/code-standards" },
            { text: "Identity integrity verification", link: "/development/identity-integrity-verification" },
            { text: "Identity data reset", link: "/development/identity-data-reset" },
            { text: "Private identity replay dataset", link: "/development/private-identity-replay" },
            { text: "Identity integrity rollout", link: "/development/identity-integrity-rollout" },
            { text: "Face confidence calibration", link: "/development/face-confidence-calibration" },
            { text: "Contributing", link: "/development/contributing" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API reference",
          items: [{ text: "REST API", link: "/api/reference" }],
        },
      ],
      "/hardware/": [
        {
          text: "Hardware",
          items: [
            { text: "Supported devices", link: "/hardware/" },
            { text: "Jetson CTS deployment", link: "/hardware/jetson-cts" },
            {
              text: "Model quantization",
              link: "/hardware/model-quantization",
            },
            { text: "Camera setup", link: "/hardware/camera-setup" },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/SilverMind-Project/cognitive-companion",
      },
    ],

    editLink: {
      pattern:
        "https://github.com/SilverMind-Project/silvermind-project.github.io/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the AGPL-3.0 License.",
      copyright: "Copyright 2024-present Cognitive Companion Contributors",
    },

    search: {
      provider: "local",
    },

    outline: {
      level: [2, 3],
    },
  },
});
