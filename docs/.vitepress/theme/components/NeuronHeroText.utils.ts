/**
 * Pure utility functions for NeuronHeroText.
 * Exported from a co-located module so test files can import them directly
 * without needing to parse the Vue SFC.
 */

/**
 * Returns the hero font size in pixels matching VitePress VPHero .name
 * responsive breakpoints.
 *
 * | Viewport width | Font size |
 * |----------------|-----------|
 * | < 640 px       | 32 px     |
 * | 640–959 px     | 48 px     |
 * | ≥ 960 px       | 56 px     |
 *
 * Validates: Requirements 5.3
 */
export function heroFontSize(viewportWidth: number): number {
  if (viewportWidth < 640) return 44
  if (viewportWidth < 960) return 64
  return 80
}

/**
 * A pixel coordinate returned by buildTextMask.
 * Represents a canvas pixel whose alpha channel exceeds the threshold (128)
 * when "Cognitive Companion" is rasterised at the given font size.
 */
export interface FilledPixel {
  x: number // integer pixel column
  y: number // integer pixel row
}

/**
 * Font stack matching `--vp-font-family-base` used by VitePress.
 */
const VP_FONT_STACK =
  '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'

/**
 * Alpha threshold above which a pixel is considered "filled".
 */
const ALPHA_THRESHOLD = 128

/**
 * Rasterises "Cognitive Companion" onto an offscreen 2D canvas and returns
 * every pixel whose alpha channel exceeds ALPHA_THRESHOLD as a FilledPixel.
 *
 * The text is centred horizontally and vertically within the canvas.
 * Uses `document.createElement('canvas')` for broad environment compatibility.
 *
 * Returns an empty array (without calling getImageData) when width or height
 * is 0. Emits a console.warn when the resulting pixel array is empty.
 *
 * This function is synchronous and completes within a single call.
 *
 * Validates: Requirements 1.2, 5.3, 7.4
 */
export function buildTextMask(
  width: number,
  height: number,
  fontSize: number,
): FilledPixel[] {
  // Guard: zero-size canvas — skip getImageData entirely
  if (width <= 0 || height <= 0) {
    return []
  }

  // Create an offscreen 2D canvas
  const offscreen = document.createElement('canvas')
  offscreen.width = Math.round(width)
  offscreen.height = Math.round(height)

  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    console.warn(
      'buildTextMask: could not obtain 2D context from offscreen canvas',
    )
    return []
  }

  // Clear to transparent
  ctx.clearRect(0, 0, offscreen.width, offscreen.height)

  // Configure text rendering
  ctx.font = `bold ${fontSize}px ${VP_FONT_STACK}`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Draw text centred in the canvas
  ctx.fillText('Cognitive Companion', offscreen.width / 2, offscreen.height / 2)

  // Read pixel data synchronously
  const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
  const { data, width: w, height: h } = imageData

  const pixels: FilledPixel[] = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Alpha channel is at index (y * w + x) * 4 + 3
      const alpha = data[(y * w + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        pixels.push({ x, y })
      }
    }
  }

  if (pixels.length === 0) {
    console.warn(
      'buildTextMask: no filled pixels found — font may not be loaded or canvas is too small',
    )
  }

  return pixels
}

/**
 * Interior (drifting) node count used on viewports ≥ 640 px wide.
 *
 * Validates: Requirements 5.4
 */
export const DESKTOP_NODE_COUNT = 300

/**
 * Interior (drifting) node count used on viewports < 640 px wide.
 *
 * Validates: Requirements 5.4
 */
export const MOBILE_NODE_COUNT = 120

/**
 * Upper bound on node velocity magnitude in pixels per frame.
 */
export const MAX_SPEED = 0.5

/**
 * A single node positioned within the text mask.
 * Border nodes (isBorder = true) are fixed outline nodes with vx = vy = 0;
 * interior nodes drift inside the letterform.
 */
export interface Node {
  x: number        // current x position (canvas pixels)
  y: number        // current y position (canvas pixels)
  vx: number       // x velocity (px/frame); 0 for border nodes
  vy: number       // y velocity (px/frame); 0 for border nodes
  isBorder: boolean
}

/**
 * Minimum node velocity magnitude in pixels per frame.
 */
const MIN_SPEED = 0.05

