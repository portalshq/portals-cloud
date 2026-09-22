'use client'

import {useState, useEffect} from 'react'
import styles from './PxLandingPage.module.css'

export function EntityCards() {
  const [visibleCards, setVisibleCards] = useState<number[]>([])
  const [isAnimating, setIsAnimating] = useState(false)

  const representations = [
    {
      icon: '🐻',
      name: 'face_image.png',
      type: 'face_image',
      shape: 'rounded-full'
    },
    {
      icon: '📋',
      name: 'character_sheet.png',
      type: 'character_sheet',
      shape: 'rounded-lg'
    },
    {
      icon: '🎮',
      name: 'model_3d.glb',
      type: '3d_model',
      shape: 'rounded-lg'
    }
  ]

  useEffect(() => {
    // Start with first card
    setVisibleCards([0])
    
    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setVisibleCards((prev) => {
          if (prev.length >= representations.length) {
            // Reset after showing all cards
            return [0]
          }
          const nextIndex = prev.length
          return [...prev, nextIndex]
        })
        setIsAnimating(false)
      }, 500)
    }, 2000)

    return () => clearInterval(interval)
  }, [representations.length])

  const getCardPosition = (index: number) => {
    const offset = index * 20
    return {
      translateZ: `${offset}px`,
      translateX: `${-offset}px`,
      translateY: `${-offset}px`
    }
  }

  return (
    <div className={styles.entityCards} style={{ perspective: '1000px' }}>
      <div className="relative w-full max-w-[280px] mx-auto" style={{ transformStyle: 'preserve-3d' }}>
        {visibleCards.map((cardIndex, i) => {
          const rep = representations[cardIndex]
          const isLatest = i === visibleCards.length - 1
          const position = getCardPosition(i)
          
          return (
            <div
              key={cardIndex}
              className="absolute inset-0 bg-black/6 border border-white/10 rounded-lg overflow-hidden transition-all duration-500"
              style={{ 
                transformStyle: 'preserve-3d',
                transform: `translateZ(${position.translateZ}) translateX(${position.translateX}) translateY(${position.translateY}) ${isLatest && isAnimating ? 'scale(1.1)' : 'scale(1)'}`,
                zIndex: i + 1,
                opacity: isLatest && isAnimating ? 0 : 1
              }}
            >
              <div className="aspect-square bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                <div className="text-center">
                  <div className={`w-24 h-24 mx-auto bg-white/10 ${rep.shape} border border-white/20 flex items-center justify-center`}>
                    <span className="text-white/40 text-4xl">{rep.icon}</span>
                  </div>
                  <p className="mt-3 text-white/40 text-xs px-mono">{rep.name}</p>
                </div>
              </div>
              <div className="border-t border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[9px] text-white/50 px-mono">representation: {rep.type}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}