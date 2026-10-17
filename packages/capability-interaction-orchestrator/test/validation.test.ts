import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, openWindow, terms, windowInput } from "./database.js";
import type { CreateWindowInput, SubmitIntentInput } from "../src/index.js";

describe("input validation through the lifecycle interface", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  it.each([
    { worldId: "" },
    { worldId: 5 },
    { worldId: "x".repeat(1025) },
    { maxSelectedInputs: 0 },
    { maxSelectedInputs: 2147483648 },
    { maxSelectedInputs: 1.5 },
    { allowedInputKinds: [] },
    { allowedInputKinds: "vote" },
    { allowedInputKinds: ["vote", "vote"] },
    { allowedInputKinds: ["other"] },
    { arbitrationPolicy: "bad-name" },
    { contentRating: "other" },
    { billingPolicy: "other" },
    { opensAt: "invalid" },
    { closesAt: "invalid" },
    { opensAt: "2026-10-17T10:00:00Z", closesAt: "2026-10-17T09:00:00Z" },
    { arbitrationPolicyConfig: [] },
    { appMetadata: null as never, worldId: "" },
    { moderationPolicyVersion: "" },
    { rulesetVersion: "" },
    { billingPolicy: "prepaid_credits" },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, currency: "usd" },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, amountCents: -1 },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, sessionId: "" },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, date: "yesterday" },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, date: "2026-13-01" },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, date: "2026-02-30" },
    },
    {
      billingPolicy: "prepaid_credits",
      billingTerms: { ...terms, reservationTtlMs: 1 },
    },
    {
      billingPolicy: "pay_for_guaranteed_slot",
      billingTerms: terms,
      arbitrationPolicy: "plurality",
    },
  ])("rejects invalid window configuration %j", async (overrides) => {
    await expect(
      db.app.windows.createWindow(
        windowInput(overrides as Partial<CreateWindowInput>)
      )
    ).rejects.toThrow();
  });
  it("accepts explicit version/configuration terms and all input kinds", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: {
        ...terms,
        date: "2026-10-17",
        sessionId: "session",
        reservationTtlMs: 60000,
      },
      moderationPolicyVersion: "custom",
      rulesetVersion: "custom",
      arbitrationPolicyConfig: { nested: { b: 1, a: 2 } },
    });
    expect(w.billingTerms?.sessionId).toBe("session");
    const free = await openWindow(db.app, {
      maxSubmissionsPerUser: 10,
      allowedInputKinds: [
        "custom_prompt",
        "message",
        "world_action",
        "entity_mutation",
        "vote",
        "create_object",
        "create_branch",
      ],
    });
    for (const [kind, payload, targetEntityIds] of [
      ["custom_prompt", { prompt: "Hi" }, []],
      ["message", { message: "Hi" }, []],
      ["world_action", { action: "move" }, []],
      ["entity_mutation", { params: { x: 1 } }, ["object"]],
      ["vote", { targetId: "A", value: 1 }, []],
      ["vote", { option: "B" }, []],
      ["create_object", { object: { name: "ball" } }, []],
      ["create_branch", { name: "remix" }, []],
    ] as const)
      expect(
        (
          await db.app.submissions.submitIntent({
            windowId: free.id,
            actorId: "kinds",
            idempotencyKey: crypto.randomUUID(),
            kind,
            payload,
            targetEntityIds: [...targetEntityIds],
            baseCommitHash: free.baseCommitHash,
            appMetadata: { nested: { b: true, a: null }, array: [0, "text"] },
          })
        ).status
      ).toBe("eligible");
  });
  it.each([
    { kind: "invalid" },
    { payload: [] },
    { payload: null },
    { payload: { prompt: "" } },
    { kind: "message", payload: { message: "" } },
    { kind: "world_action", payload: { action: "" } },
    { kind: "entity_mutation", payload: { params: {} } },
    {
      kind: "entity_mutation",
      payload: { params: [] },
      targetEntityIds: ["a"],
    },
    { kind: "vote", payload: { option: "" } },
    { kind: "vote", payload: { option: "a", value: "one" } },
    { kind: "vote", payload: { option: "a", value: Infinity } },
    { kind: "create_object", payload: { object: [] } },
    { kind: "create_branch", payload: { name: "" } },
    { baseCommitHash: "" },
    { targetEntityIds: "a" },
    { targetEntityIds: ["a", "a"] },
    { targetEntityIds: Array.from({ length: 101 }, (_, i) => `${i}`) },
    { targetEntityIds: [""] },
    { actorId: "" },
    { appMetadata: [] },
    { payload: { prompt: "x".repeat(16001) } },
    { payload: { prompt: "Hi", bad: undefined } },
    { payload: { prompt: "Hi", bad: () => true } },
    { payload: { prompt: "Hi", bad: new Date() } },
    { payload: { prompt: "Hi", bad: NaN } },
    { payload: { prompt: "Hi", data: "x".repeat(65537) } },
  ])("rejects malformed intents %j", async (overrides) => {
    await expect(
      db.app.submissions.submitIntent({
        windowId: "unknown",
        actorId: "validation",
        idempotencyKey: "validation",
        kind: "custom_prompt",
        payload: { prompt: "Hello" },
        ...overrides,
      } as SubmitIntentInput)
    ).rejects.toThrow();
  });
  it("rejects cycles and excessive nesting before database admission", async () => {
    const cyclic: Record<string, unknown> = { prompt: "hi" };
    cyclic.self = cyclic;
    let nested: unknown = {};
    for (let i = 0; i < 34; i++) nested = { child: nested };
    for (const payload of [cyclic, { prompt: "Hi", nested }])
      await expect(
        db.app.submissions.submitIntent({
          windowId: "unknown",
          actorId: "validation",
          idempotencyKey: "validation",
          kind: "custom_prompt",
          payload,
        })
      ).rejects.toThrow();
  });
  it("enforces allowed kinds, current base, schedule and existence", async () => {
    const w = await openWindow(db.app);
    const base = {
      windowId: w.id,
      actorId: "validation",
      idempotencyKey: crypto.randomUUID(),
      kind: "custom_prompt" as const,
      payload: { prompt: "Hi" },
    };
    await expect(
      db.app.submissions.submitIntent({ ...base, windowId: "unknown" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      db.app.submissions.submitIntent({ ...base, baseCommitHash: "stale" })
    ).rejects.toMatchObject({ code: "STALE_BASE" });
    await expect(
      db.app.submissions.submitIntent({
        ...base,
        kind: "message",
        payload: { message: "Hi" },
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await db.pool.query(
      "UPDATE input_windows SET opens_at=now()+interval '1 hour' WHERE id=$1",
      [w.id]
    );
    await expect(db.app.submissions.submitIntent(base)).rejects.toMatchObject({
      code: "WINDOW_CLOSED",
    });
    await db.pool.query(
      "UPDATE input_windows SET opens_at=now()-interval '1 hour',closes_at=now()-interval '1 second' WHERE id=$1",
      [w.id]
    );
    await expect(db.app.submissions.submitIntent(base)).rejects.toMatchObject({
      code: "WINDOW_CLOSED",
    });
  });
  it("checks every idempotency dimension and canonicalizes JSON object keys", async () => {
    const w = await openWindow(db.app);
    const base = {
      windowId: w.id,
      actorId: "canonical",
      idempotencyKey: "canonical",
      kind: "custom_prompt" as const,
      payload: { prompt: "Hello", nested: { a: 1, b: 2 } },
      targetEntityIds: ["a"],
      appMetadata: { b: 2, a: 1 },
    };
    const original = await db.app.submissions.submitIntent(base);
    expect(
      (
        await db.app.submissions.submitIntent({
          ...base,
          payload: { nested: { b: 2, a: 1 }, prompt: "Hello" },
          appMetadata: { a: 1, b: 2 },
          baseCommitHash: w.baseCommitHash,
        })
      ).id
    ).toBe(original.id);
    for (const change of [
      { windowId: "different" },
      { kind: "message", payload: { message: "Hello" } },
      { targetEntityIds: ["b"] },
      { appMetadata: { a: 2 } },
      { baseCommitHash: "other" },
    ])
      await expect(
        db.app.submissions.submitIntent({
          ...base,
          ...change,
        } as SubmitIntentInput)
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});
