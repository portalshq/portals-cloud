export type StripePricingTerms = {
  unit_amount: number | null
  currency: string
  recurring?: {interval: string; interval_count: number} | null
}

export type ExpectedPricingTerms = {
  amount: number
  currency: string
  interval?: string
  intervalCount?: number
}

export function pricingMismatch(price: StripePricingTerms, expected: ExpectedPricingTerms): string | null {
  if (price.unit_amount !== expected.amount) return 'amount differs'
  if (price.currency !== expected.currency) return 'currency differs'
  if (expected.interval) {
    if (price.recurring?.interval !== expected.interval
      || price.recurring.interval_count !== (expected.intervalCount || 1)) return 'billing interval differs'
  } else if (price.recurring) {
    return 'billing type differs'
  }
  return null
}
