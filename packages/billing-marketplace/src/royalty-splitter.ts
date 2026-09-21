/**
 * Royalty splitting for derivative/remix content.
 * The Portals lineage graph gives every derivative narrative a chain of
 * ancestor PX addresses. This module distributes a royalty payment
 * across that chain proportionally, implementing monetization model #4
 * ("Stripe Connect for fictional IP").
 *
 * The lineage weight model is deliberately simple at launch:
 *   - Original work: 60% of royalty pool
 *   - Each derivative layer: splits remaining 40% equally
 *   - Platform: takes its standard rake off the top before splitting
 *
 * This will need to evolve with actual creator feedback — start simple
 * and let the community shape the model, same as how Spotify's royalty
 * model iterated. The important thing is that the infrastructure exists
 * to distribute splits at all.
 */

export interface LineageEntry {
  pxAddress: string;
  providerStripeAccountId: string; // Stripe Connect connected account
  depth: number;                    // 0 = original, 1 = direct derivative, etc.
}

export interface RoyaltySplit {
  pxAddress: string;
  stripeAccountId: string;
  amountCents: number;
  rationale: string;
}

export function calculateRoyaltySplits(
  netRoyaltyPoolCents: number,  // after platform rake has been deducted
  lineage: LineageEntry[],
): RoyaltySplit[] {
  if (lineage.length === 0) return [];

  const originals = lineage.filter((l) => l.depth === 0);
  const derivatives = lineage.filter((l) => l.depth > 0);

  // Guard: if one side is empty, allocate full pool to the other side
  // This prevents 60%/40% from vanishing when only originals or only derivatives exist
  const originalPool = originals.length > 0 && derivatives.length === 0
    ? netRoyaltyPoolCents
    : originals.length === 0 && derivatives.length > 0
      ? 0
      : Math.round(netRoyaltyPoolCents * 0.6);
  const derivativePool = netRoyaltyPoolCents - originalPool;

  const splits: RoyaltySplit[] = [];

  // Distribute original pool equally among all depth-0 works (co-authored originals)
  if (originals.length > 0) {
    const perOriginalCents = Math.floor(originalPool / originals.length);
    let remainder = originalPool - perOriginalCents * originals.length;
    for (const orig of originals) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      splits.push({
        pxAddress: orig.pxAddress,
        stripeAccountId: orig.providerStripeAccountId,
        amountCents: perOriginalCents + extra,
        rationale: `Original work (${originals.length} originals sharing ${originals.length > 0 && derivatives.length === 0 ? '100%' : '60%'} pool)`,
      });
    }
  }

  // Distribute derivative pool equally among derivative works
  if (derivatives.length > 0) {
    const perDerivativeCents = Math.floor(derivativePool / derivatives.length);
    let remainder = derivativePool - perDerivativeCents * derivatives.length;
    for (const deriv of derivatives) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      splits.push({
        pxAddress: deriv.pxAddress,
        stripeAccountId: deriv.providerStripeAccountId,
        amountCents: perDerivativeCents + extra,
        rationale: `Derivative (depth ${deriv.depth}, ${derivatives.length} derivatives sharing ${originals.length === 0 && derivatives.length > 0 ? '100%' : '40%'} pool)`,
      });
    }
  }

  return splits;
}
