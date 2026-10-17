import { randomUUID } from "node:crypto";
import type { InteractionRepository } from "./db/repository.js";
import type { BillingController } from "./billing-controller.js";
import type { IModerationGateway } from "./moderation-gateway.js";
import type {
  InputWindow,
  ModerationContext,
  ModerationDecision,
  Submission,
  SubmissionStatus,
  SubmitIntentInput,
} from "./types.js";
import { InteractionError, requireValue, text } from "./validation.js";

export interface ISubmissionGateway {
  submitIntent(input: SubmitIntentInput): Promise<Submission>;
  getSubmission(id: string): Promise<Submission | null>;
  cancelSubmission(id: string): Promise<void>;
  listSubmissions(
    windowId: string,
    status?: SubmissionStatus
  ): Promise<Submission[]>;
}
export class SubmissionGateway implements ISubmissionGateway {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly moderation: IModerationGateway,
    private readonly billing: BillingController,
    private readonly contextFor: (
      window: InputWindow
    ) => Omit<ModerationContext, "contentRating"> = () => ({})
  ) {}
  async submitIntent(input: SubmitIntentInput): Promise<Submission> {
    const submission = await this.repository.admit(input);
    return this.resumeSubmission(submission.id);
  }
  /** Recover an admission interrupted before qualification. Safe across processes. */
  async resumeSubmission(id: string): Promise<Submission> {
    const s = requireValue(
      await this.repository.getSubmission(id),
      "Submission"
    );
    if (s.status !== "received") return s;
    const w = requireValue(
      await this.repository.getWindow(s.windowId),
      "Window"
    );
    const decision = await this.moderation.moderateInput(s, {
      ...this.contextFor(w),
      userId: s.actorId,
      contentRating: w.contentRating,
      policyVersion: w.moderationPolicyVersion,
    });
    return this.finishModeration(id, decision, "received");
  }
  async reviewSubmission(
    id: string,
    status: "allow" | "reject",
    reasons: string[]
  ): Promise<Submission> {
    if (
      !["allow", "reject"].includes(status) ||
      !Array.isArray(reasons) ||
      !reasons.length
    )
      throw new InteractionError(
        "INVALID_INPUT",
        "Human review requires allow/reject and reasons"
      );
    reasons.forEach((reason) => text(reason, "review reason"));
    const s = requireValue(
      await this.repository.getSubmission(id),
      "Submission"
    );
    if (s.status !== "moderating")
      throw new InteractionError(
        "INVALID_STATE",
        "Submission is not awaiting review"
      );
    const w = requireValue(
      await this.repository.getWindow(s.windowId),
      "Window"
    );
    return this.finishModeration(
      id,
      {
        id: randomUUID(),
        submissionId: id,
        status,
        reasons,
        policyVersion: w.moderationPolicyVersion,
        reviewedBy: "human",
        createdAt: new Date().toISOString(),
      },
      "moderating"
    );
  }
  private async finishModeration(
    id: string,
    decision: ModerationDecision,
    expected: SubmissionStatus
  ): Promise<Submission> {
    return this.repository.withSubmission(id, async (r, s, w) => {
      if (s.status !== expected) return s;
      if (!["open", "qualifying"].includes(w.state))
        return r.saveSubmission(s, "rejected");
      await r.createModerationDecision({ ...decision, submissionId: id });
      s.moderationDecisionId = decision.id;
      if (decision.status !== "allow")
        return r.saveSubmission(
          s,
          decision.status === "reject" ? "rejected" : "moderating"
        );
      s = await r.saveSubmission(s, "awaiting_entitlement");
      try {
        const reservation = await this.billing.authorizeInTransaction(r, s, w);
        s.entitlementId = reservation.id;
      } catch (cause) {
        if (
          !(cause instanceof InteractionError) ||
          cause.code !== "INSUFFICIENT_CREDITS"
        )
          throw cause;
        await r.emit(w, "submission_rejected", {
          submissionId: id,
          reason: cause.code,
        });
        return r.saveSubmission(s, "rejected");
      }
      return r.saveSubmission(s, "eligible");
    });
  }
  getSubmission(id: string) {
    return this.repository.getSubmission(id);
  }
  listSubmissions(windowId: string, status?: SubmissionStatus) {
    return this.repository.listSubmissions(windowId, status);
  }
  async cancelSubmission(id: string): Promise<void> {
    await this.repository.withSubmission(id, async (r, s, w) => {
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
          "Cannot cancel a selected or completed submission"
        );
      await this.billing.releaseInTransaction(r, s, w, "cancelled");
      await r.saveSubmission(s, "cancelled");
    });
  }
}
