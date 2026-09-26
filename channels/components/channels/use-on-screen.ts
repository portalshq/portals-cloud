'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Tracks an element's visibility and whether it has ever been seen.
 *
 * Replaces scroll-position maths: reading scrollTop against a guessed panel
 * height is not visibility, and it costs a layout read on every scroll event.
 *
 * `visible` is the test for `intersectionRatio`, not `isIntersecting`. A
 * full-height panel whose edge merely touches the viewport boundary counts as
 * "intersecting" with zero visible pixels, which is enough to start a second
 * stream downloading beside the one you are watching.
 *
 * `seen` latches on first sight. It is what lets a stream mount once and stay
 * mounted: unmounting on the way out and rebuilding on the way back tears down
 * the hls session mid-flight, which leaves the range requests it had in the
 * air to be dropped and hands the returning panel a stream wedged at 0:00. It
 * also throws away the buffer, so the video restarts from the top every time
 * you come back to it.
 */
export function useOnScreen<T extends Element>(
  { root = null, rootMargin, threshold = 0.5 }: {
    root?: Element | null
    rootMargin?: string
    threshold?: number
  } = {},
) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        const on = entry.intersectionRatio >= threshold
        setVisible(on)
        if (on) setSeen(true)
      },
      { root, rootMargin, threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [root, rootMargin, threshold])

  return [ref, { visible, seen }] as const
}
