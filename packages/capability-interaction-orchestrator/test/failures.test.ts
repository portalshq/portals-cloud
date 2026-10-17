import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  InteractionOrchestrator,
  ModerationGateway,
  WindowManager,
} from "../src/index.js";
import {
  database,
  grant,
  openWindow,
  submit,
  terms,
  windowInput,
} from "./database.js";

describe("failure and recovery paths", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  it("requires finite windows to close and enforces host resolution idempotency", async () => {
    const w = await openWindow(db.app, {
      arbitrationPolicy: "host_selection",
      closesAt: new Date(Date.now() + 60000).toISOString(),
    });
    const s = await submit(db.app, w);
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "host" })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await db.app.windows.closeWindow(w.id);
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "host" })
    ).rejects.toMatchObject({ code: "HOST_SELECTION_REQUIRED" });
    const r = await db.app.resolveWindow(w.id, {
      idempotencyKey: "host",
      selectedSubmissionIds: [s.id],
    });
    expect(
      (
        await db.app.resolveWindow(w.id, {
          idempotencyKey: "host",
          selectedSubmissionIds: [s.id],
        })
      ).id
    ).toBe(r.id);
    await expect(
      db.app.resolveWindow(w.id, {
        idempotencyKey: "host",
        selectedSubmissionIds: [],
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(db.app.cancelWindow(w.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(
      db.app.commitResolution(r.id, "Hello", "hash")
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await db.app.failResolution(r.id, "host_failed");
    await expect(db.app.prepareExecution(r.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
  it("rejects explicit selections for automatic policies and stale mutations for a moved queue head", async () => {
    const w = await openWindow(db.app, {
      allowedInputKinds: ["entity_mutation"],
    });
    await db.app.submissions.submitIntent({
      windowId: w.id,
      actorId: "mutation",
      idempotencyKey: "mutation",
      kind: "entity_mutation",
      payload: { params: { x: 1 } },
      targetEntityIds: ["object"],
    });
    await expect(
      db.app.resolveWindow(w.id, {
        idempotencyKey: "auto",
        selectedSubmissionIds: [],
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await db.repository.advanceHead(w.id, "new-head");
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "auto" })
    ).rejects.toMatchObject({ code: "STALE_BASE" });
  });
  it("handles empty selection, no eligible submissions and cancellation with active work", async () => {
    const w = await openWindow(db.app);
    await expect(
      db.app.resolveWindow(w.id, { idempotencyKey: "empty" })
    ).rejects.toMatchObject({ code: "NO_ELIGIBLE_SUBMISSIONS" });
    const s = await submit(db.app, w);
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "selected" });
    await expect(db.app.cancelWindow(w.id)).rejects.toMatchObject({
      code: "RESOLUTION_IN_PROGRESS",
    });
    await expect(db.app.windows.closeWindow(w.id)).rejects.toMatchObject({
      code: "RESOLUTION_IN_PROGRESS",
    });
    await expect(
      db.app.submissions.cancelSubmission(s.id)
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await db.app.prepareExecution(r.id);
    await db.repository.advanceHead(w.id, "moved");
    await expect(
      db.app.commitResolution(r.id, "Text", "result")
    ).rejects.toMatchObject({ code: "STALE_BASE" });
    await db.app.failResolution(r.id, "conflict");
    await db.app.cancelWindow(w.id);
  });
  it("keeps parallel-branch results off the canonical head", async () => {
    const w = await openWindow(db.app, {
      arbitrationPolicy: "parallel_branches",
    });
    await submit(db.app, w);
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "branches" });
    await db.app.prepareExecution(r.id);
    await expect(
      db.app.commitResolution(r.id, "Remix", "branch-commit")
    ).rejects.toThrow();
    await expect(db.app.commitResolution(r.id, "Remix", {})).rejects.toThrow(
      "one branch"
    );
    await db.app.commitResolution(r.id, "Remix", {
      [r.selectedSubmissionIds[0]]: "branch-commit",
    });
    expect((await db.app.windows.getWindow(w.id))?.baseCommitHash).toBe("base");
  });
  it("requires a valid unexpired hold before generating a publication preview", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "pay_to_publish",
      billingTerms: terms,
    });
    await grant(db.pool, "preview-expired", 1);
    const s = await submit(db.app, w, "preview-expired");
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "preview" });
    await db.pool.query(
      "UPDATE interaction_reservations SET expires_at=now()-interval '1 second' WHERE submission_id=$1",
      [s.id]
    );
    await expect(db.app.prepareExecution(r.id)).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
    });
    await db.app.failResolution(r.id, "expired");
  });
  it("rejects output review and transform without exposing a result", async () => {
    const normal = new ModerationGateway();
    const app = new InteractionOrchestrator(db.repository, {
      moderation: {
        moderateInput: (...args) => normal.moderateInput(...args),
        moderateOutput: async () => ({
          id: crypto.randomUUID(),
          submissionId: "output",
          status: "review",
          reasons: ["Review output"],
          policyVersion: "custom",
          reviewedBy: "human",
          createdAt: new Date().toISOString(),
        }),
      },
    });
    const w = await openWindow(app, {
      closesAt: new Date(Date.now() + 60000).toISOString(),
    });
    await submit(app, w);
    await app.windows.closeWindow(w.id);
    const r = await app.resolveWindow(w.id, { idempotencyKey: "review" });
    await app.prepareExecution(r.id);
    expect(
      (await app.commitResolution(r.id, "Preview", "private")).status
    ).toBe("failed");
    expect((await app.windows.getWindow(w.id))?.state).toBe("failed");
  });
  it("rejects input moderation, supports rejection by a host and cancels before any authorization", async () => {
    const w = await openWindow(db.app);
    expect((await submit(db.app, w, crypto.randomUUID(), "fuck")).status).toBe(
      "rejected"
    );
    const normal = new ModerationGateway();
    normal.registerCustomValidator({
      name: "transform",
      validate: async (s) => ({
        id: crypto.randomUUID(),
        submissionId: s.id,
        status: "transform",
        reasons: ["Rewrite"],
        policyVersion: "1",
        reviewedBy: "rules",
        createdAt: new Date().toISOString(),
      }),
    });
    const app = new InteractionOrchestrator(db.repository, {
      moderation: normal,
    });
    const review = await openWindow(app);
    const s = await submit(app, review);
    expect(
      (await app.submissions.reviewSubmission(s.id, "reject", ["Declined"]))
        .status
    ).toBe("rejected");
    await expect(
      app.submissions.reviewSubmission(s.id, "allow", [])
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const original = await db.repository.admit({
      windowId: w.id,
      actorId: "late",
      idempotencyKey: "late",
      kind: "custom_prompt",
      payload: { prompt: "Hello" },
    });
    // The low-level manager can close/fail windows; a resumed admission must not escape a terminal state.
    await db.repository.updateWindowState(w.id, "failed");
    expect(
      (await db.app.submissions.resumeSubmission(original.id)).status
    ).toBe("rejected");
    const pending = await openWindow(db.app);
    const p = await db.repository.admit({
      windowId: pending.id,
      actorId: "cancel-before",
      idempotencyKey: "cancel-before",
      kind: "custom_prompt",
      payload: { prompt: "Hello" },
    });
    await db.app.submissions.cancelSubmission(p.id);
  });
  it("does not turn an unexpected billing failure into eligibility", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    await db.pool.query(
      "ALTER TABLE monetization_entitlements RENAME TO unavailable_entitlements"
    );
    try {
      await expect(submit(db.app, w, "billing-down")).rejects.toThrow();
    } finally {
      await db.pool.query(
        "ALTER TABLE unavailable_entitlements RENAME TO monetization_entitlements"
      );
    }
    expect((await db.app.submissions.listSubmissions(w.id))[0].status).toBe(
      "received"
    );
  });
  it("handles idempotent transitions, lists scheduled windows, and handles missing records", async () => {
    const w = await db.app.windows.createWindow(windowInput());
    await db.app.windows.openWindow(w.id);
    await db.app.windows.openWindow(w.id);
    await db.app.windows.closeWindow(w.id);
    await db.app.windows.closeWindow(w.id);
    expect(
      await db.app.windows.listWindows(w.worldId, "qualifying")
    ).toHaveLength(1);
    expect(await db.app.windows.listWindows(w.worldId)).toHaveLength(1);
    expect(await db.repository.getWindow("unknown")).toBeNull();
    expect(await db.repository.getSubmission("unknown")).toBeNull();
    expect(await db.repository.getResolution("unknown")).toBeNull();
    await expect(db.app.prepareExecution("unknown")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("reports closer failures and stops without leaving asynchronous work running", async () => {
    const error = new Error("database offline");
    const spy = vi
      .spyOn(db.repository, "listOpenWindowsDueToClose")
      .mockRejectedValue(error);
    const onError = vi.fn();
    const manager = new WindowManager(db.repository, onError);
    manager.startWindowCloser(2);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    await manager.stopWindowCloser();
    spy.mockRestore();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const defaultManager = new WindowManager(db.repository);
    const second = vi
      .spyOn(db.repository, "listOpenWindowsDueToClose")
      .mockRejectedValue(error);
    defaultManager.startWindowCloser(1);
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    await defaultManager.stopWindowCloser();
    second.mockRestore();
    consoleSpy.mockRestore();
  });
});
