import { defineConfig } from "vitepress";

export default defineConfig({
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
  ],

  themeConfig: {
    logo: "/favicon.svg",

    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Features", link: "/features/pipeline" },
      { text: "API", link: "/api/reference" },
      { text: "Development", link: "/development/setup" },
      { text: "Roadmap", link: "/roadmap" },
      {
        text: "v0.6.122",
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
      "/guide/": [
        {
          text: "Getting Started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Quick Start", link: "/guide/getting-started" },
            { text: "Deployment", link: "/guide/deployment" },
            { text: "Configuration", link: "/guide/configuration" },
            { text: "Architecture", link: "/guide/architecture" },
          ],
        },
      ],
      "/features/": [
        {
          text: "Core Features",
          items: [
            { text: "Composable Pipelines", link: "/features/pipeline" },
            { text: "Knowledge Repository", link: "/features/knowledge-repository" },
            { text: "Person Tracking", link: "/features/person-tracking" },
            {
              text: "Continuous Tracking (CTS)",
              link: "/features/continuous-tracking",
              collapsed: true,
              items: [
                { text: "Overview", link: "/features/continuous-tracking" },
                { text: "Frame Pipeline", link: "/features/continuous-tracking/frame-pipeline" },
                { text: "Dementia Signals", link: "/features/continuous-tracking/dementia-signals" },
                { text: "CC Integration", link: "/features/continuous-tracking/cc-integration" },
              ],
            },
            { text: "Voice Companion", link: "/features/voice-companion" },
            { text: "E-Ink Displays", link: "/features/eink-display" },
            { text: "Notifications", link: "/features/notifications" },
            { text: "TTS Service", link: "/features/tts-service" },
            { text: "MCP Integration", link: "/features/mcp-integration" },
          ],
        },
      ],
      "/development/": [
        {
          text: "Developer Guide",
          items: [
            { text: "Development Setup", link: "/development/setup" },
            { text: "Extending the Pipeline", link: "/development/extending-pipeline" },
            { text: "Code Standards", link: "/development/code-standards" },
            { text: "Contributing", link: "/development/contributing" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [{ text: "REST API", link: "/api/reference" }],
        },
      ],
      "/hardware/": [
        {
          text: "Hardware",
          items: [{ text: "Supported Devices", link: "/hardware/" }],
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
