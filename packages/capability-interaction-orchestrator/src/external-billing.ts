import type {
  CreditDebitStore,
  CreditGrantStore,
  EntitlementScope,
} from "@portalshq/monetization";
import type { InteractionRepository } from "./db/repository.js";
import type { InputWindow, Submission } from "./types.js";
import { integer, InteractionError, requireValue } from "./validation.js";
import type { InteractionMetrics } from "./metrics.js";
import { noopMetrics } from "./metrics.js";

/** Billing policies whose charge is a final external debit, not a reservation. */
export const EXTERNAL_DEBIT_POLICIES = new Set([
  "prepaid_credits",
  "pay_for_guaranteed_slot",
  "pay_to_generate",
]);

export interface ExternalBillingOptions {
  debits: CreditDebitStore;
  grants?: CreditGrantStore;
  metrics?: InteractionMetrics;
  onError?: (error: unknown) => void;
}

/** True when a window bills through the external credit stores rather than the
 *  in-transaction reservation path. Reservation policies keep their existing
 *  colocated behaviour. */
export function usesExternalDebit(w: InputWindow): boolean {
  return EXTERNAL_DEBIT_POLICIES.has(w.billingPolicy);
}

function siteFor(w: InputWindow): EntitlementScope {
  const terms = w.billingTerms;
  return {
    channelId: w.worldId,
    ...(terms?.sessionId ? { sessionId: terms.sessionId } : {}),
    ...(terms?.date ? { date: terms.date } : {}),
  };
}

/**
 * Coordinates submission billing against a separate billing database.
 *
 * The interaction database holds `awaiting_entitlement` as the durable marker;
 * the external `debitCredits`/`grantCredits` call runs outside any interaction
 * transaction and is idempotent on the submission id as the operation id, so a
 * crash at any point is repaired by replaying the same operation. After the
 * external call returns, a short transaction applies the outcome.
 */
export class ExternalBilling {
  private readonly metrics: InteractionMetrics;
  private readonly onError: (error: unknown) => void;
  constructor(
    private readonly repository: InteractionRepository,
    private readonly options: ExternalBillingOptions,
  ) {
    this.metrics = options.metrics ?? noopMetrics;
    this.onError =
      options.onError ?? ((error) => console.error("[interaction billing]", error));
  }

  /** Mark a submission pending on external billing inside a lifecycle transaction. */
  async markPending(r: InteractionRepository, s: Submission): Promise<Submission> {
    await r.query(
      "UPDATE submissions SET billing_attempts=COALESCE(billing_attempts,0), billing_pending_since=COALESCE(billing_pending_since, clock_timestamp()) WHERE id=$1",
      [s.id],
    );
    return r.saveSubmission(s, "awaiting_entitlement");
  }

  /**
   * Settle one submission's external debit. Safe to call at any time and from
   * any process: an already-settled submission is returned unchanged, and a
   * repeated call replays the same operation id against `debitCredits`, which
   * returns the stored outcome.
   *
   * Outcome mapping: a confirmed debit moves the submission to the post-charge
   * state for its billing mode ("eligible" for admission billing, "executing"
   * for claim billing); a confirmed insufficient declines it without charge;
   * an unknown outcome (thrown error) leaves it `awaiting_entitlement` for the
   * sweep to retry.
   */
  async settleDebit(id: string): Promise<Submission> {
    const s = requireValue(await this.repository.getSubmission(id), "Submission");
    if (s.status !== "awaiting_entitlement") return s;
    const w = requireValue(await this.repository.getWindow(s.windowId), "Window");
    if (!usesExternalDebit(w)) return s;
    const terms = requireValue(w.billingTerms, "billingTerms");
    if (!Number.isSafeInteger(terms.amountCredits) || terms.amountCredits < 1) {
      return this.repository.withSubmission(id, async (r, current) =>
        current.status === "awaiting_entitlement"
          ? r.saveSubmission(current, this.admissionOutcome(w))
          : current,
      );
    }
    let outcome: "debited" | "insufficient";
    try {
      const result = await this.options.debits.debitCredits({
        operationId: s.id,
        tenantId: terms.tenantId,
        consumerId: s.actorId,
        kind: terms.entitlementKind,
        site: siteFor(w),
        amount: terms.amountCredits,
      });
      outcome = result.outcome;
      this.metrics.increment(
        outcome === "debited" ? "interaction.debit.confirmed" : "interaction.debit.declined",
        { world: w.worldId },
      );
    } catch (cause) {
      await this.recordRetry(id, cause);
      return requireValue(await this.repository.getSubmission(id), "Submission");
    }
    return this.repository.withSubmission(id, async (r, current, currentWindow) => {
      if (current.status !== "awaiting_entitlement") return current;
      if (outcome === "debited") {
        return r.saveSubmission(current, this.admissionOutcome(currentWindow));
      }
      await r.emit(currentWindow, "submission_rejected", {
        submissionId: id,
        reason: "INSUFFICIENT_CREDITS",
      });
      return r.saveSubmission(current, "rejected");
    });
  }

