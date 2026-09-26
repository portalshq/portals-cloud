import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  InMemoryEntitlementStore,
  Monetization,
  MonetizationDispatcher,
  applySettlementEvent,
  ruleMatches,
  validateRule,
  type BillingOutboxEvent,
  type BillingOutboxEventType,
  type BillingStore,
  type EntitlementRule,
} from "../src/index.js";

const NOW = "2026-03-04T12:00:00.000Z";

const RULE: EntitlementRule = {
  id: "rule_1", tenantId: "tenant", kind: "prompt_influence",
  scope: { channelId: "channel_a" }, conditions: [], quantity: 1, createdAt: NOW,
};

function settledEvent(overrides: Partial<Record<string, unknown>> = {}): BillingOutboxEvent {
  return {
    id: "out_1", type: "billing.purchase_settled", aggregateId: "purchase_one",
    payload: {
      purchaseId: "purchase_one", tenantId: "tenant", channelId: "channel_a",
      sessionId: "session_7", buyerId: "consumer", kind: "super_chat",
      productKey: "superchat_1", amount: 100, currency: "usd", settledAt: NOW,
      ...overrides,
    },
    createdAt: NOW,
  };
}

function queue(events: BillingOutboxEvent[]) {
  let pending = [...events];
  let delivered = false;
  const store = {
    claimOutbox: async () => (delivered ? [] : (delivered = true, pending)),
    completeOutbox: async () => {},
    failOutbox: async () => {},
  } as unknown as BillingStore;
  return store;
}

async function harness(events = [settledEvent()], options: Record<string, unknown> = {}) {
  const entitlements = new InMemoryEntitlementStore();
  await entitlements.saveRule(RULE);
  const onEvent = vi.fn();
  const dispatcher = new MonetizationDispatcher({
    store: queue(events), entitlements, ids: { next: () => "grant_1" },
    onEvent, now: () => new Date(NOW), ...options,
  });
  return { dispatcher, entitlements, onEvent };
}

