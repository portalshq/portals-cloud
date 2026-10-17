import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresEntitlementStore } from "../../monetization/src/postgres-store.js";
import {
  balance,
  database,
  grant,
  openWindow,
  submit,
  terms,
} from "./database.js";

describe("transactional concurrency and rollback", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  it("allows only one competing resolution and never selects a submission twice", async () => {
    const w = await openWindow(db.app);
    const s = await submit(db.app, w);
    const contenders = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        db.app.resolveWindow(w.id, { idempotencyKey: `run-${i}` })
      )
    );
    expect(contenders.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = contenders.find((r) => r.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("No winner");
    expect(winner.value.selectedSubmissionIds).toEqual([s.id]);
    const prepared = await Promise.all(
      Array.from({ length: 4 }, () => db.app.prepareExecution(winner.value.id))
    );
    expect(prepared.every((r) => r.status === "executing")).toBe(true);
    const commits = await Promise.all(
      Array.from({ length: 4 }, () =>
        db.app.commitResolution(winner.value.id, "Story", "commit")
      )
    );
    expect(commits.every((r) => r.status === "committed")).toBe(true);
    const count = (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM moderation_decisions WHERE submission_id=$1 AND phase='output'",
        [s.id]
      )
    ).rows[0].n;
    expect(count).toBe(1);
  });
  it("shares credit grants with monetization consumption without deadlocks or overspend", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: { ...terms, amountCredits: 3 },
    });
    await grant(db.pool, "mixed", 2);
    await grant(db.pool, "mixed", 3);
    await grant(db.pool, "mixed", 4);
    const s = await submit(db.app, w, "mixed");
    const store = new PostgresEntitlementStore(db.pool);
    await Promise.all([
      db.app.submissions.cancelSubmission(s.id),
      store.consume("mixed", "story_guide", { channelId: w.worldId }, 2),
    ]);
    expect(await balance(db.pool, "mixed")).toBe(7);
  });
  it("orders grant and world-event locks consistently across windows of the same world", async () => {
    const a = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
      conflictKey: "a",
    });
    const b = await openWindow(db.app, {
      worldId: a.worldId,
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
      conflictKey: "b",
      maxSubmissionsPerUser: 10,
    });
    await grant(db.pool, "same-world", 10);
    await submit(db.app, a, "same-world");
    const r = await db.app.resolveWindow(a.id, {
      idempotencyKey: "lock-order",
    });
    await Promise.all([
      db.app.prepareExecution(r.id),
      ...Array.from({ length: 5 }, () => submit(db.app, b, "same-world")),
    ]);
    expect(await balance(db.pool, "same-world")).toBe(4);
  });
  it("rolls back event sequence allocation when the outbox insert fails", async () => {
    const world = crypto.randomUUID();
    const before = await db.repository.eventHead(world);
    await expect(
      db.repository.transaction(async (r) => {
        await r.publishEvent({
          worldId: world,
          eventType: "test",
          data: {},
          occurredAt: new Date().toISOString(),
        });
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
    expect(await db.repository.eventHead(world)).toBe(before);
    expect(await db.repository.getEvents(world)).toEqual([]);
  });
  it("serializes cancellation against selection, preserving one valid outcome", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    await grant(db.pool, "race", 1);
    const s = await submit(db.app, w, "race");
    await Promise.allSettled([
      db.app.submissions.cancelSubmission(s.id),
      db.app.resolveWindow(w.id, { idempotencyKey: "race" }),
    ]);
    const current = await db.app.submissions.getSubmission(s.id);
    expect(["cancelled", "selected"]).toContain(current?.status);
    expect(await balance(db.pool, "race")).toBe(
      current?.status === "cancelled" ? 1 : 0
    );
  });
  it("locks all allocations before multi-actor capture across worlds", async () => {
    const a = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
    });
    const b = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
    });
    await grant(db.pool, "order-a", 4);
    await grant(db.pool, "order-b", 4);
    await submit(db.app, a, "order-a");
    await submit(db.app, a, "order-b");
    await submit(db.app, b, "order-b");
    await submit(db.app, b, "order-a");
    const ar = await db.app.resolveWindow(a.id, { idempotencyKey: "a" });
    const br = await db.app.resolveWindow(b.id, { idempotencyKey: "b" });
    await Promise.all([
      db.app.prepareExecution(ar.id),
      db.app.prepareExecution(br.id),
    ]);
    await Promise.all([
      db.app.failResolution(ar.id, "failed"),
      db.app.failResolution(br.id, "failed"),
    ]);
    expect(await balance(db.pool, "order-a")).toBe(4);
    expect(await balance(db.pool, "order-b")).toBe(4);
  });
  it("preserves PostgreSQL microsecond oldest-first ordering after acquiring ID-ordered locks", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    for (const actor of ["micro-direct", "micro-orchestrated"]) {
      const ids = [
        await grant(db.pool, actor, 1),
        await grant(db.pool, actor, 1),
      ].sort();
      await db.pool.query(
        "UPDATE monetization_entitlements SET created_at='2026-01-01T00:00:00.000002Z' WHERE id=$1",
        [ids[0]]
      );
      await db.pool.query(
        "UPDATE monetization_entitlements SET created_at='2026-01-01T00:00:00.000001Z' WHERE id=$1",
        [ids[1]]
      );
      if (actor === "micro-direct")
        expect(
          await new PostgresEntitlementStore(db.pool).consume(
            actor,
            "story_guide",
            { channelId: w.worldId },
            1
          )
        ).toBe(true);
      else expect((await submit(db.app, w, actor)).status).toBe("eligible");
      expect(
        (
          await db.pool.query(
            "SELECT remaining FROM monetization_entitlements WHERE id=$1",
            [ids[1]]
          )
        ).rows[0].remaining
      ).toBe(0);
      expect(
        (
          await db.pool.query(
            "SELECT remaining FROM monetization_entitlements WHERE id=$1",
            [ids[0]]
          )
        ).rows[0].remaining
      ).toBe(1);
    }
  });
});
