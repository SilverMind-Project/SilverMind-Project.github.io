import { defineConfig } from "vitepress";

export default defineConfig({
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
        text: "v2.0.0",
        items: [
          {
            text: "Changelog",
            link: "https://github.com/SilverMind-Project/cognitive-companion/releases",
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
            { text: "Person Tracking", link: "/features/person-tracking" },
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
        "https://github.com/OWNER/cognitive-companion-pages/edit/main/docs/:path",
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
