'use client'

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react'
import {trackEvent} from '@/lib/leads/analytics-client'
import { cn } from '@/lib/utils'

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
  't-button inline-flex justify-center items-center rounded h-48 gap-x-9 px-12 t-p-sans text-white transition-all duration-500 cursor-pointer'

const appearanceClasses = {
  default: `min-w-220 w-fit border border-white/10 bg-white/8 backdrop-blur-[32px] hover:bg-white/16`,
  plain: `gap-x-9 w-fit`
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
  const classes = `${defaultClasses} ${appearance === 'plain' ? appearanceClasses[appearance] : appearanceClasses['default']} ${className}`.trim()
  const content = (
    <span className="inline-flex items-center gap-x-9">
      {children}
    </span>
  )

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    const {onClick, ...anchorProps} = elementProps
    return (
      <a
        {...anchorProps}
        className={cn(classes)}
        onClick={(event) => {
          void trackEvent('cta_clicked', {
            cta_label: analyticsLabel || String(elementProps.href),
            intent: analyticsIntent,
            use_case: analyticsUseCase,
            destination: elementProps.href,
          })
          onClick?.(event)
        }}
      >
        {content}
      </a>
    )
  }

  const {onClick, ...buttonProps} = elementProps
  return (
    <button
      {...buttonProps}
      className={classes}
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
