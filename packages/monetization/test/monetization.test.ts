import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  Monetization,
  type BillingCatalog,
  type BillingLedgerEntry,
  type BillingOutboxEvent,
  type BillingStore,
  type BillingTransaction,
  type Product,
  type Purchase,
  type TenantBillingProfile,
} from "../src/index.js";

const PROFILE: TenantBillingProfile = {
  tenantId: "tenant", ownerId: "owner", stripeAccountId: "acct_tenant",
  transfersStatus: "active", defaultCurrency: "usd",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

function fixture(overrides: { transfersStatus?: TenantBillingProfile["transfersStatus"]; catalog?: BillingCatalog } = {}) {
  const profile: TenantBillingProfile = { ...PROFILE, ...overrides };
  const purchases = new Map<string, Purchase>();
  const ledgers: BillingLedgerEntry[] = [];
  const outbox: BillingOutboxEvent[] = [];
  const eventIds = new Set<string>();
  const transaction: BillingTransaction = {
    getPurchase: async (id) => purchases.get(id),
    findPurchaseByStripeReference: async (reference) => [...purchases.values()].find((purchase) =>
      [purchase.stripeCheckoutSessionId, purchase.stripePaymentIntentId, purchase.stripeChargeId, purchase.stripeTransferId].includes(reference)),
    savePurchase: async (purchase) => { purchases.set(purchase.id, purchase); },
    saveTenantProfile: async () => {},
    appendLedger: async (entry) => { ledgers.push(entry); },
    appendOutbox: async (event) => { outbox.push(event); },
  };
  const customers = new Map<string, string>();
  const createCustomer = vi.fn(async () => ({ id: "cus_created" }));
  const store: BillingStore = {
    getBillingCustomer: async (buyerId) => customers.get(buyerId),
    saveBillingCustomer: async (buyerId, customerId) => { customers.set(buyerId, customerId); },
    getTenantProfile: async (tenantId) => (tenantId === profile.tenantId ? profile : undefined),
    findPurchaseByStripeReference: async (reference) => [...purchases.values()].find((purchase) =>
      [purchase.stripeCheckoutSessionId, purchase.stripePaymentIntentId, purchase.stripeChargeId, purchase.stripeTransferId].includes(reference)),
    findTenantProfileByAccount: async () => profile,
    saveTenantProfile: async () => {},
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
  const createReversal = vi.fn().mockResolvedValue({ id: "trr_one" });
  let webhookEvent: Stripe.Event | undefined;
  const retrieveIntent = vi.fn().mockResolvedValue({
    id: "pi_one",
    latest_charge: {
      id: "ch_one", transfer: "tr_one", application_fee: "fee_one",
      balance_transaction: { fee: 25, net: 875 },
    },
  });
  const v2AccountRetrieve = vi.fn().mockResolvedValue({
    id: "acct_tenant",
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } } },
  });
  const v2AccountCreate = vi.fn().mockResolvedValue({
    id: "acct_new",
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } },
  });
  const stripe = {
    checkout: { sessions: { create, retrieve } },
    transfers: { createReversal },
    paymentIntents: { retrieve: retrieveIntent },
    v2: { core: { accounts: { create: v2AccountCreate, retrieve: v2AccountRetrieve } } },
    webhooks: { constructEvent: vi.fn(() => webhookEvent) },
    customers: { create: createCustomer },
  } as unknown as Stripe;
  const monetization = new Monetization({
    stripe, store, ids: { next: () => "id_one" },
    catalog: overrides.catalog ?? { resolve: () => ({ key: "super", purchaseKind: "super_chat", name: "Super Chat", unitAmount: 1000, currency: "USD", platformFeeAmount: 100 }) },
  });
  return {
    monetization, create, retrieve, createReversal, retrieveIntent, purchases, ledgers, outbox, profile,
    v2AccountCreate, v2AccountRetrieve, createCustomer, customers,
    setWebhookEvent: (event: Stripe.Event) => { webhookEvent = event; },
  };
}

const CHECKOUT = {
  purchaseId: "purchase_one", tenantId: "tenant", channelId: "channel_a",
  buyerId: "buyer", productKey: "super",
  successUrl: "https://portals.works/success", cancelUrl: "https://portals.works/cancel",
};

