import {createClient} from '@sanity/client'

export type PilotOffer = {
  _id: string
  _rev: string
  slug: string
  basePackageSlug: string
  status: 'active' | 'inactive'
  startsAt: string
  endsAt: string
  acceptanceDeadlineLabel?: string
  pilotPriceAmount: number
  pilotPriceLabel: string
  annualCreditAmount: number
  annualCreditLabel: string
  pilotDurationDays: number
  annualCreditRedemptionPolicy: string
  offerCopy?: string
  termsVersion?: string
  allowedEmailDomains?: string[]
}

const offerClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-07-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

const OFFER_FIELDS = `{
  _id, _rev, "slug": slug.current, status,
  "basePackageSlug": basePackage->slug.current,
  startsAt, endsAt, acceptanceDeadlineLabel, pilotPriceAmount, pilotPriceLabel,
  annualCreditAmount, annualCreditLabel, pilotDurationDays,
  annualCreditRedemptionPolicy, offerCopy, termsVersion,
  allowedEmailDomains
}`

// Sanity labels are display strings, so tolerate accidental repeated currency
// symbols without allowing them to leak into buyer-facing copy.
function normalizeCurrencyLabel(value: unknown): string {
  const label = String(value || '').trim()
  return label.replace(/^\$+/, '$')
}

export async function resolveCurrentPilotOffer(
  offerSlug?: string,
  email?: string,
  now = new Date(),
): Promise<PilotOffer | null> {
  const normalizedOfferSlug = offerSlug?.trim().replace(/^\/+|\/+$/g, '')
  if (offerSlug && !normalizedOfferSlug) {
    throw new Error('invalid pilot offer selector')
  }
  if (!process.env.SANITY_API_TOKEN) {
    if (normalizedOfferSlug) throw new Error('pilot offer resolution is not configured')
    return null
  }

  const query = normalizedOfferSlug
    ? `*[_type == "pilotOfferVariant" && slug.current == $offerSlug && basePackage->slug.current == "paid-pilot" && status == "active"]${OFFER_FIELDS}`
    : `*[_type == "pilotOfferVariant" && basePackage->slug.current == "paid-pilot" && status == "active" && startsAt <= $now && endsAt > $now] | order(startsAt desc)${OFFER_FIELDS}`
  const offers = await offerClient.fetch<PilotOffer[]>(query, {
    ...(normalizedOfferSlug ? {offerSlug: normalizedOfferSlug} : {}),
    now: now.toISOString(),
  })

  if (offers.length > 1 && !normalizedOfferSlug) {
    throw new Error('multiple active pilot offers are configured')
  }
  const offer = offers[0]
  if (!offer) return null
  if (offer.basePackageSlug !== 'paid-pilot') throw new Error('invalid pilot offer package')

  const startsAt = new Date(offer.startsAt).getTime()
  const endsAt = new Date(offer.endsAt).getTime()
  const current = now.getTime()
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    throw new Error('invalid pilot offer window')
  }
  if (current < startsAt || current >= endsAt) throw new Error('pilot offer is outside its active window')
  offer.pilotPriceLabel = normalizeCurrencyLabel(offer.pilotPriceLabel)
  offer.annualCreditLabel = normalizeCurrencyLabel(offer.annualCreditLabel)
  if (!Number.isFinite(offer.pilotPriceAmount) || !offer.pilotPriceLabel || !Number.isFinite(offer.annualCreditAmount) || !offer.annualCreditLabel) {
    throw new Error('invalid pilot offer terms')
  }

  if (offer.allowedEmailDomains?.length && email) {
    const domain = email.toLowerCase().split('@').pop() || ''
    if (!offer.allowedEmailDomains.map((item) => item.toLowerCase()).includes(domain)) {
      throw new Error('pilot offer is not available for this prospect')
    }
  }
  return offer
}