/**
 * Samples `count` positions uniformly at random from `pixels` (with
 * replacement) and assigns each a random velocity with magnitude uniformly
 * distributed in [MIN_SPEED, MAX_SPEED] and a uniformly random direction.
 *
 * Returns an empty array when `pixels` is empty.
 *
 * Validates: Requirements 1.4, 4.1
 */
export function spawnNodes(pixels: FilledPixel[], count: number): Node[] {
  if (pixels.length === 0) {
    return []
  }

  const nodes: Node[] = []

  for (let i = 0; i < count; i++) {
    // Sample a random pixel position (with replacement)
    const pixel = pixels[Math.floor(Math.random() * pixels.length)]

    // Random direction: angle uniformly in [0, 2π)
    const angle = Math.random() * 2 * Math.PI

    // Random magnitude uniformly in [MIN_SPEED, MAX_SPEED]
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)

    nodes.push({
      x: pixel.x,
      y: pixel.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      isBorder: false,
    })
  }

  return nodes
}

/**
 * Returns the subset of filled pixels that lie on the silhouette of the text —
 * i.e. any filled pixel that has at least one 4-connected neighbour outside
 * the mask. Used to seed the fixed border-node ring.
 *
 * `maskSet` must be built with `y * canvasWidth + x` keys.
 */
export function buildBorderPixels(
  filledPixels: FilledPixel[],
  maskSet: Set<number>,
  canvasWidth: number,
): FilledPixel[] {
  const border: FilledPixel[] = []
  for (const { x, y } of filledPixels) {
    if (
      !maskSet.has((y - 1) * canvasWidth + x) ||
      !maskSet.has((y + 1) * canvasWidth + x) ||
      !maskSet.has(y * canvasWidth + (x - 1)) ||
      !maskSet.has(y * canvasWidth + (x + 1))
    ) {
      border.push({ x, y })
    }
  }
  return border
}

/**
 * Samples border pixels such that no two selected nodes are closer than
 * `minSpacing` pixels, producing a sparse ring that traces the character
 * outlines. Each returned node has vx = vy = 0 (fixed in place) and
 * isBorder = true.
 *
 * Uses a grid-based approach for O(n) performance.
 */
export function spawnBorderNodes(
  borderPixels: FilledPixel[],
  minSpacing: number,
): Node[] {
  if (borderPixels.length === 0) return []

  const nodes: Node[] = []
  const cellSize = Math.max(1, Math.floor(minSpacing))
  // Track which grid cells are occupied (key = cellY * 4096 + cellX)
  const occupied = new Set<number>()

  for (const pixel of borderPixels) {
    const cellX = Math.floor(pixel.x / cellSize)
    const cellY = Math.floor(pixel.y / cellSize)

    // Check 3 × 3 neighbourhood to enforce minimum spacing
    let tooClose = false
    for (let dy = -1; dy <= 1 && !tooClose; dy++) {
      for (let dx = -1; dx <= 1 && !tooClose; dx++) {
        if (occupied.has((cellY + dy) * 4096 + (cellX + dx))) {
          tooClose = true
        }
      }
    }

    if (!tooClose) {
      occupied.add(cellY * 4096 + cellX)
      nodes.push({ x: pixel.x, y: pixel.y, vx: 0, vy: 0, isBorder: true })
    }
  }

  return nodes
}

/**
 * Duration of one full colour gradient cycle in milliseconds.
 * Matches the CSS custom property `--cc-brand-gradient-duration`.
 *
 * Validates: Requirements 3.1
 */
export const GRADIENT_PERIOD_MS = 60_000

/**
 * Fraction of one gradient cycle that separates the left edge from the right
 * edge of the canvas. The gradient wave travels left→right: the right side
 * lags this many cycles behind the left side, so at any moment a 0.7-cycle
 * colour spread is visible across the text.
 *
 * Validates: Requirements 3.2
 */
export const SPATIAL_PHASE_SCALE = 1.0

/**
 * Brand colour stops as normalised RGB triples, matching the CSS gradient:
 *   linear-gradient(120deg, #0a84ff 0%, #5e5ce6 60%, #bf5af2 100%)
 *
 * Stop positions mirror the CSS percentages so gradient sampling feels identical.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */
export const BRAND_STOPS: [number, number, number][] = [
  [10 / 255,  132 / 255, 255 / 255], // #0a84ff  (t = 0.0)
  [94 / 255,   92 / 255, 230 / 255], // #5e5ce6  (t = 0.6 — matches CSS 60%)
  [191 / 255,  90 / 255, 242 / 255], // #bf5af2  (t = 1.0)
]

/** CSS gradient stop positions matching the percentages above. */
const BRAND_STOP_T = [0.0, 0.6, 1.0] as const

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Computes the brand gradient colour for a node at horizontal position `x`.
 *
 * Temporal phase uses a cosine ease-in-out oscillation that exactly replicates
 * the CSS `animation: cc-gradient-drift 18s ease-in-out infinite` behaviour:
 *   rawT     = (timeMs / GRADIENT_PERIOD_MS) % 1.0   — linear [0, 1)
 *   temporal = (1 - cos(2π · rawT)) / 2              — smooth ping-pong [0, 1]
 *
 * This oscillates 0 → 1 → 0 with ease-in-out at both endpoints, matching the
 * CSS keyframes (0% → 100% → 0%) and preventing any perceptible jump at the
 * period boundary.
 *
 * Spatial phase adds a gentle left-to-right shift (SPATIAL_PHASE_SCALE = 0.4)
 * so the whole word drifts through the gradient together — the same cohesive
 * feel as the CSS gradient on the text background.
 *
 * Gradient sampling uses the CSS stop positions (indigo at t = 0.6, not 0.5)
 * so the blue phase is held slightly longer, matching the CSS appearance.
 *
 * When `canvasWidth` is 0, the spatial phase contribution is treated as 0.
 *
 * Returns a normalised RGB triple [r, g, b] in [0, 1].
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */
export function nodeColour(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  timeMs: number,
  reducedMotion: boolean,
): [number, number, number] {
  // Normalised coordinates (centre y = 0)
  const u = canvasWidth  > 0 ? x / canvasWidth                       : 0
  const v = canvasHeight > 0 ? (y - canvasHeight / 2) / canvasHeight : 0

  // Subtle multi-harmonic wobbles. Periods are integer fractions of
  // GRADIENT_PERIOD_MS (PERIOD/3, /5, /7) so the function still strictly
  // cycles every PERIOD — but within a cycle the harmonics interact to
  // bend the iso-lines and ease the sweep, giving an organic, fluid feel
  // instead of a rigid metronome.
  const wob1 = reducedMotion ? 0 : Math.sin((timeMs / GRADIENT_PERIOD_MS) * 2 * Math.PI * 3)
  const wob2 = reducedMotion ? 0 : Math.sin((timeMs / GRADIENT_PERIOD_MS) * 2 * Math.PI * 5)
  const wob3 = reducedMotion ? 0 : Math.sin((timeMs / GRADIENT_PERIOD_MS) * 2 * Math.PI * 7)

  // Spatial phase: horizontal sweep + a y-dependent skew that breathes
  // slowly, bending the colour iso-lines into soft curves rather than
  // rigid vertical bands. Magnitudes kept small so the change reads as
  // a smooth wave, not as a colour swap.
  const horizontalPhase = u * SPATIAL_PHASE_SCALE
  const skew            = v * 0.12 * wob1
  const breath          = 0.02 * wob2
  const spatialPhase    = horizontalPhase + skew + breath

  // Temporal phase: base linear advance + a tiny ease so the sweep
  // imperceptibly speeds up and slows down instead of ticking.
  const baseT          = reducedMotion ? 0.5 : (timeMs / GRADIENT_PERIOD_MS) % 1.0
  const temporalWobble = 0.025 * wob3
  const temporalPhase  = baseT + temporalWobble

  const t = ((spatialPhase + temporalPhase) % 1.0 + 1.0) % 1.0

  // Smoothstep eases each segment at its endpoints — replaces the
  // piecewise-linear sampling whose slope kink at the indigo stop (t=0.6)
  // made the colour change read as a hard "swap" rather than a smooth
  // gradient. With smoothstep the derivative is continuous through every
  // stop, so the wave glides between hues.
  const smooth = (k: number) => k * k * (3 - 2 * k)

  let r: number, g: number, b: number
  if (t <= BRAND_STOP_T[1]) {
    const localT = smooth(t / BRAND_STOP_T[1])
    r = lerp(BRAND_STOPS[0][0], BRAND_STOPS[1][0], localT)
    g = lerp(BRAND_STOPS[0][1], BRAND_STOPS[1][1], localT)
    b = lerp(BRAND_STOPS[0][2], BRAND_STOPS[1][2], localT)
  } else {
    const localT = smooth((t - BRAND_STOP_T[1]) / (BRAND_STOP_T[2] - BRAND_STOP_T[1]))
    r = lerp(BRAND_STOPS[1][0], BRAND_STOPS[2][0], localT)
    g = lerp(BRAND_STOPS[1][1], BRAND_STOPS[2][1], localT)
    b = lerp(BRAND_STOPS[1][2], BRAND_STOPS[2][2], localT)
  }

  return [r, g, b]
}