function paidSession(purchaseId: string, overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: "evt_paid", type: "checkout.session.completed", created: 1,
    data: { object: {
      id: "cs_one", payment_status: "paid", client_reference_id: purchaseId,
      metadata: { purchaseId }, payment_intent: "pi_one", ...overrides,
    } },
  } as Stripe.Event;
}

describe("Monetization account setup", () => {
  it("creates the tenant account via Accounts v2 as a recipient, not a v1 account type", async () => {
    const { monetization, v2AccountCreate } = fixture();
    const profile = await monetization.ensureTenantProfile({ tenantId: "tenant_new", ownerId: "owner", email: "t@example.com" });
    const params = v2AccountCreate.mock.calls[0][0] as Record<string, unknown>;

    expect(params).toMatchObject({
      contact_email: "t@example.com",
      dashboard: "express",
      configuration: { recipient: {} },
      // Required for destination charges: the platform must hold the negative
      // balance so a dispute transfer can be reversed.
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
    });
    // The deprecated v1 form must never be sent.
    expect(params).not.toHaveProperty("type");
    expect(params).not.toHaveProperty("capabilities");
    expect(profile).toMatchObject({ stripeAccountId: "acct_new", transfersStatus: "pending" });
  });

  it("reads transfer capability from the v2 path, never the deprecated booleans", async () => {
    const { monetization, v2AccountRetrieve } = fixture();
    const refreshed = await monetization.refreshTenantCapabilities("tenant");
    expect(v2AccountRetrieve).toHaveBeenCalledWith("acct_tenant");
    expect(refreshed.transfersStatus).toBe("active");
    expect(refreshed).not.toHaveProperty("chargesEnabled");
    expect(refreshed).not.toHaveProperty("payoutsEnabled");
  });
});

describe("Monetization checkout (direct charge)", () => {
  it("creates a destination charge that transfers to the tenant", async () => {
    const { monetization, create } = fixture();
    const result = await monetization.createCheckout(CHECKOUT);
    expect(result.sessionId).toBe("cs_one");

    const [params, options] = create.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({
      mode: "payment",
      payment_intent_data: {
        transfer_data: { destination: "acct_tenant" },
        application_fee_amount: 100,
      },
    });
    // Created on the platform account: no account context is set, because the
    // charge belongs to the platform and the transfer carries it to the tenant.
    expect(options).toEqual({ idempotencyKey: "checkout:purchase_one" });
  });

  it("charges the platform Customer so one payment method serves every tenant", async () => {
    const { monetization, create, purchases } = fixture();
    await monetization.createCheckout({ ...CHECKOUT, customerId: "cus_shared" });
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params.customer).toBe("cus_shared");
    expect(purchases.get("purchase_one")).toMatchObject({ customerId: "cus_shared" });
  });

  it("omits the customer when none is supplied, letting Stripe create one", async () => {
    const { monetization, create } = fixture();
    await monetization.createCheckout(CHECKOUT);
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params).not.toHaveProperty("customer");
  });

  it("labels the session for Dashboard tracking with an 8-letter suffix", async () => {
    const { monetization, create } = fixture();
    await monetization.createCheckout(CHECKOUT);
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params.integration_identifier).toMatch(/^portalshq-monetization-[a-z]{8}$/);
  });

  it("returns the same Stripe checkout when the application retries a purchase", async () => {
    const { monetization, create, retrieve } = fixture();
    await monetization.createCheckout(CHECKOUT);
    await expect(monetization.createCheckout(CHECKOUT)).resolves.toMatchObject({ sessionId: "cs_one" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("cs_one");
  });

  it("refuses to reuse a purchase id for different purchase data", async () => {
    const { monetization } = fixture();
    await monetization.createCheckout(CHECKOUT);
    await expect(monetization.createCheckout({ ...CHECKOUT, buyerId: "someone_else" }))
      .rejects.toThrow("purchaseId is already associated with a different purchase");
  });

  it("refuses checkout until transfers are active on the v2 capability", async () => {
    const { monetization } = fixture({ transfersStatus: "pending" });
    await expect(monetization.createCheckout(CHECKOUT))
      .rejects.toThrow("Tenant account is not active for transfers");
  });
});

