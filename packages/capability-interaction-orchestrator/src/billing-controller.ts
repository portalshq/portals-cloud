import { randomUUID } from "node:crypto";
import type { EntitlementScope } from "@portalshq/monetization";
import { grantAppliesAt } from "@portalshq/monetization";
import type { InteractionRepository } from "./db/repository.js";
import type {
  EntitlementReservation,
  InputWindow,
  PriceQuote,
  Resolution,
  Submission,
} from "./types.js";
import { integer, InteractionError, requireValue, text } from "./validation.js";

interface Allocation {
  grantId: string;
  amount: number;
}
export interface StoredReservation extends EntitlementReservation {
  state: "reserved" | "captured" | "released" | "refunded";
  allocations: Allocation[];
}
export interface IBillingController {
  quote(window: InputWindow, actorId: string): Promise<PriceQuote>;
  authorize(submission: Submission): Promise<EntitlementReservation>;
  capture(resolution: Resolution): Promise<void>;
  cancel(submission: Submission): Promise<void>;
  refund(submission: Submission, reason: string): Promise<void>;
}
/** Credit-backed billing against monetization grants on the same PostgreSQL database.
 * A hold deducts spendable balance once. Capture, release and refund are durable transitions.
 */
export class BillingController implements IBillingController {
  constructor(private readonly repository: InteractionRepository) {}
  /** Lock every allocation a lifecycle transaction will touch, in database ID order. */
  async lockReservations(
    r: InteractionRepository,
    submissionIds: string[]
  ): Promise<void> {
    const allocations = await r.query(
      "SELECT allocations FROM interaction_reservations WHERE submission_id=ANY($1::text[])",
      [submissionIds]
    );
    const ids = [
      ...new Set(
        allocations.rows.flatMap((row) =>
          (row.allocations as Allocation[]).map(
            (allocation) => allocation.grantId
          )
        )
      ),
    ];
    if (ids.length)
      await r.query(
        "SELECT id FROM monetization_entitlements WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
        [ids]
      );
  }
  async quote(window: InputWindow, actorId: string): Promise<PriceQuote> {
    text(actorId, "actorId");
    const current = requireValue(
      await this.repository.getWindow(window.id),
      "Window"
    );
    const terms = current.billingTerms;
    if (current.billingPolicy !== "free" && !terms)
      throw new InteractionError(
        "INVALID_INPUT",
        "Paid window requires billingTerms"
      );
    return {
      id: randomUUID(),
      amountCents: current.billingPolicy === "free" ? 0 : terms!.amountCents,
      currency: terms?.currency ?? "USD",
      expiresAt: new Date((await this.repository.now()) + 900000).toISOString(),
    };
  }
  async authorize(submission: Submission): Promise<EntitlementReservation> {
    return this.repository.withSubmission(submission.id, async (r, s, w) =>
      this.authorizeInTransaction(r, s, w)
    );
  }
  async getReservation(
    id: string,
    r = this.repository
  ): Promise<StoredReservation | null> {
    const row = (
      await r.query(
        "SELECT * FROM interaction_reservations WHERE submission_id=$1",
        [id]
      )
    ).rows[0];
    return row
      ? {
          id: row.id,
          amountCredits: row.amount_credits,
          expiresAt: new Date(row.expires_at).toISOString(),
          state: row.state,
          allocations: row.allocations,
        }
      : null;
  }
  async authorizeInTransaction(
    r: InteractionRepository,
    s: Submission,
    w: InputWindow
  ): Promise<StoredReservation> {
    const existing = await this.getReservation(s.id, r);
    if (existing) {
      if (existing.state === "released" || existing.state === "refunded")
        throw new InteractionError(
          "INVALID_STATE",
          "Reservation was already released"
        );
      return existing;
    }
    if (s.status !== "awaiting_entitlement")
      throw new InteractionError(
        "INVALID_STATE",
        "Submission must pass moderation before billing"
      );
    const allocations: Allocation[] = [];
    const now = await r.now();
    let expiresAt = now + (w.billingTerms?.reservationTtlMs ?? 3600000);
    const terms =
      w.billingPolicy === "free"
        ? undefined
        : requireValue(w.billingTerms, "billingTerms");
    if (terms) {
      const site: EntitlementScope = {
        channelId: w.worldId,
        ...(terms.sessionId ? { sessionId: terms.sessionId } : {}),
        ...(terms.date ? { date: terms.date } : {}),
      };
      const candidates = await r.query(
        `SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS created_order
         FROM monetization_entitlements WHERE tenant_id=$1 AND consumer_id=$2 AND kind=$3 AND remaining>0 AND (expires_at IS NULL OR expires_at>clock_timestamp()) ORDER BY id FOR UPDATE`,
        [terms.tenantId, s.actorId, terms.entitlementKind]
      );
      const applicable = candidates.rows
        .filter((row) => grantAppliesAt(row.scope as EntitlementScope, site))
        .sort((a, b) =>
          a.created_order < b.created_order
            ? -1
            : a.created_order > b.created_order
            ? 1
            : 0
        );
      if (
        applicable.reduce((sum, row) => sum + Number(row.remaining), 0) <
        terms.amountCredits
      )
        throw new InteractionError(
          "INSUFFICIENT_CREDITS",
          "Insufficient credits"
        );
      let owed = terms.amountCredits;
      for (const row of applicable) {
        if (!owed) break;
        const amount = Math.min(owed, Number(row.remaining));
        await r.query(
          "UPDATE monetization_entitlements SET remaining=remaining-$2,updated_at=now() WHERE id=$1",
          [row.id, amount]
        );
        allocations.push({ grantId: row.id, amount });
        owed -= amount;
        if (row.expires_at)
          expiresAt = Math.min(expiresAt, new Date(row.expires_at).getTime());
      }
    }
    const state = ["capture_if_selected", "pay_to_publish"].includes(
      w.billingPolicy
    )
      ? "reserved"
      : "captured";
    const reservation: StoredReservation = {
      id: randomUUID(),
      state,
      amountCredits: terms?.amountCredits ?? 0,
      allocations,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    await r.query(
      "INSERT INTO interaction_reservations(id,submission_id,state,amount_credits,allocations,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        reservation.id,
        s.id,
        state,
        reservation.amountCredits,
        JSON.stringify(allocations),
        reservation.expiresAt,
      ]
    );
    await r.emit(w, "billing_authorized", {
      submissionId: s.id,
      reservationId: reservation.id,
      state,
      amountCredits: reservation.amountCredits,
    });
    return reservation;
  }
  async capture(resolution: Resolution): Promise<void> {
    await this.repository.transaction(async (r) => {
      const w = requireValue(
        await r.getWindow(resolution.windowId, true),
        "Window"
      );
      const stored = requireValue(
        await r.getResolution(resolution.id),
        "Resolution"
      );
      if (
        stored.windowId !== w.id ||
        !["selected", "executing", "committed"].includes(stored.status)
      )
        throw new InteractionError(
          "INVALID_STATE",
          "Resolution cannot be captured"
        );
      // Pay-to-publish capture is owned by commitResolution, after output moderation.
      if (w.billingPolicy === "pay_to_publish")
        throw new InteractionError(
          "OUTPUT_REQUIRED",
          "Use commitResolution to capture after output moderation"
        );
      if (stored.status === "committed") return;
      await this.lockReservations(r, stored.selectedSubmissionIds);
      for (const id of stored.selectedSubmissionIds)
        await this.captureInTransaction(
          r,
          requireValue(await r.getSubmission(id, true), "Submission"),
          w
        );
    });
  }
  async captureInTransaction(
    r: InteractionRepository,
    s: Submission,
    w: InputWindow
  ): Promise<void> {
    const reservation = requireValue(
      await this.getReservation(s.id, r),
      "Reservation"
    );
    if (reservation.state !== "reserved" && reservation.state !== "captured")
      throw new InteractionError(
        "INVALID_STATE",
        "Reservation is no longer payable"
      );
    const now = await r.now();
    if (
      reservation.state === "reserved" &&
      Date.parse(reservation.expiresAt) <= now
    )
      throw new InteractionError(
        "RESERVATION_EXPIRED",
        "Credit reservation expired"
      );
    await this.lockReservations(r, [s.id]);
    for (const allocation of [...reservation.allocations].sort((a, b) =>
      a.grantId.localeCompare(b.grantId)
    )) {
      const grant = (
        await r.query(
          "SELECT id,expires_at FROM monetization_entitlements WHERE id=$1 FOR UPDATE",
          [allocation.grantId]
        )
      ).rows[0];
      if (
        !grant ||
        (grant.expires_at && new Date(grant.expires_at).getTime() <= now)
      )
        throw new InteractionError(
          "ENTITLEMENT_REVOKED",
          "Backing credit grant was revoked or expired"
        );
    }
    if (reservation.state === "captured") return;
    await r.query(
      "UPDATE interaction_reservations SET state='captured',updated_at=now() WHERE id=$1",
      [reservation.id]
    );
    await r.emit(w, "billing_captured", {
      submissionId: s.id,
      reservationId: reservation.id,
    });
  }
  async cancel(submission: Submission): Promise<void> {
    await this.repository.withSubmission(submission.id, async (r, s, w) => {
      if (s.status === "cancelled") return;
      if (
        ![
          "received",
          "moderating",
          "awaiting_entitlement",
          "eligible",
          "rejected",
        ].includes(s.status)
      )
        throw new InteractionError(
          "INVALID_STATE",
          "Cannot cancel selected or completed billing"
        );
      await this.releaseInTransaction(r, s, w, "cancelled");
      await r.saveSubmission(s, "cancelled");
    });
  }
  async refund(submission: Submission, reason: string): Promise<void> {
    text(reason, "refund reason");
    await this.repository.withSubmission(submission.id, async (r, s, w) => {
      if (s.status === "selected" || s.status === "executing")
        throw new InteractionError(
          "INVALID_STATE",
          "Fail the active resolution before refunding"
        );
      await this.releaseInTransaction(r, s, w, reason);
      if (s.status !== "refunded") await r.saveSubmission(s, "refunded");
    });
  }
  async releaseInTransaction(
    r: InteractionRepository,
    s: Submission,
    w: InputWindow,
    reason: string
  ): Promise<void> {
    const reservation = await this.getReservation(s.id, r);
    if (
      !reservation ||
      reservation.state === "released" ||
      reservation.state === "refunded"
    )
      return;
    // Lock grants in the same order as capture. Deleted or expired grants cannot be recreated.
    await this.lockReservations(r, [s.id]);
    let restored = 0;
    for (const allocation of [...reservation.allocations].sort((a, b) =>
      a.grantId.localeCompare(b.grantId)
    )) {
      const row = (
        await r.query(
          "SELECT remaining,quantity,expires_at FROM monetization_entitlements WHERE id=$1 FOR UPDATE",
          [allocation.grantId]
        )
      ).rows[0];
      if (
        !row ||
        (row.expires_at &&
          new Date(row.expires_at).getTime() <= (await r.now()))
      )
        continue;
      const amount = Math.min(
        allocation.amount,
        Number(row.quantity) - Number(row.remaining)
      );
      await r.query(
        "UPDATE monetization_entitlements SET remaining=remaining+$2,updated_at=now() WHERE id=$1",
        [allocation.grantId, amount]
      );
      restored += amount;
    }
    const state = reservation.state === "reserved" ? "released" : "refunded";
    await r.query(
      "UPDATE interaction_reservations SET state=$2,reason=$3,updated_at=now() WHERE id=$1",
      [reservation.id, state, reason]
    );
    await r.emit(w, "billing_released", {
      submissionId: s.id,
      reservationId: reservation.id,
      state,
      restoredCredits: restored,
      reason,
    });
  }
  async expireReservations(limit = 100): Promise<number> {
    integer(limit, "limit", 1, 1000);
    const rows = await this.repository.query(
      `SELECT submission_id FROM interaction_reservations r JOIN submissions s ON s.id=r.submission_id
      WHERE r.state='reserved' AND r.expires_at<=clock_timestamp() AND s.status IN ('received','moderating','awaiting_entitlement','eligible') ORDER BY r.expires_at LIMIT $1`,
      [limit]
    );
    let expired = 0;
    for (const row of rows.rows)
      await this.repository.withSubmission(
        row.submission_id,
        async (r, s, w) => {
          const reservation = await this.getReservation(s.id, r);
          if (
            reservation?.state !== "reserved" ||
            Date.parse(reservation.expiresAt) > (await r.now())
          )
            return;
          if (
            ![
              "received",
              "moderating",
              "awaiting_entitlement",
              "eligible",
            ].includes(s.status)
          )
            return;
          await this.releaseInTransaction(r, s, w, "reservation_expired");
          await r.saveSubmission(s, "failed");
          expired++;
        }
      );
    return expired;
  }
}
