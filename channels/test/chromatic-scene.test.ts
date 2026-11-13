import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChromaticScene,
  type ChromaticRenderer,
} from '../components/background/chromatic-scene'
import { rayCount } from '../components/background/chromatic-config'

class FakeHTMLElement extends EventTarget {
  scrollTop = 0
  scrollHeight = 0
  clientHeight = 0
}

class FakeMediaQueryList extends EventTarget {
  matches = false
}

class FakeVisualViewport extends EventTarget {
  width = 1440
  height = 900
}

class FakeRenderer implements ChromaticRenderer {
  autoClear = true
  outputColorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
  toneMapping: THREE.ToneMapping = THREE.NoToneMapping
  toneMappingExposure = 1
  animationCallback: ((time: number) => void) | null = null
  setPixelRatio = vi.fn()
  setSize = vi.fn()
  clear = vi.fn()
  clearDepth = vi.fn()
  render = vi.fn()
  dispose = vi.fn()

  setAnimationLoop(callback: ((time: number) => void) | null) {
    this.animationCallback = callback
  }

  frame(timestamp: number) {
    this.animationCallback?.(timestamp)
  }
}

function createHarness() {
  const motionQuery = new FakeMediaQueryList()
  const visualViewport = new FakeVisualViewport()
  const documentElement = new FakeHTMLElement()
  documentElement.scrollHeight = 3600
  documentElement.clientHeight = 900
  const fakeWindow = Object.assign(new EventTarget(), {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    scrollY: 0,
    visualViewport: visualViewport as FakeVisualViewport | undefined,
    matchMedia: vi.fn(() => motionQuery),
  })
  const fakeDocument = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement,
    body: new FakeHTMLElement(),
  })
  const bounds = { width: 1440, height: 900 }
  const container = { getBoundingClientRect: () => bounds }
  const canvas = Object.assign(new EventTarget(), {
    parentElement: container,
    dataset: {},
  }) as unknown as HTMLCanvasElement

  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('document', fakeDocument)
  vi.stubGlobal('HTMLElement', FakeHTMLElement)

  return { bounds, canvas, container, fakeDocument, fakeWindow, motionQuery, visualViewport }
}

let harness: ReturnType<typeof createHarness>