describe("MonetizationDispatcher", () => {
  it("grants entitlements with no developer callback at all", async () => {
    const { dispatcher, entitlements } = await harness([settledEvent()], { onEvent: undefined });
    const result = await dispatcher.drainOnce();
    expect(result).toMatchObject({ delivered: 1, failed: 0, granted: 1, revoked: 0 });
    expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(1);
  });

  it("grants before the developer callback runs, so ordering is deterministic", async () => {
    const order: string[] = [];
    const entitlements = new InMemoryEntitlementStore();
    await entitlements.saveRule(RULE);
    const dispatcher = new MonetizationDispatcher({
      store: queue([settledEvent()]), entitlements, ids: { next: () => "grant_1" },
      onEvent: async () => {
        order.push(`remaining:${await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })}`);
      },
      now: () => new Date(NOW),
    });
    await dispatcher.drainOnce();
    expect(order).toEqual(["remaining:1"]);
  });

  it("hands the developer the event and what entitlements did", async () => {
    const { dispatcher, onEvent } = await harness();
    await dispatcher.drainOnce();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "billing.purchase_settled" }),
      expect.objectContaining({ granted: 1, revoked: 0, withoutSession: false }),
    );
  });

  it("revokes on refund and on dispute", async () => {
    for (const type of ["billing.purchase_refunded", "billing.purchase_disputed"] as const) {
      const event = { ...settledEvent(), type: type as BillingOutboxEventType };
      const entitlements = new InMemoryEntitlementStore();
      await entitlements.saveRule(RULE);
      await entitlements.grant([{
        id: "grant_1", ruleId: RULE.id, tenantId: "tenant", consumerId: "consumer",
        kind: RULE.kind, scope: RULE.scope, quantity: 1, remaining: 1,
        purchaseId: "purchase_one", createdAt: NOW, updatedAt: NOW,
      }]);
      const dispatcher = new MonetizationDispatcher({
        store: queue([event]), entitlements, ids: { next: () => "grant_2" },
        now: () => new Date(NOW),
      });
      const result = await dispatcher.drainOnce();
      expect(result).toMatchObject({ granted: 0, revoked: 1 });
      expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(0);
    }
  });

  it("flags a settlement that arrived with no session so it is visible", async () => {
    const logged: string[] = [];
    const { dispatcher, entitlements } = await harness(
      [settledEvent({ sessionId: null })],
      { logger: (message: string) => { logged.push(message); } },
    );
    const result = await dispatcher.drainOnce();
    expect(result.withoutSession).toBe(1);
    expect(logged.some((line) => line.includes("without a sessionId"))).toBe(true);
    // It still grants: a session-less purchase can match channel-scoped rules.
    expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(1);
  });

  it("fails delivery when the payload cannot be evaluated, rather than skipping it", async () => {
    const entitlements = new InMemoryEntitlementStore();
    await entitlements.saveRule(RULE);
    const dispatcher = new MonetizationDispatcher({
      store: queue([settledEvent({ tenantId: undefined })]), entitlements,
      ids: { next: () => "grant_1" }, now: () => new Date(NOW),
    });
    const result = await dispatcher.drainOnce();
    // Failed, so the event is retried and an operator can be alerted.
    expect(result).toMatchObject({ delivered: 0, failed: 1 });
  });

  it("leaves unrelated event types alone", async () => {
    const event = { ...settledEvent(), type: "billing.something_else" as BillingOutboxEventType };
    const { dispatcher, entitlements, onEvent } = await harness([event]);
    const result = await dispatcher.drainOnce();
    expect(result).toMatchObject({ delivered: 1, failed: 0, granted: 0, revoked: 0 });
    expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(0);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("reports stale before it has ever run, and after it stops", async () => {
    let clock = Date.parse(NOW);
    const entitlements = new InMemoryEntitlementStore();
    const dispatcher = new MonetizationDispatcher({
      store: queue([]), entitlements, ids: { next: () => "g" },
      now: () => new Date(clock),
    });
    expect(dispatcher.isStale()).toBe(true);
    expect(dispatcher.lastDrainAt()).toBeUndefined();
    await dispatcher.drainOnce();
    expect(dispatcher.isStale()).toBe(false);
    expect(dispatcher.lastDrainAt()).toBe(new Date(NOW).toISOString());
    clock += 11 * 60_000;
    expect(dispatcher.isStale()).toBe(true);
  });

  it("reports per-drain counters, not a running total", async () => {
    const entitlements = new InMemoryEntitlementStore();
    await entitlements.saveRule(RULE);
    const store = {
      claimOutbox: (() => {
        let pass = 0;
        return async () => (pass++ === 0
          ? [settledEvent({ purchaseId: "purchase_one" })]
          : [settledEvent({ purchaseId: "purchase_two" })]);
      })(),
      completeOutbox: async () => {},
      failOutbox: async () => {},
    } as unknown as BillingStore;
    const dispatcher = new MonetizationDispatcher({
      store, entitlements, ids: { next: (() => { let n = 0; return () => `grant_${++n}`; })() },
      now: () => new Date(NOW),
    });
    expect((await dispatcher.drainOnce()).granted).toBe(1);
    expect((await dispatcher.drainOnce()).granted).toBe(1);
  });
});

