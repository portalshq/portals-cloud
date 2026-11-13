'use client'

import { useEffect, useRef } from 'react'
import type { ChromaticScene } from './chromatic-scene'
import styles from './ChromaticBackground.module.css'

export function ChromaticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let isDisposed = false
    let scene: ChromaticScene | undefined

    const initialize = async () => {
      try {
        const { createChromaticScene } = await import('./chromatic-scene')
        if (isDisposed) return
        scene = createChromaticScene(canvas)
      } catch (error) {
        if (isDisposed) return
        canvas.dataset.state = 'fallback'
        console.error('[chromatic-background] WebGL initialization failed; using the static fallback', error)
      }
    }

    void initialize()
    return () => {
      isDisposed = true
      scene?.dispose()
    }
  }, [])

  return (
    <div className={styles.background} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} data-state="loading" />
    </div>
  )
}
