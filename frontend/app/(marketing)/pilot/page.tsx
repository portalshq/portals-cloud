import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {cookies} from 'next/headers'
import {PaidPilotLandingPage} from '@/components/resources/PaidPilotLandingPage'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {resolveCurrentPilotOffer} from '@/lib/leads/pilot-offers'
import {getPublishedPackageSpecifications} from '@/lib/package-specifications'
import {marketingMetadata} from '@/lib/seo'
import {annualTotalFrom} from '@/lib/leads/pilot'
import {PROFILE_COOKIE} from '@/lib/leads/store'
import {APP_SESSION_COOKIE} from '@/lib/leads/application-auth'
import {getResourceDocument} from '@/sanity/lib/resources'

export const dynamic = 'force-dynamic'

export async function generateMetadata({searchParams}: {searchParams: Promise<{email?: string}>}): Promise<Metadata> {
  const {email} = await searchParams
  const cookieStore = await cookies()
  const document = await getResourceDocument('paid-pilot')
  if (!document) return {}
  return marketingMetadata({
    title: document.seo?.metaTitle || '21-Day AI Creative Production Pilot | portals',
    description:
      document.seo?.metaDescription ||
      'Scope a 21-day paid pilot on one active AI creative workflow. Measure asset retrieval, context recovery, reproducibility, handoffs, and rework.',
    path: document.seo?.canonicalPath || '/pilot',
    keywords: document.seo?.keywords ?? [
      'AI production pilot',
      'AI creative production pilot',
      'AI workflow evaluation',
      'AI asset management pilot',
      'production memory pilot',
    ],
    type: 'article',
    image: document.seo?.shareImageUrl,
    shareTitle: document.seo?.shareTitle,
    shareDescription: document.seo?.shareDescription,
    publishedTime: document.publishedAt,
    modifiedTime: document._updatedAt,
    noIndex: Boolean(email || cookieStore.get(PROFILE_COOKIE)?.value || cookieStore.get(APP_SESSION_COOKIE)?.value),
  })
}

export default async function PaidPilotPage({
  searchParams,
}: {
  searchParams: Promise<{offer?: string; mode?: 'standard' | 'assisted'; email?: string}>
}) {
  const {offer, mode, email} = await searchParams
  const [document, knownContext, offerVariant, packages] = await Promise.all([
    getResourceDocument('paid-pilot'),
    getKnownLeadContext(),
    resolveCurrentPilotOffer(offer).catch(() => null),
    getPublishedPackageSpecifications(),
  ])
  if (!document || document.landingPage?.enabled === false) notFound()
  const context: import('@/lib/leads/contracts').KnownLeadContext = {
    ...(email && knownContext.identity?.email && email.toLowerCase() !== knownContext.identity.email.toLowerCase()
      ? {known: false, knownFields: [], knownAnswerFields: []} : knownContext),
    ...(email ? {draftScopeHint: `email:${email.trim().toLowerCase().slice(0, 254)}`} : {}),
  }
  const annualOptions = packages.filter((spec) => ['production-team', 'studio', 'enterprise'].includes(spec.slug))
    .map((spec) => {
      const annualTotal = annualTotalFrom(spec)
      const priceLabel = annualTotal
        ? `${new Intl.NumberFormat('en-US', {style: 'currency', currency: spec.price?.currency || 'USD', maximumFractionDigits: 0}).format(annualTotal)} annually`
        : [spec.price?.displayValue, spec.price?.periodLabel].filter(Boolean).join(' ')
      return {slug: spec.slug, name: spec.name, priceLabel}
    })
  return (
    <PaidPilotLandingPage
      document={document}
      context={context}
      annualOptions={annualOptions}
      offer={offer}
      offerTerms={offerVariant ? {
          pilotPriceLabel: offerVariant.pilotPriceLabel,
          annualCreditLabel: offerVariant.annualCreditLabel,
          pilotDurationDays: offerVariant.pilotDurationDays,
          acceptanceDeadlineLabel: offerVariant.acceptanceDeadlineLabel,
          offerCopy: offerVariant.offerCopy,
      } : undefined}
      assessmentOrigin="standard"
      pilotMode={mode}
    />
  )
}