describe("Monetization end to end", () => {
  it("a settled purchase grants an entitlement with no wiring beyond construction", async () => {
    const purchase = {
      id: "purchase_one", tenantId: "tenant", channelId: "channel_a", sessionId: "session_7",
      buyerId: "consumer", productKey: "super", kind: "super_chat", amount: 1000,
      currency: "usd", platformFeeAmount: 100, state: "checkout_created" as const, refundedAmount: 0,
      stripeCheckoutSessionId: "cs_1",
      createdAt: NOW, updatedAt: NOW,
    };
    const events: BillingOutboxEvent[] = [];
    const purchases = new Map([[purchase.id, purchase]]);
    const store = {
      getTenantProfile: async () => ({ tenantId: "tenant", ownerId: "owner", stripeAccountId: "acct_tenant", transfersStatus: "active", defaultCurrency: "usd", createdAt: NOW, updatedAt: NOW }),
      findTenantProfileByAccount: async () => undefined,
      saveTenantProfile: async () => {},
      createPurchase: async (p: typeof purchase) => { purchases.set(p.id, p); return p; },
      getPurchase: async (id: string) => purchases.get(id),
      findPurchaseByStripeReference: async () => purchase,
      processStripeEvent: async (_event: Stripe.Event, apply: (tx: { getPurchase: (id: string) => Promise<typeof purchase>; findPurchaseByStripeReference: () => Promise<typeof purchase>; savePurchase: (p: typeof purchase) => Promise<void>; saveTenantProfile: () => Promise<void>; appendLedger: () => Promise<void>; appendOutbox: (e: BillingOutboxEvent) => Promise<void> }) => Promise<void>) => {
        await apply({
          getPurchase: async (id: string) => purchases.get(id),
          findPurchaseByStripeReference: async () => purchase,
          savePurchase: async (p: typeof purchase) => { purchases.set(p.id, p); },
          saveTenantProfile: async () => {},
          appendLedger: async () => {},
          appendOutbox: async (e: BillingOutboxEvent) => { events.push(e); },
        });
        return "processed";
      },
      claimOutbox: async () => [],
      completeOutbox: async () => {},
      failOutbox: async () => {},
    } as unknown as BillingStore;

    const webhook = { id: "evt_1", type: "checkout.session.completed", created: 1, data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "purchase_one", metadata: { purchaseId: "purchase_one" }, payment_intent: "pi_one" } } } as unknown as Stripe.Event;
    // The PaymentIntent has not been recorded on the purchase yet, so the
    // settlement resolves it from the webhook payload, as it does in production.
    const monetization = new Monetization({
      stripe: {
        checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
        paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_one", latest_charge: { id: "ch_one", amount_captured: 1000, transfer: "tr_one", balance_transaction: { fee: 25, net: 875 } } }) },
        webhooks: { constructEvent: vi.fn(() => webhook) },
      } as unknown as Stripe,
      store, ids: { next: () => "id_1" },
      catalog: { resolve: () => ({ key: "super", purchaseKind: "super_chat", name: "Super Chat", unitAmount: 1000, currency: "USD", platformFeeAmount: 100 }) },
    });
    await monetization.handleWebhook("body", "sig", "secret");

    const entitlements = new InMemoryEntitlementStore();
    await entitlements.saveRule({ ...RULE, scope: { channelId: "channel_a", sessionId: "session_7" } });
    const draining = new MonetizationDispatcher({
      store: {
        ...store,
        claimOutbox: (() => { let pass = 0; return async () => (pass++ === 0 ? events : []); })(),
      } as BillingStore,
      entitlements, ids: { next: () => "grant_1" }, now: () => new Date(NOW),
    });

    const result = await draining.drainOnce();
    expect(result).toMatchObject({ delivered: 1, granted: 1, withoutSession: 0 });
    // Session-scoped rule matched, because the purchase carried sessionId.
    expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_7" })).toBe(1);
  });
});

