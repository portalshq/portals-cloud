export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function damp(current: number, target: number, smoothing: number, delta: number) {
  return target + (current - target) * Math.exp(-smoothing * delta)
}

export function getFrameDelta(currentMs: number, previousMs: number | undefined) {
  if (previousMs === undefined) return 0
  return Math.min(0.05, Math.max(0, (currentMs - previousMs) / 1000))
}

export function normalizeScroll(scrollY: number, scrollHeight: number, viewportHeight: number) {
  const scrollable = Math.max(0, scrollHeight - viewportHeight)
  return scrollable === 0 ? 0 : clamp01(scrollY / scrollable)
}
