import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresEntitlementStore, InMemoryEntitlementStore } from "../../monetization/src/index.js";
import { database } from "./database.js";

describe("retry-safe credit grants", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
    for (const file of ["../../monetization/sql/002_credit_debits.sql", "../../monetization/sql/003_credit_grants.sql"]) {
      await db.pool.query(readFileSync(new URL(file, import.meta.url), "utf8"));
    }
  });
  afterAll(async () => { await db?.close(); });

  it("atomically grants once across concurrent calls and replays identically", async () => {
    const consumer = crypto.randomUUID();
    const store = new PostgresEntitlementStore(db.pool);
    const input = { operationId: crypto.randomUUID(), tenantId: "tenant", consumerId: consumer, kind: "feedback_reward", site: { channelId: "channel", sessionId: "session" }, amount: 1 };
    const [a, b] = await Promise.all([store.grantCredits(input), store.grantCredits(input)]);
    expect(a).toEqual(b);
    expect(a.outcome).toBe("granted");
    expect(await store.grantCredits(input)).toEqual(a);
    await expect(store.grantCredits({ ...input, amount: 2 })).rejects.toThrow("idempotency conflict");
    // The reward is spendable where it was issued.
    expect(await store.remaining(consumer, "feedback_reward", { channelId: "channel", sessionId: "session" })).toBe(1);
    // …and debitable through the same debit path other credits use.
    expect((await store.debitCredits({ operationId: crypto.randomUUID(), tenantId: "tenant", consumerId: consumer, kind: "feedback_reward", site: { channelId: "channel", sessionId: "session" }, amount: 1 })).outcome).toBe("debited");
    expect(await store.remaining(consumer, "feedback_reward", { channelId: "channel", sessionId: "session" })).toBe(0);
  });

  it("scopes the reward grant to the site it was issued at", async () => {
    const consumer = crypto.randomUUID();
    const store = new PostgresEntitlementStore(db.pool);
    await store.grantCredits({ operationId: crypto.randomUUID(), tenantId: "tenant", consumerId: consumer, kind: "feedback_reward", site: { channelId: "channel", sessionId: "one" }, amount: 1 });
    expect(await store.remaining(consumer, "feedback_reward", { channelId: "channel", sessionId: "one" })).toBe(1);
    expect(await store.remaining(consumer, "feedback_reward", { channelId: "channel", sessionId: "two" })).toBe(0);
    expect(await store.remaining(consumer, "feedback_reward", { channelId: "other" })).toBe(0);
  });

  it("supports retry-safe dry-run grants", async () => {
    const store = new InMemoryEntitlementStore();
    const input = { operationId: "op", tenantId: "tenant", consumerId: "user", kind: "feedback_reward", site: { channelId: "channel" }, amount: 1 };
    expect(await store.grantCredits(input)).toEqual(await store.grantCredits(input));
    expect(await store.remaining("user", "feedback_reward", { channelId: "channel" })).toBe(1);
    await expect(store.grantCredits({ ...input, tenantId: "other" })).rejects.toThrow("idempotency conflict");
    expect((await store.debitCredits({ ...input, operationId: "debit", amount: 1 })).outcome).toBe("debited");
  });
});
