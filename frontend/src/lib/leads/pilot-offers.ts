import {createClient} from '@sanity/client'

export type PilotOffer = {
  _id: string
  _rev: string
  slug: string
  basePackageSlug: string
  basePackageAmount?: number
  basePackageCurrency?: string
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

export const publishedOfferClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-07-01',
  useCdn: false,
  // Offers used for pricing are published content, not preview or draft data.
})

const OFFER_FIELDS = `{
  _id, _rev, "slug": slug.current, status,
  "basePackageSlug": basePackage->slug.current,
  "basePackageAmount": basePackage->price.amount,
  "basePackageCurrency": basePackage->price.currency,
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
  const query = normalizedOfferSlug
    ? `*[_type == "pilotOfferVariant" && slug.current == $offerSlug && basePackage->slug.current == "studio-pilot" && status == "active"]${OFFER_FIELDS}`
    : `*[_type == "pilotOfferVariant" && basePackage->slug.current == "studio-pilot" && status == "active" && startsAt <= $now && endsAt > $now] | order(startsAt desc)${OFFER_FIELDS}`
  const offers = await publishedOfferClient.fetch<PilotOffer[]>(query, {
    ...(normalizedOfferSlug ? {offerSlug: normalizedOfferSlug} : {}),
    now: now.toISOString(),
  })

  if (offers.length > 1 && !normalizedOfferSlug) {
    throw new Error('multiple active pilot offers are configured')
  }
  const offer = offers[0]
  if (!offer) return null
  return validateAndNormalizeOffer(offer, now, email)
}

export function validateAndNormalizeOffer(offer: PilotOffer, now: Date, email?: string): PilotOffer {
  if (offer.basePackageSlug !== 'studio-pilot') throw new Error('invalid pilot offer package')

  const startsAt = new Date(offer.startsAt).getTime()
  const endsAt = new Date(offer.endsAt).getTime()
  const current = now.getTime()
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    throw new Error('invalid pilot offer window')
  }
  if (current < startsAt || current >= endsAt) throw new Error('pilot offer is outside its active window')
  offer.pilotPriceLabel = normalizeCurrencyLabel(offer.pilotPriceLabel)
  offer.annualCreditLabel = normalizeCurrencyLabel(offer.annualCreditLabel)
  if (!Number.isFinite(offer.pilotPriceAmount) || offer.pilotPriceAmount <= 0 || !offer.pilotPriceLabel
    || !Number.isFinite(offer.annualCreditAmount) || offer.annualCreditAmount <= 0 || !offer.annualCreditLabel) {
    throw new Error('invalid pilot offer terms')
  }
  if (!Number.isFinite(offer.basePackageAmount) || !offer.basePackageAmount || !offer.basePackageCurrency) {
    throw new Error('published Studio Pilot base price is missing')
  }
  if (offer.pilotPriceAmount > offer.basePackageAmount) {
    throw new Error('pilot offer price exceeds the published Studio Pilot price')
  }
  const currency = offer.basePackageCurrency || 'USD'
  if (!displayLabelMatchesAmount(offer.pilotPriceLabel, offer.pilotPriceAmount, currency)
    || !displayLabelMatchesAmount(offer.annualCreditLabel, offer.annualCreditAmount, currency)) {
    throw new Error('pilot offer display labels do not match their amounts and currency')
  }

  if (offer.allowedEmailDomains?.length && email) {
    const domain = email.toLowerCase().split('@').pop() || ''
    if (!offer.allowedEmailDomains.map((item) => item.toLowerCase()).includes(domain)) {
      throw new Error('pilot offer is not available for this prospect')
    }
  }
  return offer
}

function displayLabelMatchesAmount(label: string, amount: number, currency: string): boolean {
  const expectedSymbol = new Intl.NumberFormat('en-US', {style: 'currency', currency})
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value
  const normalized = label.replace(/\s/g, '')
  if (expectedSymbol && !normalized.startsWith(expectedSymbol)) return false
  const numeric = normalized.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  return numeric !== '' && Number(numeric) === amount
}
