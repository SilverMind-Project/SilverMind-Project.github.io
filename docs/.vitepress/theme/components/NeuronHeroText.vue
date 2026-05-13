<script lang="ts">
export {
  heroFontSize,
  computeFittedFontSize,
  buildTextMask,
  buildBorderPixels,
  DESKTOP_NODE_COUNT,
  MOBILE_NODE_COUNT,
  spawnNodes,
  spawnBorderNodes,
  buildEdges,
  buildBorderBridges,
  getCharPositions,
  buildIntraToBorderEdges,
  buildIntraCharEdges,
  buildInterCharBridges,
  buildCharacterEdges,
  nodeColour,
  updateNodes,
  GRADIENT_PERIOD_MS,
  SPATIAL_PHASE_SCALE,
  BRAND_STOPS,
  MAX_SPEED,
} from './NeuronHeroText.utils'
export type { FilledPixel, Node, Edge, CharPosition } from './NeuronHeroText.utils'
</script>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  heroFontSize,
  computeFittedFontSize,
  buildTextMask,
  buildBorderPixels,
  spawnNodes,
  spawnBorderNodes,
  buildEdges,
  buildBorderBridges,
  getCharPositions,
  buildIntraToBorderEdges,
  buildIntraCharEdges,
  nodeColour,
  updateNodes,
} from './NeuronHeroText.utils'
import type { FilledPixel, Node, Edge, CharPosition } from './NeuronHeroText.utils'

// ---------------------------------------------------------------------------
// Internal constants — two independent control sets
// ---------------------------------------------------------------------------
// The mesh has two parts that need to scale differently:
//
//   1. INTERIOR mesh — drifting nodes inside the letterform. Scales with the
//      actual rasterised font size (in physical pixels). This single number
//      already combines viewport breakpoint + device pixel ratio, so it's the
//      right ruler for "how big does each character look on this screen."
//
//   2. BORDER ring — fixed nodes tracing the silhouette. Scales with CSS-px
//      units only (×DPR). The outline stays at a constant *visual* density
//      and minimum thickness so characters are always legible — even on
//      small-font portrait phones where the interior mesh is necessarily
//      tighter, or large-font landscape where the interior is loose.
// ---------------------------------------------------------------------------

/** Reference physical-pixel font size against which all density / threshold
 *  defaults are calibrated (matches desktop 80 CSS px @ DPR 1). */
const REFERENCE_FONT_PHYSICAL_PX = 80

// === Interior mesh (font-scaled) =====================================
/** Target one interior node per N filled mask pixels. Constant density
 *  across viewports → portrait phones get more nodes (their tight mask
 *  was sparse before), landscape phones get many more (their wide mask
 *  used to feel empty with the old hardcoded 120). */
const FILLED_PIXELS_PER_INTERIOR_NODE = 40
const MIN_INTERIOR_NODES = 250
const MAX_INTERIOR_NODES = 400

/** Reach for interior→border edges, as a fraction of the rasterised font
 *  size. 0.5 ≈ half a cap-height of reach in every direction. */
const INTERIOR_REACH_RATIO = .70

/** Inter-glyph bridges (capped to keep small fonts readable):
 *  one edge between letters within a word, a small handful between words. */
const IN_WORD_BRIDGES        = 0
const CROSS_WORD_BRIDGES_MIN = 0
const CROSS_WORD_BRIDGES_MAX = 0
/** Max border-node connections per interior node (K-nearest). Lower than
 *  before because node *count* now scales with area — each node only needs
 *  a handful of links to keep the mesh visually continuous. */
const MAX_EDGES_PER_INTERIOR = 100

/** Per-interior-node rendering size, in CSS pixels (multiplied by DPR in
 *  drawFrame). */
const INTERIOR_NODE_SIZE_CSS = 2.0
const INTERIOR_NODE_ALPHA    = 0.8

/** Interior node drift speed in physical px/frame.
 *  Decrease for slower, more subtle motion; increase for faster drift.
 *  At 60 fps and DPR=2, MAX gives 0.075 CSS px/frame (≈4.5 CSS px/sec). */
const INTERIOR_NODE_MIN_SPEED = 0.05
const INTERIOR_NODE_MAX_SPEED = 0.20

