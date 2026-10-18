import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BillingController,
  SubmissionGateway,
  ModerationGateway,
} from "../src/index.js";
import {
  balance,
  database,
  grant,
  openWindow,
  submit,
  terms,
} from "./database.js";

describe("credit-backed billing", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => {
    db = await database();
  });
  afterAll(async () => {
    await db?.close();
  });
  it("quotes immutable server terms and retries authorization without double consumption", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "pay_to_generate",
      billingTerms: terms,
    });
    await grant(db.pool, "quote", 3);
    expect(
      await db.app.billing.quote(
        { ...w, billingTerms: { ...terms, amountCents: 1 } },
        "quote"
      )
    ).toMatchObject({ amountCents: 100, currency: "USD" });
    expect(
      await db.app.billing.quote(await openWindow(db.app), "free")
    ).toMatchObject({ amountCents: 0, currency: "USD" });
    const s = await submit(db.app, w, "quote");
    const reservation = await db.app.billing.authorize(s);
    expect(reservation.id).toBe(s.entitlementId);
    expect(await balance(db.pool, "quote")).toBe(2);
    await db.app.billing.cancel(s);
    await db.app.billing.cancel(s);
    expect(await balance(db.pool, "quote")).toBe(3);
    await expect(db.app.billing.authorize(s)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await db.pool.query(
      "UPDATE input_windows SET billing_terms=NULL WHERE id=$1",
      [w.id]
    );
    await expect(db.app.billing.quote(w, "quote")).rejects.toThrow(
      "billingTerms"
    );
  });
  it("refunds once and refuses to refund selected work outside its resolution", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    await grant(db.pool, "refund", 2);
    const s = await submit(db.app, w, "refund");
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "refund" });
    await expect(db.app.billing.refund(s, "operator")).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(db.app.billing.cancel(s)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await db.app.failResolution(r.id, "generation_failed");
    await db.app.billing.refund(s, "operator");
    await db.app.billing.refund(s, "operator");
    expect((await db.app.submissions.getSubmission(s.id))?.status).toBe(
      "refunded"
    );
    expect(await balance(db.pool, "refund")).toBe(2);
    await expect(db.app.billing.capture(r)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
  it("splits holds across oldest matching grants and restores each allocation", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: {
        ...terms,
        amountCredits: 3,
        sessionId: "session",
        date: "2099-01-01",
        reservationTtlMs: 60000,
      },
    });
    const g1 = await grant(
      db.pool,
      "split",
      2,
      { channelId: w.worldId, sessionId: "session", date: "2099-01-01" },
      "tenant",
      "2099-01-01T23:59:59Z"
    );
    const g2 = await grant(db.pool, "split", 3, { channelId: w.worldId });
    await grant(db.pool, "split", 2, { channelId: w.worldId });
    await grant(db.pool, "split", 50, {}, "other");
    await grant(db.pool, "split", 50, { channelId: "wrong" });
    const s = await submit(db.app, w, "split");
    const reservation = await db.app.billing.getReservation(s.id);
    expect(reservation?.amountCredits).toBe(3);
    expect(reservation?.allocations).toHaveLength(2);
    expect(
      (
        await db.pool.query(
          "SELECT remaining FROM monetization_entitlements WHERE id=$1",
          [g1]
        )
      ).rows[0].remaining
    ).toBe(0);
    await db.app.billing.refund(s, "cancelled");
    expect(
      (
        await db.pool.query(
          "SELECT remaining FROM monetization_entitlements WHERE id=$1",
          [g2]
        )
      ).rows[0].remaining
    ).toBe(3);
  });
  it("serializes concurrent spending across windows and never spends another tenant or scope", async () => {
    const a = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    const b = await openWindow(db.app, {
      billingPolicy: "prepaid_credits",
      billingTerms: terms,
    });
    await grant(db.pool, "last-credit", 1);
    const results = await Promise.all([
      submit(db.app, a, "last-credit"),
      submit(db.app, b, "last-credit"),
    ]);
    expect(results.map((s) => s.status).sort()).toEqual([
      "eligible",
      "rejected",
    ]);
    expect(await balance(db.pool, "last-credit")).toBe(0);
    await grant(db.pool, "wrong-tenant", 10, {}, "other");
    expect((await submit(db.app, a, "wrong-tenant")).status).toBe("rejected");
  });
  it("refuses expired or released holds and does not recreate expired credits", async () => {
    const w = await openWindow(db.app, {
      billingPolicy: "capture_if_selected",
      billingTerms: terms,
    });
    const grantId = await grant(
      db.pool,
      "expired-grant",
      1,
      {},
      "tenant",
      "2099-01-01T00:00:00Z"
    );
    const s = await submit(db.app, w, "expired-grant");
    const r = await db.app.resolveWindow(w.id, { idempotencyKey: "expired" });
    await db.pool.query(
      "UPDATE interaction_reservations SET expires_at=now()-interval '1 second' WHERE submission_id=$1",
      [s.id]
    );
    await expect(db.app.prepareExecution(r.id)).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
    });
    expect(await db.app.billing.expireReservations()).toBe(0);
    await db.pool.query(
      "UPDATE monetization_entitlements SET expires_at=now()-interval '1 second' WHERE id=$1",
      [grantId]
    );
    await db.app.failResolution(r.id, "expired");
    expect(await balance(db.pool, "expired-grant")).toBe(0);
    await expect(db.app.billing.authorize(s)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
  it("does not authorize unmoderated admissions and handles missing reservations", async () => {
    const w = await openWindow(db.app);
    const s = await db.repository.admit({
      windowId: w.id,
      actorId: "unmoderated",
      idempotencyKey: "unmoderated",
      kind: "custom_prompt",
      payload: { prompt: "Hi" },
    });
    await expect(db.app.billing.authorize(s)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(await db.app.billing.getReservation(s.id)).toBeNull();
    await db.app.billing.cancel(s);
    const gateway = new SubmissionGateway(
      db.repository,
      new ModerationGateway(),
      new BillingController(db.repository)
    );
    expect((await gateway.getSubmission(s.id))?.status).toBe("cancelled");
    await expect(db.app.billing.expireReservations(-1)).rejects.toThrow();
  });
});
