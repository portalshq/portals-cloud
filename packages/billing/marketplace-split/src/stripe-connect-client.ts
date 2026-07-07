/**
 * Stripe Connect wrapper for marketplace provider payouts.
 * Uses Stripe Connect's Transfers API, not Payouts — Transfers go to
 * connected accounts (your providers), not to external bank accounts.
 * That distinction matters: Transfers happen instantly within Stripe;
 * Payouts (connected account → bank) happen on the provider's schedule.
 *
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are K8s secrets injected
 * as env vars. Never hardcode them.
 */

export interface ConnectTransfer {
  amount: number;         // cents
  currency: string;       // e.g. "usd"
  destination: string;    // Stripe connected account ID
  transferGroup?: string; // groups related transfers (e.g. a single marketplace transaction)
  metadata?: Record<string, string>;
}

export class StripeConnectClient {
  private secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey ?? process.env.STRIPE_SECRET_KEY ?? "";
    if (!this.secretKey) throw new Error("STRIPE_SECRET_KEY is required");
  }

  /**
   * Transfer provider payout to their connected Stripe account.
   * Call AFTER the platform has collected the gross amount from the buyer —
   * transfer only the net after rake and Stripe Connect fee.
   */
  async transferToProvider(transfer: ConnectTransfer): Promise<{ transferId: string }> {
    const res = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(transfer.amount),
        currency: transfer.currency,
        destination: transfer.destination,
        ...(transfer.transferGroup ? { transfer_group: transfer.transferGroup } : {}),
        ...(transfer.metadata
          ? Object.fromEntries(Object.entries(transfer.metadata).map(([k, v]) => [`metadata[${k}]`, v]))
          : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Stripe Connect transfer failed: ${await res.text()}`);
    }

    const data = (await res.json()) as { id: string };
    return { transferId: data.id };
  }

  /**
   * Execute all royalty splits from calculateRoyaltySplits() as a single
   * transfer group so they're traceable together in the Stripe dashboard.
   */
  async executeRoyaltySplits(
    splits: Array<{ stripeAccountId: string; amountCents: number }>,
    currency: string,
    groupId: string,
  ): Promise<string[]> {
    const transferIds: string[] = [];
    for (const split of splits) {
      if (split.amountCents <= 0) continue;
      const { transferId } = await this.transferToProvider({
        amount: split.amountCents,
        currency,
        destination: split.stripeAccountId,
        transferGroup: groupId,
        metadata: { royaltyGroup: groupId },
      });
      transferIds.push(transferId);
    }
    return transferIds;
  }
}
