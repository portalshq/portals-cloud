'use client'

import {useCallback, useEffect, useRef, useState} from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function usePreservedSwap() {
  const elRef = useRef<HTMLElement | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el
  }, [])

  const reserve = useCallback(() => {
    const el = elRef.current
    if (el) setHeight(el.getBoundingClientRect().height)
  }, [])

  useEffect(() => {
    if (height == null) return
    const el = elRef.current
    if (el) {
      el.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    }
    const clear = () => setHeight(null)
    const scroller = () => document.scrollingElement ?? document.documentElement
    if (!prefersReducedMotion()) {
      scroller().addEventListener('scrollend', clear, {once: true})
    }
    const fallback = window.setTimeout(clear, 1200)
    return () => {
      if (!prefersReducedMotion()) {
        scroller().removeEventListener('scrollend', clear)
      }
      window.clearTimeout(fallback)
    }
  }, [height])

  return {ref, reservedHeight: height, reserve}
}