/**
 * A connection between two nodes in the neural network graph.
 * Alpha is proportional to proximity: 1 when nodes are coincident, 0 at threshold distance.
 */
export interface Edge {
  i: number     // index of first node in the nodes array
  j: number     // index of second node in the nodes array
  alpha: number // [0, 1]; decreases linearly with distance
}

/**
 * Advances each node by its velocity, keeping nodes within the text mask.
 *
 * For each node:
 * 1. If `reducedMotion` is true, skip all movement.
 * 2. If `mask` is empty, skip all movement.
 * 3. Compute the candidate next position by rounding `node.x + node.vx` and
 *    `node.y + node.vy`.
 * 4. If the candidate is in `maskSet`, move the node there.
 * 5. Otherwise, try axis-aligned reflections in order:
 *    a. Flip vx only  (reflect off vertical boundary)
 *    b. Flip vy only  (reflect off horizontal boundary)
 *    c. Flip both vx and vy  (corner reflection)
 *    Pick the first candidate that lands on a filled pixel and update the
 *    velocity accordingly.
 * 6. If no reflection works (e.g. very thin stroke), teleport the node to a
 *    random filled pixel without changing its velocity.
 *
 * `maskSet` encodes positions as `y * canvasWidth + x` for O(1) membership
 * tests. `canvasWidth` must match the width used when building `maskSet`.
 *
 * Mutates `nodes` in-place; returns nothing.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 3.3
 */
export function updateNodes(
  nodes: Node[],
  mask: FilledPixel[],
  maskSet: Set<number>,
  canvasWidth: number,
  reducedMotion: boolean,
): void {
  // Nothing to do when reduced motion is active or there are no filled pixels
  if (reducedMotion || mask.length === 0) {
    return
  }

  for (const node of nodes) {
    const cx = Math.round(node.x + node.vx)
    const cy = Math.round(node.y + node.vy)

    // 1. Straight move — candidate is inside the mask
    if (maskSet.has(cy * canvasWidth + cx)) {
      node.x = cx
      node.y = cy
      continue
    }

    // 2. Try reflection: flip vx only
    const rx1 = Math.round(node.x - node.vx)
    const ry1 = Math.round(node.y + node.vy)
    if (maskSet.has(ry1 * canvasWidth + rx1)) {
      node.vx = -node.vx
      node.x = rx1
      node.y = ry1
      continue
    }

    // 3. Try reflection: flip vy only
    const rx2 = Math.round(node.x + node.vx)
    const ry2 = Math.round(node.y - node.vy)
    if (maskSet.has(ry2 * canvasWidth + rx2)) {
      node.vy = -node.vy
      node.x = rx2
      node.y = ry2
      continue
    }

    // 4. Try reflection: flip both vx and vy
    const rx3 = Math.round(node.x - node.vx)
    const ry3 = Math.round(node.y - node.vy)
    if (maskSet.has(ry3 * canvasWidth + rx3)) {
      node.vx = -node.vx
      node.vy = -node.vy
      node.x = rx3
      node.y = ry3
      continue
    }

    // 5. No reflection worked — teleport to a random filled pixel
    const pixel = mask[Math.floor(Math.random() * mask.length)]
    node.x = pixel.x
    node.y = pixel.y
  }
}

