import type { InteractionRepository } from "./db/repository.js";
import type { ExternalBilling } from "./external-billing.js";
import type { ContentRating, InputWindow, Submission } from "./types.js";
import { InteractionError, integer, text } from "./validation.js";

export interface FeedbackReward {
  tenantId: string;
  entitlementKind: string;
  amountCredits: number;
}

export interface OpenFeedbackInput {
  worldId: string;
  branchId: string;
  baseCommitHash?: string;
  sessionId: string;
  reward: FeedbackReward;
  /** Maximum feedback events per user per session. */
  maxPerSession: number;
  durationSeconds?: number;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
}

const DEFAULT_DURATION_SECONDS = 120;

/**
 * Rewarded session feedback.
 *
 * Each feedback event is a short window accepting one thumbs-up/down (plus
 * optional moderated text) per viewer. A confirmed response pays the
 * configured credit reward exactly once per viewer per event through the
 * idempotent `grantCredits` operation — retries and reconnects replay the
 * same operation id and cannot double-credit. Feedback never inspects
 * whether a chosen entity appeared and never refunds votes.
 */
export class FeedbackCoordinator {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly billing: ExternalBilling,
  ) {}

  /**
   * Open a feedback window unless the session cap is reached. Returns null
   * when the viewer already used the session's configured maximum.
   */
  async openFeedback(input: OpenFeedbackInput): Promise<InputWindow | null> {
    text(input.sessionId, "sessionId");
    integer(input.maxPerSession, "maxPerSession", 1);
    integer(input.durationSeconds ?? DEFAULT_DURATION_SECONDS, "durationSeconds", 1);
    const prior = await this.repository.query(
      `SELECT COUNT(*)::int AS n FROM input_windows
       WHERE world_id=$1 AND 'feedback' = ANY(SELECT jsonb_array_elements_text(allowed_input_kinds))
         AND app_metadata->>'sessionId' = $2`,
      [input.worldId, input.sessionId],
    );
    if (Number(prior.rows[0].n) >= input.maxPerSession) return null;
    const now = Date.now();
    const window = await this.repository.createWindow({
      worldId: input.worldId,
      branchId: input.branchId,
      baseCommitHash: input.baseCommitHash ?? `feedback:${input.sessionId}`,
      conflictKey: `feedback:${input.sessionId}:${prior.rows[0].n + 1}`,
      allowedInputKinds: ["feedback"],
      arbitrationPolicy: "first_accepted",
      arbitrationPolicyConfig: {},
      billingPolicy: "free",
      maxSubmissionsPerUser: 1,
      maxSelectedInputs: 1,
      opensAt: new Date(now).toISOString(),
      closesAt: new Date(now + (input.durationSeconds ?? DEFAULT_DURATION_SECONDS) * 1000).toISOString(),
      contentRating: input.contentRating ?? "E",
      moderationPolicyVersion: input.moderationPolicyVersion,
      appMetadata: { feedbackEvent: true, sessionId: input.sessionId, reward: input.reward },
    });
    await this.repository.updateWindowState(window.id, "open");
    await this.repository.emit({ ...window, state: "open" }, "feedback_opened", {
      sessionId: input.sessionId,
      rewardCredits: input.reward.amountCredits,
    });
    return { ...window, state: "open" };
  }

  /** Reward terms persisted on the window (server-authored). */
  rewardFor(w: InputWindow): FeedbackReward & { sessionId?: string } {
    const reward = w.appMetadata.reward as FeedbackReward | undefined;
    if (!reward) throw new InteractionError("INVALID_STATE", "Feedback window carries no reward terms");
    return { ...reward, sessionId: w.appMetadata.sessionId as string | undefined };
  }

  /** Grant the configured reward once the response is admitted. */
  async rewardSubmission(submissionId: string): Promise<Submission> {
    const s = await this.repository.getSubmission(submissionId);
    if (!s) throw new InteractionError("NOT_FOUND", "Submission not found");
    const w = await this.repository.getWindow(s.windowId);
    if (!w) throw new InteractionError("NOT_FOUND", "Window not found");
    return this.billing.settleReward(submissionId, this.rewardFor(w));
  }
}