  /** The state a confirmed debit moves the submission to, by billing mode. */
  private admissionOutcome(w: InputWindow): "eligible" | "executing" {
    return w.billingTerms?.settle === "claim" ? "executing" : "eligible";
  }

  private async recordRetry(id: string, cause: unknown): Promise<void> {
    this.onError(cause);
    this.metrics.increment("interaction.debit.retry");
    try {
      await this.repository.query(
        "UPDATE submissions SET billing_attempts=COALESCE(billing_attempts,0)+1 WHERE id=$1 AND status='awaiting_entitlement'",
        [id],
      );
    } catch {
      // Retry bookkeeping must never take down the settlement path.
    }
  }

  /**
   * Sweep every submission stuck on external billing. Returns the number that
   * reached a definitive state. Per-submission failures are retried on the next
   * sweep — a submission can only leave `awaiting_entitlement` through a
   * confirmed billing outcome.
   */
  async settlePending(limit = 100): Promise<number> {
    integer(limit, "limit", 1, 1000);
    const rows = await this.repository.query(
      `SELECT s.id, s.billing_pending_since FROM submissions s
       JOIN input_windows w ON w.id = s.window_id
       WHERE s.status='awaiting_entitlement' AND w.billing_policy IN ('prepaid_credits','pay_for_guaranteed_slot','pay_to_generate')
       ORDER BY s.admitted_at, s.id LIMIT $1`,
      [limit],
    );
    let settled = 0;
    for (const row of rows.rows) {
      if (row.billing_pending_since) {
        this.metrics.observe(
          "interaction.debit.pending_age_ms",
          Date.now() - new Date(row.billing_pending_since).getTime(),
        );
      }
      const before = (await this.repository.getSubmission(row.id))?.status;
      const after = (await this.settleDebit(row.id)).status;
      if (before === "awaiting_entitlement" && after !== "awaiting_entitlement") settled += 1;
    }
    return settled;
  }

  /**
   * Pay a reward once per submission using the idempotent grant operation.
   * The submission id is the operation id, so a retry or reconnect cannot
   * credit the response twice.
   */
  async settleReward(
    id: string,
    reward: { tenantId: string; entitlementKind: string; amountCredits: number; sessionId?: string },
  ): Promise<Submission> {
    if (!this.options.grants) {
      throw new InteractionError("INVALID_STATE", "Reward grants are not configured");
    }
    integer(reward.amountCredits, "reward amountCredits", 0);
    const s = requireValue(await this.repository.getSubmission(id), "Submission");
    if (s.status === "fulfilled") return s;
    if (s.status !== "eligible") {
      throw new InteractionError("INVALID_STATE", "Submission is not rewardable");
    }
    const w = requireValue(await this.repository.getWindow(s.windowId), "Window");
    if (reward.amountCredits > 0) {
      await this.options.grants.grantCredits({
        operationId: s.id,
        tenantId: reward.tenantId,
        consumerId: s.actorId,
        kind: reward.entitlementKind,
        site: { channelId: w.worldId, ...(reward.sessionId ? { sessionId: reward.sessionId } : {}) },
        amount: reward.amountCredits,
      });
      this.metrics.increment("interaction.feedback.rewarded", { world: w.worldId });
    }
    return this.repository.withSubmission(id, async (r, current, currentWindow) => {
      if (current.status === "fulfilled") return current;
      if (current.status !== "eligible") return current;
      const saved = await r.saveSubmission(current, "fulfilled");
      await r.emit(currentWindow, "feedback_rewarded", {
        submissionId: id,
        amountCredits: reward.amountCredits,
      });
      return saved;
    });
  }
}
