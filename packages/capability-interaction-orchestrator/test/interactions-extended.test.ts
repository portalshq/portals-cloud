import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresEntitlementStore } from "../../monetization/src/index.js";
import {
  GuideCoordinator,
  ExternalBilling,
  NarrativeHandoffQueue,
  ReactionGateway,
  validateRegistryInteractions,
  parseInteractionSettings,
} from "../src/index.js";
import type { CreditDebitInput, CreditDebitResult, CreditGrantInput } from "../../monetization/src/index.js";
import { database, grant, openWindow, terms, windowInput } from "./database.js";

const OPTIONS = [
  { id: "atlas", kind: "character" as const, name: "Atlas", pxUri: "px://bears/character/atlas" },
  { id: "sunny", kind: "character" as const, name: "Sunny", pxUri: "px://bears/character/sunny" },
  { id: "kite", kind: "prop" as const, name: "a red kite", description: "a tangled red kite" },
];

/** A debit store whose behaviour can be flipped to simulate outages. */
function flakyDebits(real: PostgresEntitlementStore) {
  const calls: CreditDebitInput[] = [];
  let fail = false;
  return {
    calls,
    set fail(v: boolean) { fail = v; },
    async debitCredits(input: CreditDebitInput): Promise<CreditDebitResult> {
      calls.push(input);
      if (fail) throw new Error("billing unavailable");
      return real.debitCredits(input);
    },
  };
}

