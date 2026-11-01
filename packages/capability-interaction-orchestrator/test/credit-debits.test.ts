import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresEntitlementStore, InMemoryEntitlementStore } from "../../monetization/src/index.js";
import { database, grant } from "./database.js";

describe("retry-safe credit debits", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
    await db.pool.query(readFileSync(new URL("../../monetization/sql/002_credit_debits.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => { await db?.close(); });
  it("atomically debits once across concurrent requests and preserves allocations", async () => {
    const actor = crypto.randomUUID();
    const first = await grant(db.pool, actor, 1, {channelId: "channel"});
    const second = await grant(db.pool, actor, 2, {channelId: "channel"});
    await grant(db.pool, actor, 9, {}, "other");
    const store = new PostgresEntitlementStore(db.pool);
    const input = { operationId: crypto.randomUUID(), tenantId: "tenant", consumerId: actor, kind: "story_guide", site: {channelId: "channel"}, amount: 3 };
    const [a, b] = await Promise.all([store.debitCredits(input), store.debitCredits(input)]);
    expect(a).toEqual(b);
    expect(a.outcome).toBe("debited");
    expect(a.allocations.map(x => x.grantId).sort()).toEqual([first, second].sort());
    expect(await store.debitCredits(input)).toEqual(a);
    await expect(store.debitCredits({...input, amount: 2})).rejects.toThrow("idempotency conflict");
    const rows = await db.pool.query("SELECT remaining FROM monetization_entitlements WHERE consumer_id=$1 AND tenant_id='other'", [actor]);
    expect(Number(rows.rows[0].remaining)).toBe(9);
  });
  it("records insufficient outcomes without charging, including on retry", async () => {
    const actor = crypto.randomUUID();
    await grant(db.pool, actor, 1, {channelId: "different"});
    const store = new PostgresEntitlementStore(db.pool);
    const input = { operationId: crypto.randomUUID(), tenantId: "tenant", consumerId: actor, kind: "story_guide", site: {channelId: "channel"}, amount: 1 };
    expect((await store.debitCredits(input)).outcome).toBe("insufficient");
    await grant(db.pool, actor, 1, {channelId: "channel"});
    expect((await store.debitCredits(input)).outcome).toBe("insufficient");
    expect((await store.debitCredits({...input, operationId: crypto.randomUUID()})).outcome).toBe("debited");
  });
  it("supports retry-safe dry-run debits", async () => {
    const store = new InMemoryEntitlementStore();
    await store.grant([{id: "grant", ruleId: "rule", tenantId: "tenant", consumerId: "user", kind: "story_guide", scope: {}, quantity: 2, remaining: 2, purchaseId: "purchase", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"}]);
    const input = { operationId: "op", tenantId: "tenant", consumerId: "user", kind: "story_guide", site: {}, amount: 1 };
    expect(await store.debitCredits(input)).toEqual(await store.debitCredits(input));
    expect(await store.remaining("user", "story_guide", {})).toBe(1);
    await expect(store.debitCredits({...input, tenantId: "other"})).rejects.toThrow("idempotency conflict");
  });
});
