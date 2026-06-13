import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import HomeDayTimeline from "./components/HomeDayTimeline.vue";
import Mermaid from "./components/Mermaid.vue";

// Self-hosted brand fonts (Design System v2): Newsreader (display serif),
// Hanken Grotesk (UI/body), IBM Plex Mono (data). Same families the product
// frontend ships via fontsource — keeps the doc site off the Google CDN.
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/500-italic.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "./custom.css";

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("HomeDayTimeline", HomeDayTimeline);
    app.component("Mermaid", Mermaid);
  },
};