// === Interior-to-interior mesh =======================================
/** Connection threshold for intra-character interior edges, as a fraction of
 *  the rasterised font size. Connects nearby drifting nodes within the same
 *  letterform, producing the visible neural-network graph inside each glyph. */
const INTERIOR_INTRA_THRESHOLD_RATIO = 0.17
/** Max interior-to-interior edges per node (K-nearest cap, same role as
 *  MAX_EDGES_PER_INTERIOR for interior→border edges). */
const MAX_INTRA_EDGES_PER_NODE = 30

// === Border ring (CSS-px-scaled, font-independent) ===================
/** Spacing between border nodes along the outline (CSS px × DPR). */
const BORDER_NODE_SPACING_CSS = 1.0
/** Connection threshold for border-to-border edges (CSS px × DPR). */
const BORDER_EDGE_THRESHOLD_CSS = 9

/** FLOOR for border edge half-width: 0.5 CSS px → 1 CSS px full width.
 *  This is the readability guarantee — outlines never render sub-pixel,
 *  even when the interior mesh is sparse. */
const BORDER_EDGE_HALF_WIDTH_CSS_FLOOR = 0.1
/** Half-width at the reference font size; scaled by font so big desktop
 *  hero text gets a slightly bolder outline. The floor above always wins
 *  on small fonts. */
const BORDER_EDGE_HALF_WIDTH_CSS_AT_REF = 0.1

/** Per-border-node rendering size (CSS px × DPR). Outline shape comes from
 *  the edges, not the dots, so this stays small. */
const BORDER_NODE_SIZE_CSS = 0.5
const BORDER_NODE_ALPHA    = 0.5

// ---------------------------------------------------------------------------
// Reactive state (controls template branching)
// ---------------------------------------------------------------------------

const canvasRef      = ref<HTMLCanvasElement | null>(null)
const webglSupported = ref(true)
const reducedMotion  = ref(false)
const darkMode       = ref(false)

// ---------------------------------------------------------------------------
// Non-reactive animation state (mutated directly to avoid reactivity overhead)
// ---------------------------------------------------------------------------

let gl:                  WebGLRenderingContext | null = null
let frameId:             number = 0
let nodes:                Node[] = []       // interior drifting nodes
let borderNodes:          Node[] = []       // fixed outline nodes
let cachedBorderEdges:    Edge[] = []       // precomputed; border nodes never move
let borderEdgeThreshold:           number = 10      // physical px; updated in rebuildMask
let interiorToBorderThreshold:     number = 25      // physical px; scaled by font size in rebuildMask
let interiorIntraThreshold:        number = 15      // physical px; scaled by font size in rebuildMask
let fontPhysicalScale:             number = 1.0     // fittedFontSize / REFERENCE_FONT_PHYSICAL_PX; updated in rebuildMask
let currentDpr:                    number = 1       // device pixel ratio; updated in rebuildMask
let isDarkMode:                    boolean = false  // updated by MutationObserver
let filledPixels:        FilledPixel[] = []
let maskSet:             Set<number> = new Set()
let charPositions:       CharPosition[] = []
let startTime:           number = 0
let nodeProgram:         WebGLProgram | null = null
let edgeProgram:         WebGLProgram | null = null
let vertexBuffer:        WebGLBuffer | null = null
let motionMediaQuery:    MediaQueryList | null = null
let motionChangeHandler: ((e: MediaQueryListEvent) => void) | null = null
let resizeObserver:      ResizeObserver | null = null
let darkModeObserver:    MutationObserver | null = null

function detectWebGL(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  return canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext | null
}

function detectReducedMotion(): boolean {
  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionChangeHandler = (e: MediaQueryListEvent) => {
    reducedMotion.value = e.matches
  }
  motionMediaQuery.addEventListener('change', motionChangeHandler)
  return motionMediaQuery.matches
}

// ---------------------------------------------------------------------------
// WebGL setup
// ---------------------------------------------------------------------------

/** GLSL source for the node vertex shader. */
const NODE_VERT_SRC = `
attribute vec2  a_position;
attribute float a_alpha;
attribute vec3  a_color;
attribute float a_size;
uniform vec2 u_resolution;
varying float v_alpha;
varying vec3  v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position  = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size;
  v_alpha = a_alpha;
  v_color = a_color;
}
`