/**
 * Iterates all pairs (i, j) where i < j and returns an edge for each pair
 * whose Euclidean distance is less than or equal to `threshold`.
 *
 * Alpha is computed as `1 - dist / threshold`, giving 1 for coincident nodes
 * and approaching 0 as distance approaches the threshold.
 *
 * When `charPositions` is provided, cross-character edges are suppressed —
 * two nodes classified into different characters are never connected even if
 * they are within threshold distance. Pass an empty array to disable.
 *
 * When `maskSet` and `canvasWidth` are provided, edges whose midpoint falls
 * outside the filled text mask are discarded. This prevents connections from
 * bridging the open counters inside letters like 'e', 'a', and 'o'.
 *
 * Returns an empty array when `threshold` is 0 (avoids division by zero)
 * or when `nodes` has fewer than 2 elements.
 *
 * Validates: Requirements 1.3, 2.2
 */
export function buildEdges(
  nodes: Node[],
  threshold: number,
  charPositions: CharPosition[] = [],
  maskSet?: Set<number>,
  canvasWidth?: number,
): Edge[] {
  if (threshold <= 0 || nodes.length < 2) return []

  const nodeChar: number[] = charPositions.length > 0
    ? nodes.map(n => getCharIndex(n.x, charPositions))
    : []

  const edges: Edge[] = []

  for (let i = 0; i < nodes.length - 1; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      // When charPositions is supplied, both endpoints must be classified into
      // the *same* character. Unclassified nodes (x outside any char box) are
      // excluded entirely so kerning gaps never leak into outline edges.
      if (nodeChar.length > 0) {
        if (nodeChar[i] < 0 || nodeChar[j] < 0 || nodeChar[i] !== nodeChar[j]) continue
      }

      const dx = nodes[j].x - nodes[i].x
      const dy = nodes[j].y - nodes[i].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > threshold) continue

      if (maskSet && canvasWidth !== undefined) {
        const mx = Math.round((nodes[i].x + nodes[j].x) / 2)
        const my = Math.round((nodes[i].y + nodes[j].y) / 2)
        if (!maskSet.has(my * canvasWidth + mx)) continue
      }

      edges.push({ i, j, alpha: 1 - dist / threshold })
    }
  }

  return edges
}

// ---------------------------------------------------------------------------
// Font fitting
// ---------------------------------------------------------------------------

const HERO_TEXT = 'Cognitive Companion'

/**
 * Computes the largest font size (in canvas physical pixels) that keeps
 * "Cognitive Companion" within the canvas bounds.
 *
 * Starting from `targetFontSize`, the function:
 * 1. Caps to 88% of canvas height (so ascenders/descenders don't clip).
 * 2. Measures the text width and scales down further if the text would
 *    overflow the canvas width (leaving 4% padding on each side).
 *
 * Both `buildTextMask` and `getCharPositions` must use the same value
 * returned here so the character-position map matches the rasterised mask.
 */
export function computeFittedFontSize(
  targetFontSize: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  if (canvasWidth <= 0 || canvasHeight <= 0) return targetFontSize

  // Cap to height first
  let fontSize = Math.min(targetFontSize, canvasHeight * 0.88)

  // Measure text width at this font size
  const offscreen = document.createElement('canvas')
  const ctx = offscreen.getContext('2d')
  if (!ctx) return fontSize

  ctx.font = `bold ${fontSize}px ${VP_FONT_STACK}`
  const textWidth = ctx.measureText(HERO_TEXT).width

  // Scale down to fit within 99% of canvas width (1% safety margin).
  // Using 0.99 instead of a larger margin ensures the fitted font is as
  // close as possible to the vh-text font size at every breakpoint.
  if (textWidth > canvasWidth * 0.99) {
    fontSize *= (canvasWidth * 0.99) / textWidth
  }

  return fontSize
}

// ---------------------------------------------------------------------------
// Character-aware rendering
// ---------------------------------------------------------------------------

/** Describes the horizontal extent of a single character in the text mask. */
export interface CharPosition {
  charX: number      // left edge x (canvas pixels)
  charWidth: number  // width (canvas pixels)
  charIndex: number  // position in the text (0-based)
  char: string       // the character itself
}

/**
 * Measures each character of "Cognitive Companion" at the given font size and
 * returns an array describing where each character sits horizontally on a
 * canvas of the given width (text is centred).
 *
 * A tiny offscreen canvas is used for measurement only — this does not
 * rasterise the full mask.
 */
