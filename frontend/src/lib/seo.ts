import type {Metadata} from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'

// Single positioning sentence. Use everywhere.
export const SITE_NAME = 'portals'
export const SITE_TAGLINE =
  'Production memory for AI-native creative teams — preserve every approved version and reuse it.'
export const SITE_DESCRIPTION =
  'portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.'

// Default share image for all marketing pages. File lives in public/.
export const DEFAULT_OG_IMAGE = '/og-image.jpg'

export function siteUrl() {
  return SITE_URL
}

export function canonical(path: string) {
  return new URL(path, SITE_URL).toString()
}

type SeoInput = {
  title: string
  description?: string
  path: string
  keywords?: string[]
  type?: 'website' | 'article'
  image?: string
  noIndex?: boolean
  publishedTime?: string
  modifiedTime?: string
}

/** Single helper for all marketing pages. Enforces absolute canonical, OG/Twitter, siteName. */
export function marketingMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  keywords,
  type = 'website',
  image = DEFAULT_OG_IMAGE,
  noIndex,
  publishedTime,
  modifiedTime,
}: SeoInput): Metadata {
  const url = canonical(path)
  const ogTitle = title.includes('|') ? title : `${title} | portals`
  return {
    title,
    description,
    keywords,
    metadataBase: new URL(SITE_URL),
    alternates: {canonical: url},
    robots: noIndex ? {index: false, follow: false} : 'index, follow',
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title: ogTitle,
      description,
      ...(image ? {images: [{url: image, width: 1200, height: 630}]} : undefined),
      ...(publishedTime ? {publishedTime} : {}),
      ...(modifiedTime ? {modifiedTime} : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      ...(image ? {images: [image]} : undefined),
    },
  }
}

/** Single source for root + marketing layout defaults. Keeps them unified. */
export function baseSiteMetadata(): Metadata {
  return {
    ...marketingMetadata({
      title: 'Production memory for AI-native creative teams | portals',
      description: SITE_DESCRIPTION,
      path: '/',
    }),
    icons: {icon: '/favicon.svg'},
  }
}

export function orgWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_TAGLINE,
      },
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
      },
    ],
  }
}

export function breadcrumbJsonLd(items: Array<{name: string; path: string}>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: canonical(item.path),
    })),
  }
}
