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
import { ref, onMounted, onUnmounted } from 'vue'
import {
  heroFontSize,
  computeFittedFontSize,
  buildTextMask,
  buildBorderPixels,
  spawnNodes,
  spawnBorderNodes,
  buildEdges,
  getCharPositions,
  buildIntraToBorderEdges,
  nodeColour,
  updateNodes,
  DESKTOP_NODE_COUNT,
  MOBILE_NODE_COUNT,
  GRADIENT_PERIOD_MS,
  SPATIAL_PHASE_SCALE,
} from './NeuronHeroText.utils'
import type { FilledPixel, Node, Edge, CharPosition } from './NeuronHeroText.utils'

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Base distance (physical px at 80px CSS reference font) for interior→border connections. Scaled by font size in rebuildMask. */
const INTERIOR_TO_BORDER_THRESHOLD_BASE = 35
/** Max border-node connections per interior node (K-nearest). */
const MAX_EDGES_PER_INTERIOR = 48

// Border node / outline rendering
/** Minimum physical-pixel spacing between border nodes along the outline. Scaled by DPR in rebuildMask. */
const BORDER_NODE_SPACING_CSS = 1.0   // dense outline: ~2px between nodes
/** Connection threshold for border-to-border outline edges. Scaled by DPR in rebuildMask. */
const BORDER_EDGE_THRESHOLD_CSS = 7  // visual px; catches all physically adjacent nodes at 2px spacing
/** Half-width of border outline edges in CSS pixels. Rendered as geometry (triangles) so
 *  the thickness is reliable across all WebGL implementations. Scaled by DPR in drawFrame. */
const BORDER_EDGE_HALF_WIDTH_CSS = 0.5

// Per-node rendering sizes (gl_PointSize in physical pixels)
const INTERIOR_NODE_SIZE = 2.5
const BORDER_NODE_SIZE   = 0.1   // smaller than before; outline shape comes from edges not dots

// Per-node alpha
const INTERIOR_NODE_ALPHA = 0.9
const BORDER_NODE_ALPHA   = 0.0

// ---------------------------------------------------------------------------
// Reactive state (controls template branching)
// ---------------------------------------------------------------------------

const canvasRef      = ref<HTMLCanvasElement | null>(null)
const webglSupported = ref(true)
const reducedMotion  = ref(false)

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
let fontScaleCSS:                  number = 1.0     // cssFontSize / 80; updated in rebuildMask
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

// ---------------------------------------------------------------------------
// Task 4.2 — detectWebGL and detectReducedMotion helpers
// Validates: Requirements 3.3, 7.2
// ---------------------------------------------------------------------------

/**
 * Attempts to obtain a WebGL rendering context from the given canvas.
 * Returns the context on success, or null if WebGL is unavailable.
 */
function detectWebGL(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  return canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext | null
}

/**
 * Reads the initial `prefers-reduced-motion` state and attaches a change
 * listener that keeps the `reducedMotion` ref in sync.
 * Returns the initial `matches` value.
 */
function detectReducedMotion(): boolean {
  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionChangeHandler = (e: MediaQueryListEvent) => {
    reducedMotion.value = e.matches
  }
  motionMediaQuery.addEventListener('change', motionChangeHandler)
  return motionMediaQuery.matches
}

