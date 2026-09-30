'use client'

import Link from 'next/link'
import { CTAButton } from '@/components/CTAButton'

export type PortalsHeaderProps = {
  breadcrumb?: Array<{ href: string; label: string }>
  actions?: Array<{
    href: string
    label: string
    appearance?: 'default' | 'plain'
    className?: string
  }>
  className?: string
}

/**
 * The one marketing header: wordmark + breadcrumbs on the left, CTAs on the right.
 * Rendered once by `app/(marketing)/layout.tsx` via `MarketingHeader` — pages
 * must never ship their own copy.
 */
export function PortalsHeader({ breadcrumb, actions, className = '' }: PortalsHeaderProps) {
  const breadcrumbItems = breadcrumb

  return (
    <header className={`absolute inset-x-0 top-0 z-(--z-header) ${className}`}>
      <div className="flex h-Header-h items-center justify-between gap-x-24 px-sms">
        <div className="flex min-w-0 items-baseline-last gap-x-12">
          <Link href="/" className="t-h3-sans !font-medium text-white">
            portals
          </Link>
          {breadcrumbItems?.map(({ href, label }, index) => (
            <span key={href} className="flex items-center gap-x-12 truncate t-p-sm-sans text-white/80">
              <span aria-hidden="true">/</span>
              <Link href={href} className="truncate transition-colors hover:text-white" aria-current={index === breadcrumbItems.length - 1 ? 'page' : undefined}>
                {label}
              </Link>
            </span>
          ))}
        </div>
        {actions?.length ? (
          <nav aria-label="Page" className="hidden shrink-0 items-center gap-x-16 text-white sm:flex">
            {actions.map(({ href, label, appearance, className }) => (
              <CTAButton key={`${href}-${label}`} href={href} appearance={appearance} analyticsLabel={label} className={className}>
                {label}
              </CTAButton>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  )
}