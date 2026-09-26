import { describe, expect, it } from "vitest";

import {
  InMemoryEntitlementStore,
  grantsForSettlement,
  applySettlementEvent,
  readSettlementFacts,
  resolveScope,
  SELF_BIND,
  ruleMatches,
  validateRule,
  type EntitlementRule,
} from "../src/index.js";
import type { PurchaseSettledFacts } from "../src/index.js";

const FACTS: PurchaseSettledFacts = {
  purchaseId: "purchase_one", tenantId: "tenant", channelId: "channel_a", sessionId: "session_7",
  buyerId: "consumer", kind: "super_chat", productKey: "superchat_1",
  amount: 100, currency: "usd", settledAt: "2026-03-04T12:00:00.000Z",
};

const ids = { next: () => "grant_1" };

function rule(overrides: Partial<EntitlementRule> = {}): EntitlementRule {
  return {
    id: "rule_1", tenantId: "tenant", kind: "prompt_influence",
    scope: { channelId: "channel_a" }, conditions: [], quantity: 1,
    createdAt: "2026-01-01T00:00:00.000Z", ...overrides,
  };
}

describe("ruleMatches", () => {
  it("grants when the scope names only dimensions the purchase satisfies", () => {
    expect(ruleMatches(rule({ scope: { channelId: "channel_a" } }), FACTS)).toBe(true);
  });

  it("denies when a scope dimension does not match", () => {
    expect(ruleMatches(rule({ scope: { channelId: "channel_b" } }), FACTS)).toBe(false);
  });

  it("denies a session-scoped rule when the purchase had no session", () => {
    expect(ruleMatches(rule({ scope: { channelId: "channel_a", sessionId: "session_7" } }), { ...FACTS, sessionId: null })).toBe(false);
  });

  it("denies a session-scoped rule for a different session", () => {
    expect(ruleMatches(rule({ scope: { channelId: "channel_a", sessionId: "session_9" } }), FACTS)).toBe(false);
  });

  it("matches a date-scoped rule only on that day", () => {
    const onDay = rule({ scope: { channelId: "channel_a", date: "2026-03-04" } });
    expect(ruleMatches(onDay, FACTS)).toBe(true);
    expect(ruleMatches(onDay, { ...FACTS, settledAt: "2026-03-05T12:00:00.000Z" })).toBe(false);
  });

  it("never crosses tenants", () => {
    expect(ruleMatches(rule(), { ...FACTS, tenantId: "other_tenant" })).toBe(false);
  });

  it("requires every condition to match", () => {
    const constrained = rule({
      conditions: [{ fact: "purchaseKind", equals: "super_chat" }, { fact: "amount", gte: 500 }],
    });
    expect(ruleMatches(constrained, FACTS)).toBe(false);
    expect(ruleMatches(constrained, { ...FACTS, amount: 500 })).toBe(true);
  });

  it("matches a product-key condition", () => {
    const constrained = rule({ conditions: [{ fact: "productKey", equals: "founding_member" }] });
    expect(ruleMatches(constrained, FACTS)).toBe(false);
    expect(ruleMatches(constrained, { ...FACTS, productKey: "founding_member" })).toBe(true);
  });
});

describe("validateRule", () => {
  it("rejects a rule that names no scope dimension", () => {
    expect(() => validateRule(rule({ scope: {} }))).toThrow("at least one dimension");
  });

  it("rejects a non-positive quantity", () => {
    expect(() => validateRule(rule({ quantity: 0 }))).toThrow("positive integer");
  });

  it("rejects an unparseable date", () => {
    expect(() => validateRule(rule({ scope: { channelId: "channel_a", date: "not-a-date" } }))).toThrow("invalid date");
  });
});

