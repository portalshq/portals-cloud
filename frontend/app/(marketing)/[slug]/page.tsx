import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {PaidPilotLandingPage} from '@/components/resources/PaidPilotLandingPage'
import {ResourceLandingPage} from '@/components/resources/ResourceLandingPage'
import {SecurityArchitectureLandingPage} from '@/components/resources/SecurityArchitectureLandingPage'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {getResourceDocument, getResourceSlugs} from '@/sanity/lib/resources'

type PageProps = {
  params: Promise<{
    slug: string
  }>
}

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  return getResourceSlugs()
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const {slug} = await params
  const document = await getResourceDocument(slug)

  if (!document) {
    return {}
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'

  const canonicalPath =
    document.seo?.canonicalPath || `/${document.slug}`

  const shareImage = document.seo?.shareImageUrl
    ? [{url: document.seo.shareImageUrl}]
    : undefined

  return {
    title: document.seo?.metaTitle || document.title,
    description: document.seo?.metaDescription || document.abstract,
    keywords: document.seo?.keywords,
    alternates: {
      canonical: new URL(canonicalPath, siteUrl),
    },
    robots: document.seo?.noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
    openGraph: {
      type: 'article',
      title:
        document.seo?.shareTitle ||
        document.seo?.metaTitle ||
        document.title,
      description:
        document.seo?.shareDescription ||
        document.seo?.metaDescription ||
        document.abstract,
      publishedTime: document.publishedAt,
      modifiedTime: document._updatedAt,
      images: shareImage,
    },
  }
}

export default async function ResourcePage({params}: PageProps) {
  const {slug} = await params
  const [document, context] = await Promise.all([
    getResourceDocument(slug),
    getKnownLeadContext(),
  ])

  if (!document || document.landingPage?.enabled === false) {
    notFound()
  }

  if (document.slug === 'security-and-architecture') {
    return <SecurityArchitectureLandingPage document={document} context={context} />
  }

  if (document.slug === 'paid-pilot') {
    return <PaidPilotLandingPage document={document} context={context} />
  }

  return <ResourceLandingPage document={document} context={context} />
}