describe("MonetizationDispatcher retry bounds", () => {
  /** A pending event that always fails to apply, so the retry path is exercised. */
  function poisonStore() {
    let pending: BillingOutboxEvent | undefined = { ...settledEvent(), attempts: 0 };
    const parked: BillingOutboxEvent[] = [];
    const store = {
      claimOutbox: async () => {
        if (!pending || pending.deadAt) return [];
        pending = { ...pending, attempts: pending.attempts + 1 };
        return [pending];
      },
      completeOutbox: async () => {},
      failOutbox: async () => {},
      markOutboxDead: async (id: string, error: string) => {
        if (!pending) return;
        parked.push({ ...pending, id, lastError: error, deadAt: NOW });
        pending = undefined;
      },
      listDeadOutbox: async () => parked.slice(),
      requeueDeadOutbox: async (limit: number) => {
        const take = parked.splice(0, limit);
        for (const event of take) pending = { ...event, attempts: 0, deadAt: undefined, lastError: undefined };
        return take.length;
      },
    } as unknown as BillingStore;
    return { store, parked };
  }

  const broken = {
    getPurchase: async () => undefined,
    findPurchaseByStripeReference: async () => undefined,
    saveRule: async () => {},
    listRules: async () => [],
    grant: async () => { throw new Error("dependency down"); },
    consume: async () => false,
    remaining: async () => 0,
    revokeForPurchase: async () => {},
  } as never;

  it("stops retrying an event that cannot be applied", async () => {
    const { store, parked } = poisonStore();
    const dispatcher = new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" },
      maxAttempts: 3, now: () => new Date(NOW),
    });
    const results = [];
    for (let i = 0; i < 10; i += 1) results.push(await dispatcher.drainOnce());
    expect(results.filter((r) => r.exhausted > 0)).toHaveLength(1);
    expect(parked).toHaveLength(1);
  });

  it("makes exactly the budgeted number of attempts, then parks", async () => {
    const { store } = poisonStore();
    const dispatcher = new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" },
      maxAttempts: 3, now: () => new Date(NOW),
    });
    const results = [];
    for (let i = 0; i < 20; i += 1) results.push(await dispatcher.drainOnce());
    // 3 real attempts, then the event is parked on the 4th claim.
    expect(results.reduce((n, r) => n + r.failed, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.exhausted, 0)).toBe(1);
  });

  it("keeps retrying bounded however long it is left running", async () => {
    const { store } = poisonStore();
    const dispatcher = new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" },
      maxAttempts: 2, now: () => new Date(NOW),
    });
    for (let i = 0; i < 200; i += 1) await dispatcher.drainOnce();
    expect(await dispatcher.listParked()).toHaveLength(1);
  });

  it("retains the parked event with its payload and reason, so nothing is lost", async () => {
    const { store } = poisonStore();
    const dispatcher = new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" },
      maxAttempts: 1, now: () => new Date(NOW),
    });
    for (let i = 0; i < 6; i += 1) await dispatcher.drainOnce();
    const [event] = await dispatcher.listParked();
    expect(event?.payload).toMatchObject({ purchaseId: "purchase_one", tenantId: "tenant" });
    expect(event?.lastError).toContain("maxAttempts");
  });

  it("replays a parked event once the cause is fixed", async () => {
    const { store } = poisonStore();
    const entitlements = new InMemoryEntitlementStore();
    await entitlements.saveRule(RULE);
    const dispatcher = new MonetizationDispatcher({
      store, entitlements, ids: { next: () => "grant_1" },
      maxAttempts: 1, now: () => new Date(NOW),
    });
    for (let i = 0; i < 6; i += 1) await dispatcher.drainOnce();
    expect(await dispatcher.listParked()).toHaveLength(1);

    // The dependency is fixed; the operator replays rather than losing the grant.
    expect(await dispatcher.requeueParked()).toBe(1);
    expect(await dispatcher.listParked()).toHaveLength(0);
    const after = await dispatcher.drainOnce();
    expect(after.granted).toBe(1);
    expect(await entitlements.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(1);
  });

  it("defaults to a bounded budget rather than unlimited retries", async () => {
    const { store } = poisonStore();
    const dispatcher = new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" }, now: () => new Date(NOW),
    });
    for (let i = 0; i < 40; i += 1) await dispatcher.drainOnce();
    expect(await dispatcher.listParked()).toHaveLength(1);
  });

  it("rejects a non-positive attempt budget", () => {
    const { store } = poisonStore();
    expect(() => new MonetizationDispatcher({
      store, entitlements: broken, ids: { next: () => "g" }, maxAttempts: 0,
    })).toThrow("positive integer");
  });
});
