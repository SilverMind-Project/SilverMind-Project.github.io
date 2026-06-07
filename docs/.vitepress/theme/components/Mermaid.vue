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

// Design system: warm paper (light) / stone-900 (dark), sage brand, terra accent
const FONT = '"Hanken Grotesk", "Inter", system-ui, sans-serif';

const lightVars = {
  fontFamily:              FONT,
  fontSize:                "13.5px",
  // page background
  background:              "#FBF8F3",  // stone-50 cream paper
  mainBkg:                 "#FBF8F3",
  edgeLabelBackground:     "#FBF8F3",
  // primary nodes — sage tint
  primaryColor:            "#EDF4EF",  // sage-50 tint
  primaryTextColor:        "#1D1A14",  // stone-900 warm ink
  primaryBorderColor:      "#3F6B52",  // sage-500
  // secondary nodes — warm stone
  secondaryColor:          "#F4EDE2",  // stone-100 / bg-soft
  secondaryTextColor:      "#1D1A14",
  secondaryBorderColor:    "#D4C4AD",  // warm mid-tone
  // tertiary nodes — terracotta accent
  tertiaryColor:           "#FBF0EB",  // terra-50 tint
  tertiaryTextColor:       "#1D1A14",
  tertiaryBorderColor:     "#C8704F",  // terra-400
  // edges and labels
  lineColor:               "#5F5544",  // text-2, warm brown-grey
  textColor:               "#1D1A14",
  titleColor:              "#1D1A14",
  nodeBorder:              "#3F6B52",  // sage-500
  // subgraph clusters
  clusterBkg:              "#F4EDE2",  // bg-soft
  clusterBorder:           "#E8DDCC",  // divider
};

const darkVars = {
  fontFamily:              FONT,
  fontSize:                "13.5px",
  // page background
  background:              "#1D1A14",  // stone-900
  mainBkg:                 "#1D1A14",
  edgeLabelBackground:     "#2C2820",  // bg-alt
  // primary nodes — deep sage
  primaryColor:            "#243F31",  // sage-700 / vp-c-brand-3
  primaryTextColor:        "#F4EDE2",  // stone-50 warm light
  primaryBorderColor:      "#5A896E",  // sage-400
  // secondary nodes — warm dark stone
  secondaryColor:          "#2C2820",  // bg-alt
  secondaryTextColor:      "#F4EDE2",
  secondaryBorderColor:    "#433C30",  // bg-elv
  // tertiary nodes — dark terra
  tertiaryColor:           "#352218",  // dark terra tint
  tertiaryTextColor:       "#F4EDE2",
  tertiaryBorderColor:     "#C8704F",  // terra-400
  // edges and labels
  lineColor:               "#82B292",  // sage-300 (brand in dark)
  textColor:               "#F4EDE2",  // stone-50
  titleColor:              "#F4EDE2",
  nodeBorder:              "#3F6B52",  // sage-500
  // subgraph clusters
  clusterBkg:              "#2C2820",  // bg-alt
  clusterBorder:           "#433C30",  // bg-elv
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

  // Mermaid sets fixed pixel width/height attributes and an inline max-width style.
  // CSS max-width:100% constrains the box but not the SVG coordinate system, so
  // content clips at the shrunken boundary. Removing the attributes lets the viewBox
  // drive aspect-ratio scaling instead.
  const svgEl = container.value.querySelector("svg");
  if (svgEl) {
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.style.maxWidth = "";
  }
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
  width: 100%;
  height: auto;
  display: block;
  pointer-events: none;
}
</style>