/** GLSL source for the node fragment shader (soft circular point). */
const NODE_FRAG_SRC = `
precision mediump float;
varying float v_alpha;
varying vec3  v_color;
void main() {
  float dist  = length(gl_PointCoord - vec2(0.5));
  float mask  = 1.0 - smoothstep(0.4, 0.5, dist);
  float alpha = v_alpha * mask;
  gl_FragColor = vec4(v_color, alpha);
}
`

/** GLSL source for the edge vertex shader. */
const EDGE_VERT_SRC = `
attribute vec2  a_position;
attribute float a_alpha;
attribute vec3  a_color;
uniform vec2 u_resolution;
varying float v_alpha;
varying vec3  v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
  v_alpha = a_alpha;
  v_color = a_color;
}
`

/** GLSL source for the edge fragment shader. */
const EDGE_FRAG_SRC = `
precision mediump float;
varying float v_alpha;
varying vec3  v_color;
void main() {
  gl_FragColor = vec4(v_color, v_alpha * 0.6);
}
`

/**
 * Compiles a single GLSL shader. Returns the shader on success, or null on
 * failure (logs the error and sets webglSupported to false).
 */
function compileShader(
  glCtx: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = glCtx.createShader(type)
  if (!shader) {
    console.error('NeuronHeroText: failed to create shader object')
    webglSupported.value = false
    return null
  }
  glCtx.shaderSource(shader, source)
  glCtx.compileShader(shader)
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    console.error('NeuronHeroText: shader compilation failed:', glCtx.getShaderInfoLog(shader))
    glCtx.deleteShader(shader)
    webglSupported.value = false
    return null
  }
  return shader
}

/**
 * Links a vertex and fragment shader into a program. Returns the program on
 * success, or null on failure (logs the error and sets webglSupported to false).
 */
function linkProgram(
  glCtx: WebGLRenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader,
): WebGLProgram | null {
  const program = glCtx.createProgram()
  if (!program) {
    console.error('NeuronHeroText: failed to create program object')
    webglSupported.value = false
    return null
  }
  glCtx.attachShader(program, vertShader)
  glCtx.attachShader(program, fragShader)
  glCtx.linkProgram(program)
  if (!glCtx.getProgramParameter(program, glCtx.LINK_STATUS)) {
    console.error('NeuronHeroText: program link failed:', glCtx.getProgramInfoLog(program))
    glCtx.deleteProgram(program)
    webglSupported.value = false
    return null
  }
  return program
}

/**
 * Compiles both shader programs and creates the shared interleaved vertex
 * buffer. Sets webglSupported to false and returns false on any failure.
 */
function initWebGL(glCtx: WebGLRenderingContext): boolean {
  // Compile node shaders
  const nodeVert = compileShader(glCtx, glCtx.VERTEX_SHADER, NODE_VERT_SRC)
  const nodeFrag = compileShader(glCtx, glCtx.FRAGMENT_SHADER, NODE_FRAG_SRC)
  if (!nodeVert || !nodeFrag) return false

  nodeProgram = linkProgram(glCtx, nodeVert, nodeFrag)
  if (!nodeProgram) return false

  // Compile edge shaders
  const edgeVert = compileShader(glCtx, glCtx.VERTEX_SHADER, EDGE_VERT_SRC)
  const edgeFrag = compileShader(glCtx, glCtx.FRAGMENT_SHADER, EDGE_FRAG_SRC)
  if (!edgeVert || !edgeFrag) return false

  edgeProgram = linkProgram(glCtx, edgeVert, edgeFrag)
  if (!edgeProgram) return false

  // Create the shared interleaved vertex buffer
  vertexBuffer = glCtx.createBuffer()
  if (!vertexBuffer) {
    console.error('NeuronHeroText: failed to create vertex buffer')
    webglSupported.value = false
    return false
  }

  // Enable blending; mode is set per-frame in drawFrame based on light/dark theme
  glCtx.enable(glCtx.BLEND)

  return true
}

// ---------------------------------------------------------------------------
// Per-frame rendering
// ---------------------------------------------------------------------------

