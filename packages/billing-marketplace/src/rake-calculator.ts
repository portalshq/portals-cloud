/**
 * Platform rake is charged on two transaction types:
 *   (a) Capability marketplace: developer buys a third-party capability
 *   (b) Creator monetization: audience pays creator (subscription/tip/purchase)
 *
 * Both flow through this calculator so rake rates are changed in one place.
 * Rake rates are intentionally generous to the provider/creator at launch
 * to drive ecosystem adoption — raise them as marketplace density grows,
 * same strategy Roblox and Steam used.
 */

export type TransactionType = "capability-purchase" | "creator-subscription" | "creator-tip" | "creator-purchase";

const RAKE_RATES: Record<TransactionType, number> = {
  "capability-purchase":   0.20,  // 20% on capability marketplace (Unity/Steam is 30%; start lower to attract providers)
  "creator-subscription":  0.08,  // 8% on subscriptions (Patreon is 8-12%)
  "creator-tip":           0.05,  // 5% on tips (aggressive — tips are relationship-building)
  "creator-purchase":      0.10,  // 10% on one-time purchases/unlocks
};

export interface RakeResult {
  grossAmountCents: number;
  platformRakeCents: number;
  platformRakeRate: number;
  providerNetCents: number;
  stripeFeeCents: number;         // deducted from platform take, not from provider
  platformNetCents: number;       // what the platform actually keeps after Stripe
}

/**
 * Stripe Connect payout fee is 0.25% + $0.25 (US). Deducted from platform
 * rake, not passed through to the provider — clean provider economics are
 * key to marketplace trust. At scale, negotiate this down with Stripe.
 */
export function calculateRake(
  grossAmountCents: number,
  type: TransactionType,
  currency = "usd",
): RakeResult {
  const rate = RAKE_RATES[type];
  const platformRakeCents = Math.round(grossAmountCents * rate);
  const providerNetCents = grossAmountCents - platformRakeCents;

  // Stripe Connect fee: 0.25% of transfer + $0.25 flat (US)
  const stripeFeeCents = Math.round(providerNetCents * 0.0025) + 25;
  const platformNetCents = platformRakeCents - stripeFeeCents;

  return {
    grossAmountCents,
    platformRakeCents,
    platformRakeRate: rate,
    providerNetCents,
    stripeFeeCents,
    platformNetCents,
  };
}