export function getCharPositions(
  fontSize: number,
  canvasWidth: number,
): CharPosition[] {
  const offscreen = document.createElement('canvas')
  const ctx = offscreen.getContext('2d')!

  // Guard: some test environments (happy-dom) don't implement measureText
  if (typeof ctx.measureText !== 'function') {
    return []
  }

  ctx.font = `bold ${fontSize}px ${VP_FONT_STACK}`

  const chars = HERO_TEXT.split('')
  const charWidths = chars.map((c) => ctx.measureText(c).width)
  const totalWidth = charWidths.reduce((a, b) => a + b, 0)

  // Centre the text horizontally (matches buildTextMask textAlign = 'center')
  const startX = (canvasWidth - totalWidth) / 2

  const positions: CharPosition[] = []
  let cursorX = startX

  for (let i = 0; i < chars.length; i++) {
    positions.push({
      charX: Math.round(cursorX),
      charWidth: Math.round(charWidths[i]),
      charIndex: i,
      char: chars[i],
    })
    cursorX += charWidths[i]
  }

  return positions
}

/**
 * Returns the character index for a node at horizontal position `x`.
 * Returns -1 if the node doesn't fall within any character region.
 */
function getCharIndex(x: number, positions: CharPosition[]): number {
  for (let i = positions.length - 1; i >= 0; i--) {
    if (x >= positions[i].charX && x < positions[i].charX + positions[i].charWidth) {
      return i
    }
  }
  return -1
}

/**
 * Builds only intra-character edges (local connections within each letterform).
 * Called every animation frame since interior node positions change.
 */
export function buildIntraCharEdges(
  nodes: Node[],
  charPositions: CharPosition[],
  intraThreshold: number,
): Edge[] {
  const n = nodes.length
  if (n < 2 || intraThreshold <= 0) return []

  if (charPositions.length === 0) {
    return buildEdges(nodes, intraThreshold)
  }

  const charNodes: number[][] = charPositions.map(() => [])
  for (let i = 0; i < n; i++) {
    const ci = getCharIndex(nodes[i].x, charPositions)
    if (ci >= 0) charNodes[ci].push(i)
  }

  const edges: Edge[] = []
  for (const indices of charNodes) {
    const m = indices.length
    for (let a = 0; a < m - 1; a++) {
      for (let b = a + 1; b < m; b++) {
        const ni = indices[a], nj = indices[b]
        const dx = nodes[nj].x - nodes[ni].x
        const dy = nodes[nj].y - nodes[ni].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= intraThreshold) {
          edges.push({ i: ni, j: nj, alpha: 1 - dist / intraThreshold })
        }
      }
    }
  }
  return edges
}

/**
 * Builds inter-word bridge edges — 2 to `interPerGap` random connections that
 * cross each space boundary (right side of the last letter before a space to
 * the left side of the first letter after the space).
 *
 * Only fires at word boundaries, not between every adjacent character pair.
 * Call once when nodes are instantiated and cache the result.
 */
