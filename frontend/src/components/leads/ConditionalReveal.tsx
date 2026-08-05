'use client'

import type {ReactNode} from 'react'

export function ConditionalReveal({
  active,
  children,
  className = '',
}: {
  active: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      inert={!active}
      aria-hidden={!active}
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
        active ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      } ${className}`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
