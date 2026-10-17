import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ArbitrationEngine,
  FIFOPolicy,
  InteractionOrchestrator,
  ModerationGateway,
  WindowManager,
} from "../src/index.js";
import {
  balance,
  database,
  grant,
  openWindow,
  submit,
  terms,
  windowInput,
} from "./database.js";

describe("durable interaction lifecycle", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  it("applies upgrades repeatedly without resetting sequence counters", async () => {
    await db.pool.query(
      readFileSync(
        new URL("../sql/002_durable_lifecycle.sql", import.meta.url),
        "utf8"
      )
    );
  });
  it("runs a free queue through submission, selection, execution and commit", async () => {
    const w = await openWindow(db.app);
    const s = await submit(db.app, w);
    expect(s.status).toBe("eligible");
    expect(s.moderationDecisionId).toBeTruthy();
    expect(s.entitlementId).toBeTruthy();
    const resolution = await db.app.resolveWindow(w.id, {
      idempotencyKey: "run",
    });
    expect(resolution.resolutionSequence).toBe(1);
    expect(resolution.selectedSubmissionIds).toEqual([s.id]);
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "run" })
    ).resolves.toMatchObject({ id: resolution.id });
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "other" })
    ).rejects.toMatchObject({ code: "RESOLUTION_IN_PROGRESS" });
    await db.app.prepareExecution(resolution.id);
    await db.app.prepareExecution(resolution.id);
    const committed = await db.app.commitResolution(
      resolution.id,
      { text: "A new day" },
      "commit-1"
    );
    expect(committed.status).toBe("committed");
    expect((await db.app.submissions.getSubmission(s.id))?.status).toBe(
      "fulfilled"
    );
    expect((await db.app.windows.getWindow(w.id))?.baseCommitHash).toBe(
      "commit-1"
    );
    await expect(
      db.app.commitResolution(resolution.id, { text: "A new day" }, "commit-1")
    ).resolves.toMatchObject({ status: "committed" });
    await expect(
      db.app.commitResolution(resolution.id, { text: "Different" }, "commit-1")
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      db.app.failResolution(resolution.id, "failed")
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    const events = await db.repository.getEvents(w.worldId);
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1));
    expect(events.at(-1)?.eventType).toBe("resolution_committed");
  });
  it("serializes duplicate admission, detects conflicting retries and preserves the original record", async () => {
    const w = await openWindow(db.app);
    const input = {
      windowId: w.id,
      actorId: "retry",
      idempotencyKey: "retry",
      kind: "custom_prompt" as const,
      payload: { prompt: "Hello" },
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => db.app.submissions.submitIntent(input))
    );
    expect(new Set(results.map((s) => s.id)).size).toBe(1);
    await db.app.windows.closeWindow(w.id);
    await expect(db.app.submissions.submitIntent(input)).resolves.toMatchObject(
      { id: results[0].id }
    );
    await expect(
      db.app.submissions.submitIntent({
        ...input,
        payload: { prompt: "Changed" },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await db.app.submissions.listSubmissions(w.id)).toHaveLength(1);
  });
  it("prevents quota races and allocates distinct admission sequences", async () => {
    const w = await openWindow(db.app);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => submit(db.app, w, "quota"))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const others = await Promise.all(
      Array.from({ length: 5 }, () => submit(db.app, w))
    );
    expect(new Set(others.map((s) => s.admissionSequence)).size).toBe(5);
  });
  it("refunds cancelled prepaid submissions exactly once and allows a new queue submission", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    await grant(db.pool, "cancel", 2, { channelId: w.worldId });
    const s = await submit(db.app, w, "cancel");
    expect(await balance(db.pool, "cancel")).toBe(1);
    await Promise.all([
      db.app.submissions.cancelSubmission(s.id),
      db.app.submissions.cancelSubmission(s.id),
    ]);
    expect(await balance(db.pool, "cancel")).toBe(2);
    expect((await db.app.submissions.getSubmission(s.id))?.status).toBe(
      "cancelled"
    );
    expect((await submit(db.app, w, "cancel")).status).toBe("eligible");
  });
  it("records insufficient balance without admitting an unpaid input", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    const s = await submit(db.app, w, "empty");
    expect(s.status).toBe("rejected");
    expect(
      await db.app.submissions.listSubmissions(w.id, "eligible")
    ).toHaveLength(0);
  });
  it("captures selected holds and releases losing holds after finite-window arbitration", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
      maxSelectedInputs: 1,
      closesAt: new Date(Date.now() + 60000).toISOString(),
    });
    await grant(db.pool, "selected", 2);
    await grant(db.pool, "loser", 2);
    const first = await submit(db.app, w, "selected");
    const second = await submit(db.app, w, "loser");
    expect((await db.app.billing.getReservation(first.id))?.state).toBe(
      "reserved"
    );
    await db.app.windows.closeWindow(w.id);
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "select" });
    expect(await balance(db.pool, "loser")).toBe(2);
    expect((await db.app.submissions.getSubmission(second.id))?.status).toBe(
      "not_selected"
    );
    await db.app.billing.capture(r);
    await db.app.billing.capture(r);
    expect(await balance(db.pool, "selected")).toBe(1);
    await db.app.prepareExecution(r.id);
    await db.app.commitResolution(r.id, "A happy result", "next");
    expect((await db.app.windows.getWindow(w.id))?.state).toBe("published");
  });
  it("defers paid queue overflow for the next generation", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
      maxSelectedInputs: 1,
    });
    await grant(db.pool, "queue-a");
    await grant(db.pool, "queue-b");
    const a = await submit(db.app, w, "queue-a");
    const b = await submit(db.app, w, "queue-b");
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "one" });
    expect(r.selectedSubmissionIds).toEqual([a.id]);
    expect(r.rejectedSubmissionIds).toEqual([]);
    expect((await db.app.submissions.getSubmission(b.id))?.status).toBe(
      "eligible"
    );
    await db.app.prepareExecution(r.id);
    await db.app.commitResolution(r.id, "Chapter", "chapter");
    const next = await db.app.resolveWindow(w.id, { idempotencyKey: "two" });
    expect(next.selectedSubmissionIds).toEqual([b.id]);
    expect(next.resolutionSequence).toBe(2);
  });
  it("captures pay-to-publish only after moderated output, refunding a rejected preview", async () => {
    for (const [actor, output, status] of [
      ["preview-ok", "Sunshine", "committed"],
      ["preview-bad", "fuck", "failed"],
    ] as const) {
      const w = await openWindow(db.app, {
        billingPolicy: "pay_to_publish",
        billingTerms: terms,
      });
      await grant(db.pool, actor, 1);
      const s = await submit(db.app, w, actor);
      const r = await db.app.resolveWindow(w.id, { idempotencyKey: "publish" });
      await expect(db.app.billing.capture(r)).rejects.toMatchObject({
        code: "OUTPUT_REQUIRED",
      });
      await db.app.prepareExecution(r.id);
      expect((await db.app.billing.getReservation(s.id))?.state).toBe(
        "reserved"
      );
      expect(
        (await db.app.commitResolution(r.id, output, "published")).status
      ).toBe(status);
      expect(await balance(db.pool, actor)).toBe(
        status === "committed" ? 0 : 1
      );
    }
  });
  it("guarantees paid slots by refusing admissions beyond capacity", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "pay_for_guaranteed_slot",
      billingTerms: terms,
      maxSelectedInputs: 1,
    });
    await grant(db.pool, "guarantee");
    await submit(db.app, w, "guarantee");
    await expect(submit(db.app, w, "second")).rejects.toMatchObject({
      code: "CAPACITY_EXCEEDED",
    });
  });
  it("does not restore revoked or expired entitlement grants", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    const id = await grant(db.pool, "revoked", 1);
    const s = await submit(db.app, w, "revoked");
    await db.pool.query("DELETE FROM monetization_entitlements WHERE id=$1", [
      id,
    ]);
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "revoked" });
    await expect(db.app.prepareExecution(r.id)).rejects.toMatchObject({
      code: "ENTITLEMENT_REVOKED",
    });
    await db.app.failResolution(r.id, "revoked");
    await db.app.failResolution(r.id, "revoked");
    expect(await balance(db.pool, "revoked")).toBe(0);
  });
  it("supports durable host review without treating review or transform as allow", async () => {
    const gateway = new ModerationGateway();
    gateway.registerCustomValidator({
      name: "review",
      validate: async (s) => ({
        id: crypto.randomUUID(),
        submissionId: s.id,
        status: "review",
        reasons: ["Needs host"],
        policyVersion: "1",
        reviewedBy: "rules",
        createdAt: new Date().toISOString(),
      }),
    });
    const app = new InteractionOrchestrator(db.repository, {
      moderation: gateway,
    });
    const w = await openWindow(app, {
      closesAt: new Date(Date.now() + 60000).toISOString(),
    });
    const s = await submit(app, w);
    expect(s.status).toBe("moderating");
    await app.windows.closeWindow(w.id);
    await expect(
      app.resolveWindow(w.id, { idempotencyKey: "pending" })
    ).rejects.toMatchObject({ code: "QUALIFICATION_PENDING" });
    expect(
      (await app.submissions.reviewSubmission(s.id, "allow", ["Host approved"]))
        .status
    ).toBe("eligible");
    await expect(
      app.submissions.reviewSubmission(s.id, "allow", ["Again"])
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("resumes admission after a moderation outage", async () => {
    let down = true;
    const normal = new ModerationGateway();
    const app = new InteractionOrchestrator(db.repository, {
      moderation: {
        moderateInput: async (...args) => {
          if (down) throw new Error("offline");
          return normal.moderateInput(...args);
        },
        moderateOutput: (...args) => normal.moderateOutput(...args),
      },
    });
    const w = await openWindow(app);
    const input = {
      windowId: w.id,
      actorId: "outage",
      idempotencyKey: "outage",
      kind: "custom_prompt" as const,
      payload: { prompt: "hello" },
    };
    await expect(app.submissions.submitIntent(input)).rejects.toThrow(
      "offline"
    );
    down = false;
    expect((await app.submissions.submitIntent(input)).status).toBe("eligible");
  });
  it("expires unselected holds and cancels a whole window atomically", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
    });
    await grant(db.pool, "expire", 2);
    const s = await submit(db.app, w, "expire");
    await db.pool.query(
      "UPDATE interaction_reservations SET expires_at=now()-interval '1 second' WHERE submission_id=$1",
      [s.id]
    );
    expect(await db.app.billing.expireReservations()).toBe(1);
    expect(await balance(db.pool, "expire")).toBe(2);
    const second = await submit(db.app, w, "expire");
    await db.app.cancelWindow(w.id);
    await db.app.cancelWindow(w.id);
    expect((await db.app.submissions.getSubmission(second.id))?.status).toBe(
      "cancelled"
    );
    expect(await balance(db.pool, "expire")).toBe(2);
  });
  it("closes scheduled windows once, never closes always-open queues, and waits for shutdown", async () => {
    const w = await openWindow(db.app, {
      closesAt: new Date(Date.now() + 60000).toISOString(),
    });
    const queue = await openWindow(db.app);
    await db.pool.query(
      "UPDATE input_windows SET closes_at=now()-interval '1 second' WHERE id=$1",
      [w.id]
    );
    const errors: unknown[] = [];
    const manager = new WindowManager(db.repository, (e) => errors.push(e));
    manager.startWindowCloser(5);
    manager.startWindowCloser(5);
    await vi.waitFor(
      async () =>
        expect((await manager.getWindow(w.id))?.state).toBe("qualifying"),
      { timeout: 2000 }
    );
    await manager.stopWindowCloser();
    expect((await manager.getWindow(queue.id))?.state).toBe("open");
    expect(errors).toEqual([]);
  });
  it("enforces schedule, revision, transition and conflict invariants", async () => {
    const w = await db.app.windows.createWindow(
      windowInput({ opensAt: new Date(Date.now() + 60000).toISOString() })
    );
    await expect(db.app.windows.openWindow(w.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(
      db.repository.updateWindowState(w.id, "cancelled", 99)
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      db.repository.updateWindowState(w.id, "published")
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    const scheduled = await db.app.windows.createWindow(
      windowInput({ worldId: w.worldId })
    );
    await db.app.windows.openWindow(scheduled.id);
    await db.pool.query(
      "UPDATE input_windows SET opens_at=now()-interval '1 second' WHERE id=$1",
      [w.id]
    );
    await expect(db.app.windows.openWindow(w.id)).rejects.toThrow();
    await db.app.cancelWindow(w.id);
    await expect(db.app.windows.openWindow(w.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
  it("resolves eligible queue inputs while newer inputs await moderation", async () => {
    const w = await openWindow(db.app);
    const eligible = await submit(db.app, w);
    const pending = await db.repository.admit({
      windowId: w.id,
      actorId: "pending",
      idempotencyKey: "pending",
      kind: "custom_prompt",
      payload: { prompt: "Hi" },
    });
    const result = await db.app.resolveWindow(w.id, {
      idempotencyKey: "ready",
    });
    expect(result.selectedSubmissionIds).toEqual([eligible.id]);
    expect((await db.app.submissions.getSubmission(pending.id))?.status).toBe(
      "received"
    );
  });
  it("persists and executes a registered custom arbitration policy", async () => {
    const arbitration = new ArbitrationEngine();
    arbitration.registerPolicy("custom_fifo", {
      name: "custom_fifo",
      resolve: (w, s) => ({
        ...new FIFOPolicy().resolve(w, s),
        arbitrationPolicy: "custom_fifo",
      }),
    });
    const app = new InteractionOrchestrator(db.repository, { arbitration });
    const w = await openWindow(app, { arbitrationPolicy: "custom_fifo" });
    await submit(app, w);
    const result = await app.resolveWindow(w.id, { idempotencyKey: "custom" });
    expect(
      (await db.repository.getResolution(result.id))?.arbitrationPolicy
    ).toBe("custom_fifo");
    await app.prepareExecution(result.id);
    expect(
      (await app.commitResolution(result.id, "Hello", "custom-commit")).status
    ).toBe("committed");
  });
});
