import * as THREE from 'three'
import { createRayGeometry } from './chromatic-config'
import {
  damp,
  getFrameDelta,
  normalizeScroll,
} from './chromatic-math'
import {
  backgroundFragmentShader,
  backgroundVertexShader,
  rayFragmentShader,
  rayVertexShader,
} from './chromatic-shaders'

export interface ChromaticRenderer {
  autoClear: boolean
  outputColorSpace: THREE.ColorSpace
  toneMapping: THREE.ToneMapping
  toneMappingExposure: number
  setPixelRatio: (pixelRatio: number) => void
  setSize: (width: number, height: number) => void
  setAnimationLoop: (callback: ((time: number) => void) | null) => void
  clear: () => void
  clearDepth: () => void
  render: (scene: THREE.Scene, camera: THREE.Camera) => void
  dispose: () => void
}

export interface ChromaticScene {
  dispose: () => void
}

const CAMERA_FOV = 37
const WAIST_Z = -9

export function createChromaticScene(
  canvas: HTMLCanvasElement,
  rendererOverride?: ChromaticRenderer,
): ChromaticScene {
  const container = canvas.parentElement
  if (!container) throw new Error('Chromatic background requires a positioned parent element')

  const renderer = rendererOverride ?? new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.autoClear = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 460)
  const lookAtTarget = new THREE.Vector3()

  const backgroundScene = new THREE.Scene()
  const backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const backgroundGeometry = new THREE.PlaneGeometry(2, 2)
  const backgroundUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uEye: { value: camera.position },
    uInverseViewProjection: { value: new THREE.Matrix4() },
  }
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: backgroundUniforms,
    vertexShader: backgroundVertexShader,
    fragmentShader: backgroundFragmentShader,
    depthTest: false,
    depthWrite: false,
  })
  const backgroundMesh = new THREE.Mesh(backgroundGeometry, backgroundMaterial)
  backgroundScene.add(backgroundMesh)

  const rayGeometry = createRayGeometry()
  const rayUniforms = {
    uTime: backgroundUniforms.uTime,
  }
  const rayMaterial = new THREE.ShaderMaterial({
    uniforms: rayUniforms,
    vertexShader: rayVertexShader,
    fragmentShader: rayFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const rays = new THREE.Mesh(rayGeometry, rayMaterial)
  // Vertices are projected by the shader from world-space paths on the surface.
  rays.frustumCulled = false
  scene.add(rays)

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointerTarget = new THREE.Vector2()
  const pointerCurrent = new THREE.Vector2()
  let scrollTarget = 0
  let scrollCurrent = 0
  let elapsed = 0
  let previousTimestamp: number | undefined
  let isDisposed = false
  let isContextLost = false

  const updateWorld = () => {
    const distanceScale = Math.max(1, Math.sqrt(0.68 / camera.aspect))
    camera.position.set(
      26.7 * distanceScale + pointerCurrent.x * 0.9,
      -10.8 * distanceScale + pointerCurrent.y * 1.5 - (scrollCurrent - 0.5) * 2.1,
      WAIST_Z + 30 * distanceScale - pointerCurrent.x * 0.95,
    )
    const framing = Math.min(1, camera.aspect / 1.25)
    const portrait = THREE.MathUtils.smoothstep(1 - camera.aspect, 0, 0.55)
    lookAtTarget.set(
      -7 * framing - 2 * portrait,
      3 - 8 * portrait + pointerCurrent.y * 0.32,
      WAIST_Z + 11 * framing + 2 * portrait,
    )
    camera.lookAt(lookAtTarget)
    camera.rotateZ(-0.67)
    camera.updateMatrixWorld()
    backgroundUniforms.uInverseViewProjection.value.multiplyMatrices(
      camera.matrixWorld, camera.projectionMatrixInverse,
    )

    backgroundUniforms.uTime.value = elapsed
  }

  const renderFrame = () => {
    if (isContextLost) return
    updateWorld()
    renderer.clear()
    renderer.render(backgroundScene, backgroundCamera)
    renderer.clearDepth()
    renderer.render(scene, camera)
    if (canvas.dataset.state !== 'ready') canvas.dataset.state = 'ready'
  }

  const resize = () => {
    const bounds = container.getBoundingClientRect()
    const viewport = window.visualViewport
    const width = Math.max(1, Math.ceil(bounds.width || viewport?.width || window.innerWidth))
    const height = Math.max(1, Math.ceil(bounds.height || viewport?.height || window.innerHeight))
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    backgroundUniforms.uAspect.value = camera.aspect
    renderFrame()
  }

  const tick = (timestamp: number) => {
    const delta = getFrameDelta(timestamp, previousTimestamp)
    previousTimestamp = timestamp
    elapsed += delta
    pointerCurrent.x = damp(pointerCurrent.x, pointerTarget.x, 3.4, delta)
    pointerCurrent.y = damp(pointerCurrent.y, pointerTarget.y, 3.4, delta)
    scrollCurrent = damp(scrollCurrent, scrollTarget, 2.8, delta)
    renderFrame()
  }

  const syncPlayback = () => {
    if (isDisposed) return
    renderer.setAnimationLoop(null)
    previousTimestamp = undefined
    if (isContextLost) return
    if (motionQuery.matches) {
      renderFrame()
      return
    }
    if (!document.hidden) renderer.setAnimationLoop(tick)
  }

  const readWindowScroll = () => {
    scrollTarget = normalizeScroll(
      window.scrollY,
      document.documentElement.scrollHeight,
      window.innerHeight,
    )
  }

  const onScroll = (event: Event) => {
    const target = event.target
    if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
      scrollTarget = normalizeScroll(target.scrollTop, target.scrollHeight, target.clientHeight)
      return
    }
    readWindowScroll()
  }

  const onPointerMove = (event: PointerEvent) => {
    pointerTarget.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    )
  }

  const onPointerLeave = () => pointerTarget.set(0, 0)
  const onContextLost = (event: Event) => {
    event.preventDefault()
    isContextLost = true
    canvas.dataset.state = 'fallback'
    syncPlayback()
  }
  const onContextRestored = () => {
    isContextLost = false
    resize()
    syncPlayback()
  }

  readWindowScroll()
  resize()
  window.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.visualViewport?.addEventListener('scroll', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  document.addEventListener('visibilitychange', syncPlayback)
  motionQuery.addEventListener('change', syncPlayback)
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)
  syncPlayback()

  return {
    dispose() {
      if (isDisposed) return
      isDisposed = true
      renderer.setAnimationLoop(null)
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', onScroll, true)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', syncPlayback)
      motionQuery.removeEventListener('change', syncPlayback)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      rayGeometry.dispose()
      rayMaterial.dispose()
      backgroundGeometry.dispose()
      backgroundMaterial.dispose()
      renderer.dispose()
      canvas.dataset.state = 'disposed'
    },
  }
}