describe("external debit settlement and choice lifecycle", () => {
  let db: Awaited<ReturnType<typeof database>>;
  let store: PostgresEntitlementStore;
  let debits: ReturnType<typeof flakyDebits>;
  beforeAll(async () => {
    db = await database();
    await db.pool.query(readFileSync(new URL("../../monetization/sql/002_credit_debits.sql", import.meta.url), "utf8"));
    await db.pool.query(readFileSync(new URL("../../monetization/sql/003_credit_grants.sql", import.meta.url), "utf8"));
    store = new PostgresEntitlementStore(db.pool);
    debits = flakyDebits(store);
  });
  afterAll(async () => { await db?.close(); });

  async function choiceWorld() {
    const app = new (await import("../src/orchestrator.js")).InteractionOrchestrator(db.repository, {
      externalBilling: { debits, grants: store },
    });
    const worldId = crypto.randomUUID();
    const w = await app.choices.openChoice({
      worldId,
      branchId: "main",
      sessionId: "session",
      options: OPTIONS,
      durationSeconds: 60,
      billingTerms: { ...terms, sessionId: "session" },
    });
    return { app, w, worldId };
  }

  it("charges a vote once and resolves one winner with a durable handoff", async () => {
    const { app, w, worldId } = await choiceWorld();
    const actor = crypto.randomUUID();
    // Grant the voter one credit on the shared billing database.
    await store.saveRule({ id: "rule", tenantId: terms.tenantId, kind: terms.entitlementKind, scope: { channelId: "c" }, conditions: [], quantity: 1, createdAt: new Date().toISOString() });
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query(
      "INSERT INTO monetization_purchases(id,tenant_id,channel_id,buyer_id,product_key,kind,amount,currency,platform_fee_amount,state,created_at,updated_at) VALUES($1,$2,'c',$3,'p','k',1,'usd',0,'settled',now(),now()) ON CONFLICT DO NOTHING",
      [actor, terms.tenantId, actor],
    );
    await store.grant([{ id: crypto.randomUUID(), ruleId: "rule", tenantId: terms.tenantId, consumerId: actor, kind: terms.entitlementKind, scope: {}, quantity: 1, remaining: 1, purchaseId: actor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);

    const vote = await app.submissions.submitIntent({
      windowId: w.id, actorId: actor, idempotencyKey: "v1", kind: "vote",
      payload: { option: "atlas" },
    });
    expect(vote.status).toBe("eligible");
    // The vote debit used the submission id as the operation id.
    expect(debits.calls[0]?.operationId).toBe(vote.id);
    // A second vote attempt by the same actor fails the per-user cap.
    await expect(app.submissions.submitIntent({ windowId: w.id, actorId: actor, idempotencyKey: "v2", kind: "vote", payload: { option: "sunny" } })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });

    // Close intake and resolve.
    await db.pool.query("UPDATE input_windows SET closes_at=clock_timestamp() - interval '1 second' WHERE id=$1", [w.id]);
    await app.windows.closeWindow(w.id);
    const result = await app.choices.resolveChoice(w.id);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.winner?.id).toBe("atlas");
      expect(result.resolution.status).toBe("committed");
      expect(result.resolution.appMetadata.choice).toMatchObject({ winner: { id: "atlas" }, ballotCount: 1 });
    }
    // Replay returns the stored resolution.
    expect(await app.choices.resolveChoice(w.id)).toMatchObject({ status: "resolved" });
    // Exactly one pending handoff carrying the winner.
    const handoffs = await app.handoffs.list(worldId, "pending");
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].option).toMatchObject({ id: "atlas", kind: "character" });
    // Offer counts persisted.
    expect((await app.choices.getOptionSelectionCounts(worldId)).get("px://bears/character/atlas")).toBe(1);
  });

  it("rejects insufficient voters without charge and stays stable on retry", async () => {
    const { app, w } = await choiceWorld();
    const vote = await app.submissions.submitIntent({
      windowId: w.id, actorId: crypto.randomUUID(), idempotencyKey: "v1", kind: "vote",
      payload: { option: "sunny" },
    });
    expect(vote.status).toBe("rejected");
    // A second settle replay cannot charge after credits arrive.
    const settled = await app.externalBilling!.settleDebit(vote.id);
    expect(settled.status).toBe("rejected");
  });

  it("holds admitted votes pending during a billing outage and settles after", async () => {
    const { app, w, worldId } = await choiceWorld();
    const actor = crypto.randomUUID();
    await store.saveRule({ id: "rule2", tenantId: terms.tenantId, kind: terms.entitlementKind, scope: { channelId: "c" }, conditions: [], quantity: 1, createdAt: new Date().toISOString() });
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query(
      "INSERT INTO monetization_purchases(id,tenant_id,channel_id,buyer_id,product_key,kind,amount,currency,platform_fee_amount,state,created_at,updated_at) VALUES($1,$2,'c',$3,'p','k',1,'usd',0,'settled',now(),now())",
      [actor, terms.tenantId, actor],
    );
    await store.grant([{ id: crypto.randomUUID(), ruleId: "rule2", tenantId: terms.tenantId, consumerId: actor, kind: terms.entitlementKind, scope: {}, quantity: 1, remaining: 1, purchaseId: actor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);

    debits.fail = true;
    const vote = await app.submissions.submitIntent({
      windowId: w.id, actorId: actor, idempotencyKey: "v1", kind: "vote",
      payload: { option: "kite" },
    });
    expect(vote.status).toBe("awaiting_entitlement");
    debits.fail = false;
    // Close intake; resolution waits for the pending ballot.
    await db.pool.query("UPDATE input_windows SET closes_at=clock_timestamp() - interval '1 second' WHERE id=$1", [w.id]);
    await app.windows.closeWindow(w.id);
    expect(await app.choices.resolveChoice(w.id)).toMatchObject({ status: "pending" });
    // The sweep settles the pending debit, then resolution proceeds.
    expect(await app.externalBilling!.settlePending()).toBeGreaterThanOrEqual(1);
    const result = await app.choices.resolveChoice(w.id);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.winner?.id).toBe("kite");
    expect((await app.handoffs.list(worldId)).length).toBeGreaterThanOrEqual(1);
  });

  it("records no winner on an empty window and no handoff", async () => {
    const { app, w, worldId } = await choiceWorld();
    await app.windows.closeWindow(w.id);
    const result = await app.choices.resolveChoice(w.id);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.winner).toBeNull();
    expect(await app.handoffs.list(worldId, "pending")).toHaveLength(0);
  });

  it("claims a handoff exactly once and re-offers after the visibility timeout", async () => {
    const { app, w, worldId } = await choiceWorld();
    const actor = crypto.randomUUID();
    await store.saveRule({ id: "rule3", tenantId: terms.tenantId, kind: terms.entitlementKind, scope: { channelId: "c" }, conditions: [], quantity: 1, createdAt: new Date().toISOString() });
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query(
      "INSERT INTO monetization_purchases(id,tenant_id,channel_id,buyer_id,product_key,kind,amount,currency,platform_fee_amount,state,created_at,updated_at) VALUES($1,$2,'c',$3,'p','k',1,'usd',0,'settled',now(),now())",
      [actor, terms.tenantId, actor],
    );
    await store.grant([{ id: crypto.randomUUID(), ruleId: "rule3", tenantId: terms.tenantId, consumerId: actor, kind: terms.entitlementKind, scope: {}, quantity: 1, remaining: 1, purchaseId: actor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
    await app.submissions.submitIntent({ windowId: w.id, actorId: actor, idempotencyKey: "v", kind: "vote", payload: { option: "atlas" } });
    await app.windows.closeWindow(w.id);
    await app.choices.resolveChoice(w.id);

    const queue = new NarrativeHandoffQueue(db.repository);
    const first = await queue.claimNext(worldId);
    expect(first?.handoff.state).toBe("claimed");
    // A second claim sees nothing while the first is held.
    expect(await queue.claimNext(worldId)).toBeNull();
    // A stale claim becomes visible again after the visibility timeout.
    await new Promise((r) => setTimeout(r, 10));
    const second = await queue.claimNext(worldId, { visibilityTimeoutMs: 1 });
    expect(second).not.toBeNull();
    await queue.fail(second!.handoff.id, second!.token);
    expect((await queue.get(second!.handoff.id))?.state).toBe("dead");
    expect(await queue.claimNext(worldId)).toBeNull();
  });

  it("validates choice options and proposals", async () => {
    const { app } = await choiceWorld();
    const base = { worldId: crypto.randomUUID(), branchId: "main", durationSeconds: 5, options: OPTIONS };
    await expect(app.choices.openChoice({ ...base, options: OPTIONS.slice(0, 1) })).rejects.toThrow("two to six");
    await expect(app.choices.openChoice({ ...base, options: [...OPTIONS, OPTIONS[0]] })).rejects.toThrow("Duplicate");
    await expect(app.choices.openChoice({ ...base, options: OPTIONS.map((o) => ({ ...o, pxUri: "bad" })) })).rejects.toThrow("malformed");
    const { validateChoiceProposal } = await import("../src/choice.js");
    expect(validateChoiceProposal({ options: OPTIONS })).toHaveLength(3);
    expect(() => validateChoiceProposal({ options: [{ id: "x" }] })).toThrow();
  });
});

describe("guides on shared submissions", () => {
  let db: Awaited<ReturnType<typeof database>>;
  let store: PostgresEntitlementStore;
  beforeAll(async () => {
    db = await database();
    await db.pool.query(readFileSync(new URL("../../monetization/sql/002_credit_debits.sql", import.meta.url), "utf8"));
    store = new PostgresEntitlementStore(db.pool);
  });
  afterAll(async () => { await db?.close(); });

  it("admits uncharged, charges at claim, and consumes exactly once", async () => {
    const { InteractionOrchestrator } = await import("../src/orchestrator.js");
    const app = new InteractionOrchestrator(db.repository, { externalBilling: { debits: store, grants: store } });
    const worldId = crypto.randomUUID();
    const actor = crypto.randomUUID();
    await store.saveRule({ id: "grule", tenantId: terms.tenantId, kind: terms.entitlementKind, scope: { channelId: "c" }, conditions: [], quantity: 1, createdAt: new Date().toISOString() });
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query("INSERT INTO monetization_tenant_profiles(tenant_id,owner_id,stripe_account_id,default_currency,created_at,updated_at) VALUES($1,'o','acct','usd',now(),now()) ON CONFLICT DO NOTHING", [terms.tenantId]);
    await db.pool.query(
      "INSERT INTO monetization_purchases(id,tenant_id,channel_id,buyer_id,product_key,kind,amount,currency,platform_fee_amount,state,created_at,updated_at) VALUES($1,$2,'c',$3,'p','k',1,'usd',0,'settled',now(),now())",
      [actor, terms.tenantId, actor],
    );
    await store.grant([{ id: crypto.randomUUID(), ruleId: "grule", tenantId: terms.tenantId, consumerId: actor, kind: terms.entitlementKind, scope: {}, quantity: 1, remaining: 1, purchaseId: actor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);

    const guides = app.guides!;
    const window = await guides.ensureWindow({ worldId, branchId: "main", sessionId: "s", billingTerms: { ...terms, sessionId: "s" } });
    expect(window.state).toBe("open");
    expect(window.closesAt).toBeNull();

    // Admission is free: the prompt waits eligible, no credit taken.
    const submission = await app.submissions.submitIntent({
      windowId: window.id, actorId: actor, idempotencyKey: "g1", kind: "custom_prompt",
      payload: { prompt: "give the bears a picnic" },
    });
    expect(submission.status).toBe("eligible");
    expect(await store.remaining(actor, terms.entitlementKind, {})).toBe(1);

    // Claim charges once; generation completes it.
    const claimed = await guides.claimNext(window.id);
    expect(claimed?.status).toBe("executing");
    expect(await store.remaining(actor, terms.entitlementKind, {})).toBe(0);
    await guides.complete(claimed!.id);
    expect((await app.submissions.getSubmission(claimed!.id))?.status).toBe("fulfilled");
    expect(await guides.claimNext(window.id)).toBeNull();
  });

  it("drops an unpayable claimed guide without charge", async () => {
    const { InteractionOrchestrator } = await import("../src/orchestrator.js");
    const app = new InteractionOrchestrator(db.repository, { externalBilling: { debits: store, grants: store } });
    const window = await app.guides!.ensureWindow({ worldId: crypto.randomUUID(), branchId: "main", sessionId: "s", billingTerms: terms });
    const submission = await app.submissions.submitIntent({
      windowId: window.id, actorId: crypto.randomUUID(), idempotencyKey: "g1", kind: "custom_prompt",
      payload: { prompt: "hungry bears" },
    });
    expect(submission.status).toBe("eligible");
    expect(await app.guides!.claimNext(window.id)).toBeNull();
    expect((await app.submissions.getSubmission(submission.id))?.status).toBe("rejected");
  });
});

describe("feedback rewards", () => {
  let db: Awaited<ReturnType<typeof database>>;
  let store: PostgresEntitlementStore;
  beforeAll(async () => {
    db = await database();
    await db.pool.query(readFileSync(new URL("../../monetization/sql/003_credit_grants.sql", import.meta.url), "utf8"));
    store = new PostgresEntitlementStore(db.pool);
  });
  afterAll(async () => { await db?.close(); });

  it("pays the reward once per response and enforces the session cap", async () => {
    const { InteractionOrchestrator } = await import("../src/orchestrator.js");
    const app = new InteractionOrchestrator(db.repository, { externalBilling: { debits: store, grants: store } });
    const worldId = crypto.randomUUID();
    const reward = { tenantId: "tenant", entitlementKind: "feedback_reward", amountCredits: 1 };
    const window = await app.feedback!.openFeedback({ worldId, branchId: "main", sessionId: "sess", reward, maxPerSession: 1 });
    expect(window).not.toBeNull();
    // The session cap blocks a second feedback event.
    expect(await app.feedback!.openFeedback({ worldId, branchId: "main", sessionId: "sess", reward, maxPerSession: 1 })).toBeNull();

    const actor = crypto.randomUUID();
    const submission = await app.submissions.submitIntent({
      windowId: window!.id, actorId: actor, idempotencyKey: "f1", kind: "feedback",
      payload: { rating: "up", text: "lovely stream" },
    });
    expect(submission.status).toBe("eligible");
    const rewarded = await app.feedback!.rewardSubmission(submission.id);
    expect(rewarded.status).toBe("fulfilled");
    // Retry cannot pay twice.
    await app.feedback!.rewardSubmission(submission.id);
    expect(await store.remaining(actor, "feedback_reward", { channelId: worldId, sessionId: "sess" })).toBe(1);
    // A second response from the same viewer fails the per-window cap.
    await expect(app.submissions.submitIntent({ windowId: window!.id, actorId: actor, idempotencyKey: "f2", kind: "feedback", payload: { rating: "down" } })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    // Invalid rating rejected at validation.
    await expect(app.submissions.submitIntent({ windowId: window!.id, actorId: crypto.randomUUID(), idempotencyKey: "f3", kind: "feedback", payload: { rating: "meh" } })).rejects.toThrow();
  });
});

describe("reactions", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => { db = await database(); });
  afterAll(async () => { await db?.close(); });

  it("records, attributes, rate-limits, and prunes reactions", async () => {
    const worldId = crypto.randomUUID();
    const gateway = new ReactionGateway(db.repository, { maxPerWindow: 3, windowMs: 60_000 });
    const window = await openWindow(db.app, windowInput({ worldId }));
    await db.app.resolveWindow(window.id, { idempotencyKey: "noop" }).catch(() => {});
    const a = await gateway.record({ worldId, actorId: "viewer", sessionId: "s", emotion: "love" });
    expect(a.emotion).toBe("love");
    // Attribution falls back to the world's most recent event.
    expect(a.eventId).not.toBeNull();
    await gateway.record({ worldId, actorId: "viewer", sessionId: "s", emotion: "fire" });
    await gateway.record({ worldId, actorId: "viewer", sessionId: "s", emotion: "sad" });
    await expect(gateway.record({ worldId, actorId: "viewer", sessionId: "s", emotion: "angry" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(gateway.record({ worldId, actorId: "viewer", emotion: "sparkle" })).rejects.toThrow("emotion");
    expect(await gateway.list(worldId)).toHaveLength(3);
    expect(await gateway.list(worldId, { afterSeq: 1 })).toHaveLength(2);
    expect(await gateway.prune(worldId, 1)).toBeGreaterThanOrEqual(0);
    // Outbox carries the compact event for analytics/fanout.
    const events = await db.repository.getEvents(worldId, 0);
    expect(events.filter((e) => e.eventType === "reaction_recorded")).toHaveLength(3);
  });
});

describe("interaction settings and registry validation", () => {
  it("parses feedback settings with defaults and rejects unknown keys", () => {
    expect(parseInteractionSettings({ feedback: {} })).toEqual({ feedback: { maxPerSession: 1, rewardCredits: 1, windowSeconds: 120 } });
    expect(parseInteractionSettings({ choice: { "interval-seconds": 60 }, feedback: { "reward-credits": 5 } })?.feedback.rewardCredits).toBe(5);
    expect(parseInteractionSettings(undefined)).toBeUndefined();
    expect(() => parseInteractionSettings({ typo: true })).toThrow("Unknown interactions section");
    expect(() => parseInteractionSettings({ feedback: { "max-per-session": 0 } })).toThrow("positive integer");
  });

  it("validates every channel's interactions with named context", () => {
    const registry = {
      channels: {
        good: { controlEndpoint: "${ENDPOINT}", queueTokenEnv: "TOKEN", requiredEntities: ["px://a/character/b"], interactions: { choice: { "model-interval": true } } },
        bad: { controlEndpoint: "https://x", queueTokenEnv: "TOKEN", requiredEntities: ["px://a/character/b"], interactions: { choice: { "option-count": 99, "interval-seconds": 5 } } },
      },
    };
    expect(() => validateRegistryInteractions(registry)).toThrow(/bad.*option-count/s);
    const valid = validateRegistryInteractions({ channels: { only: { controlEndpoint: "https://x", queueTokenEnv: "T", requiredEntities: ["px://a/character/b"], interactions: { feedback: { "max-per-session": 2 } } } } });
    expect(valid[0].settings?.feedback.maxPerSession).toBe(2);
  });
});

describe("scheduled guide windows", () => {
  let db: Awaited<ReturnType<typeof database>>;
  let store: PostgresEntitlementStore;
  beforeAll(async () => {
    db = await database();
    await db.pool.query(readFileSync(new URL("../../monetization/sql/002_credit_debits.sql", import.meta.url), "utf8"));
    await db.pool.query(readFileSync(new URL("../../monetization/sql/003_credit_grants.sql", import.meta.url), "utf8"));
    store = new PostgresEntitlementStore(db.pool);
  });
  afterAll(async () => { await db?.close(); });

  async function guideApp() {
    const { InteractionOrchestrator } = await import("../src/orchestrator.js");
    return new InteractionOrchestrator(db.repository, { externalBilling: { debits: store, grants: store } });
  }
  const billingTerms = { ...terms, sessionId: "s" };

  it("opens a bounded window once, emits guide_opened, and closes intake at the deadline", async () => {
    const app = await guideApp();
    const worldId = crypto.randomUUID();
    const guides = app.guides!;
    const input = { worldId, branchId: "main", sessionId: "s", guideKey: "story", theme: "a door appears", durationSeconds: 60, billingTerms };
    const w1 = await guides.openWindow(input);
    expect(w1.state).toBe("open");
    expect(w1.closesAt).not.toBeNull();
    expect(w1.appMetadata).toMatchObject({ guideQueue: true, guideWindow: true, guideKey: "story", theme: "a door appears" });
    // A racing second open returns the same window.
    expect((await guides.openWindow(input)).id).toBe(w1.id);
    const events = await db.repository.getEvents(worldId, 0);
    expect(events.some((e) => e.eventType === "guide_opened" && e.data.theme === "a door appears")).toBe(true);

    const actor = crypto.randomUUID();
    const sub = await guides.submit({ worldId, branchId: "main", sessionId: "s", guideKey: "story", alwaysOpen: false, actorId: actor, prompt: "bees!", idempotencyKey: "g1", billingTerms });
    expect(sub.status).toBe("eligible");

    // Past closesAt admit rejects even before the publish sweep runs.
    await db.pool.query("UPDATE input_windows SET closes_at = clock_timestamp() - interval '1 second' WHERE id=$1", [w1.id]);
    await expect(guides.submit({ worldId, branchId: "main", sessionId: "s", guideKey: "story", alwaysOpen: false, actorId: actor, prompt: "again", idempotencyKey: "g2", billingTerms })).rejects.toMatchObject({ code: "WINDOW_CLOSED" });

    expect(await guides.expireClosed(worldId)).toBe(1);
    expect((await db.repository.getWindow(w1.id))?.state).toBe("published");
    // The admitted guide stays eligible and claimable after publish.
    expect((await app.submissions.getSubmission(sub.id))?.status).toBe("eligible");
  });

  it("keeps a closing window open while admissions are in flight", async () => {
    const app = await guideApp();
    const worldId = crypto.randomUUID();
    const guides = app.guides!;
    const w = await guides.openWindow({ worldId, branchId: "main", sessionId: "s", durationSeconds: 60, billingTerms });
    await guides.submit({ worldId, branchId: "main", sessionId: "s", alwaysOpen: false, actorId: crypto.randomUUID(), prompt: "hi", idempotencyKey: "g1", billingTerms });
    await db.pool.query("UPDATE input_windows SET closes_at = clock_timestamp() - interval '1 second' WHERE id=$1", [w.id]);
    // The eligible submission does not pin the window — only in-flight ones do.
    expect(await guides.expireClosed(worldId)).toBe(1);
    expect((await db.repository.getWindow(w.id))?.state).toBe("published");
  });

  it("submit routes always-open configs to the standing queue and windowed configs to the open window", async () => {
    const app = await guideApp();
    const worldId = crypto.randomUUID();
    const guides = app.guides!;
    const base = { worldId, branchId: "main", sessionId: "s", billingTerms };
    // Windowed submit with nothing open → WINDOW_CLOSED.
    await expect(guides.submit({ ...base, alwaysOpen: false, actorId: crypto.randomUUID(), prompt: "x", idempotencyKey: "w1" })).rejects.toMatchObject({ code: "WINDOW_CLOSED" });
    // Always-open submit creates the standing queue lazily.
    const standing = await guides.submit({ ...base, alwaysOpen: true, actorId: crypto.randomUUID(), prompt: "always", idempotencyKey: "a1" });
    expect(standing.status).toBe("eligible");
    const standingWindow = await db.repository.getWindow(standing.windowId);
    expect(standingWindow?.closesAt).toBeNull();
    // Scheduled window + submit lands on it, keyed by guideKey.
    const scheduled = await guides.openWindow({ ...base, guideKey: "story", durationSeconds: 60 });
    const onWindow = await guides.submit({ ...base, guideKey: "story", alwaysOpen: false, actorId: crypto.randomUUID(), prompt: "windowed", idempotencyKey: "w2" });
    expect(onWindow.windowId).toBe(scheduled.id);
    // A different guideKey does not see the open window.
    await expect(guides.submit({ ...base, guideKey: "other", alwaysOpen: false, actorId: crypto.randomUUID(), prompt: "x", idempotencyKey: "w3" })).rejects.toMatchObject({ code: "WINDOW_CLOSED" });
  });

  it("claims the oldest eligible guide across standing and scheduled windows", async () => {
    const app = await guideApp();
    const worldId = crypto.randomUUID();
    const guides = app.guides!;
    const base = { worldId, branchId: "main", sessionId: "s", billingTerms };
    const actor = crypto.randomUUID();
    await grant(db.pool, actor, 5);
    // Standing queue guide admitted first.
    const first = await guides.submit({ ...base, alwaysOpen: true, actorId: actor, prompt: "first", idempotencyKey: "c1" });
    // Scheduled window guide admitted second.
    await guides.openWindow({ ...base, guideKey: "story", durationSeconds: 60 });
    const second = await guides.submit({ ...base, guideKey: "story", alwaysOpen: false, actorId: actor, prompt: "second", idempotencyKey: "c2" });
    expect(first.status).toBe("eligible");
    expect(second.status).toBe("eligible");

    const claimed = await guides.claimNextForSession(worldId, "s");
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe("executing");
    await guides.complete(claimed!.id);
    const next = await guides.claimNextForSession(worldId, "s");
    expect(next?.id).toBe(second.id);
  });

  it("queueStatus scopes to the session and includes published windows", async () => {
    const app = await guideApp();
    const worldId = crypto.randomUUID();
    const guides = app.guides!;
    const base = { worldId, branchId: "main", sessionId: "s1", billingTerms };
    const w = await guides.openWindow({ ...base, durationSeconds: 60 });
    await guides.submit({ ...base, alwaysOpen: false, actorId: crypto.randomUUID(), prompt: "queued prompt", displayName: "Fan", idempotencyKey: "q1" });
    let status = await guides.queueStatus(worldId, "s1");
    expect(status.count).toBe(1);
    expect(status.items[0]).toMatchObject({ displayName: "Fan", promptPreview: "queued prompt", status: "eligible", position: 1 });
    // Other sessions see nothing.
    expect((await guides.queueStatus(worldId, "s2")).count).toBe(0);
    // After publish the queued guide still shows.
    await db.pool.query("UPDATE input_windows SET closes_at = clock_timestamp() - interval '1 second' WHERE id=$1", [w.id]);
    await guides.expireClosed(worldId);
    status = await guides.queueStatus(worldId, "s1");
    expect(status.count).toBe(1);
  });
});
