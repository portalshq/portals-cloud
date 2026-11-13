import * as THREE from 'three'

const rayLayers = [
  { count: 72, style: 0 }, // Soft, continuous paths define the silhouette.
  { count: 96, style: 1 }, // Bright pulses run along the same curved paths.
  { count: 24, style: 2 }, // Broad optical leaks add depth around the surface.
] as const

export const rayCount = rayLayers.reduce((total, layer) => total + layer.count, 0)

export function createRayGeometry() {
  const strip = new THREE.PlaneGeometry(1, 1, 32, 1)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setIndex(strip.getIndex())
  geometry.setAttribute('position', strip.getAttribute('position'))
  geometry.setAttribute('uv', strip.getAttribute('uv'))
  strip.dispose()

  const rays = new Float32Array(rayCount * 3)
  let index = 0
  for (const { count, style } of rayLayers) {
    for (let ray = 0; ray < count; ray += 1) {
      const seed = ((index + 1) * 0.61803398875) % 1
      const angle = (ray + seed * 0.72 + style * 0.37) * Math.PI * 2 / count
      rays.set([angle, seed, style], index * 3)
      index += 1
    }
  }
  geometry.setAttribute('aRay', new THREE.InstancedBufferAttribute(rays, 3))
  geometry.instanceCount = rayCount
  return geometry
}
