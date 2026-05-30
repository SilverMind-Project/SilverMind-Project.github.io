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
          @wheel.prevent="onWheel"
          @mousedown="onPanStart"
          @dblclick.prevent="resetZoom"
        >
          <div
            class="diagram-lightbox-content"
            :style="contentStyle"
            v-html="svgContent"
            ref="contentRef"
          />
        </div>

        <div class="diagram-lightbox-controls">
          <button
            class="diagram-lightbox-ctrl-btn"
            @click="zoomOut"
            aria-label="Zoom out"
            :disabled="scale <= minScale"
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
            :disabled="scale >= maxScale"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            class="diagram-lightbox-ctrl-btn diagram-lightbox-reset"
            @click="resetZoom"
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
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";

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

// --- SVG natural dimensions ---
const svgNaturalW = ref(800);
const svgNaturalH = ref(600);

// --- zoom / pan state ---
const scale = ref(1);
const tx = ref(0); // translate-x in px (applied before scale)
const ty = ref(0); // translate-y in px
const minScale = 0.2;
const maxScale = 10;

const displayZoom = computed(() => `${Math.round(scale.value * 100)}%`);

// transform: translate first, then scale (both around 0,0)
const contentStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  transformOrigin: "0 0",
}));

// --- pan tracking ---
let dragging = false;
let panStartX = 0;
let panStartY = 0;
let panStartTx = 0;
let panStartTy = 0;

function onPanStart(e: MouseEvent) {
  if (e.button !== 0) return;
  dragging = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartTx = tx.value;
  panStartTy = ty.value;
  document.addEventListener("mousemove", onPanMove);
  document.addEventListener("mouseup", onPanEnd);
}

function onPanMove(e: MouseEvent) {
  if (!dragging) return;
  // Cursor movement in screen space → content-space movement is divided by scale
  tx.value = panStartTx + (e.clientX - panStartX) / scale.value;
  ty.value = panStartTy + (e.clientY - panStartY) / scale.value;
}

function onPanEnd() {
  dragging = false;
  document.removeEventListener("mousemove", onPanMove);
  document.removeEventListener("mouseup", onPanEnd);
}

// --- cursor-relative zoom ---
function onWheel(e: WheelEvent) {
  const viewport = viewportRef.value;
  if (!viewport) return;

  const rect = viewport.getBoundingClientRect();
  // Cursor position relative to the viewport's top-left corner
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const oldScale = scale.value;
  const newScale = Math.min(maxScale, Math.max(minScale, oldScale * factor));

  // The content point currently under the cursor (in content coordinate space):
  //   contentX = (cx - tx) / oldScale
  // After zooming to newScale, we want that same content point to stay under
  // the cursor:
  //   cx = contentX * newScale + newTx
  // → newTx = cx - contentX * newScale
  const newTx = cx - ((cx - tx.value) / oldScale) * newScale;
  const newTy = cy - ((cy - ty.value) / oldScale) * newScale;

  tx.value = newTx;
  ty.value = newTy;
  scale.value = newScale;
}

function zoomIn() {
  zoomTowardCenter(1.4);
}

function zoomOut() {
  zoomTowardCenter(1 / 1.4);
}

function zoomTowardCenter(factor: number) {
  const viewport = viewportRef.value;
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  // Zoom toward the center of the viewport
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const oldScale = scale.value;
  const newScale = Math.min(maxScale, Math.max(minScale, oldScale * factor));
  tx.value = cx - ((cx - tx.value) / oldScale) * newScale;
  ty.value = cy - ((cy - ty.value) / oldScale) * newScale;
  scale.value = newScale;
}

function computeFitScale(): { s: number; fitTx: number; fitTy: number } {
  const viewport = viewportRef.value;
  if (!viewport) return { s: 1, fitTx: 0, fitTy: 0 };

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const sw = svgNaturalW.value;
  const sh = svgNaturalH.value;

  // Fit the diagram within 90% of the viewport, preserving aspect ratio
  const fitScale = Math.min((vw * 0.9) / sw, (vh * 0.9) / sh, 1.5);
  const s = Math.max(0.3, Math.min(fitScale, 1.5));

  // Center the scaled content in the viewport
  const fitTx = (vw - sw * s) / 2;
  const fitTy = (vh - sh * s) / 2;

  return { s, fitTx, fitTy };
}

function resetZoom() {
  const { s, fitTx, fitTy } = computeFitScale();
  scale.value = s;
  tx.value = fitTx;
  ty.value = fitTy;
}

function close() {
  emit("close");
}

// --- fix up the SVG: remove percentage sizing, set pixel dimensions from viewBox ---
function fixupSvgDimensions() {
  const svg = contentRef.value?.querySelector("svg");
  if (!svg) return;

  // Read the viewBox to get the diagram's natural dimensions
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

  // Override percentage / constraint sizing so the SVG renders at its
  // natural pixel size inside the zoom/pan container.
  svg.style.maxWidth = "none";
  svg.style.width = svgNaturalW.value + "px";
  svg.style.height = svgNaturalH.value + "px";
  svg.removeAttribute("width");
  svg.removeAttribute("height");
}

// --- body scroll lock, focus, init ---
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      document.body.style.overflow = "hidden";
      await nextTick();
      fixupSvgDimensions();
      // Compute a fit-to-viewport scale and center
      const { s, fitTx, fitTy } = computeFitScale();
      scale.value = s;
      tx.value = fitTx;
      ty.value = fitTy;
      backdropRef.value?.focus();
      document.addEventListener("keydown", onKeyDown);
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
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
  document.removeEventListener("mousemove", onPanMove);
  document.removeEventListener("mouseup", onPanEnd);
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
  /* Establish a positioning context for the absolutely-placed content */
  position: relative;
  /* Prevent the viewport itself from capturing wheel events after the
     content handles them (especially on trackpad fling). */
  overscroll-behavior: none;
}

.diagram-lightbox-viewport:active {
  cursor: grabbing;
}

/* ---- content (wraps the SVG) ---- */
.diagram-lightbox-content {
  /* Absolute: we control position entirely via transform */
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  /* Prevent the browser from treating the SVG as a percentage-sized
     replaced element — it has fixed pixel dimensions now. */
  width: max-content;
  height: max-content;
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

.diagram-lightbox-ctrl-btn:disabled {
  opacity: 0.3;
  cursor: default;
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
