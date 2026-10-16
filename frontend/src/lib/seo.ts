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
  const configuredUrl = new URL(SITE_URL)
  if (configuredUrl.hostname === 'www.portals.works') configuredUrl.hostname = 'portals.works'
  return configuredUrl.origin
}

export function canonical(path: string) {
  const url = new URL(path, siteUrl())
  // Marketing URLs use trailing slashes in Next.js. Normalize them here so
  // canonical, sitemap, Open Graph, and JSON-LD URLs all agree.
  if (url.pathname !== '/' && !url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

type SeoInput = {
  title: string
  description?: string
  path: string
  keywords?: string[]
  type?: 'website' | 'article'
  image?: string
  shareTitle?: string
  shareDescription?: string
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
  shareTitle,
  shareDescription,
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
    metadataBase: new URL(siteUrl()),
    alternates: {canonical: url},
    robots: noIndex
      ? {index: false, follow: false}
      : {index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1},
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      title: shareTitle || ogTitle,
      description: shareDescription || description,
      ...(image
        ? {
            images: [
              {
                url: image,
                width: 1200,
                height: 630,
                alt: 'Portals AI creative production repository',
              },
            ],
          }
        : undefined),
      ...(publishedTime ? {publishedTime} : {}),
      ...(modifiedTime ? {modifiedTime} : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle || ogTitle,
      description: shareDescription || description,
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
        '@id': canonical('/#organization'),
        name: SITE_NAME,
        url: canonical('/'),
        description: SITE_TAGLINE,
      },
      {
        '@type': 'WebSite',
        '@id': canonical('/#website'),
        name: SITE_NAME,
        url: canonical('/'),
        publisher: {'@id': canonical('/#organization')},
      },
    ],
  }
}

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': canonical('/#software'),
    name: 'portals',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: canonical('/'),
    description:
      'Production memory for AI-native creative teams — preserve every approved version and reuse it.',
    publisher: {'@id': canonical('/#organization')},
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
