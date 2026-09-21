'use client'

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react'
import { trackEvent } from '@/lib/leads/analytics-client'
import { cn } from '@/lib/utils'

function smoothScrollTo(hash: string) {
  const element = globalThis.document.querySelector(hash)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

type SharedProps = {
  children: ReactNode
  className?: string
  appearance?: 'default' | 'plain'
  analyticsLabel?: string
  analyticsIntent?: string
  analyticsUseCase?: string
}

type LinkProps = SharedProps & {
  href: string
} & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'className' | 'href'
>

type ButtonProps = SharedProps & {
  href?: never
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>

type CTAButtonProps = LinkProps | ButtonProps

const defaultClasses =
  't-button inline-flex justify-center items-center rounded h-48 gap-x-9 px-12 text-inherit transition-backdrop duration-240 cursor-pointer'

const appearanceClasses = {
  default: `md:min-w-220 w-fit border border-white/50 bg-white/8 backdrop-blur-[32px] hover:bg-white/16 hover:border-white/80`,
  plain: `gap-x-9 w-fit underline decoration-2 underline-offset-4`
}

export function CTAButton(props: CTAButtonProps) {
  const {
    appearance = 'default',
    analyticsLabel,
    analyticsIntent,
    analyticsUseCase,
    children,
    className = '',
    ...elementProps
  } = props
  const classes = [defaultClasses, appearance === 'plain' ? appearanceClasses[appearance] : appearanceClasses['default'], className].join(' ')
  const content = (
    <span className="t-p-sans inline-flex items-center gap-x-9">
      {children}
    </span>
  )

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    const { onClick, ...anchorProps } = elementProps
    const isSamePageAnchor = elementProps.href.startsWith('#')

    return (
      <a
        {...anchorProps}
        data-analytics-cta="true"
        className={cn(classes)}
        onClick={(event) => {
          void trackEvent('cta_clicked', {
            cta_label: analyticsLabel || String(elementProps.href),
            intent: analyticsIntent,
            use_case: analyticsUseCase,
            destination: elementProps.href,
          })

          // Only handle smooth scroll for same-page anchors (href starts with #)
          // Cross-page links with hashes should navigate normally
          if (isSamePageAnchor) {
            event.preventDefault()
            smoothScrollTo(elementProps.href)
          }

          onClick?.(event)
        }}
      >
        {content}
      </a>
    )
  }

  const { onClick, ...buttonProps } = elementProps
  return (
    <button
      {...buttonProps}
      data-analytics-cta="true"
      className={cn(classes)}
      onClick={(event) => {
        if (analyticsLabel) {
          void trackEvent('cta_clicked', {
            cta_label: analyticsLabel,
            intent: analyticsIntent,
            use_case: analyticsUseCase,
          })
        }
        onClick?.(event)
      }}
    >
      {content}
    </button>
  )
}
