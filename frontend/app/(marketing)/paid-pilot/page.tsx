import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {PaidPilotLandingPage} from '@/components/resources/PaidPilotLandingPage'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {resolveCurrentPilotOffer} from '@/lib/leads/pilot-offers'
import {marketingMetadata} from '@/lib/seo'
import {getResourceDocument} from '@/sanity/lib/resources'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const document = await getResourceDocument('paid-pilot')
  if (!document) return {}
  return marketingMetadata({
    title: document.seo?.metaTitle || 'Paid pilot | portals',
    description:
      document.seo?.metaDescription ||
      'Scope a 21-day paid pilot on one active workflow and prove production memory pays for itself.',
    path: '/paid-pilot',
    keywords: document.seo?.keywords ?? [
      'AI production pilot',
      'creative production pilot',
      'production memory pilot',
    ],
    type: 'article',
    image: document.seo?.shareImageUrl,
    publishedTime: document.publishedAt,
    modifiedTime: document._updatedAt,
  })
}

export default async function PaidPilotPage({
  searchParams,
}: {
  searchParams: Promise<{offer?: string}>
}) {
  const {offer} = await searchParams
  const [document, context, offerVariant] = await Promise.all([
    getResourceDocument('paid-pilot'),
    getKnownLeadContext(),
    offer ? resolveCurrentPilotOffer(offer).catch(() => null) : Promise.resolve(null),
  ])
  if (!document || document.landingPage?.enabled === false) notFound()
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
      assessmentOrigin="standard"
    />
  )
}
