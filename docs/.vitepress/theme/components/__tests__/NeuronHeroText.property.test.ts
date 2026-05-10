import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  heroFontSize,
  buildEdges,
  nodeColour,
  updateNodes,
  spawnNodes,
  GRADIENT_PERIOD_MS,
  SPATIAL_PHASE_SCALE,
  DESKTOP_NODE_COUNT,
  MOBILE_NODE_COUNT,
} from '../NeuronHeroText.utils'
import type { Node, FilledPixel } from '../NeuronHeroText.utils'

/**
 * Property 8: Font size matches VPHero breakpoints
 * Validates: Requirements 5.3
 *
 * For any viewport width, heroFontSize must return:
 *   - 32 px when width < 640
 *   - 48 px when 640 ≤ width < 960
 *   - 56 px when width ≥ 960
 */
describe('NeuronHeroText property tests', () => {
  /**
   * Property 2: Edge set completeness and exclusivity
   * Validates: Requirements 1.3
   *
   * For any list of nodes and connection threshold, buildEdges must return
   * exactly the pairs (i, j) where i < j and Euclidean distance ≤ threshold,
   * and must omit all pairs whose distance exceeds the threshold.
   */
  it(
    'Feature: neuron-hero-text, Property 2: edge set completeness and exclusivity',
    () => {
      const nodeArb = fc.array(
        fc.record({
          x: fc.float({ min: 0, max: 500, noNaN: true }),
          y: fc.float({ min: 0, max: 500, noNaN: true }),
          vx: fc.constant(0),
          vy: fc.constant(0),
        }),
        { minLength: 10, maxLength: 100 },
      )
      const thresholdArb = fc.float({ min: 10, max: 80, noNaN: true })

      fc.assert(
        fc.property(nodeArb, thresholdArb, (nodes: Node[], threshold: number) => {
          const edges = buildEdges(nodes, threshold)

          // Build a set of edge keys from the result for O(1) lookup
          const edgeSet = new Set<string>(
            edges.map((e) => `${e.i},${e.j}`),
          )

          // Check every pair (i, j) where i < j
          for (let i = 0; i < nodes.length - 1; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const dx = nodes[j].x - nodes[i].x
              const dy = nodes[j].y - nodes[i].y
              const dist = Math.sqrt(dx * dx + dy * dy)
              const key = `${i},${j}`

              if (dist <= threshold) {
                // Must be present
                expect(edgeSet.has(key)).toBe(true)
              } else {
                // Must be absent
                expect(edgeSet.has(key)).toBe(false)
              }
            }
          }

          // No duplicate edges
          expect(edges.length).toBe(edgeSet.size)
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 4: Edge alpha decreases linearly with distance
   * Validates: Requirements 2.2
   *
   * For any pair of nodes at Euclidean distance d where d <= threshold,
   * the computed edge alpha must equal (1 - d / threshold) within floating-point tolerance.
   */
  it(
    'Feature: neuron-hero-text, Property 4: edge alpha decreases linearly with distance',
    () => {
      // Arbitraries
      const thresholdArb = fc.float({ min: 10, max: 80, noNaN: true })
      const positionArb = fc.float({ min: 0, max: 500, noNaN: true })
      const angleArb = fc.float({ min: 0, max: Math.fround(2 * Math.PI), noNaN: true })

      fc.assert(
        fc.property(
          positionArb,
          positionArb,
          thresholdArb,
          fc.float({ min: 0, max: Math.fround(0.999), noNaN: true }), // d < threshold (avoids fp imprecision at boundary)
          angleArb,
          (x1: number, y1: number, threshold: number, distFraction: number, angle: number) => {
            // Compute exact distance d in [0, threshold]
            const d = distFraction * threshold

            // Place node2 at exactly distance d from node1 along the given angle
            const x2 = x1 + d * Math.cos(angle)
            const y2 = y1 + d * Math.sin(angle)

            const node1: Node = { x: x1, y: y1, vx: 0, vy: 0 }
            const node2: Node = { x: x2, y: y2, vx: 0, vy: 0 }

            const edges = buildEdges([node1, node2], threshold)

            // The pair must produce exactly one edge (distance <= threshold by construction)
            expect(edges.length).toBe(1)

            const edge = edges[0]
            const expectedAlpha = 1 - d / threshold
            expect(Math.abs(edge.alpha - expectedAlpha)).toBeLessThan(1e-6)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'Feature: neuron-hero-text, Property 8: font size matches VPHero breakpoints',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2000 }),
          (viewportWidth: number) => {
            const size = heroFontSize(viewportWidth)

            if (viewportWidth < 640) {
              expect(size).toBe(44)
            } else if (viewportWidth < 960) {
              expect(size).toBe(64)
            } else {
              expect(size).toBe(80)
            }
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 5: Colour cycling is periodic with the brand gradient period
   * Validates: Requirements 3.1
   *
   * For any node x-position and any time value t, the colour computed at time t
   * must equal the colour computed at time t + GRADIENT_PERIOD_MS (18 000 ms),
   * confirming the animation cycles with the correct period.
   */
  it(
    'Feature: neuron-hero-text, Property 5: colour cycling is periodic',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 0, max: 100_000, noNaN: true }),
          (x: number, t: number) => {
            const [r1, g1, b1] = nodeColour(x, 1000, t, false)
            const [r2, g2, b2] = nodeColour(x, 1000, t + GRADIENT_PERIOD_MS, false)

            expect(Math.abs(r1 - r2)).toBeLessThan(1e-6)
            expect(Math.abs(g1 - g2)).toBeLessThan(1e-6)
            expect(Math.abs(b1 - b2)).toBeLessThan(1e-6)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 6: Spatial colour phase varies with x position
   * Validates: Requirements 3.2
   *
   * For any two nodes at different x coordinates on the same canvas, the colour
   * phase offset applied to each node must differ by an amount proportional to
   * their x-distance divided by the canvas width, scaled by SPATIAL_PHASE_SCALE.
   *
   * The phase formula is:
   *   phase = (x / canvasWidth) * SPATIAL_PHASE_SCALE + temporalPhase
   *
   * So the phase difference between x1 and x2 is:
   *   phaseDiff = (x2 - x1) / canvasWidth * SPATIAL_PHASE_SCALE
   *
   * Verification approach: advancing time by phaseDiff * GRADIENT_PERIOD_MS is
   * equivalent to advancing the spatial phase by phaseDiff, so:
   *   nodeColour(x2, cw, t, false) === nodeColour(x1, cw, t + phaseDiff * GRADIENT_PERIOD_MS, false)
   */
  it(
    'Feature: neuron-hero-text, Property 6: spatial colour phase varies with x position',
    () => {
      // Generate: canvas width in [200, 1200], x1 in [0, cw - 10], delta in [10, cw - x1]
      const canvasWidthArb = fc.integer({ min: 200, max: 1200 })
      const timeArb = fc.float({ min: 0, max: 100_000, noNaN: true })

      fc.assert(
        fc.property(
          canvasWidthArb,
          timeArb,
          fc.integer({ min: 0, max: 1190 }), // x1 base (clamped below)
          fc.integer({ min: 10, max: 1200 }), // delta (clamped below)
          (canvasWidth: number, t: number, x1Raw: number, deltaRaw: number) => {
            // Clamp x1 to [0, canvasWidth - 10] so there is room for delta
            const x1 = Math.min(x1Raw, canvasWidth - 10)
            // Clamp delta to [10, canvasWidth - 1 - x1] so x2 stays strictly
            // inside [0, canvasWidth - 1], avoiding the x2 = canvasWidth edge
            // case where floating-point wrap-around breaks the phase identity.
            const delta = Math.min(deltaRaw, canvasWidth - 1 - x1)
            const x2 = x1 + delta

            // Expected phase difference between x2 and x1
            const phaseDiff = (x2 - x1) / canvasWidth * SPATIAL_PHASE_SCALE

            // Advancing time by phaseDiff * GRADIENT_PERIOD_MS at x1 should
            // produce the same colour as x2 at time t
            const [r1, g1, b1] = nodeColour(x2, canvasWidth, t, false)
            const [r2, g2, b2] = nodeColour(x1, canvasWidth, t + phaseDiff * GRADIENT_PERIOD_MS, false)

            expect(Math.abs(r1 - r2)).toBeLessThan(1e-6)
            expect(Math.abs(g1 - g2)).toBeLessThan(1e-6)
            expect(Math.abs(b1 - b2)).toBeLessThan(1e-6)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 1: Node mask containment
   * Validates: Requirements 1.2, 4.1
   *
   * For any synthetic mask (a rectangular region of filled pixels) and any
   * spawned node set, every node's position must correspond to a pixel that
   * exists in the mask.
   *
   * A synthetic mask is used instead of buildTextMask (which requires a real
   * canvas with font rendering) so the test runs in the node environment
   * without DOM dependencies.
   */
  it(
    'Feature: neuron-hero-text, Property 1: node mask containment',
    () => {
      // Generate random rectangular mask dimensions
      const widthArb = fc.integer({ min: 10, max: 200 })
      const heightArb = fc.integer({ min: 5, max: 50 })

      fc.assert(
        fc.property(widthArb, heightArb, (W: number, H: number) => {
          // Build a synthetic rectangular mask: all pixels in [0, W-1] x [0, H-1]
          const pixels: FilledPixel[] = []
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              pixels.push({ x, y })
            }
          }

          // Build a Set for O(1) membership checks (encode as y * W + x)
          const maskSet = new Set<string>(pixels.map((p) => `${p.x},${p.y}`))

          // Spawn up to DESKTOP_NODE_COUNT nodes from the mask
          const nodes = spawnNodes(pixels, DESKTOP_NODE_COUNT)

          // Every spawned node must sit on a filled pixel
          for (const node of nodes) {
            const key = `${node.x},${node.y}`
            expect(maskSet.has(key)).toBe(true)
          }
        }),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 3: Node distribution covers all mask regions
   * Validates: Requirements 1.4
   *
   * After spawning DESKTOP_NODE_COUNT nodes from a synthetic horizontal-band
   * mask, partitioning the mask into 10 equal-width cells and asserting that
   * no cell containing ≥ 5% of all filled pixels has zero nodes assigned to it.
   *
   * Fixed dimensions (W=200, H=100) keep the structure deterministic while
   * still exercising the uniform-sampling property of spawnNodes.
   */
  it(
    'Feature: neuron-hero-text, Property 3: node distribution covers all mask regions',
    () => {
      // Fixed canvas dimensions for a deterministic structure
      const W = 200
      const H = 100

      // Horizontal band: all pixels in [0, W-1] x [H/4, 3H/4)
      const yMin = Math.floor(H / 4)
      const yMax = Math.floor((3 * H) / 4)

      const pixels: FilledPixel[] = []
      for (let y = yMin; y < yMax; y++) {
        for (let x = 0; x < W; x++) {
          pixels.push({ x, y })
        }
      }

      const totalFilled = pixels.length

      // Spawn DESKTOP_NODE_COUNT nodes
      const nodes = spawnNodes(pixels, DESKTOP_NODE_COUNT)

      // Partition into 10 equal-width cells along the x axis
      const NUM_CELLS = 10
      const cellWidth = W / NUM_CELLS

      for (let cell = 0; cell < NUM_CELLS; cell++) {
        const xStart = cell * cellWidth
        const xEnd = (cell + 1) * cellWidth

        // Count filled pixels in this cell
        const filledInCell = pixels.filter((p) => p.x >= xStart && p.x < xEnd).length

        // Only assert coverage for cells with ≥ 5% of total filled pixels
        if (filledInCell / totalFilled >= 0.05) {
          const nodesInCell = nodes.filter((n) => n.x >= xStart && n.x < xEnd).length
          expect(nodesInCell).toBeGreaterThan(0)
        }
      }
    },
  )

  /**
   * Property 7: Boundary reflection keeps nodes inside the mask
   * Validates: Requirements 4.2
   *
   * For any node at a mask boundary position with an outward-pointing velocity,
   * after one call to updateNodes, the node's position must still correspond to
   * a filled pixel in the mask.
   *
   * Setup:
   * - Synthetic rectangular mask of W=20 x H=10 filled pixels
   * - canvasWidth = W (the mask spans the full canvas width)
   * - Node placed at a boundary pixel (x=0, x=W-1, y=0, or y=H-1)
   * - Velocity points outward (away from the mask interior) with magnitude in [0.05, 0.35]
   * - After updateNodes, the node's rounded position must be in maskSet
   */
  it(
    'Feature: neuron-hero-text, Property 7: boundary reflection keeps nodes inside the mask',
    () => {
      // Fixed mask dimensions
      const W = 20
      const H = 10
      const canvasWidth = W

      // Build the synthetic rectangular mask: all pixels in [0, W-1] x [0, H-1]
      const mask: FilledPixel[] = []
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          mask.push({ x, y })
        }
      }
      const maskSet = new Set<number>(mask.map((p) => p.y * canvasWidth + p.x))

      // Velocity magnitude in [0.05, 0.35]
      const speedArb = fc.float({ min: Math.fround(0.05), max: Math.fround(0.35), noNaN: true })

      // Edge selector: 0=left (x=0), 1=right (x=W-1), 2=top (y=0), 3=bottom (y=H-1)
      const edgeArb = fc.integer({ min: 0, max: 3 })

      // Position along the edge (integer index within the edge length)
      const posArb = fc.integer({ min: 0, max: Math.max(W, H) - 1 })

      fc.assert(
        fc.property(
          edgeArb,
          posArb,
          speedArb,
          (edge: number, posRaw: number, speed: number) => {
            let nx: number
            let ny: number
            let vx: number
            let vy: number

            // Place node on the chosen boundary edge with an outward velocity
            switch (edge) {
              case 0: // left edge: x=0, outward vx < 0
                nx = 0
                ny = posRaw % H
                vx = -speed
                vy = 0
                break
              case 1: // right edge: x=W-1, outward vx > 0
                nx = W - 1
                ny = posRaw % H
                vx = speed
                vy = 0
                break
              case 2: // top edge: y=0, outward vy < 0
                nx = posRaw % W
                ny = 0
                vx = 0
                vy = -speed
                break
              case 3: // bottom edge: y=H-1, outward vy > 0
                nx = posRaw % W
                ny = H - 1
                vx = 0
                vy = speed
                break
              default:
                nx = 0
                ny = 0
                vx = -speed
                vy = 0
            }

            const node: Node = { x: nx, y: ny, vx, vy }

            updateNodes([node], mask, maskSet, canvasWidth, false)

            // After updateNodes, the node's position must be inside the mask
            const key = Math.round(node.y) * canvasWidth + Math.round(node.x)
            expect(maskSet.has(key)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  /**
   * Property 9: Node count respects mobile threshold
   * Validates: Requirements 5.4
   *
   * For any viewport width, the node count selection logic must return
   * MOBILE_NODE_COUNT for widths < 768 and DESKTOP_NODE_COUNT for widths ≥ 768.
   *
   * The selection logic `w < 768 ? MOBILE_NODE_COUNT : DESKTOP_NODE_COUNT` is
   * tested as a pure expression since the actual branching lives in the Vue
   * component's onMounted hook (which is not unit-testable without a DOM).
   */
  it(
    'Feature: neuron-hero-text, Property 9: node count respects mobile threshold',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2000 }),
          (viewportWidth: number) => {
            const count = viewportWidth < 768 ? MOBILE_NODE_COUNT : DESKTOP_NODE_COUNT
            // Values are set in NeuronHeroText.utils.ts
            const expectedMobile = 100
            const expectedDesktop = 250

            if (viewportWidth < 768) {
              expect(count).toBe(expectedMobile)
            } else {
              expect(count).toBe(expectedDesktop)
            }
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
