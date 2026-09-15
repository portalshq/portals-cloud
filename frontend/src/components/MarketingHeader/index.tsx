'use client'

import {usePathname} from 'next/navigation'
import {PortalsHeader, type PortalsHeaderProps} from '@/components/PortalsHeader'

// Static routes whose header is a pure function of the pathname. Pages with
// CMS-driven titles (legal docs, use-case detail) and bespoke hero headers
// render their own header and miss this map, yielding null below.
const staticHeaders: Record<string, PortalsHeaderProps> = {
  '/contact': {breadcrumb: [{href: '/contact', label: 'contact'}]},
  '/assessment': {breadcrumb: [{href: '/assessment', label: 'assessment'}]},
  '/interactive': {breadcrumb: [{href: '/interactive', label: 'interactive'}]},
  '/roadmap': {breadcrumb: [{href: '/roadmap', label: 'roadmap'}]},
}

export function MarketingHeader() {
  const pathname = usePathname()
  const props = staticHeaders[pathname]

  if (!props) return null

  return <PortalsHeader {...props} />
}
