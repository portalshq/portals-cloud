'use client'

import {usePathname} from 'next/navigation'
import {PortalsHeader, type PortalsHeaderProps} from '@/components/PortalsHeader'

// Static routes whose header is a pure function of the pathname.
const staticHeaders: Record<string, PortalsHeaderProps> = {
  '/contact': {breadcrumb: [{href: '/contact', label: 'contact'}]},
  '/assessment': {breadcrumb: [{href: '/assessment', label: 'assessment'}]},
  '/production-memory': {breadcrumb: [{href: '/production-memory', label: 'production memory'}]},
  '/use-cases': {breadcrumb: [{href: '/use-cases', label: 'use cases'}]},
  '/resources/production-memory-brief': {breadcrumb: [{href: '/resources/production-memory-brief', label: 'production memory brief'}]},
  '/paid-pilot': {breadcrumb: [{href: '/paid-pilot', label: 'paid pilot'}]},
  '/security-and-architecture': {breadcrumb: [{href: '/security-and-architecture', label: 'security'}]},
}

export function MarketingHeader() {
  const pathname = usePathname()
  const props = staticHeaders[pathname]

  if (!props) return null

  return <PortalsHeader {...props} />
}