// ---------------------------------------------------------------------------
// Task 4.3 — initWebGL: compile shaders and create GPU buffers
// Validates: Requirements 2.1, 2.2, 2.3, 7.2
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
// Task 4.4 — drawFrame: per-frame draw call
// Validates: Requirements 1.1, 2.1, 2.2, 2.3, 3.1, 3.2
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

  // In light mode the brand colours need to be darker to read against white.
  // 0.55 brings the saturated blues/purples down to a clearly visible, non-harsh value.
  const cs = isDarkMode ? 1.0 : 1.0

  // --- Interior nodes ---
  for (let i = 0; i < iCount; i++) {
    const n = iNodes[i]
    const [r, g, b] = nodeColour(n.x, canvasWidth, timeMs, reducedMotion.value)
    packVertex(data, i * FLOATS_PER_VERTEX, n.x, n.y, INTERIOR_NODE_ALPHA, r * cs, g * cs, b * cs, INTERIOR_NODE_SIZE)
  }

  // --- Border nodes ---
  for (let i = 0; i < bCount; i++) {
    const n = bNodes[i]
    const [r, g, b] = nodeColour(n.x, canvasWidth, timeMs, reducedMotion.value)
    packVertex(data, (iCount + i) * FLOATS_PER_VERTEX, n.x, n.y, BORDER_NODE_ALPHA, r * cs, g * cs, b * cs, BORDER_NODE_SIZE)
  }

  // --- Interior edge vertices (two per edge) ---
  // edge.j >= iCount means the endpoint is a border node (offset by iCount).
  for (let e = 0; e < iEdges.length; e++) {
    const edge = iEdges[e]
    const nA = iNodes[edge.i]
    const nB = edge.j < iCount ? iNodes[edge.j] : bNodes[edge.j - iCount]
    const [rA, gA, bA] = nodeColour(nA.x, canvasWidth, timeMs, reducedMotion.value)
    const [rB, gB, bB] = nodeColour(nB.x, canvasWidth, timeMs, reducedMotion.value)
    const baseA = (totalNodes + e * 2) * FLOATS_PER_VERTEX
    packVertex(data, baseA,                    nA.x, nA.y, edge.alpha, rA * cs, gA * cs, bA * cs, 0)
    packVertex(data, baseA + FLOATS_PER_VERTEX, nB.x, nB.y, edge.alpha, rB * cs, gB * cs, bB * cs, 0)
  }

  // --- Border edge thick-quad vertices (2 triangles = 6 vertices per edge) ---
  // Each edge is a screen-aligned rectangle perpendicular to the edge direction,
  // giving reliable sub-pixel-accurate thickness on all WebGL 1 implementations
  // (gl.lineWidth is capped at 1 on most GPUs/browsers).
  // Scale edge thickness by font size so borders look proportional at all breakpoints
  const halfW = BORDER_EDGE_HALF_WIDTH_CSS * currentDpr * fontScaleCSS
  const bEdgeStart = totalNodes + iEdgeV
  for (let e = 0; e < bEdges.length; e++) {
    const edge = bEdges[e]
    const nA = bNodes[edge.i], nB = bNodes[edge.j]
    const [rA, gA, bA] = nodeColour(nA.x, canvasWidth, timeMs, reducedMotion.value)
    const [rB, gB, bB] = nodeColour(nB.x, canvasWidth, timeMs, reducedMotion.value)
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
      // Interior nodes connect to K nearest border nodes each frame (nodes drift).
      // cachedBorderEdges is precomputed in rebuildMask — border nodes are fixed.
      const iEdges = buildIntraToBorderEdges(nodes, borderNodes, charPositions, interiorToBorderThreshold, MAX_EDGES_PER_INTERIOR, maskSet, canvas.width)
      drawFrame(gl, nodes, borderNodes, iEdges, cachedBorderEdges, elapsed, canvas.width)
    }

    frameId = requestAnimationFrame(loop)
  }

  frameId = requestAnimationFrame(loop)
}

// ---------------------------------------------------------------------------
// Task 4.5 — onMounted: full initialisation sequence
// Validates: Requirements 1.1, 1.2, 6.1, 7.1, 7.2
// ---------------------------------------------------------------------------

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

  // All threshold distances scale proportionally to font size relative to the 80px CSS
  // reference so the visual density stays consistent across mobile / tablet / desktop.
  // At 44px mobile: fontScaleCSS ≈ 0.55 → thresholds roughly halved vs desktop.
  //fontScaleCSS = Math.min(1.2, Math.max(0.7, cssFontTarget / 80))
  fontScaleCSS = 1.0
  const borderSpacing = Math.max(1, Math.round(BORDER_NODE_SPACING_CSS * dpr * fontScaleCSS))
  borderEdgeThreshold = Math.round(BORDER_EDGE_THRESHOLD_CSS * dpr * fontScaleCSS)
  interiorToBorderThreshold = Math.max(5, Math.round(INTERIOR_TO_BORDER_THRESHOLD_BASE * fontScaleCSS))
  const borderPixels  = buildBorderPixels(filledPixels, maskSet, canvas.width)
  borderNodes         = spawnBorderNodes(borderPixels, borderSpacing)
  // Threshold-based edges connect all physically adjacent border nodes.
  // Cross-character suppression is handled by the midpoint mask check (pass maskSet):
  // if an edge's midpoint falls in the empty gap between two letters it is rejected.
  // This is more reliable than zone-based charPositions filtering, which misclassifies
  // bottom-corner nodes due to kerning and causes missing edges at the base of 'n', 'm', 'i'.
  cachedBorderEdges = buildEdges(borderNodes, borderEdgeThreshold, [], maskSet, canvas.width)
}