describe("grantsForSettlement", () => {
  it("creates one grant per matching rule, addressed to the paying consumer", () => {
    const grants = grantsForSettlement(
      [rule(), rule({ id: "rule_2", kind: "highlight" })],
      FACTS, { next: (() => { let n = 0; return () => `grant_${++n}`; })() },
      "2026-03-04T12:00:00.000Z",
    );
    expect(grants.map((grant) => grant.kind)).toEqual(["prompt_influence", "highlight"]);
    expect(grants.every((grant) => grant.consumerId === "consumer")).toBe(true);
    expect(grants.every((grant) => grant.purchaseId === "purchase_one")).toBe(true);
  });

  it("carries the rule quantity onto the grant balance", () => {
    const [grant] = grantsForSettlement([rule({ quantity: 3 })], FACTS, ids, "2026-03-04T12:00:00.000Z");
    expect(grant).toMatchObject({ quantity: 3, remaining: 3 });
  });

  it("derives an expiry from a date-scoped rule", () => {
    const [grant] = grantsForSettlement(
      [rule({ scope: { channelId: "channel_a", date: "2026-03-04" } })],
      FACTS, ids, "2026-03-04T12:00:00.000Z",
    );
    expect(grant.expiresAt).toBe("2026-03-04T23:59:59.999Z");
  });

  it("leaves an unbounded grant without an expiry", () => {
    const [grant] = grantsForSettlement([rule()], FACTS, ids, "2026-03-04T12:00:00.000Z");
    expect(grant.expiresAt).toBeUndefined();
  });
});

describe("InMemoryEntitlementStore", () => {
  async function seeded(overrides: Partial<EntitlementRule> = {}) {
    const store = new InMemoryEntitlementStore();
    await store.saveRule(rule(overrides));
    await store.grant(grantsForSettlement([rule(overrides)], FACTS, { next: () => "grant_1" }, FACTS.settledAt));
    return store;
  }

  it("spends a channel-scoped balance inside that channel", async () => {
    const store = await seeded();
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_7" }, 1)).resolves.toBe(true);
    await expect(store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).resolves.toBe(0);
  });

  it("does not spend a channel-scoped balance in another channel", async () => {
    const store = await seeded();
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_b" }, 1)).resolves.toBe(false);
  });

  it("keeps a session-scoped balance out of a sibling session", async () => {
    const store = await seeded({ scope: { channelId: "channel_a", sessionId: "session_7" } });
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_8" }, 1)).resolves.toBe(false);
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_7" }, 1)).resolves.toBe(true);
  });

  it("keeps a standing grant available when nothing consumes it", async () => {
    const store = await seeded({ kind: "founding_member", quantity: 1 });
    await expect(store.remaining("consumer", "founding_member", { channelId: "channel_a" })).resolves.toBe(1);
  });

  it("refuses to spend more than the balance holds", async () => {
    const store = await seeded();
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a" }, 2)).resolves.toBe(false);
  });

  it("does not double-grant when a settlement event is redelivered", async () => {
    const store = await seeded({ quantity: 1 });
    const [grant] = grantsForSettlement([rule({ quantity: 1 })], FACTS, { next: () => "grant_1" }, FACTS.settledAt);
    await store.grant([grant]);
    await expect(store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).resolves.toBe(1);
  });

  it("tops a balance up again when the same consumer buys twice", async () => {
    const store = await seeded();
    const second = grantsForSettlement([rule()], { ...FACTS, purchaseId: "purchase_two" }, { next: () => "grant_2" }, FACTS.settledAt);
    await store.grant(second);
    await expect(store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).resolves.toBe(2);
  });

  it("revokes everything a refunded purchase created", async () => {
    const store = await seeded();
    await store.revokeForPurchase("purchase_one");
    await expect(store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).resolves.toBe(0);
  });

  it("keeps a consumer's balance private to them", async () => {
    const store = await seeded();
    await expect(store.remaining("someone_else", "prompt_influence", { channelId: "channel_a" })).resolves.toBe(0);
  });

  it("rejects a non-positive consume count", async () => {
    const store = await seeded();
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a" }, 0)).rejects.toThrow("positive integer");
  });
});