/**
 * Stride in bytes for the interleaved vertex buffer:
 *   vec2 a_position (8) + float a_alpha (4) + vec3 a_color (12) + float a_size (4) = 28 bytes
 */
const STRIDE = 28
/** Number of floats per vertex: x, y, alpha, r, g, b, size */
const FLOATS_PER_VERTEX = 7

/**
 * Binds vertex attribute pointers for the given program using the shared
 * interleaved buffer layout (stride = 28 bytes).
 * `bindSize` should be true for the node program (which uses a_size for
 * gl_PointSize) and false for the edge program (which ignores it).
 */
function bindAttributes(
  glCtx: WebGLRenderingContext,
  program: WebGLProgram,
  bindSize: boolean,
): void {
  const posLoc   = glCtx.getAttribLocation(program, 'a_position')
  const alphaLoc = glCtx.getAttribLocation(program, 'a_alpha')
  const colorLoc = glCtx.getAttribLocation(program, 'a_color')

  glCtx.enableVertexAttribArray(posLoc)
  glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, STRIDE, 0)

  glCtx.enableVertexAttribArray(alphaLoc)
  glCtx.vertexAttribPointer(alphaLoc, 1, glCtx.FLOAT, false, STRIDE, 8)

  glCtx.enableVertexAttribArray(colorLoc)
  glCtx.vertexAttribPointer(colorLoc, 3, glCtx.FLOAT, false, STRIDE, 12)

  if (bindSize) {
    const sizeLoc = glCtx.getAttribLocation(program, 'a_size')
    if (sizeLoc >= 0) {
      glCtx.enableVertexAttribArray(sizeLoc)
      glCtx.vertexAttribPointer(sizeLoc, 1, glCtx.FLOAT, false, STRIDE, 24)
    }
  }
}

/**
 * Packs one vertex (7 floats) into `data` at byte-offset `base`.
 * Layout: x, y, alpha, r, g, b, size
 */
function packVertex(
  data: Float32Array,
  base: number,
  x: number, y: number, alpha: number,
  r: number, g: number, b: number,
  size: number,
): void {
  data[base]     = x
  data[base + 1] = y
  data[base + 2] = alpha
  data[base + 3] = r
  data[base + 4] = g
  data[base + 5] = b
  data[base + 6] = size
}

/**
 * Clears, builds and uploads the interleaved vertex buffer, then issues four
 * draw calls:
 *   1. Interior nodes  (small, translucent point sprites)
 *   2. Border nodes    (larger, opaque point sprites — the outline ring)
 *   3. Interior edges  (local connections inside each letterform)
 *   4. Border edges    (outline connections between adjacent border nodes)
 */
