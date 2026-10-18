'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function MarketingRouteEntrance() {
  const pathname = usePathname()
  const previousPathname = useRef(pathname)
  const previousMain = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) {
      previousMain.current = document.querySelector('[data-marketing-page-content] main')
      return
    }

    const outgoingMain = previousMain.current
    previousPathname.current = pathname
    let animation: Animation | undefined
    let observer: MutationObserver | undefined
    let observerTimeout = 0

    const animateIncomingContent = () => {
      const content = document.querySelector<HTMLElement>('[data-marketing-page-content]')
      const main = content?.querySelector<HTMLElement>('main')
      if (!content || !main || main === outgoingMain) return false
      previousMain.current = main
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      animation = content.animate(
        reducedMotion
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: 'translateY(24px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
        { duration: reducedMotion ? 167 : 267, easing: 'ease-in-out', fill: 'both' },
      )
      return true
    }

    if (!animateIncomingContent()) {
      observer = new MutationObserver(() => {
        if (animateIncomingContent()) {
          observer?.disconnect()
          window.clearTimeout(observerTimeout)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      observerTimeout = window.setTimeout(() => observer?.disconnect(), 10000)
    }

    return () => {
      observer?.disconnect()
      window.clearTimeout(observerTimeout)
      animation?.cancel()
    }
  }, [pathname])

  return null
}