describe("applySettlementEvent", () => {
  const PAYLOAD = {
    purchaseId: "purchase_one", tenantId: "tenant", channelId: "channel_a", sessionId: "session_7",
    buyerId: "consumer", kind: "super_chat", productKey: "superchat_1",
    amount: 100, currency: "usd", settledAt: "2026-03-04T12:00:00.000Z",
  };
  const ids = { next: () => "grant_1" };
  const now = "2026-03-04T12:00:00.000Z";

  async function seeded() {
    const store = new InMemoryEntitlementStore();
    await store.saveRule(rule());
    return store;
  }

  it("grants on settlement, which is what wires the outbox to entitlements", async () => {
    const store = await seeded();
    const result = await applySettlementEvent(store, { type: "billing.purchase_settled", payload: PAYLOAD }, ids, now);
    expect(result).toEqual({ granted: 1, revoked: 0 });
    expect(await store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(1);
  });

  it("is idempotent across a redelivered settlement", async () => {
    const store = await seeded();
    await applySettlementEvent(store, { type: "billing.purchase_settled", payload: PAYLOAD }, ids, now);
    await applySettlementEvent(store, { type: "billing.purchase_settled", payload: PAYLOAD }, ids, now);
    expect(await store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(1);
  });

  it("revokes on refund and on dispute", async () => {
    for (const type of ["billing.purchase_refunded", "billing.purchase_disputed"]) {
      const store = await seeded();
      await applySettlementEvent(store, { type: "billing.purchase_settled", payload: PAYLOAD }, ids, now);
      const result = await applySettlementEvent(store, { type, payload: PAYLOAD }, ids, now);
      expect(result).toEqual({ granted: 0, revoked: 1 });
      expect(await store.remaining("consumer", "prompt_influence", { channelId: "channel_a" })).toBe(0);
    }
  });

  it("ignores unrelated event types without granting", async () => {
    const store = await seeded();
    expect(await applySettlementEvent(store, { type: "billing.something_else", payload: PAYLOAD }, ids, now))
      .toEqual({ granted: 0, revoked: 0 });
  });

  it("rejects a payload that predates entitlement facts instead of matching on undefined", () => {
    const { tenantId: _t, ...withoutTenant } = PAYLOAD;
    expect(() => readSettlementFacts(withoutTenant as never)).toThrow("missing tenantId");
  });

  it("rejects a payload with a non-integer amount", () => {
    expect(() => readSettlementFacts({ ...PAYLOAD, amount: 1.5 })).toThrow("invalid amount");
  });

  it("normalizes a null session rather than treating it as a match", () => {
    expect(readSettlementFacts({ ...PAYLOAD, sessionId: null }).sessionId).toBeNull();
  });
});

describe("self-binding scope", () => {
  const selfRule = (): EntitlementRule => rule({
    scope: { channelId: "channel_a", sessionId: SELF_BIND },
  });

  it("matches any session when the rule binds to the purchase's own", () => {
    expect(ruleMatches(selfRule(), FACTS)).toBe(true);
    expect(ruleMatches(selfRule(), { ...FACTS, sessionId: "session_other" })).toBe(true);
  });

  it("does not match a purchase that had no session", () => {
    expect(ruleMatches(selfRule(), { ...FACTS, sessionId: null })).toBe(false);
  });

  it("binds the grant to the session the purchase actually happened in", () => {
    const [grant] = grantsForSettlement(
      [selfRule()], { ...FACTS, sessionId: "session_42" }, ids, FACTS.settledAt,
    );
    expect(grant.scope).toEqual({ channelId: "channel_a", sessionId: "session_42" });
  });

  it("binds the grant's channel too, so a channel-bound rule is still exact", () => {
    const [grant] = grantsForSettlement(
      [rule({ scope: { channelId: SELF_BIND, sessionId: SELF_BIND } })], FACTS, ids, FACTS.settledAt,
    );
    expect(grant.scope).toEqual({ channelId: "channel_a", sessionId: "session_7" });
  });

  it("yields an unscoped grant when a binding has no fact, not an unsatisfiable one", () => {
    const [grant] = grantsForSettlement(
      [selfRule()], { ...FACTS, sessionId: null }, ids, FACTS.settledAt,
    );
    expect(grant).toBeUndefined();
  });

  it("resolves a self-binding channel from the purchase", () => {
    expect(resolveScope({ channelId: SELF_BIND }, { ...FACTS, channelId: "channel_z" }).channelId).toBe("channel_z");
    expect(resolveScope({ channelId: "channel_a" }, FACTS).channelId).toBe("channel_a");
  });

  it("keeps a session-bound grant unusable in a different session", async () => {
    const store = new InMemoryEntitlementStore();
    await store.saveRule(selfRule());
    await store.grant(grantsForSettlement([selfRule()], { ...FACTS, sessionId: "session_9" }, ids, FACTS.settledAt));
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_8" }, 1)).resolves.toBe(false);
    await expect(store.consume("consumer", "prompt_influence", { channelId: "channel_a", sessionId: "session_9" }, 1)).resolves.toBe(true);
  });
});