function drawFrame(
  glCtx: WebGLRenderingContext,
  iNodes: Node[],      // interior (drifting) nodes
  bNodes: Node[],      // border (fixed outline) nodes
  iEdges: Edge[],      // interior character edges
  bEdges: Edge[],      // border outline edges
  timeMs: number,
  canvasWidth: number,
): void {
  if (!nodeProgram || !edgeProgram || !vertexBuffer) return

  const canvas = glCtx.canvas as HTMLCanvasElement
  const cw = canvas.width
  const ch = canvas.height

  // Dark mode: additive blending (light accumulation on black) — looks glassy
  // Light mode: standard alpha blending — brand colours visible on white
  if (isDarkMode) {
    glCtx.blendFunc(glCtx.SRC_ALPHA,glCtx.ONE)
    //glCtx.blendFunc(glCtx.ONE, glCtx.ONE)
  } else {
    glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA)
  }

  glCtx.clearColor(0, 0, 0, 0)
  glCtx.clear(glCtx.COLOR_BUFFER_BIT)

  const iCount = iNodes.length
  const bCount = bNodes.length
  const totalNodes = iCount + bCount
  const iEdgeV = iEdges.length * 2
  // Border edges are rendered as thick quads (2 triangles = 6 vertices each)
  // so thickness is reliable across all WebGL implementations.
  // Thickness scales with font size so the outline looks proportional at all breakpoints.
  const bEdgeV = bEdges.length * 6
  const total = totalNodes + iEdgeV + bEdgeV

  if (total === 0) return

  const data = new Float32Array(total * FLOATS_PER_VERTEX)

  // Identical brand colours in both modes — the canvas drop-shadow glow
  // (custom.css) provides the contrast needed for legibility on light backgrounds.
  // Dark mode uses additive blending so the per-particle multiplier is kept below
  // 1 to prevent the densely-overlapping border ring from saturating; 0.40 gives
  // interior nodes enough individual brightness to be clearly visible while the
  // ring accumulates to a bright outline through overlap.
  const cs = isDarkMode ? .40 : 1.0

  // Per-node sizes are authored in CSS px and scaled to physical px here so
  // dots remain visible (and not chunky) across the full DPR range.
  const interiorNodeSize = INTERIOR_NODE_SIZE_CSS * currentDpr
  const borderNodeSize   = BORDER_NODE_SIZE_CSS   * currentDpr

  // --- Interior nodes ---
  for (let i = 0; i < iCount; i++) {
    const n = iNodes[i]
    const [r, g, b] = nodeColour(n.x, n.y, canvasWidth, ch, timeMs, reducedMotion.value)
    packVertex(data, i * FLOATS_PER_VERTEX, n.x, n.y, INTERIOR_NODE_ALPHA, r * cs, g * cs, b * cs, interiorNodeSize)
  }

  // --- Border nodes ---
  for (let i = 0; i < bCount; i++) {
    const n = bNodes[i]
    const [r, g, b] = nodeColour(n.x, n.y, canvasWidth, ch, timeMs, reducedMotion.value)
    packVertex(data, (iCount + i) * FLOATS_PER_VERTEX, n.x, n.y, BORDER_NODE_ALPHA, r * cs, g * cs, b * cs, borderNodeSize)
  }

  // --- Interior edge vertices (two per edge) ---
  // edge.j >= iCount means the endpoint is a border node (offset by iCount).
  for (let e = 0; e < iEdges.length; e++) {
    const edge = iEdges[e]
    const nA = iNodes[edge.i]
    const nB = edge.j < iCount ? iNodes[edge.j] : bNodes[edge.j - iCount]
    const [rA, gA, bA] = nodeColour(nA.x, nA.y, canvasWidth, ch, timeMs, reducedMotion.value)
    const [rB, gB, bB] = nodeColour(nB.x, nB.y, canvasWidth, ch, timeMs, reducedMotion.value)
    const baseA = (totalNodes + e * 2) * FLOATS_PER_VERTEX
    packVertex(data, baseA,                    nA.x, nA.y, edge.alpha, rA * cs, gA * cs, bA * cs, 0)
    packVertex(data, baseA + FLOATS_PER_VERTEX, nB.x, nB.y, edge.alpha, rB * cs, gB * cs, bB * cs, 0)
  }

  // --- Border edge thick-quad vertices (2 triangles = 6 vertices per edge) ---
  // Each edge is a screen-aligned rectangle perpendicular to the edge direction,
  // giving reliable sub-pixel-accurate thickness on all WebGL 1 implementations
  // (gl.lineWidth is capped at 1 on most GPUs/browsers).
  // Border edge thickness: scales gently with font (so big desktop hero looks
  // bolder), with a hard floor at 1 CSS px full width so the silhouette
  // always reads — even on small portrait fonts where the interior mesh is tight.
  const halfWFromFont = BORDER_EDGE_HALF_WIDTH_CSS_AT_REF * currentDpr * fontPhysicalScale
  const halfWFloor    = BORDER_EDGE_HALF_WIDTH_CSS_FLOOR  * currentDpr
  const halfW = Math.max(halfWFloor, halfWFromFont)
  const bEdgeStart = totalNodes + iEdgeV
  for (let e = 0; e < bEdges.length; e++) {
    const edge = bEdges[e]
    const nA = bNodes[edge.i], nB = bNodes[edge.j]
    const [rA, gA, bA] = nodeColour(nA.x, nA.y, canvasWidth, ch, timeMs, reducedMotion.value)
    const [rB, gB, bB] = nodeColour(nB.x, nB.y, canvasWidth, ch, timeMs, reducedMotion.value)
    const alpha = Math.max(0.8, edge.alpha)

    // Perpendicular unit vector scaled to half-width
    const dx = nB.x - nA.x, dy = nB.y - nA.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const px = (-dy / len) * halfW, py = (dx / len) * halfW

    // Quad corners: A0=(nA-p), A1=(nA+p), B0=(nB-p), B1=(nB+p)
    // Triangle 1: A0, A1, B0  |  Triangle 2: A1, B0, B1
    const base = (bEdgeStart + e * 6) * FLOATS_PER_VERTEX
    packVertex(data, base + 0 * FLOATS_PER_VERTEX, nA.x - px, nA.y - py, alpha, rA * cs, gA * cs, bA * cs, 0)
    packVertex(data, base + 1 * FLOATS_PER_VERTEX, nA.x + px, nA.y + py, alpha, rA * cs, gA * cs, bA * cs, 0)
    packVertex(data, base + 2 * FLOATS_PER_VERTEX, nB.x - px, nB.y - py, alpha, rB * cs, gB * cs, bB * cs, 0)
    packVertex(data, base + 3 * FLOATS_PER_VERTEX, nA.x + px, nA.y + py, alpha, rA * cs, gA * cs, bA * cs, 0)
    packVertex(data, base + 4 * FLOATS_PER_VERTEX, nB.x - px, nB.y - py, alpha, rB * cs, gB * cs, bB * cs, 0)
    packVertex(data, base + 5 * FLOATS_PER_VERTEX, nB.x + px, nB.y + py, alpha, rB * cs, gB * cs, bB * cs, 0)
  }

  // Upload
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, vertexBuffer)
  glCtx.bufferData(glCtx.ARRAY_BUFFER, data, glCtx.DYNAMIC_DRAW)

  // 1. Draw interior nodes
  glCtx.useProgram(nodeProgram)
  glCtx.uniform2f(glCtx.getUniformLocation(nodeProgram, 'u_resolution'), cw, ch)
  bindAttributes(glCtx, nodeProgram, true)
  glCtx.drawArrays(glCtx.POINTS, 0, iCount)

  // 2. Draw border nodes (same program, different size/alpha already in data)
  if (bCount > 0) {
    glCtx.drawArrays(glCtx.POINTS, iCount, bCount)
  }

  // 3. Draw interior edges
  if (iEdgeV > 0) {
    glCtx.useProgram(edgeProgram)
    glCtx.uniform2f(glCtx.getUniformLocation(edgeProgram, 'u_resolution'), cw, ch)
    bindAttributes(glCtx, edgeProgram, false)
    glCtx.drawArrays(glCtx.LINES, totalNodes, iEdgeV)
  }

  // 4. Draw border (outline) edges as thick geometry quads
  if (bEdgeV > 0) {
    if (iEdgeV === 0) {
      glCtx.useProgram(edgeProgram)
      glCtx.uniform2f(glCtx.getUniformLocation(edgeProgram, 'u_resolution'), cw, ch)
      bindAttributes(glCtx, edgeProgram, false)
    }
    glCtx.drawArrays(glCtx.TRIANGLES, totalNodes + iEdgeV, bEdgeV)
  }
}