describe("Monetization settlement", () => {
  it("transfers to the same tenant account from any of its channels", async () => {
    const { monetization, create, purchases } = fixture();
    await monetization.createCheckout(CHECKOUT);
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params.payment_intent_data).toMatchObject({ transfer_data: { destination: "acct_tenant" } });
    expect(purchases.get("purchase_one")).toMatchObject({ tenantId: "tenant", channelId: "channel_a" });
  });

  it("keeps a second channel under the same tenant on one destination account", async () => {
    const { monetization, create } = fixture();
    await monetization.createCheckout(CHECKOUT);
    await monetization.createCheckout({ ...CHECKOUT, purchaseId: "purchase_two", channelId: "channel_b" });
    const destinations = create.mock.calls.map(
      (call) => ((call[0] as Record<string, unknown>).payment_intent_data as Record<string, unknown>).transfer_data,
    );
    expect(destinations).toEqual([{ destination: "acct_tenant" }, { destination: "acct_tenant" }]);
  });

  it("publishes every fact an entitlement rule needs on the settlement outbox", async () => {
    const { monetization, outbox, setWebhookEvent } = fixture();
    await monetization.createCheckout({ ...CHECKOUT, sessionId: "session_7" });
    setWebhookEvent(paidSession("purchase_one"));
    await monetization.handleWebhook("body", "signature", "secret");

    const settled = outbox.find((event) => event.type === "billing.purchase_settled");
    expect(settled?.payload).toMatchObject({
      purchaseId: "purchase_one",
      tenantId: "tenant",
      channelId: "channel_a",
      sessionId: "session_7",
      buyerId: "buyer",
      kind: "super_chat",
      productKey: "super",
      amount: 1000,
      currency: "usd",
    });
    expect(String(settled?.payload.settledAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports a null session when the purchase had none, so rules can distinguish it", async () => {
    const { monetization, outbox, setWebhookEvent } = fixture();
    await monetization.createCheckout(CHECKOUT);
    setWebhookEvent(paidSession("purchase_one"));
    await monetization.handleWebhook("body", "signature", "secret");
    expect(outbox.find((event) => event.type === "billing.purchase_settled")?.payload.sessionId).toBeNull();
  });

  it("applies a settlement only once when Stripe redelivers the event", async () => {
    const { monetization, outbox, ledgers, setWebhookEvent } = fixture();
    await monetization.createCheckout(CHECKOUT);
    setWebhookEvent(paidSession("purchase_one"));

    const first = await monetization.handleWebhook("body", "signature", "secret");
    const second = await monetization.handleWebhook("body", "signature", "secret");

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(outbox.filter((event) => event.type === "billing.purchase_settled")).toHaveLength(1);
    expect(ledgers.filter(({ kind }) => kind === "settlement")).toHaveLength(1);
  });

  it("ignores a checkout that never completed payment", async () => {
    const { monetization, outbox, setWebhookEvent } = fixture();
    await monetization.createCheckout(CHECKOUT);
    setWebhookEvent(paidSession("purchase_one", { payment_status: "unpaid" }));
    await monetization.handleWebhook("body", "signature", "secret");
    expect(outbox).toHaveLength(0);
  });
});

describe("Monetization refunds", () => {
  it("records only the new amount from cumulative partial-refund webhooks", async () => {
    const { monetization, purchases, ledgers, setWebhookEvent } = fixture();
    purchases.set("purchase_one", {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const refundEvent = (id: string, amountRefunded: number): Stripe.Event => ({
      id, type: "charge.refunded", created: 1,
      data: { object: { id: "ch_one", object: "charge", amount_refunded: amountRefunded, metadata: { purchaseId: "purchase_one" } } },
    } as Stripe.Event);

    setWebhookEvent(refundEvent("evt_refund_1", 400));
    await monetization.handleWebhook("body", "signature", "secret");
    setWebhookEvent(refundEvent("evt_refund_2", 700));
    await monetization.handleWebhook("body", "signature", "secret");

    expect(ledgers.filter(({ kind }) => kind === "refund").map(({ amount }) => amount)).toEqual([400, 300]);
    expect(purchases.get("purchase_one")).toMatchObject({ state: "partially_refunded", refundedAmount: 700 });
  });

  it("emits a refund event carrying the purchase a revocation should target", async () => {
    const { monetization, outbox, purchases, setWebhookEvent } = fixture();
    purchases.set("purchase_one", {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    setWebhookEvent({
      id: "evt_refund", type: "charge.refunded", created: 1,
      data: { object: { id: "ch_one", object: "charge", amount_refunded: 1000, metadata: { purchaseId: "purchase_one" } } },
    } as Stripe.Event);
    await monetization.handleWebhook("body", "signature", "secret");

    const refunded = outbox.find((event) => event.type === "billing.purchase_refunded");
    expect(refunded?.aggregateId).toBe("purchase_one");
    expect(refunded?.payload.purchaseId).toBe("purchase_one");
  });
});

describe("Monetization settlement verification", () => {
  async function settled(overrides: Partial<Purchase> = {}) {
    const harness = fixture();
    const purchase: Purchase = {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
    harness.purchases.set("purchase_one", purchase);
    return { ...harness, purchase };
  }

  it("passes when Stripe recorded the catalog amount and fee", async () => {
    const { monetization } = await settled();
    await expect(monetization.verifySettlement("purchase_one", 1000, 100)).resolves.toEqual({ ok: true });
  });

  it("rejects a short application_fee_amount so a tenant cannot skip rake", async () => {
    const { monetization } = await settled();
    await expect(monetization.verifySettlement("purchase_one", 1000, 0))
      .resolves.toEqual({ ok: false, reason: "fee_mismatch", expected: 100, actual: 0 });
  });

  it("rejects an over-collected fee so a tenant cannot overcharge the platform", async () => {
    const { monetization } = await settled();
    await expect(monetization.verifySettlement("purchase_one", 1000, 900))
      .resolves.toEqual({ ok: false, reason: "fee_mismatch", expected: 100, actual: 900 });
  });

  it("treats a missing fee as zero rather than passing it", async () => {
    const { monetization } = await settled({ platformFeeAmount: 0 });
    await expect(monetization.verifySettlement("purchase_one", 1000, null)).resolves.toEqual({ ok: true });
  });

  it("rejects a mismatched amount", async () => {
    const { monetization } = await settled();
    await expect(monetization.verifySettlement("purchase_one", 500, 100))
      .resolves.toEqual({ ok: false, reason: "amount_mismatch", expected: 1000, actual: 500 });
  });
});

describe("Monetization fee ownership", () => {
  it("takes the fee from the server catalog, never from the request", async () => {
    const { monetization, create } = fixture();
    await monetization.createCheckout({ ...CHECKOUT, productKey: "super" });
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect((params.payment_intent_data as Record<string, unknown>).application_fee_amount).toBe(100);
  });

  it("ignores any fee a caller tries to smuggle through the input object", async () => {
    const { monetization, create } = fixture();
    // `CreateCheckoutInput` has no fee field; an excess property at runtime
    // must not reach Stripe.
    await monetization.createCheckout({ ...CHECKOUT, application_fee_amount: 0, platformFeeAmount: 0 } as never);
    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params.payment_intent_data).toEqual({
      metadata: expect.any(Object),
      transfer_data: { destination: "acct_tenant" },
      application_fee_amount: 100,
    });
  });

  it("omits the fee entirely when the catalog fee is zero", async () => {
    const harness = fixture();
    const zero = new Monetization({
      stripe: harness.monetization["options"].stripe,
      store: harness.monetization["options"].store,
      ids: { next: () => "id_1" },
      catalog: { resolve: () => ({ key: "free", purchaseKind: "tip", name: "Free", unitAmount: 100, currency: "USD", platformFeeAmount: 0 }) },
    });
    await zero.createCheckout({ ...CHECKOUT, productKey: "free" });
    const [params] = harness.create.mock.calls[0] as [Record<string, unknown>];
    expect(params.payment_intent_data).not.toHaveProperty("application_fee_amount");
    // The destination transfer is still required even at a zero fee.
    expect(params.payment_intent_data).toMatchObject({ transfer_data: { destination: "acct_tenant" } });
  });

  it("still transfers the full amount to the tenant when the fee is zero", async () => {
    const harness = fixture();
    const zero = new Monetization({
      stripe: harness.monetization["options"].stripe,
      store: harness.monetization["options"].store,
      ids: { next: () => "id_1" },
      catalog: { resolve: () => ({ key: "free", purchaseKind: "tip", name: "Free", unitAmount: 100, currency: "USD", platformFeeAmount: 0 }) },
    });
    await zero.createCheckout({ ...CHECKOUT, productKey: "free" });
    const [params] = harness.create.mock.calls[0] as [Record<string, unknown>];
    const item = (params.line_items as Array<Record<string, Record<string, unknown>>>)[0];
    expect(item.price_data).toMatchObject({ unit_amount: 100 });
  });
});

describe("Monetization dispute handling", () => {
  it("resolves the purchase from the payload without any Stripe read", async () => {
    const { monetization, setWebhookEvent, retrieveIntent, purchases } = fixture();
    purchases.set("purchase_one", {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    setWebhookEvent({
      id: "evt_dispute", type: "charge.dispute.created", created: 1,
      data: { object: { id: "dp_1", charge: "ch_one", amount: 1000 } },
    } as Stripe.Event);
    await monetization.handleWebhook("body", "signature", "secret");
    // A dispute never needs to read the Charge: the reference lookup suffices.
    expect(retrieveIntent).not.toHaveBeenCalled();
    expect(purchases.get("purchase_one")?.state).toBe("disputed");
  });

  it("skips an unresolvable dispute rather than reading a charge at the wrong scope", async () => {
    const { monetization, setWebhookEvent, outbox } = fixture();
    setWebhookEvent({
      id: "evt_orphan", type: "charge.dispute.created", created: 1,
      data: { object: { id: "dp_2", charge: "ch_unknown", amount: 500 } },
    } as Stripe.Event);
    await expect(monetization.handleWebhook("body", "signature", "secret")).resolves.toMatchObject({ status: "processed" });
    expect(outbox).toHaveLength(0);
  });
});

describe("Monetization anomaly guards", () => {
  it("requests stripe_transfers, without which the capability never activates", async () => {
    const { monetization, v2AccountCreate } = fixture();
    await monetization.ensureTenantProfile({ tenantId: "brand_new", ownerId: "owner" });
    const params = v2AccountCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    });
  });

  it("does not settle a purchase whose captured amount differs from the catalog", async () => {
    const { monetization, outbox, setWebhookEvent, retrieveIntent } = fixture();
    retrieveIntent.mockResolvedValue({
      id: "pi_one",
      latest_charge: { id: "ch_one", amount_captured: 1, transfer: "tr_one", balance_transaction: { fee: 0, net: 1 } },
    });
    await monetization.createCheckout(CHECKOUT);
    setWebhookEvent(paidSession("purchase_one"));
    await monetization.handleWebhook("body", "signature", "secret");
    expect(outbox.filter((event) => event.type === "billing.purchase_settled")).toHaveLength(0);
  });

  it("settles normally when the captured amount matches", async () => {
    const { monetization, outbox, setWebhookEvent } = fixture();
    await monetization.createCheckout(CHECKOUT);
    setWebhookEvent(paidSession("purchase_one"));
    await monetization.handleWebhook("body", "signature", "secret");
    expect(outbox.filter((event) => event.type === "billing.purchase_settled")).toHaveLength(1);
  });

  it("reverses the transfer before opening the transaction, under a stable key", async () => {
    const harness = fixture();
    const purchase: Purchase = {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one", stripeTransferId: "tr_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    harness.purchases.set("purchase_one", purchase);
    const createReversal = vi.fn().mockResolvedValue({ id: "trr_one" });
    const dispute = {
      id: "dp_1", type: "charge.dispute.created", created: 1,
      data: { object: { id: "dp_1", charge: "ch_one", amount: 1000 } },
    } as Stripe.Event;
    const scoped = new Monetization({
      stripe: {
        checkout: { sessions: { create: harness.create, retrieve: harness.retrieve } },
        paymentIntents: { retrieve: harness.retrieveIntent },
        transfers: { createReversal },
        webhooks: { constructEvent: vi.fn(() => dispute) },
      } as unknown as Stripe,
      store: {
        ...harness.monetization["options"].store,
        getPurchase: async (id: string) => (id === "purchase_one" ? purchase : undefined),
        findPurchaseByStripeReference: async (reference: string) => (reference === "ch_one" ? purchase : undefined),
      } as never,
      ids: { next: () => "id_1" },
      catalog: harness.monetization["options"].catalog,
      reverseTransferForDispute: () => true,
    });
    await scoped.handleWebhook("body", "signature", "secret");
    expect(createReversal).toHaveBeenCalledWith(
      "tr_one",
      expect.objectContaining({ amount: 1000 }),
      { idempotencyKey: "dispute-reversal:purchase_one:dp_1" },
    );
  });

  it("skips the reversal when policy declines it", async () => {
    const harness = fixture();
    const purchase: Purchase = {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", buyerId: "buyer",
      productKey: "super", kind: "super_chat", amount: 1000, currency: "usd",
      platformFeeAmount: 100, state: "settled", refundedAmount: 0,
      stripePaymentIntentId: "pi_one", stripeChargeId: "ch_one", stripeTransferId: "tr_one",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    harness.purchases.set("purchase_one", purchase);
    const createReversal = vi.fn();
    const dispute = { id: "dp_2", type: "charge.dispute.created", created: 1, data: { object: { id: "dp_2", charge: "ch_one", amount: 1000 } } } as Stripe.Event;
    const scoped = new Monetization({
      stripe: { transfers: { createReversal }, webhooks: { constructEvent: vi.fn(() => dispute) } } as unknown as Stripe,
      store: {
        ...harness.monetization["options"].store,
        getPurchase: async () => purchase,
        findPurchaseByStripeReference: async () => purchase,
      } as never,
      ids: { next: () => "id_1" },
      catalog: harness.monetization["options"].catalog,
      reverseTransferForDispute: () => false,
    });
    await scoped.handleWebhook("body", "signature", "secret");
    expect(createReversal).not.toHaveBeenCalled();
  });
});

describe("platform-held billing customer", () => {
  it("creates a Customer on the platform account on first use", async () => {
    const { monetization, createCustomer, customers } = fixture();
    await expect(monetization.ensureBillingCustomer("buyer")).resolves.toEqual({ id: "cus_created" });
    expect(createCustomer).toHaveBeenCalledWith({ metadata: { buyerId: "buyer" } });
    expect(customers.get("buyer")).toBe("cus_created");
  });

  it("reuses the same Customer on later calls, so one card pays across tenants", async () => {
    const { monetization, createCustomer } = fixture();
    const first = await monetization.ensureBillingCustomer("buyer");
    const second = await monetization.ensureBillingCustomer("buyer");
    expect(second).toEqual(first);
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  it("keeps different consumers on different Customers", async () => {
    const { monetization, createCustomer, customers } = fixture();
    await monetization.ensureBillingCustomer("buyer_a");
    await monetization.ensureBillingCustomer("buyer_b");
    expect(createCustomer).toHaveBeenCalledTimes(2);
    expect(customers.get("buyer_a")).toBe("cus_created");
    expect(customers.get("buyer_b")).toBe("cus_created");
  });

  it("feeds the Customer into checkout so a saved payment method is reused", async () => {
    const { monetization } = fixture();
    const customer = await monetization.ensureBillingCustomer("buyer");
    const result = await monetization.createCheckout({ ...CHECKOUT, customerId: customer.id });
    expect(result.purchase.customerId).toBe("cus_created");
  });
});

describe("Product", () => {
  // Compile-time assertion: a tenant catalog is a plain record of Products, and
  // the key is supplied by the record rather than stored in the value.
  const PRODUCTS: Record<string, Omit<Product, "key">> = {
    superchat_1: {
      purchaseKind: "super_chat", name: "Superchat",
      unitAmount: 100, currency: "usd", platformFeeAmount: 10,
    },
    founding_member: {
      purchaseKind: "founding_member", name: "Founding Member",
      unitAmount: 2900, currency: "usd", platformFeeAmount: 10,
    },
  };
  const catalog: BillingCatalog = {
    resolve: (key) => {
      const product = PRODUCTS[key];
      if (!product) throw new TypeError(`unknown product: ${key}`);
      return { key, ...product };
    },
  };

  it("resolves a declared product, echoing the key back", () => {
    expect(catalog.resolve("superchat_1")).toEqual({
      key: "superchat_1", purchaseKind: "super_chat", name: "Superchat",
      unitAmount: 100, currency: "usd", platformFeeAmount: 10,
    });
  });

  it("rejects an undeclared product instead of inventing one", () => {
    expect(() => catalog.resolve("free_coins")).toThrow(/unknown product/);
  });

  it("prices a purchase from the product, never from the buyer", async () => {
    const { monetization, purchases } = fixture({ catalog });
    await monetization.createCheckout({ ...CHECKOUT, productKey: "founding_member" });
    expect(purchases.get("purchase_one")).toMatchObject({
      productKey: "founding_member", kind: "founding_member",
      amount: 2900, currency: "usd", platformFeeAmount: 10,
    });
  });
});
