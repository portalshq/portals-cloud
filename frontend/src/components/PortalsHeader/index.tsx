'use client'

import Link from 'next/link'

export type PortalsHeaderProps = {
  breadcrumb?: Array<{href: string; label: string}>
  action?: {
    href: string
    label: string
  }
  className?: string
}

export function PortalsHeader({breadcrumb, action, className = ''}: PortalsHeaderProps) {
  const breadcrumbItems = breadcrumb

  return (
    <header className={`absolute inset-x-0 top-0 z-(--z-header) ${className}`}>
      <div className="flex h-Header-h items-center justify-between px-sms">
        <div className="flex min-w-0 items-baseline-last gap-x-12">
          <Link href="/" className="t-h3-sans !font-medium text-white">
            portals
          </Link>
          {breadcrumbItems?.map(({href, label}, index) => (
            <span key={href} className="flex items-center gap-x-12 truncate t-p-sm-sans text-white/60">
              <span aria-hidden="true">/</span>
                <Link href={href} className="truncate transition-colors hover:text-white" aria-current={index === breadcrumbItems.length - 1 ? 'page' : undefined}>
                {label}
              </Link>
            </span>
          ))}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="hidden t-p-sm-sans text-white transition-colors hover:text-white sm:block"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </header>
  )
}
