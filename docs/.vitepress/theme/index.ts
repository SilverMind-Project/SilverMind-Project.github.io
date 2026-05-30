import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import HomeDayTimeline from "./components/HomeDayTimeline.vue";
import Mermaid from "./components/Mermaid.vue";
import "./custom.css";

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("HomeDayTimeline", HomeDayTimeline);
    app.component("Mermaid", Mermaid);
  },
};