// ---------------------------------------------------------------------------
// rAF loop
// ---------------------------------------------------------------------------

function startAnimationLoop(): void {
  const canvas = canvasRef.value!

  function loop(timestamp: number): void {
    if (startTime === 0) startTime = timestamp
    const elapsed = timestamp - startTime

    if (gl) {
      updateNodes(nodes, filledPixels, maskSet, canvas.width, reducedMotion.value)
      // Interior→border spokes (recomputed each frame since interior nodes drift).
      // cachedBorderEdges is precomputed in rebuildMask — border nodes are fixed.
      const toBorderEdges = buildIntraToBorderEdges(nodes, borderNodes, charPositions, interiorToBorderThreshold, MAX_EDGES_PER_INTERIOR, maskSet, canvas.width)
      // Interior↔interior mesh (recomputed each frame, capped to MAX_INTRA_EDGES_PER_NODE).
      const intraEdges = buildIntraCharEdges(nodes, charPositions, interiorIntraThreshold, MAX_INTRA_EDGES_PER_NODE)
      const iEdges = [...toBorderEdges, ...intraEdges]
      drawFrame(gl, nodes, borderNodes, iEdges, cachedBorderEdges, elapsed, canvas.width)
    }

    frameId = requestAnimationFrame(loop)
  }

  frameId = requestAnimationFrame(loop)
}