onMounted(() => {
  // Guard against SSR
  if (!canvasRef.value) return

  const canvas = canvasRef.value

  // Detect WebGL support
  const glCtx = detectWebGL(canvas)
  if (!glCtx) {
    webglSupported.value = false
    return
  }
  gl = glCtx

  // Detect reduced motion preference
  reducedMotion.value = detectReducedMotion()

  // Track VitePress dark/light mode (toggles .dark class on <html>)
  isDarkMode = document.documentElement.classList.contains('dark')
  darkModeObserver = new MutationObserver(() => {
    isDarkMode = document.documentElement.classList.contains('dark')
  })
  darkModeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // Compile shaders and create GPU buffers
  if (!initWebGL(gl)) return

  // Size the canvas to its parent element (physical pixels = CSS pixels × DPR)
  const dpr = window.devicePixelRatio || 1
  canvas.width  = Math.round(canvas.offsetWidth  * dpr)
  canvas.height = Math.round(canvas.offsetHeight * dpr)
  gl.viewport(0, 0, canvas.width, canvas.height)

  // Wait for web fonts (Inter) to load before building the text mask so
  // measureText returns correct widths for character-position classification.
  const initAfterFonts = () => {
    rebuildMask(canvas)
    const nodeCount = window.innerWidth < 640 ? MOBILE_NODE_COUNT : DESKTOP_NODE_COUNT
    nodes = spawnNodes(filledPixels, nodeCount)
    startAnimationLoop()
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(initAfterFonts)
  } else {
    initAfterFonts()
  }

  // Handle WebGL context loss / restoration
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
    const nc = window.innerWidth < 640 ? MOBILE_NODE_COUNT : DESKTOP_NODE_COUNT
    nodes = spawnNodes(filledPixels, nc)
    startTime = 0
    startAnimationLoop()
  })

  // ---------------------------------------------------------------------------
  // Task 4.6 — ResizeObserver callback
  // Validates: Requirements 5.1, 5.2, 5.3, 5.4
  // ---------------------------------------------------------------------------

  resizeObserver = new ResizeObserver(() => {
    const pixelRatio = window.devicePixelRatio || 1
    canvas.width  = Math.round(canvas.offsetWidth  * pixelRatio)
    canvas.height = Math.round(canvas.offsetHeight * pixelRatio)

    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    rebuildMask(canvas)
    const newNodeCount = window.innerWidth < 640 ? MOBILE_NODE_COUNT : DESKTOP_NODE_COUNT
    nodes = spawnNodes(filledPixels, newNodeCount)
  })

  resizeObserver.observe(canvas)
})

// ---------------------------------------------------------------------------
// Task 4.7 — onUnmounted cleanup
// Validates: Requirements 7.1
// ---------------------------------------------------------------------------

onUnmounted(() => {
  // Cancel the animation loop
  cancelAnimationFrame(frameId)

  // Release the WebGL context
  if (gl) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl = null
  }

  // Remove the reduced-motion change listener
  if (motionMediaQuery && motionChangeHandler) {
    motionMediaQuery.removeEventListener('change', motionChangeHandler)
    motionMediaQuery = null
    motionChangeHandler = null
  }

  // Disconnect the ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // Disconnect the dark mode observer
  if (darkModeObserver) {
    darkModeObserver.disconnect()
    darkModeObserver = null
  }
})
</script>

<!-- Task 4.8 — Template and scoped styles
     Validates: Requirements 6.1, 7.2, 7.3 -->
<template>
  <canvas
    v-if="webglSupported"
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
