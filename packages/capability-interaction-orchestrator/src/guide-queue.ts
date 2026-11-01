import type { InteractionRepository } from "./db/repository.js";
import type { ExternalBilling } from "./external-billing.js";
import type {
  BillingTerms,
  ContentRating,
  InputWindow,
  Submission,
} from "./types.js";
import { integer, text } from "./validation.js";

export interface EnsureGuideWindowInput {
  worldId: string;
  branchId: string;
  sessionId: string;
  baseCommitHash?: string;
  billingTerms: BillingTerms;
  maxSubmissionsPerUser?: number;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
}

const GUIDE_CLAIM_ATTEMPTS = 10;

/**
 * Paid guides on the shared submission infrastructure.
 *
 * A session's guide queue is one always-open `fifo` window. Admission runs the
 * normal moderation path and costs nothing; the charge happens at claim, when
 * the guide actually reaches a generation turn — preserving the existing
 * charge-at-claim semantics. Claiming durably moves the submission to
 * `awaiting_entitlement` before the debit call, so a crash cannot lose a paid
 * guide or unclaim it into a second consumption, and the idempotent debit
 * (operation id = submission id) makes every retry safe.
 */
export class GuideQueue {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly billing: ExternalBilling,
  ) {}

  /** Find or create the session's always-open guide window. */
  async ensureWindow(input: EnsureGuideWindowInput): Promise<InputWindow> {
    const conflictKey = `guides:${input.sessionId}`;
    const existing = await this.repository.listWindows(input.worldId, "open");
    const found = existing.find(
      (w) => w.conflictKey === conflictKey && w.allowedInputKinds.includes("custom_prompt"),
    );
    if (found) return found;
    const window = await this.repository.createWindow({
      worldId: input.worldId,
      branchId: input.branchId,
      baseCommitHash: input.baseCommitHash ?? `guides:${input.sessionId}`,
      conflictKey,
      allowedInputKinds: ["custom_prompt"],
      arbitrationPolicy: "fifo",
      arbitrationPolicyConfig: {},
      billingPolicy: "prepaid_credits",
      billingTerms: { ...input.billingTerms, settle: "claim" },
      maxSubmissionsPerUser: input.maxSubmissionsPerUser ?? 10,
      maxSelectedInputs: 1,
      opensAt: new Date().toISOString(),
      closesAt: null,
      contentRating: input.contentRating ?? "E",
      moderationPolicyVersion: input.moderationPolicyVersion,
      rulesetVersion: input.rulesetVersion,
      appMetadata: { guideQueue: true, sessionId: input.sessionId },
    });
    await this.repository.updateWindowState(window.id, "open");
    return { ...window, state: "open" };
  }

  /**
   * Claim and charge the oldest eligible guide for `windowId`.
   *
   * Claim first, charge second: a debit that declines drops the unpaid guide;
   * an unknown outcome leaves it `awaiting_entitlement` where the settlement
   * sweep replays the same operation id. Returns the submission once its
   * debit is confirmed (`executing`); the caller marks it `fulfilled` after
   * folding it into the generation request.
   */
  async claimNext(windowId: string, attempts = GUIDE_CLAIM_ATTEMPTS): Promise<Submission | null> {
    text(windowId, "windowId");
    integer(attempts, "attempts", 1, 100);
    for (let i = 0; i < attempts; i += 1) {
      const claimed = await this.repository.withSubmission(
        await this.oldestEligible(windowId).then((s) => s?.id ?? ""),
        async (r, s, w) => {
          if (s.status !== "eligible") return null;
          return this.billing.markPending(r, s);
        },
      ).catch(() => null);
      if (!claimed) return null;
      const settled = await this.billing.settleDebit(claimed.id);
      if (settled.status === "executing") return settled;
      // insufficient → rejected (uncharged); still pending → stop, sweep retries.
      if (settled.status === "awaiting_entitlement") return null;
    }
    return null;
  }

  private async oldestEligible(windowId: string): Promise<Submission | null> {
    const rows = await this.repository.query(
      `SELECT id FROM submissions WHERE window_id=$1 AND status='eligible' ORDER BY admission_sequence, id LIMIT 1`,
      [windowId],
    );
    return rows.rows[0] ? this.repository.getSubmission(rows.rows[0].id) : null;
  }

  /** Mark a charged guide consumed by a generation turn. */
  async complete(submissionId: string): Promise<void> {
    text(submissionId, "submissionId");
    await this.repository.withSubmission(submissionId, async (r, s) => {
      if (s.status === "executing") await r.saveSubmission(s, "fulfilled");
    });
  }
}