// ---------------------------------------------------------------------------
// Mask rebuild + lifecycle
// ---------------------------------------------------------------------------

/** Number of interior drifting nodes to spawn for a mask of `filledPixelCount`
 *  filled pixels. Constant density across viewports / DPRs — the same look
 *  whether the text is rasterised at 80 phys px (desktop) or 100 phys px
 *  (high-DPR phone portrait) or 180 phys px (high-DPR phone landscape). */
function computeInteriorNodeCount(filledPixelCount: number): number {
  return Math.max(
    MIN_INTERIOR_NODES,
    Math.min(MAX_INTERIOR_NODES, Math.round(filledPixelCount / FILLED_PIXELS_PER_INTERIOR_NODE)),
  )
}

/** Rebuilds text mask, char positions, and border nodes using a DPR-scaled, width-fitted font. */
function rebuildMask(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1
  currentDpr = dpr
  const cssFontTarget = heroFontSize(window.innerWidth)  // 44 / 64 / 80 CSS px
  const targetFontSize = cssFontTarget * dpr
  const fontSize = computeFittedFontSize(targetFontSize, canvas.width, canvas.height)
  filledPixels = buildTextMask(canvas.width, canvas.height, fontSize)
  maskSet = new Set(filledPixels.map(p => p.y * canvas.width + p.x))
  charPositions = getCharPositions(fontSize, canvas.width)

  // The actual rasterised font size (in physical pixels) is the single number
  // that combines viewport breakpoint + DPR — perfect ruler for the interior
  // mesh. The border ring stays in CSS-px units (×DPR) so the outline keeps
  // a constant *visual* density at all sizes.
  fontPhysicalScale = fontSize / REFERENCE_FONT_PHYSICAL_PX

  // Border ring: independent of font size — outline must read at any scale.
  const borderSpacing = Math.max(1, Math.round(BORDER_NODE_SPACING_CSS * dpr))
  borderEdgeThreshold = Math.max(2, Math.round(BORDER_EDGE_THRESHOLD_CSS * dpr))

  // Interior reach: scales with the actual rasterised font size so each node's
  // reach is a constant fraction of cap-height regardless of viewport / DPR.
  interiorToBorderThreshold = Math.max(8, Math.round(INTERIOR_REACH_RATIO * fontSize))
  // Interior-to-interior reach: shorter than border reach so nodes only connect
  // to immediate neighbours, producing a mesh rather than a hub-and-spoke fan.
  interiorIntraThreshold = Math.max(8, Math.round(INTERIOR_INTRA_THRESHOLD_RATIO * fontSize))
  const borderPixels = buildBorderPixels(filledPixels, maskSet, canvas.width)
  borderNodes        = spawnBorderNodes(borderPixels, borderSpacing)

  // Outline edges are character-strict: cross-character connections via the
  // borderEdgeThreshold are forbidden. Inter-character connections come from
  // a separate, capped `buildBorderBridges` pass — exactly 1 edge between
  // adjacent letters in a word, 2–5 across word boundaries. At small font
  // sizes this stops the kerning-tight glyphs from merging into a blob.
  const outlineEdges = buildEdges(borderNodes, borderEdgeThreshold, charPositions, maskSet, canvas.width)
  const bridgeEdges  = buildBorderBridges(borderNodes, charPositions, IN_WORD_BRIDGES, CROSS_WORD_BRIDGES_MIN, CROSS_WORD_BRIDGES_MAX)
  cachedBorderEdges  = [...outlineEdges, ...bridgeEdges]
}

// ---------------------------------------------------------------------------
// WebGL lifecycle (start / stop — called from onMounted, watcher, and cleanup)
// ---------------------------------------------------------------------------

/** Full WebGL initialisation: compile shaders, size canvas, build mask, spawn
 *  nodes, and start the rAF loop. Only called when the canvas exists and we are
 *  in dark mode. */
