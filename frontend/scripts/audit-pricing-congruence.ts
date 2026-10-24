import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {createStripePlatformClient} from '@portalshq/platform-billing'
import {pricingMismatch} from '../src/lib/pricing-congruence'

dotenv.config({path: '.env.local'})
dotenv.config({path: '../.env'})

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey?.startsWith('sk_test_')) {
  throw new Error('Refusing pricing audit without a Stripe test-mode secret key')
}
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) {
  throw new Error('Sanity project, dataset, and API token are required')
}

const sanity = createClient({projectId, dataset, token, apiVersion: '2026-07-01', useCdn: false})
const stripe = createStripePlatformClient(secretKey)
type Price = {amount?: number; currency?: string; annualAmount?: number; onboardingFee?: number; addOnSeatPrice?: number; installmentSchedule?: {count?: number; interval?: string}}
type Package = {name: string; slug: string; price?: Price}
const packages = await sanity.fetch<Package[]>(
  '*[_type == "packageSpecification" && status == "published" && slug.current in ["production-team", "studio", "studio-pilot"]]{name, "slug": slug.current, price}',
)
const bySlug = new Map(packages.map((item) => [item.slug, item]))
const production = bySlug.get('production-team')
const studio = bySlug.get('studio')
const pilot = bySlug.get('studio-pilot')
if (!production?.price || !studio?.price || !pilot?.price) {
  throw new Error('Published production-team, studio, and studio-pilot package prices are required')
}

function cents(amount: number | undefined, description: string): number {
  if (!Number.isFinite(amount) || !amount || amount <= 0) throw new Error(`${description} is missing or invalid`)
  return Math.round(amount * 100)
}
function currency(price: Price): string {
  return String(price.currency || 'USD').toLowerCase()
}
async function verifyPrice(input: {
  env: string
  priceEnv: string
  lookupKey: string
  amount: number
  currency: string
  interval?: 'year' | 'month'
  intervalCount?: number
}) {
  const productId = process.env[input.env]
  if (!productId) throw new Error(`${input.env} is required`)
  const matches = await stripe.prices.list({lookup_keys: [input.lookupKey], limit: 1})
  const price = matches.data[0]
  if (!price) throw new Error(`Stripe is missing lookup key ${input.lookupKey}`)
  const configuredPriceId = process.env[input.priceEnv]
  if (!configuredPriceId || configuredPriceId !== price.id) throw new Error(`${input.priceEnv} does not reference the current ${input.lookupKey} price`)
  if (!price.active) throw new Error(`Stripe price ${input.lookupKey} is inactive`)
  const attachedProduct = typeof price.product === 'string' ? price.product : price.product.id
  if (attachedProduct !== productId) throw new Error(`${input.lookupKey} is attached to the wrong Stripe product`)
  const mismatch = pricingMismatch(price, input)
  if (mismatch) throw new Error(`${input.lookupKey} ${mismatch} against the published Sanity package`)
  console.log(`PASS ${input.lookupKey}: ${input.amount} ${input.currency}${input.interval ? ` / ${input.interval}${input.intervalCount && input.intervalCount > 1 ? ` × ${input.intervalCount}` : ''}` : ' one-time'}`)
}

const productionPrice = production.price
const studioPrice = studio.price
const pilotPrice = pilot.price
const schedule = productionPrice.installmentSchedule
if (!schedule?.count || schedule.interval !== 'quarter' || !productionPrice.annualAmount) {
  throw new Error('Production Team quarterly installment schedule is missing or invalid')
}
const quarterlyCents = cents(productionPrice.annualAmount / schedule.count, 'Production Team quarterly installment')
const addOnAmount = productionPrice.amount && productionPrice.addOnSeatPrice && productionPrice.annualAmount
  ? Math.round((productionPrice.addOnSeatPrice / productionPrice.amount) * productionPrice.annualAmount)
  : null
if (!addOnAmount) throw new Error('Production Team add-on seat pricing is missing')

