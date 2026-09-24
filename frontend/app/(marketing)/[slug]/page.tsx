import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {PaidPilotLandingPage} from '@/components/resources/PaidPilotLandingPage'
import {ResourceLandingPage} from '@/components/resources/ResourceLandingPage'
import {SecurityArchitectureLandingPage} from '@/components/resources/SecurityArchitectureLandingPage'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {DEFAULT_OG_IMAGE} from '@/lib/seo'
import {getResourceDocument, getResourceSlugs} from '@/sanity/lib/resources'
import {resolveCurrentPilotOffer} from '@/lib/leads/pilot-offers'

type PageProps = {
  params: Promise<{
    slug: string
  }>
  searchParams: Promise<{from?: string; offer?: string; mode?: 'standard' | 'assisted'}>
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

  const shareImage = [{url: document.seo?.shareImageUrl || DEFAULT_OG_IMAGE}]

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

export default async function ResourcePage({params, searchParams}: PageProps) {
  const {slug} = await params
  const {from, offer, mode} = await searchParams
  const [document, context, offerVariant] = await Promise.all([
    getResourceDocument(slug),
    getKnownLeadContext(),
    offer ? resolveCurrentPilotOffer(offer).catch(() => null) : Promise.resolve(null),
  ])

  if (!document || document.landingPage?.enabled === false) {
    notFound()
  }

  if (document.slug === 'security-and-architecture') {
    return <SecurityArchitectureLandingPage document={document} context={context} />
  }

  if (document.slug === 'paid-pilot') {
    return (
      <PaidPilotLandingPage
        document={document}
        context={context}
        offer={offer}
        offerTerms={offerVariant ? {
          pilotPriceLabel: offerVariant.pilotPriceLabel,
          annualCreditLabel: offerVariant.annualCreditLabel,
          pilotDurationDays: offerVariant.pilotDurationDays,
          acceptanceDeadlineLabel: offerVariant.acceptanceDeadlineLabel,
          offerCopy: offerVariant.offerCopy,
        } : undefined}
        pilotMode={mode}
        assessmentOrigin={from === 'assessment-override' ? 'assessment_override' : 'standard'}
      />
    )
  }

  return <ResourceLandingPage document={document} context={context} />
}