function startWebGL(canvas: HTMLCanvasElement): void {
  const glCtx = detectWebGL(canvas)
  if (!glCtx) {
    webglSupported.value = false
    return
  }
  gl = glCtx

  if (!initWebGL(gl)) return

  const dpr = window.devicePixelRatio || 1
  canvas.width  = Math.round(canvas.offsetWidth  * dpr)
  canvas.height = Math.round(canvas.offsetHeight * dpr)
  gl.viewport(0, 0, canvas.width, canvas.height)

  const initAfterFonts = () => {
    rebuildMask(canvas)
    nodes = spawnNodes(filledPixels, computeInteriorNodeCount(filledPixels.length), INTERIOR_NODE_MIN_SPEED, INTERIOR_NODE_MAX_SPEED)
    startAnimationLoop()
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(initAfterFonts)
  } else {
    initAfterFonts()
  }

  canvas.addEventListener('webglcontextlost', (e: Event) => {
    e.preventDefault()
    cancelAnimationFrame(frameId)
  })

  canvas.addEventListener('webglcontextrestored', () => {
    const restoredCtx = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext | null
    if (!restoredCtx) return
    gl = restoredCtx
    if (!initWebGL(gl)) return
    rebuildMask(canvas)
    nodes = spawnNodes(filledPixels, computeInteriorNodeCount(filledPixels.length), INTERIOR_NODE_MIN_SPEED, INTERIOR_NODE_MAX_SPEED)
    startTime = 0
    startAnimationLoop()
  })

  resizeObserver = new ResizeObserver(() => {
    const pixelRatio = window.devicePixelRatio || 1
    canvas.width  = Math.round(canvas.offsetWidth  * pixelRatio)
    canvas.height = Math.round(canvas.offsetHeight * pixelRatio)

    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    rebuildMask(canvas)
    nodes = spawnNodes(filledPixels, computeInteriorNodeCount(filledPixels.length), INTERIOR_NODE_MIN_SPEED, INTERIOR_NODE_MAX_SPEED)
  })

  resizeObserver.observe(canvas)
}

/** Tear down the WebGL pipeline (canvas stays in the DOM, but animation and
 *  observers are released). The dark-mode observer and motion-query listener
 *  are kept alive for a potential re-entry into dark mode. */
function stopWebGL(): void {
  cancelAnimationFrame(frameId)

  if (gl) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl = null
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

onMounted(() => {
  // Set up dark-mode detection — always, even if the canvas isn't rendered
  // yet (light mode), so switching to dark mode triggers the watcher.
  darkMode.value = document.documentElement.classList.contains('dark')
  isDarkMode = darkMode.value
  darkModeObserver = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark')
    isDarkMode = isDark
    darkMode.value = isDark
  })
  darkModeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // Detect reduced motion preference
  reducedMotion.value = detectReducedMotion()

  // Only initialise WebGL if the canvas is already visible (dark mode on first load)
  if (canvasRef.value && darkMode.value) {
    startWebGL(canvasRef.value)
  }
})

// When the user toggles the theme, start or stop the WebGL animation.
// nextTick ensures the v-if canvas element is in the DOM before we touch it.
watch(darkMode, async (isDark) => {
  if (isDark && webglSupported.value && !gl) {
    await nextTick()
    if (canvasRef.value) startWebGL(canvasRef.value)
  } else if (!isDark && gl) {
    stopWebGL()
  }
})

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

onUnmounted(() => {
  stopWebGL()

  // Remove the reduced-motion change listener
  if (motionMediaQuery && motionChangeHandler) {
    motionMediaQuery.removeEventListener('change', motionChangeHandler)
    motionMediaQuery = null
    motionChangeHandler = null
  }

  // Disconnect the dark mode observer
  if (darkModeObserver) {
    darkModeObserver.disconnect()
    darkModeObserver = null
  }
})
</script>

<template>
  <canvas
    v-if="webglSupported && darkMode"
    ref="canvasRef"
    class="neuron-hero-canvas"
    aria-label="Cognitive Companion"
    role="img"
  />
  <span
    v-else
    class="neuron-hero-fallback"
  >Cognitive Companion</span>
</template>

<style scoped>
.neuron-hero-canvas {
  display: block;
  width: 100%;
  /* Height set via global CSS to match VPHero .name line-height at each
     breakpoint: 40px (< 640), 56px (640–959), 64px (≥ 960) */
}
</style>
