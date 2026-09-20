'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    __sagaPxTheme?: { setActive: (on: boolean) => void }
    __sagaPendingPxTheme?: boolean
  }
}

/**
 * Activates the PX-exclusive WebGL palette (black / #efdc3d) while the PX
 * landing page is mounted and restores the global defaults on unmount, so
 * no other page ever sees the PX colors. Also restores normal animation speed
 * for the PX page and slow speed for other pages.
 */
export function PxWebGLTheme() {
  useEffect(() => {
    window.__sagaPendingPxTheme = true
    window.__sagaPxTheme?.setActive(true)
    return () => {
      window.__sagaPendingPxTheme = false
      window.__sagaPxTheme?.setActive(false)
    }
  }, [])
  return null
}
