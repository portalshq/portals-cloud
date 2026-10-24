'use client'

import { usePathname } from 'next/navigation'
import { PortalsHeader, type PortalsHeaderProps } from '@/components/PortalsHeader'

const pricingAction = { href: '/#pricing', label: 'Get started' } as const

// Static routes whose header is a pure function of the pathname. A detail route
// inherits its parent's entry (e.g. /blog/<slug> -> /blog). Unlisted routes get
// no header.
const staticHeaders: Record<string, PortalsHeaderProps> = {
  '/': { actions: [pricingAction] },
  '/contact': { breadcrumb: [{ href: '/contact', label: 'contact' }] },
  '/assessment': { breadcrumb: [{ href: '/assessment', label: 'assessment' }] },
  '/production-memory': { breadcrumb: [{ href: '/production-memory', label: 'production memory' }] },
  '/use-cases': { breadcrumb: [{ href: '/use-cases', label: 'use cases' }] },
  '/blog': { breadcrumb: [{ href: '/blog', label: 'blog' }] },
  '/pilot': { breadcrumb: [{ href: '/pilot', label: 'paid pilot' }] },
  '/paid-pilot': { breadcrumb: [{ href: '/pilot', label: 'paid pilot' }] },
  '/security-and-architecture': { breadcrumb: [{ href: '/security-and-architecture', label: 'security' }] },
  '/privacy-policy': { breadcrumb: [{ href: '/privacy-policy', label: 'privacy policy' }] },
  '/terms-of-service': { breadcrumb: [{ href: '/terms-of-service', label: 'terms of service' }] },
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

  const resolved: {header: PortalsHeaderProps; leafSlug?: string} = match || { header: {}, leafSlug: undefined }

  const leafLabel = resolved.leafSlug ? detailLabels[resolved.leafSlug] : undefined
  const breadcrumb = leafLabel
    ? [...(resolved.header.breadcrumb ?? []), { href: pathname, label: leafLabel }]
    : resolved.header.breadcrumb

  return <PortalsHeader {...resolved.header} actions={[{...pricingAction, href: pathname === '/' ? '#pricing' : '/#pricing'}]} breadcrumb={breadcrumb} />
}
