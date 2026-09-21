'use client'

import type {AnchorHTMLAttributes, ReactNode} from 'react'

type SmoothAnchorProps = {
  href: string
  children: ReactNode
  className?: string
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children' | 'className'>

export function SmoothAnchor({href, children, onClick, ...rest}: SmoothAnchorProps) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        if (href.startsWith('#')) {
          event.preventDefault()
          globalThis.document.querySelector(href)?.scrollIntoView({behavior: 'smooth', block: 'start'})
        }
        onClick?.(event)
      }}
    >
      {children}
    </a>
  )
}
