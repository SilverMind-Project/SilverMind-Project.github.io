<template>
  <div
    ref="container"
    class="mermaid-container"
    @click="openLightbox"
    title="Click to zoom"
  ></div>
  <DiagramLightbox
    :svg-content="currentSvg"
    :visible="lightboxVisible"
    @close="lightboxVisible = false"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useData } from "vitepress";
import DiagramLightbox from "./DiagramLightbox.vue";

const { isDark } = useData();

const props = defineProps<{ id: string; code: string }>();
const container = ref<HTMLElement | null>(null);

let renderCount = 0;

// --- lightbox state ---
const lightboxVisible = ref(false);
const currentSvg = ref("");

function openLightbox() {
  if (!currentSvg.value) return;
  lightboxVisible.value = true;
}

const lightVars = {
  primaryColor: "#eff6ff",
  primaryTextColor: "#1e293b",
  primaryBorderColor: "#93c5fd",
  secondaryColor: "#f1f5f9",
  secondaryTextColor: "#1e293b",
  secondaryBorderColor: "#cbd5e1",
  tertiaryColor: "#f8fafc",
  tertiaryTextColor: "#1e293b",
  tertiaryBorderColor: "#cbd5e1",
  lineColor: "#475569",
  textColor: "#1e293b",
  mainBkg: "#ffffff",
  nodeBorder: "#94a3b8",
  clusterBkg: "#f8fafc",
  clusterBorder: "#cbd5e1",
  titleColor: "#1e293b",
  edgeLabelBackground: "#ffffff",
};

const darkVars = {
  primaryColor: "#1e293b",
  primaryTextColor: "#f1f5f9",
  primaryBorderColor: "#475569",
  secondaryColor: "#334155",
  secondaryTextColor: "#f1f5f9",
  secondaryBorderColor: "#475569",
  tertiaryColor: "#0f172a",
  tertiaryTextColor: "#f1f5f9",
  tertiaryBorderColor: "#475569",
  lineColor: "#94a3b8",
  textColor: "#f1f5f9",
  mainBkg: "#1e1e1e",
  nodeBorder: "#475569",
  clusterBkg: "#111827",
  clusterBorder: "#374151",
  titleColor: "#f1f5f9",
  edgeLabelBackground: "#1e1e1e",
};

async function renderDiagram() {
  if (!container.value) return;

  renderCount++;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "loose",
    themeVariables: isDark.value ? darkVars : lightVars,
  });
  const decoded = decodeURIComponent(props.code);
  const { svg } = await mermaid.render(
    `mermaid-svg-${props.id}-${renderCount}`,
    decoded
  );
  container.value.innerHTML = svg;
  currentSvg.value = svg;
}

onMounted(renderDiagram);
watch(() => props.code, renderDiagram);
watch(isDark, renderDiagram);
</script>

<style>
.mermaid-container {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
  overflow-x: auto;
  cursor: pointer;
  border-radius: 8px;
  transition: box-shadow 0.2s ease, background 0.2s ease;
}
.mermaid-container:hover {
  box-shadow: 0 0 0 4px var(--vp-c-brand-soft);
  background: var(--vp-c-brand-softer);
}
.mermaid-container svg {
  max-width: 100%;
  height: auto;
  pointer-events: none;
}
</style>
