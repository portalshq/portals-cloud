import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  PortalsBilling,
  type BillingLedgerEntry,
  type BillingOutboxEvent,
  type BillingStore,
  type BillingTransaction,
  type ChannelBillingProfile,
  type ChannelPurchase,
} from "../src/index.js";

function fixture() {
  const profile: ChannelBillingProfile = { channelId: "channel", ownerId: "owner", stripeCustomerId: "cus_channel", stripeConnectedAccountId: "acct_owner", onboardingComplete: true, chargesEnabled: true, payoutsEnabled: true, defaultCurrency: "usd", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const purchases = new Map<string, ChannelPurchase>();
  const ledgers: BillingLedgerEntry[] = [];
  const outbox: BillingOutboxEvent[] = [];
  const eventIds = new Set<string>();
  const transaction: BillingTransaction = {
    getPurchase: async (id) => purchases.get(id),
    findPurchaseByStripeReference: async (reference) => [...purchases.values()].find((purchase) =>
      [purchase.stripeCheckoutSessionId, purchase.stripePaymentIntentId, purchase.stripeChargeId, purchase.stripeTransferId].includes(reference)),
    savePurchase: async (purchase) => { purchases.set(purchase.id, purchase); },
    saveChannelProfile: async () => {},
    appendLedger: async (entry) => { ledgers.push(entry); },
    appendOutbox: async (event) => { outbox.push(event); },
  };
  const store: BillingStore = {
    getChannelProfile: async () => profile,
    findChannelProfileByConnectedAccount: async () => profile,
    saveChannelProfile: async () => {},
    createPurchase: async (purchase) => { purchases.set(purchase.id, purchase); return purchase; },
    getPurchase: async (id) => purchases.get(id),
    processStripeEvent: async (event, apply) => {
      if (eventIds.has(event.id)) return "duplicate";
      await apply(transaction);
      eventIds.add(event.id);
      return "processed";
    },
    claimOutbox: async () => [],
    completeOutbox: async () => {},
    failOutbox: async () => {},
  };
  const create = vi.fn().mockResolvedValue({ id: "cs_one", url: "https://checkout.stripe.com/one" });
  const retrieve = vi.fn().mockResolvedValue({ id: "cs_one", url: "https://checkout.stripe.com/one" });
  let webhookEvent: Stripe.Event | undefined;
  const stripe = {
    checkout: { sessions: { create, retrieve } },
    webhooks: { constructEvent: vi.fn(() => webhookEvent) },
  } as unknown as Stripe;
  const billing = new PortalsBilling({ stripe, store, ids: { next: () => "purchase_one" }, catalog: { resolve: () => ({ key: "super", purchaseKind: "super_chat", name: "Super Chat", unitAmount: 1000, currency: "USD", platformFeeAmount: 100 }) } });
  return { billing, create, retrieve, purchases, ledgers, outbox, setWebhookEvent: (event: Stripe.Event) => { webhookEvent = event; } };
}

describe("PortalsBilling", () => {
  it("creates a destination-charge checkout using server catalog values", async () => {
    const { billing, create } = fixture();
    const result = await billing.createChannelCheckout({ purchaseId: "purchase_one", channelId: "channel", buyerId: "buyer", productKey: "super", successUrl: "https://portals.works/success", cancelUrl: "https://portals.works/cancel" });
    expect(result.sessionId).toBe("cs_one");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      payment_intent_data: expect.objectContaining({ transfer_data: { destination: "acct_owner" }, application_fee_amount: 100 }),
    }), { idempotencyKey: "channel-checkout:purchase_one" });
  });

  it("returns the same Stripe checkout when the application retries a purchase", async () => {
    const { billing, create, retrieve } = fixture();
    const input = { purchaseId: "purchase_one", channelId: "channel", buyerId: "buyer", productKey: "super", successUrl: "https://portals.works/success", cancelUrl: "https://portals.works/cancel" };
    await billing.createChannelCheckout(input);
    await expect(billing.createChannelCheckout(input)).resolves.toMatchObject({ sessionId: "cs_one" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("cs_one");
  });

  it("records only the new amount from cumulative partial-refund webhooks", async () => {
    const { billing, purchases, ledgers, setWebhookEvent } = fixture();
    purchases.set("purchase_one", {
      id: "purchase_one", channelId: "channel", buyerId: "buyer", productKey: "super", kind: "super_chat",
      amount: 1000, currency: "usd", platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const refundEvent = (id: string, amountRefunded: number): Stripe.Event => ({
      id, type: "charge.refunded", created: 1,
      data: { object: { id: "ch_one", object: "charge", amount_refunded: amountRefunded, metadata: { purchaseId: "purchase_one" } } },
    } as Stripe.Event);

    setWebhookEvent(refundEvent("evt_refund_1", 400));
    await billing.handleWebhook("body", "signature", "secret");
    setWebhookEvent(refundEvent("evt_refund_2", 700));
    await billing.handleWebhook("body", "signature", "secret");

    expect(ledgers.filter(({ kind }) => kind === "refund").map(({ amount }) => amount)).toEqual([400, 300]);
    expect(purchases.get("purchase_one")).toMatchObject({ state: "partially_refunded", refundedAmount: 700 });
  });
});