export function buildInterCharBridges(
  nodes: Node[],
  charPositions: CharPosition[],
  intraThreshold: number,
  interPerGap: number,
): Edge[] {
  if (nodes.length < 2 || charPositions.length === 0) return []

  const charNodes: number[][] = charPositions.map(() => [])
  for (let i = 0; i < nodes.length; i++) {
    const ci = getCharIndex(nodes[i].x, charPositions)
    if (ci >= 0) charNodes[ci].push(i)
  }

  const edges: Edge[] = []

  for (let ci = 0; ci < charPositions.length - 1; ci++) {
    // Skip the space itself
    if (charPositions[ci].char === ' ') continue

    // Find the next non-space character
    let nextCi = ci + 1
    while (nextCi < charPositions.length && charPositions[nextCi].char === ' ') nextCi++
    if (nextCi >= charPositions.length) continue

    // Only bridge at word boundaries (a space sits between ci and nextCi)
    if (nextCi === ci + 1) continue

    // Ensure we only process each word boundary once (from the last char before the gap)
    if (ci + 1 < nextCi && charPositions[ci + 1].char !== ' ') continue

    const rightEdge = charPositions[ci].charX + charPositions[ci].charWidth
    const leftEdge  = charPositions[nextCi].charX

    // Use rightmost third of the word's last char, leftmost third of the next word's first char
    const rightZone = charPositions[ci].charWidth / 3
    const leftZone  = charPositions[nextCi].charWidth / 3
    const rightCandidates = charNodes[ci].filter(ni => nodes[ni].x >= rightEdge - rightZone)
    const leftCandidates  = charNodes[nextCi].filter(ni => nodes[ni].x <= leftEdge + leftZone)

    if (rightCandidates.length === 0 || leftCandidates.length === 0) continue

    const minBridges = Math.min(2, rightCandidates.length, leftCandidates.length)
    const maxBridges = Math.min(interPerGap, rightCandidates.length, leftCandidates.length)
    const pairCount  = minBridges + Math.floor(Math.random() * (maxBridges - minBridges + 1))

    for (let k = 0; k < pairCount; k++) {
      const ni = rightCandidates[Math.floor(Math.random() * rightCandidates.length)]
      const nj = leftCandidates[Math.floor(Math.random() * leftCandidates.length)]
      const dx = nodes[nj].x - nodes[ni].x
      const dy = nodes[nj].y - nodes[ni].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      edges.push({ i: ni, j: nj, alpha: Math.max(0.4, 1 - dist / (intraThreshold * 4)) })
    }
  }

  return edges
}

/**
 * For each interior (drifting) node, finds the K nearest border nodes that
 * share the same character and whose connecting edge midpoint lies within the
 * filled text mask. Returns edges where:
 *
 *   edge.i = index into iNodes
 *   edge.j = iNodes.length + index into bNodes
 *
 * The offset in j allows drawFrame to dispatch each endpoint to the correct
 * source array without a separate edge type.
 *
 * Interior→border connections make each letterform legible: interior nodes
 * radiate toward the outline rather than connecting across open counters (as
 * in 'e', 'a', 'o'). The midpoint check ensures the 'i' dot stays visually
 * separated from the vertical stroke — any edge crossing that gap is rejected.
 */
export function buildIntraToBorderEdges(
  iNodes: Node[],
  bNodes: Node[],
  charPositions: CharPosition[],
  threshold: number,
  maxEdgesPerNode: number,
  maskSet: Set<number>,
  canvasWidth: number,
): Edge[] {
  if (iNodes.length === 0 || bNodes.length === 0 || threshold <= 0) return []

  const iChar = charPositions.length > 0
    ? iNodes.map(n => getCharIndex(n.x, charPositions))
    : iNodes.map(() => -1)
  const bChar = charPositions.length > 0
    ? bNodes.map(n => getCharIndex(n.x, charPositions))
    : bNodes.map(() => -1)

  // Group border nodes by character so each interior node only scans same-char borders.
  const bByChar = new Map<number, number[]>()
  for (let j = 0; j < bNodes.length; j++) {
    const c = bChar[j]
    if (!bByChar.has(c)) bByChar.set(c, [])
    bByChar.get(c)!.push(j)
  }

  const iOffset = iNodes.length  // j-values ≥ iOffset indicate border nodes
  const edges: Edge[] = []

  for (let i = 0; i < iNodes.length; i++) {
    const ni = iNodes[i]
    const ci = iChar[i]
    const eligible = bByChar.get(ci) ?? []
    if (eligible.length === 0) continue

    type Cand = { j: number; dist: number; alpha: number }
    const candidates: Cand[] = []

    for (const j of eligible) {
      const nb = bNodes[j]
      const dx = nb.x - ni.x
      const dy = nb.y - ni.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > threshold) continue

      // Sample several points along the edge — every sample must lie inside
      // the mask. The single-midpoint check was insufficient at small fonts:
      // an edge could skip across a narrow counter (the void inside 'e', 'o',
      // 'a') while its midpoint still happened to fall in the surrounding
      // stroke. Sampling at t = 0.2, 0.4, 0.6, 0.8 makes those crossings
      // reliably detectable.
      let crosses = false
      for (let t = 1; t <= 4; t++) {
        const f = t * 0.2  // 0.2, 0.4, 0.6, 0.8
        const sx = Math.round(ni.x + (nb.x - ni.x) * f)
        const sy = Math.round(ni.y + (nb.y - ni.y) * f)
        if (!maskSet.has(sy * canvasWidth + sx)) { crosses = true; break }
      }
      if (crosses) continue

      candidates.push({ j, dist, alpha: 1 - dist / threshold })
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => a.dist - b.dist)
    for (const { j, alpha } of candidates.slice(0, maxEdgesPerNode)) {
      edges.push({ i, j: iOffset + j, alpha })
    }
  }

  return edges
}

