import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {createStripePlatformClient} from '@portalshq/platform-billing'

dotenv.config({path: '.env.local'})
dotenv.config({path: '../.env'})

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey?.startsWith('sk_test_')) throw new Error('Refusing Stripe catalog sync without a test-mode secret key')
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) throw new Error('Sanity project, dataset, and API token are required')

const sanity = createClient({projectId, dataset, token, apiVersion: '2026-07-01', useCdn: false})
const stripe = createStripePlatformClient(secretKey)
const apply = process.argv.includes('--apply')

const specs = await sanity.fetch<Record<string, any>[]>(
  '*[_type == "packageSpecification" && status == "published" && slug.current in ["production-team", "studio", "studio-pilot"]]{name, "slug": slug.current, price}',
)
const bySlug = new Map(specs.map((spec) => [spec.slug, spec]))
const production = bySlug.get('production-team')
const studio = bySlug.get('studio')
const studioPilot = bySlug.get('studio-pilot')
if (!production || !studio || !studioPilot) throw new Error('Required published package specifications are missing')

const amountInCents = (amount: number | undefined) => {
  if (!Number.isFinite(amount) || !amount || amount <= 0) throw new Error('Package amount is missing or invalid')
  return Math.round(amount * 100)
}
const currency = (price: any) => String(price?.currency || 'USD').toLowerCase()

async function ensurePrice(productId: string, lookupKey: string, amount: number, curr: string, recurring?: {interval: 'year' | 'month'; interval_count?: number}) {
  const existing = await stripe.prices.list({lookup_keys: [lookupKey], limit: 1})
  const price = existing.data[0]
  if (price) {
    if (price.unit_amount !== amount || price.currency !== curr || (recurring && (price.recurring?.interval !== recurring.interval || price.recurring.interval_count !== (recurring.interval_count || 1)))) {
      throw new Error(`Existing Stripe lookup key ${lookupKey} has different terms`)
    }
    if (!recurring && price.recurring) throw new Error(`Existing Stripe lookup key ${lookupKey} has different billing type`)
    return price
  }
  if (!apply) {
    console.log(`DRY RUN price ${lookupKey}: ${amount} ${curr}${recurring ? ` / ${recurring.interval}` : ' one-time'}`)
    return null
  }
  return stripe.prices.create({
    product: productId,
    lookup_key: lookupKey,
    unit_amount: amount,
    currency: curr,
    ...(recurring ? {recurring} : {}),
  })
}

async function setDefaultAndArchivePrevious(productId: string, nextPriceId: string | undefined, keepActivePriceIds: string[] = []) {
  if (!apply || !nextPriceId) return
  const product = await stripe.products.retrieve(productId)
  if (product.deleted) throw new Error(`Stripe product ${productId} is deleted`)
  const previousId = typeof product.default_price === 'string' ? product.default_price : product.default_price?.id
  await stripe.products.update(productId, {default_price: nextPriceId})
  if (previousId && previousId !== nextPriceId && !keepActivePriceIds.includes(previousId)) {
    const previous = await stripe.prices.retrieve(previousId)
    if (previous.active) await stripe.prices.update(previousId, {active: false})
  }
}

const onboardingProductId = process.env.STRIPE_PRODUCT_ONBOARDING_ID
const studioProductId = process.env.STRIPE_PRODUCT_STUDIO_ID
const pilotProductId = process.env.STRIPE_PRODUCT_STUDIO_PILOT_ID
const productionProductId = process.env.STRIPE_PRODUCT_PRODUCTION_TEAM_ID
const addOnProductId = process.env.STRIPE_PRODUCT_ADD_ON_SEAT_ID
if (!onboardingProductId || !studioProductId || !pilotProductId || !productionProductId) throw new Error('Existing Stripe product IDs are required, including STRIPE_PRODUCT_STUDIO_PILOT_ID')

const onboarding = await ensurePrice(onboardingProductId, 'production-team-onboarding-current', amountInCents(production.price?.onboardingFee), currency(production.price))
const productionAnnual = await ensurePrice(productionProductId, 'production-team-annual-current', amountInCents(production.price?.annualAmount), currency(production.price), {interval: 'year'})
const studioAnnual = await ensurePrice(studioProductId, 'studio-annual-current', amountInCents(studio.price?.annualAmount), currency(studio.price), {interval: 'year'})
const studioPilotPrice = await ensurePrice(pilotProductId, 'studio-pilot-base-current', amountInCents(studioPilot.price?.amount), currency(studioPilot.price))
const schedule = production.price?.installmentSchedule
if (!schedule?.count || schedule.interval !== 'quarter') throw new Error('Production Team quarterly installment schedule is missing')
const quarterlyAmount = amountInCents(production.price?.annualAmount) / schedule.count
if (!Number.isInteger(quarterlyAmount)) throw new Error('Annual amount cannot be divided evenly by the configured installments')
const quarterly = await ensurePrice(productionProductId, 'production-team-quarterly-annual-term', quarterlyAmount, currency(production.price), {interval: 'month', interval_count: 3})

const baseMonthly = production.price?.amount
const addonMonthly = production.price?.addOnSeatPrice
if (!baseMonthly || !addonMonthly || !production.price?.annualAmount) throw new Error('Production Team add-on pricing is missing')
const addonAnnualAmount = Math.round((addonMonthly / baseMonthly) * production.price.annualAmount)
let resolvedAddOnProductId = addOnProductId
if (!resolvedAddOnProductId && apply) {
  const product = await stripe.products.create({name: 'Production Team Add-on Seat', description: 'Additional Production Team seat, billed annually', metadata: {product_type: 'production-team-addon'}})
  resolvedAddOnProductId = product.id
}
if (resolvedAddOnProductId) {
  const addon = await ensurePrice(resolvedAddOnProductId, 'production-team-addon-seat-current', amountInCents(addonAnnualAmount), currency(production.price), {interval: 'year'})
  if (!addOnProductId && resolvedAddOnProductId && apply) console.log(`STRIPE_PRODUCT_ADD_ON_SEAT_ID=${resolvedAddOnProductId}`)
  if (addon) console.log(`STRIPE_PRICE_ADD_ON_SEAT_ID=${addon.id}`)
} else {
  console.log(`DRY RUN create Production Team add-on product and annual price: ${amountInCents(addonAnnualAmount)} ${currency(production.price)}`)
}

if (onboarding) console.log(`STRIPE_PRICE_ONBOARDING_ID=${onboarding.id}`)
if (productionAnnual) console.log(`STRIPE_PRICE_PRODUCTION_TEAM_ID=${productionAnnual.id}`)
if (studioAnnual) console.log(`STRIPE_PRICE_STUDIO_ID=${studioAnnual.id}`)
if (studioPilotPrice) console.log(`STRIPE_PRICE_STUDIO_PILOT_ID=${studioPilotPrice.id}`)
if (quarterly) console.log(`STRIPE_PRICE_PRODUCTION_TEAM_QUARTERLY_ID=${quarterly.id}`)
if (onboarding) await setDefaultAndArchivePrevious(onboardingProductId, onboarding.id)
if (productionAnnual) await setDefaultAndArchivePrevious(productionProductId, productionAnnual.id, quarterly ? [quarterly.id] : [])
if (studioAnnual) await setDefaultAndArchivePrevious(studioProductId, studioAnnual.id)
if (studioPilotPrice) await setDefaultAndArchivePrevious(pilotProductId, studioPilotPrice.id)
console.log(apply ? 'Stripe test catalog sync complete.' : 'No changes written. Pass --apply to update the Stripe test catalog.')
