<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible"
        class="diagram-lightbox"
        role="dialog"
        aria-label="Diagram viewer"
        aria-modal="true"
        ref="backdropRef"
        @click.self="close"
        tabindex="-1"
      >
        <button
          class="diagram-lightbox-close"
          @click="close"
          aria-label="Close diagram viewer"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div
          class="diagram-lightbox-viewport"
          ref="viewportRef"
        >
          <div
            class="diagram-lightbox-content"
            ref="contentRef"
            v-html="svgContent"
          />
        </div>

        <div class="diagram-lightbox-controls">
          <button
            class="diagram-lightbox-ctrl-btn"
            @click="zoomOut"
            aria-label="Zoom out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span class="diagram-lightbox-pct">{{ displayZoom }}</span>
          <button
            class="diagram-lightbox-ctrl-btn"
            @click="zoomIn"
            aria-label="Zoom in"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            class="diagram-lightbox-ctrl-btn diagram-lightbox-reset"
            @click="fitToScreen"
            aria-label="Fit to screen"
          >
            Fit
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import type Panzoom from "panzoom";

const props = defineProps<{
  svgContent: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const backdropRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

// --- SVG natural dimensions (populated by fixupSvgDimensions) ---
const svgNaturalW = ref(800);
const svgNaturalH = ref(600);

// --- panzoom instance ---
let pz: ReturnType<typeof Panzoom> | null = null;
const currentScale = ref(1);
const displayZoom = ref("100%");

function onPanzoomTransform(e: { x: number; y: number; scale: number }) {
  currentScale.value = e.scale;
  displayZoom.value = `${Math.round(e.scale * 100)}%`;
}

// --- fix up the SVG: strip percentage sizing, set pixel dimensions from viewBox ---
function fixupSvgDimensions() {
  const svg = contentRef.value?.querySelector("svg");
  if (!svg) return;

  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    const w = parseFloat(parts[2]);
    const h = parseFloat(parts[3]);
    if (w > 0 && h > 0) {
      svgNaturalW.value = w;
      svgNaturalH.value = h;
    }
  }

  svg.style.maxWidth = "none";
  svg.style.width = svgNaturalW.value + "px";
  svg.style.height = svgNaturalH.value + "px";
  svg.removeAttribute("width");
  svg.removeAttribute("height");
}

// --- fit-to-viewport ---
function computeFit() {
  const viewport = viewportRef.value;
  if (!viewport) return { s: 1, x: 0, y: 0 };

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const sw = svgNaturalW.value;
  const sh = svgNaturalH.value;

  const fitScale = Math.min((vw * 0.9) / sw, (vh * 0.9) / sh, 1.5);
  const s = Math.max(0.3, Math.min(fitScale, 1.5));

  // Center the scaled content
  const x = (vw - sw * s) / 2;
  const y = (vh - sh * s) / 2;

  return { s, x, y };
}

function fitToScreen() {
  if (!pz) return;
  const { s, x, y } = computeFit();
  pz.moveTo(x, y);
  pz.zoomAbs(x, y, s);
}

// --- control buttons ---
const ZOOM_STEP = 1.4;
const MIN_SCALE = 0.2;
const MAX_SCALE = 10;

function zoomIn() {
  if (!pz) return;
  const s = Math.min(MAX_SCALE, currentScale.value * ZOOM_STEP);
  // Zoom toward viewport center
  const vp = viewportRef.value;
  if (!vp) return;
  const cx = vp.clientWidth / 2;
  const cy = vp.clientHeight / 2;
  pz.smoothZoom(cx, cy, s);
}

function zoomOut() {
  if (!pz) return;
  const s = Math.max(MIN_SCALE, currentScale.value / ZOOM_STEP);
  const vp = viewportRef.value;
  if (!vp) return;
  const cx = vp.clientWidth / 2;
  const cy = vp.clientHeight / 2;
  pz.smoothZoom(cx, cy, s);
}

function close() {
  emit("close");
}