beforeEach(() => {
  harness = createHarness()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('chromatic WebGL scene', () => {
  it('builds the atmospheric pass and instanced hyperboloid rays with capped density', () => {
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)

    expect(renderer.autoClear).toBe(false)
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
    expect(renderer.toneMappingExposure).toBe(0.95)
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(renderer.setSize).toHaveBeenCalledWith(1440, 900)
    expect(renderer.render).toHaveBeenCalledTimes(2)
    expect(renderer.clear).toHaveBeenCalledOnce()
    expect(renderer.clearDepth).toHaveBeenCalledOnce()
    expect(renderer.animationCallback).toBeTypeOf('function')
    expect(harness.canvas.dataset.state).toBe('ready')

    const mainScene = renderer.render.mock.calls[1][0] as THREE.Scene
    const camera = renderer.render.mock.calls[1][1] as THREE.PerspectiveCamera
    const widestRadiusAtCamera = 5.4 * Math.hypot(1, (camera.position.z + 9) / 6.4)
    expect(Math.hypot(camera.position.x, camera.position.y)).toBeGreaterThan(widestRadiusAtCamera)
    expect(camera.position.y).toBeLessThan(0)
    const waist = new THREE.Vector3(0, 0, -9).project(camera)
    expect(waist.x).toBeGreaterThan(1 / 3)
    expect(waist.y).toBeGreaterThan(1 / 3)
    expect(mainScene.children).toHaveLength(1)
    const rays = mainScene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
    expect(rays.geometry.instanceCount).toBe(rayCount)
    const profiles = rays.geometry.getAttribute('aRay')
    expect(profiles.count).toBe(rayCount)
    expect(profiles.itemSize).toBe(3)
    expect(profiles.getX(1)).toBeGreaterThan(profiles.getX(0))
    expect(profiles.getZ(0)).toBe(0)
    expect(profiles.getZ(rayCount - 1)).toBe(2)

    renderer.frame(1000)
    renderer.frame(1016)

    expect(rays.material.uniforms.uTime.value).toBe(0.016)
    expect(renderer.render).toHaveBeenCalledTimes(6)
    scene.dispose()
  })

  it('damps pointer and nested feed scrolling into layered parallax', () => {
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)
    const atmosphere = renderer.render.mock.calls[0][0] as THREE.Scene
    const background = atmosphere.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
    const initialProjection = background.material.uniforms.uInverseViewProjection.value.clone()
    const initialCameraZ = (renderer.render.mock.calls[1][1] as THREE.PerspectiveCamera).position.z
    const pointer = Object.assign(new Event('pointermove'), { clientX: 1440, clientY: 450 })
    harness.fakeWindow.dispatchEvent(pointer)
    renderer.frame(0)
    renderer.frame(50)

    const camera = renderer.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera
    expect(camera.position.z).toBeLessThan(initialCameraZ)
    expect(background.material.uniforms.uEye.value).toBe(camera.position)
    expect(background.material.uniforms.uInverseViewProjection.value.equals(initialProjection)).toBe(false)

    const scroller = new FakeHTMLElement()
    scroller.scrollTop = 250
    scroller.scrollHeight = 1500
    scroller.clientHeight = 500
    const initialCameraY = camera.position.y
    const feedScroll = new Event('scroll')
    Object.defineProperty(feedScroll, 'target', { value: scroller })
    harness.fakeWindow.dispatchEvent(feedScroll)
    renderer.frame(100)
    renderer.frame(150)

    expect(camera.position.y).toBeLessThan(initialCameraY)
    expect(background.material.uniforms.uInverseViewProjection.value.equals(initialProjection)).toBe(false)

    const nestedScrollCameraY = camera.position.y
    harness.fakeWindow.scrollY = 1800
    harness.fakeWindow.dispatchEvent(new Event('scroll'))
    renderer.frame(200)
    renderer.frame(250)
    expect(camera.position.y).toBeLessThan(nestedScrollCameraY)

    scene.dispose()
  })

  it('renders a static frame for reduced motion and resumes cleanly', () => {
    harness.motionQuery.matches = true
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)

    expect(renderer.animationCallback).toBeNull()
    expect(renderer.render).toHaveBeenCalledTimes(4)

    harness.motionQuery.matches = false
    harness.motionQuery.dispatchEvent(new Event('change'))
    expect(renderer.animationCallback).toBeTypeOf('function')

    harness.fakeDocument.hidden = true
    harness.fakeDocument.dispatchEvent(new Event('visibilitychange'))
    expect(renderer.animationCallback).toBeNull()

    harness.fakeDocument.hidden = false
    harness.fakeDocument.dispatchEvent(new Event('visibilitychange'))
    expect(renderer.animationCallback).toBeTypeOf('function')
    scene.dispose()
  })

  it('falls back during context loss and restores rendering without a jump', () => {
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)
    const contextLost = new Event('webglcontextlost', { cancelable: true })
    harness.canvas.dispatchEvent(contextLost)

    expect(contextLost.defaultPrevented).toBe(true)
    expect(harness.canvas.dataset.state).toBe('fallback')
    expect(renderer.animationCallback).toBeNull()
    const renderCount = renderer.render.mock.calls.length
    harness.fakeWindow.dispatchEvent(new Event('resize'))
    expect(renderer.render).toHaveBeenCalledTimes(renderCount)

    harness.canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(harness.canvas.dataset.state).toBe('ready')
    expect(renderer.animationCallback).toBeTypeOf('function')
    renderer.frame(5000)
    renderer.frame(5016)
    const mainScene = renderer.render.mock.calls.at(-1)?.[0] as THREE.Scene
    const rays = mainScene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
    expect(rays.material.uniforms.uTime.value).toBe(0.016)
    scene.dispose()
  })

  it('uses viewport and window fallbacks when the container has no layout', () => {
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)
    harness.bounds.width = 0
    harness.bounds.height = 0
    harness.visualViewport.width = 800
    harness.visualViewport.height = 600
    harness.visualViewport.dispatchEvent(new Event('scroll'))
    expect(renderer.setSize).toHaveBeenLastCalledWith(800, 600)

    harness.visualViewport.width = 0
    harness.visualViewport.height = 0
    harness.fakeWindow.devicePixelRatio = 0
    harness.visualViewport.dispatchEvent(new Event('resize'))
    expect(renderer.setSize).toHaveBeenLastCalledWith(1440, 900)
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1)
    scene.dispose()

    harness.fakeWindow.visualViewport = undefined
    const withoutVisualViewport = new FakeRenderer()
    const nextScene = createChromaticScene(harness.canvas, withoutVisualViewport)
    expect(withoutVisualViewport.setSize).toHaveBeenCalledWith(1440, 900)
    nextScene.dispose()
  })

  it('disposes every GPU resource and detaches all browser listeners once', () => {
    const renderer = new FakeRenderer()
    const scene = createChromaticScene(harness.canvas, renderer)
    const backgroundScene = renderer.render.mock.calls[0][0] as THREE.Scene
    const mainScene = renderer.render.mock.calls[1][0] as THREE.Scene
    const backgroundMesh = backgroundScene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
    const rays = mainScene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
    const disposalSpies = [
      vi.spyOn(backgroundMesh.geometry, 'dispose'),
      vi.spyOn(backgroundMesh.material, 'dispose'),
      vi.spyOn(rays.geometry, 'dispose'),
      vi.spyOn(rays.material, 'dispose'),
    ]

    scene.dispose()
    scene.dispose()

    expect(renderer.animationCallback).toBeNull()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(harness.canvas.dataset.state).toBe('disposed')
    for (const dispose of disposalSpies) expect(dispose).toHaveBeenCalledOnce()

    const renderCount = renderer.render.mock.calls.length
    const resizeCount = renderer.setSize.mock.calls.length
    harness.fakeWindow.dispatchEvent(new Event('resize'))
    harness.fakeWindow.dispatchEvent(new Event('pointermove'))
    harness.fakeDocument.dispatchEvent(new Event('visibilitychange'))
    harness.motionQuery.dispatchEvent(new Event('change'))
    harness.canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(renderer.render).toHaveBeenCalledTimes(renderCount)
    expect(renderer.setSize).toHaveBeenCalledTimes(resizeCount)
  })

  it('fails loudly when mounted outside its required container', () => {
    const canvas = Object.assign(new EventTarget(), {
      parentElement: null,
      dataset: {},
    }) as unknown as HTMLCanvasElement
    expect(() => createChromaticScene(canvas, new FakeRenderer())).toThrow(
      'Chromatic background requires a positioned parent element',
    )
  })
})
