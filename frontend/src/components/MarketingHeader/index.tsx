'use client'

import { usePathname } from 'next/navigation'
import { PortalsHeader, type PortalsHeaderProps } from '@/components/PortalsHeader'

const productionMemory = { href: '/production-memory', label: 'production memory', appearance: 'plain' } as const
const assess = { href: '/assessment', label: 'Assess your workflow' } as const

// Static routes whose header is a pure function of the pathname. A detail route
// inherits its parent's entry (e.g. /blog/<slug> -> /blog). Unlisted routes get
// no header.
const staticHeaders: Record<string, PortalsHeaderProps> = {
  '/contact': { breadcrumb: [{ href: '/contact', label: 'contact' }] },
  '/assessment': { breadcrumb: [{ href: '/assessment', label: 'assessment' }] },
  '/production-memory': { breadcrumb: [{ href: '/production-memory', label: 'production memory' }] },
  '/use-cases': { breadcrumb: [{ href: '/use-cases', label: 'use cases' }], actions: [{ href: '/pilot', label: 'Start a pilot', className: 'fixed top-15 right-sms' }] },
  '/blog': { breadcrumb: [{ href: '/blog', label: 'blog' }], actions: [productionMemory, assess] },
  '/pilot': { breadcrumb: [{ href: '/pilot', label: 'paid pilot' }] },
  '/paid-pilot': { breadcrumb: [{ href: '/pilot', label: 'paid pilot' }] },
  '/security-and-architecture': { breadcrumb: [{ href: '/security-and-architecture', label: 'security' }], actions: [{ href: '#controls', label: 'security brief / 2026', appearance: 'plain' }] },
  '/privacy-policy': { breadcrumb: [{ href: '/privacy-policy', label: 'privacy policy' }], actions: [{ href: '#document-sections', label: 'contents', appearance: 'plain' }] },
  '/terms-of-service': { breadcrumb: [{ href: '/terms-of-service', label: 'terms of service' }], actions: [{ href: '#document-sections', label: 'contents', appearance: 'plain' }] },
  '/workflow': { breadcrumb: [{ href: '/workflow/ai-production-workflow-risks', label: 'workflow risks' }] },
}

function findHeader(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  for (let depth = segments.length; depth > 0; depth--) {
    const match = staticHeaders[`/${segments.slice(0, depth).join('/')}`]
    if (match) return { header: match, leafSlug: segments[depth] }
  }
  return undefined
}

type Props = {
  // Slug -> document title for `/use-cases/<slug>` and `/blog/<slug>`, fetched in
  // the marketing layout. Without it a detail page just inherits its parent.
  detailLabels?: Record<string, string>
}

export function MarketingHeader({ detailLabels = {} }: Props) {
  const pathname = usePathname()
  const match = findHeader(pathname)

  if (!match) return null

  const leafLabel = match.leafSlug ? detailLabels[match.leafSlug] : undefined
  const breadcrumb = leafLabel
    ? [...(match.header.breadcrumb ?? []), { href: pathname, label: leafLabel }]
    : match.header.breadcrumb

  return <PortalsHeader {...match.header} breadcrumb={breadcrumb} />
}