await verifyPrice({env: 'STRIPE_PRODUCT_ONBOARDING_ID', priceEnv: 'STRIPE_PRICE_ONBOARDING_ID', lookupKey: 'production-team-onboarding-current', amount: cents(productionPrice.onboardingFee, 'Production Team onboarding fee'), currency: currency(productionPrice)})
await verifyPrice({env: 'STRIPE_PRODUCT_PRODUCTION_TEAM_ID', priceEnv: 'STRIPE_PRICE_PRODUCTION_TEAM_ID', lookupKey: 'production-team-annual-current', amount: cents(productionPrice.annualAmount, 'Production Team annual amount'), currency: currency(productionPrice), interval: 'year'})
await verifyPrice({env: 'STRIPE_PRODUCT_STUDIO_ID', priceEnv: 'STRIPE_PRICE_STUDIO_ID', lookupKey: 'studio-annual-current', amount: cents(studioPrice.annualAmount, 'Studio annual amount'), currency: currency(studioPrice), interval: 'year'})
await verifyPrice({env: 'STRIPE_PRODUCT_STUDIO_PILOT_ID', priceEnv: 'STRIPE_PRICE_STUDIO_PILOT_ID', lookupKey: 'studio-pilot-base-current', amount: cents(pilotPrice.amount, 'Studio Pilot base amount'), currency: currency(pilotPrice)})
await verifyPrice({env: 'STRIPE_PRODUCT_PRODUCTION_TEAM_ID', priceEnv: 'STRIPE_PRICE_PRODUCTION_TEAM_QUARTERLY_ID', lookupKey: 'production-team-quarterly-annual-term', amount: quarterlyCents, currency: currency(productionPrice), interval: 'month', intervalCount: 3})
await verifyPrice({env: 'STRIPE_PRODUCT_ADD_ON_SEAT_ID', priceEnv: 'STRIPE_PRICE_ADD_ON_SEAT_ID', lookupKey: 'production-team-addon-seat-current', amount: cents(addOnAmount, 'Production Team annual add-on seat amount'), currency: currency(productionPrice), interval: 'year'})

type Offer = {
  slug: string
  status: string
  startsAt: string
  endsAt: string
  pilotPriceAmount: number
  pilotPriceLabel: string
  annualCreditAmount: number
  annualCreditLabel: string
  basePackageSlug: string
  basePackageAmount: number
  basePackageCurrency: string
}
const offers = await sanity.fetch<Offer[]>(
  '*[_type == "pilotOfferVariant" && basePackage->slug.current == "studio-pilot"]{"slug": slug.current, status, startsAt, endsAt, pilotPriceAmount, pilotPriceLabel, annualCreditAmount, annualCreditLabel, "basePackageSlug": basePackage->slug.current, "basePackageAmount": basePackage->price.amount, "basePackageCurrency": basePackage->price.currency}',
)
const now = Date.now()
const symbolFor = (code: string) => new Intl.NumberFormat('en-US', {style: 'currency', currency: code}).formatToParts(0).find((part) => part.type === 'currency')?.value
const labelMatches = (label: string, amount: number, code: string) => {
  const compact = String(label || '').replace(/\s/g, '')
  const symbol = symbolFor(code)
  const digits = compact.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  return Boolean(symbol && compact.startsWith(symbol) && digits && Number(digits) === amount)
}
for (const offer of offers) {
  if (offer.basePackageSlug !== 'studio-pilot' || !Number.isFinite(offer.pilotPriceAmount) || !Number.isFinite(offer.annualCreditAmount)) {
    throw new Error(`Pilot offer ${offer.slug} has invalid package or numeric terms`)
  }
  if (!offer.basePackageAmount || !offer.basePackageCurrency) throw new Error(`Pilot offer ${offer.slug} has no published base price/currency`)
  if (offer.pilotPriceAmount > offer.basePackageAmount) throw new Error(`Pilot offer ${offer.slug} exceeds the published Studio Pilot base price`)
  if (!labelMatches(offer.pilotPriceLabel, offer.pilotPriceAmount, offer.basePackageCurrency || 'USD')
    || !labelMatches(offer.annualCreditLabel, offer.annualCreditAmount, offer.basePackageCurrency || 'USD')) {
    throw new Error(`Pilot offer ${offer.slug} display label does not match its amount/currency`)
  }
  if (offer.status === 'active' && Number.isFinite(Date.parse(offer.startsAt)) && Number.isFinite(Date.parse(offer.endsAt))
    && Date.parse(offer.startsAt) <= now && Date.parse(offer.endsAt) > now) {
    console.log(`PASS active pilot offer ${offer.slug}: displayed amount and credit labels match the terms`)
  }
}
console.log('Pricing congruence audit passed (read-only Stripe test catalog and published Sanity data).')
