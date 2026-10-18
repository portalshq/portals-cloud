/**
 * Stripe Product and Price configuration
 * These IDs should be created in the Stripe Dashboard and updated here
 * Products are based on the pricing packages in ONBOARDING.md
 */

export interface StripeProductConfig {
  productId: string
  priceId: string
  name: string
  description: string
  amount: number // in cents
  currency: string
  type: 'one_time' | 'recurring'
  interval?: 'month' | 'year' // only for recurring prices
}

export const stripeProducts = {
  // Production Team Annual - $9,000/year
  productionTeamAnnual: {
    productId: process.env.STRIPE_PRODUCT_PRODUCTION_TEAM_ID || '',
    priceId: process.env.STRIPE_PRICE_PRODUCTION_TEAM_ID || '',
    name: 'Production Team Annual',
    description: 'Annual Production Team subscription',
    amount: 900000, // $9,000 in cents
    currency: 'usd',
    type: 'recurring' as const,
    interval: 'year' as const,
  },

  // Production Team Onboarding - $1,000 one-time
  productionTeamOnboarding: {
    productId: process.env.STRIPE_PRODUCT_ONBOARDING_ID || '',
    priceId: process.env.STRIPE_PRICE_ONBOARDING_ID || '',
    name: 'Production Team Onboarding',
    description: 'Standard onboarding for Production Team',
    amount: 100000, // $1,000 in cents
    currency: 'usd',
    type: 'one_time' as const,
  },

  // Studio Annual - $28,800/year
  studioAnnual: {
    productId: process.env.STRIPE_PRODUCT_STUDIO_ID || '',
    priceId: process.env.STRIPE_PRICE_STUDIO_ID || '',
    name: 'Studio Annual',
    description: 'Annual Studio subscription',
    amount: 2880000, // $28,800 in cents
    currency: 'usd',
    type: 'recurring' as const,
    interval: 'year' as const,
  },

  // Studio Pilot - $5,000 one-time
  studioPilot: {
    productId: process.env.STRIPE_PRODUCT_STUDIO_PILOT_ID || '',
    priceId: process.env.STRIPE_PRICE_STUDIO_PILOT_ID || '',
    name: 'Studio Pilot',
    description: 'Studio pilot evaluation',
    amount: 500000, // $5,000 in cents
    currency: 'usd',
    type: 'one_time' as const,
  },

  // Production Team Add-on Seat - $1,800/year
  productionTeamAddOnSeat: {
    productId: process.env.STRIPE_PRODUCT_ADD_ON_SEAT_ID || '',
    priceId: process.env.STRIPE_PRICE_ADD_ON_SEAT_ID || '',
    name: 'Production Team Add-on Seat',
    description: 'Additional seat for Production Team (billed annually)',
    amount: 180000, // $1,800 in cents
    currency: 'usd',
    type: 'recurring' as const,
    interval: 'year' as const,
  },
} as const

export type ProductKey = keyof typeof stripeProducts

export function getProductConfig(key: ProductKey): StripeProductConfig {
  const config = stripeProducts[key]
  if (!config.productId || !config.priceId) {
    throw new Error(`Stripe product configuration missing for ${key}. Set environment variables.`)
  }
  return config
}

export function getProductKeyByPriceId(priceId: string): ProductKey | null {
  for (const [key, config] of Object.entries(stripeProducts)) {
    if (config.priceId === priceId) {
      return key as ProductKey
    }
  }
  return null
}
