<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let animationFrameId = 0
let particles: {x: number, y: number, vx: number, vy: number}[] = []
let mouse = { x: -1000, y: -1000 }
const numParticles = 80
const maxDist = 140
const mouseDist = 200

const vShaderSrc = `
attribute vec2 a_position;
attribute float a_alpha;
varying float v_alpha;
uniform vec2 u_resolution;

void main() {
  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  gl_PointSize = 2.5;
  v_alpha = a_alpha;
}
`

const fShaderSrc = `
precision mediump float;
varying float v_alpha;
uniform vec3 u_color;

void main() {
  gl_FragColor = vec4(u_color, v_alpha);
}
`

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  const program = gl.createProgram()!
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })

  if (!gl) {
    console.warn('WebGL not supported.')
    return
  }

  const vShader = createShader(gl, gl.VERTEX_SHADER, vShaderSrc)
  const fShader = createShader(gl, gl.FRAGMENT_SHADER, fShaderSrc)
  if (!vShader || !fShader) return
  const program = createProgram(gl, vShader, fShader)
  if (!program) return

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const alphaLocation = gl.getAttribLocation(program, 'a_alpha')
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const colorLocation = gl.getUniformLocation(program, 'u_color')

  const buffer = gl.createBuffer()

  function resize() {
    canvas!.width = window.innerWidth
    canvas!.height = window.innerHeight
    gl!.viewport(0, 0, canvas!.width, canvas!.height)
  }

  window.addEventListener('resize', resize)
  resize()

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6
    })
  }

  const handleMouseMove = (e: MouseEvent) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX
      mouse.y = e.touches[0].clientY
    }
  }

  const handleMouseOut = () => {
    mouse.x = -1000
    mouse.y = -1000
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('touchmove', handleTouchMove)
  document.addEventListener('mouseleave', handleMouseOut)
  window.addEventListener('touchend', handleMouseOut)

  const draw = () => {
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(program)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
    
    // Cognitive Companion Brand Color #0a84ff
    gl.uniform3f(colorLocation, 10 / 255, 132 / 255, 255 / 255)

    const vertexData: number[] = []

    for (let i = 0; i < numParticles; i++) {
      const p = particles[i]
      p.x += p.vx
      p.y += p.vy

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1

      const dxm = mouse.x - p.x
      const dym = mouse.y - p.y
      const distMouse = Math.sqrt(dxm * dxm + dym * dym)
      if (distMouse < mouseDist) {
        // mild attraction
        p.x += dxm * 0.005
        p.y += dym * 0.005
      }

      // Add the particle point
      vertexData.push(p.x, p.y, 0.85)
    }

    for (let i = 0; i < numParticles; i++) {
      const p1 = particles[i]
      for (let j = i + 1; j < numParticles; j++) {
        const p2 = particles[j]
        const dx = p1.x - p2.x
        const dy = p1.y - p2.y
        const distSq = dx * dx + dy * dy
        if (distSq < maxDist * maxDist) {
          const dist = Math.sqrt(distSq)
          const alpha = (1.0 - (dist / maxDist)) * 0.75 // Increased line alpha
          vertexData.push(p1.x, p1.y, alpha)
          vertexData.push(p2.x, p2.y, alpha)
        }
      }
    }

    const floatData = new Float32Array(vertexData)

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, floatData, gl.DYNAMIC_DRAW)

    const stride = 12 // 3 floats * 4 bytes
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0)

    gl.enableVertexAttribArray(alphaLocation)
    gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, stride, 8)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawArrays(gl.POINTS, 0, numParticles)
    
    const totalVertices = floatData.length / 3
    if (totalVertices > numParticles) {
      gl.drawArrays(gl.LINES, numParticles, totalVertices - numParticles)
    }

    animationFrameId = requestAnimationFrame(draw)
  }

  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animationFrameId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('mouseleave', handleMouseOut)
    window.removeEventListener('touchend', handleMouseOut)
  })
})
</script>

<template>
  <canvas ref="canvasRef" class="webgl-background"></canvas>
</template>

<style scoped>
.webgl-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  pointer-events: none;
}
</style>
