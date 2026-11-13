import { describe, expect, it } from 'vitest'
import { clamp01, damp, getFrameDelta, normalizeScroll } from '../components/background/chromatic-math'

describe('chromatic animation math', () => {
  it('clamps normalized values', () => {
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(1.2)).toBe(1)
  })

  it('damps exponentially without moving when no time has elapsed', () => {
    expect(damp(2, 10, 4, 0)).toBe(2)
    expect(damp(0, 10, 4, 0.5)).toBeCloseTo(8.6466, 3)
    expect(damp(0, 10, 4, 100)).toBe(10)
  })

  it('clamps and sanitizes frame deltas', () => {
    expect(getFrameDelta(100, undefined)).toBe(0)
    expect(getFrameDelta(116, 100)).toBe(0.016)
    expect(getFrameDelta(2000, 100)).toBe(0.05)
    expect(getFrameDelta(50, 100)).toBe(0)
  })

  it('normalizes window and nested-scroller positions', () => {
    expect(normalizeScroll(50, 1100, 100)).toBe(0.05)
    expect(normalizeScroll(-50, 1100, 100)).toBe(0)
    expect(normalizeScroll(2000, 1100, 100)).toBe(1)
    expect(normalizeScroll(50, 100, 100)).toBe(0)
    expect(normalizeScroll(50, 80, 100)).toBe(0)
  })
})