/**
 * Builds a small, controlled set of edges that connect adjacent characters at
 * their nearest border-node pairs. Inside a word, `inWordCount` edges connect
 * each pair of adjacent letters (typically 1) so the silhouette doesn't smear.
 * Across a word boundary (one or more spaces between two letters), a random
 * count in [crossWordMin, crossWordMax] edges is drawn so word groups still
 * feel networked without bleeding into each other.
 *
 * Bridges are picked from the rightmost zone of the left character and the
 * leftmost zone of the right character, then sorted by Euclidean distance and
 * taken without reusing endpoints. This guarantees clean, character-respecting
 * inter-glyph connections — critical at small font sizes where automatic
 * proximity-based bridging would merge letters into an unreadable blob.
 */
export function buildBorderBridges(
  borderNodes: Node[],
  charPositions: CharPosition[],
  inWordCount: number,
  crossWordMin: number,
  crossWordMax: number,
): Edge[] {
  if (borderNodes.length < 2 || charPositions.length === 0) return []

  const byChar: number[][] = charPositions.map(() => [])
  for (let i = 0; i < borderNodes.length; i++) {
    const ci = getCharIndex(borderNodes[i].x, charPositions)
    if (ci >= 0) byChar[ci].push(i)
  }

  const edges: Edge[] = []

  for (let ci = 0; ci < charPositions.length - 1; ci++) {
    if (charPositions[ci].char === ' ') continue

    let nextCi = ci + 1
    while (nextCi < charPositions.length && charPositions[nextCi].char === ' ') nextCi++
    if (nextCi >= charPositions.length) continue

    const leftAll  = byChar[ci]
    const rightAll = byChar[nextCi]
    if (leftAll.length === 0 || rightAll.length === 0) continue

    const crossesWord = nextCi > ci + 1
    const target = crossesWord
      ? crossWordMin + Math.floor(Math.random() * (crossWordMax - crossWordMin + 1))
      : inWordCount
    if (target <= 0) continue

    // Restrict candidates to the inner edges of each glyph for fast pairing
    const leftCands  = leftAll
      .slice()
      .sort((a, b) => borderNodes[b].x - borderNodes[a].x)
      .slice(0, Math.max(target * 4, 12))
    const rightCands = rightAll
      .slice()
      .sort((a, b) => borderNodes[a].x - borderNodes[b].x)
      .slice(0, Math.max(target * 4, 12))

    type P = { i: number; j: number; d: number }
    const pairs: P[] = []
    for (const i of leftCands) {
      for (const j of rightCands) {
        const dx = borderNodes[j].x - borderNodes[i].x
        const dy = borderNodes[j].y - borderNodes[i].y
        pairs.push({ i, j, d: Math.sqrt(dx * dx + dy * dy) })
      }
    }
    pairs.sort((a, b) => a.d - b.d)

    const used = new Set<number>()
    const refDist = Math.max(charPositions[ci].charWidth, charPositions[nextCi].charWidth)
    let added = 0
    for (const p of pairs) {
      if (added >= target) break
      if (used.has(p.i) || used.has(p.j)) continue
      used.add(p.i); used.add(p.j)
      edges.push({ i: p.i, j: p.j, alpha: Math.max(0.4, 1 - p.d / (refDist * 1.5)) })
      added++
    }
  }

  return edges
}

/**
 * @deprecated Use buildIntraCharEdges + buildInterCharBridges separately.
 * Kept for backwards compatibility with tests.
 */
export function buildCharacterEdges(
  nodes: Node[],
  charPositions: CharPosition[],
  intraThreshold: number,
  interPerGap: number,
): Edge[] {
  return [
    ...buildIntraCharEdges(nodes, charPositions, intraThreshold),
    ...buildInterCharBridges(nodes, charPositions, intraThreshold, interPerGap),
  ]
}