// --- lifecycle ---
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      document.body.style.overflow = "hidden";
      await nextTick();
      fixupSvgDimensions();

      // Create panzoom instance
      const { default: createPanzoom } = await import("panzoom");
      pz = createPanzoom(contentRef.value!, {
        maxZoom: MAX_SCALE,
        minZoom: MIN_SCALE,
        bounds: false,
        smoothScroll: false,
        zoomDoubleClickSpeed: 1,
        // Let wheel + double-click be handled by panzoom
        // (we keep our own wheel handler for cursor-relative zoom,
        //  but panzoom does this natively too)
      });
      pz.on("transform", onPanzoomTransform);

      // Apply initial fit-to-viewport
      const { s, x, y } = computeFit();
      pz.moveTo(x, y);
      pz.zoomAbs(x, y, s);

      backdropRef.value?.focus();
      document.addEventListener("keydown", onKeyDown);
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      if (pz) {
        pz.dispose();
        pz = null;
      }
    }
  }
);

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    close();
  }
}

onBeforeUnmount(() => {
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onKeyDown);
  if (pz) {
    pz.dispose();
    pz = null;
  }
});
</script>

<style>
.diagram-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ---- close button ---- */
.diagram-lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.diagram-lightbox-close:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: scale(1.08);
}

.diagram-lightbox-close:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 3px;
}

/* ---- zoomable viewport ---- */
.diagram-lightbox-viewport {
  width: 90vw;
  height: 80vh;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow:
    0 24px 80px -20px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  cursor: grab;
  position: relative;
  overscroll-behavior: none;
  /* Let panzoom handle all touch gestures */
  touch-action: none;
}

.diagram-lightbox-viewport:active {
  cursor: grabbing;
}

/* ---- content (wraps the SVG) ---- */
.diagram-lightbox-content {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  width: max-content;
  height: max-content;
  /* Use smooth transform when zooming via buttons */
  transition: transform 0.3s ease-out;
}

/* ---- zoom controls bar ---- */
.diagram-lightbox-controls {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 980px;
  background: rgba(30, 30, 34, 0.78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 8px 28px -8px rgba(0, 0, 0, 0.45);
}

.diagram-lightbox-ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #f5f5f7;
  cursor: pointer;
  transition: background 0.18s ease;
}

.diagram-lightbox-ctrl-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}

.diagram-lightbox-ctrl-btn:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 2px;
}

.diagram-lightbox-pct {
  min-width: 44px;
  text-align: center;
  color: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  user-select: none;
}

.diagram-lightbox-reset {
  width: auto;
  padding: 0 12px;
  border-radius: 980px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* ---- transitions ---- */
.lightbox-enter-active {
  transition: opacity 0.2s ease-out;
}

.lightbox-leave-active {
  transition: opacity 0.15s ease-in;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

.lightbox-enter-active .diagram-lightbox-viewport {
  transition: transform 0.25s ease-out, opacity 0.25s ease-out;
}

.lightbox-leave-active .diagram-lightbox-viewport {
  transition: transform 0.12s ease-in, opacity 0.12s ease-in;
}

.lightbox-enter-from .diagram-lightbox-viewport {
  transform: scale(0.94);
  opacity: 0;
}

.lightbox-leave-to .diagram-lightbox-viewport {
  transform: scale(0.96);
  opacity: 0;
}

.lightbox-enter-active .diagram-lightbox-controls,
.lightbox-enter-active .diagram-lightbox-close {
  transition: opacity 0.28s ease-out;
}

.lightbox-leave-active .diagram-lightbox-controls,
.lightbox-leave-active .diagram-lightbox-close {
  transition: opacity 0.10s ease-in;
}

.lightbox-enter-from .diagram-lightbox-controls,
.lightbox-enter-from .diagram-lightbox-close,
.lightbox-leave-to .diagram-lightbox-controls,
.lightbox-leave-to .diagram-lightbox-close {
  opacity: 0;
}

/* ---- mobile ---- */
@media (max-width: 640px) {
  .diagram-lightbox-viewport {
    width: 94vw;
    height: 72vh;
    border-radius: 12px;
  }

  .diagram-lightbox-close {
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
  }

  .diagram-lightbox-controls {
    bottom: 16px;
  }

  .diagram-lightbox-ctrl-btn {
    width: 36px;
    height: 36px;
  }
}
</style>
