import { randomUUID } from "node:crypto";
import { ArbitrationEngine } from "./arbitration-engine.js";
import { BillingController } from "./billing-controller.js";
import { InteractionRepository } from "./db/repository.js";
import {
  ModerationGateway,
  type IModerationGateway,
} from "./moderation-gateway.js";
import { SubmissionGateway } from "./submission-gateway.js";
import { WindowManager } from "./window-manager.js";
import type { InputWindow, ModerationContext, Resolution } from "./types.js";
import {
  canonical,
  InteractionError,
  json,
  record,
  requireValue,
  text,
} from "./validation.js";
import { createHash } from "node:crypto";

export interface OrchestratorOptions {
  moderation?: IModerationGateway;
  arbitration?: ArbitrationEngine;
  contextFor?: (
    window: InputWindow
  ) => Omit<ModerationContext, "contentRating">;
}
/** Lifecycle module. Callers never need to coordinate submission, billing and outbox writes. */
export class InteractionOrchestrator {
  readonly windows: WindowManager;
  readonly submissions: SubmissionGateway;
  readonly billing: BillingController;
  private readonly moderation: IModerationGateway;
  private readonly arbitration: ArbitrationEngine;
  private readonly contextFor: NonNullable<OrchestratorOptions["contextFor"]>;
  constructor(
    private readonly repository: InteractionRepository,
    options: OrchestratorOptions = {}
  ) {
    this.moderation = options.moderation ?? new ModerationGateway();
    this.arbitration = options.arbitration ?? new ArbitrationEngine();
    this.contextFor = options.contextFor ?? (() => ({}));
    this.windows = new WindowManager(repository);
    this.billing = new BillingController(repository);
    this.submissions = new SubmissionGateway(
      repository,
      this.moderation,
      this.billing,
      this.contextFor
    );
  }
  async resolveWindow(
    id: string,
    options: { idempotencyKey: string; selectedSubmissionIds?: string[] }
  ): Promise<Resolution> {
    text(options.idempotencyKey, "resolution idempotencyKey");
    const request =
      options.selectedSubmissionIds === undefined
        ? {}
        : { selectedSubmissionIds: options.selectedSubmissionIds };
    json(request, "resolution request");
    return this.repository.transaction(async (r) => {
      const w = requireValue(await r.getWindow(id, true), "Window");
      const existing = await r.findResolution(
        id,
        options.idempotencyKey,
        request
      );
      if (existing) return existing;
      const queue = w.state === "open" && w.closesAt === null;
      if (!queue && w.state !== "qualifying")
        throw new InteractionError(
          "INVALID_STATE",
          "Close the window before resolving"
        );
      if (
        w.arbitrationPolicy === "host_selection" &&
        options.selectedSubmissionIds === undefined
      )
        throw new InteractionError(
          "HOST_SELECTION_REQUIRED",
          "Host must supply selectedSubmissionIds"
        );
      if (
        w.arbitrationPolicy !== "host_selection" &&
        options.selectedSubmissionIds !== undefined
      )
        throw new InteractionError(
          "INVALID_INPUT",
          "Explicit selection requires host_selection policy"
        );
      const active = await r.query(
        "SELECT id FROM resolutions WHERE window_id=$1 AND status IN ('selected','executing')",
        [id]
      );
      if (active.rows.length)
        throw new InteractionError(
          "RESOLUTION_IN_PROGRESS",
          "Complete the current resolution before selecting another"
        );
      const all = await r.listSubmissions(id);
      if (
        !queue &&
        all.some((s) =>
          ["received", "moderating", "awaiting_entitlement"].includes(s.status)
        )
      )
        throw new InteractionError(
          "QUALIFICATION_PENDING",
          "Pending submissions must finish qualification or be cancelled"
        );
      const eligible = all.filter((s) => s.status === "eligible");
      if (!eligible.length)
        throw new InteractionError(
          "NO_ELIGIBLE_SUBMISSIONS",
          "No eligible submissions"
        );
      const stale = eligible.find(
        (s) =>
          s.baseCommitHash !== w.baseCommitHash &&
          !["custom_prompt", "message", "vote"].includes(s.kind)
      );
      if (stale)
        throw new InteractionError(
          "STALE_BASE",
          `Submission ${stale.id} requires revalidation against the current head`
        );
      const effective =
        options.selectedSubmissionIds === undefined
          ? w
          : {
              ...w,
              arbitrationPolicyConfig: {
                ...w.arbitrationPolicyConfig,
                selectedSubmissionIds: options.selectedSubmissionIds,
              },
            };
      const proposed = await this.arbitration.resolve(effective, eligible);
      // Queue overflow is deferred. It remains paid and eligible for the next resolution.
      if (
        queue &&
        ["fifo", "parallel_branches"].includes(w.arbitrationPolicy)
      ) {
        proposed.appMetadata.deferredSubmissionIds =
          proposed.rejectedSubmissionIds;
        proposed.rejectedSubmissionIds = [];
      }
      const resolution = await r.createResolution(
        proposed,
        options.idempotencyKey,
        request
      );
      await this.billing.lockReservations(r, resolution.rejectedSubmissionIds);
      for (const s of eligible) {
        if (resolution.selectedSubmissionIds.includes(s.id))
          await r.saveSubmission(s, "selected");
        else if (resolution.rejectedSubmissionIds.includes(s.id)) {
          await this.billing.releaseInTransaction(r, s, w, "not_selected");
          await r.saveSubmission(s, "not_selected");
        }
      }
      if (!queue) await r.updateWindowState(id, "resolving");
      await r.emit(w, "resolution_selected", {
        resolutionId: resolution.id,
        selectedSubmissionIds: resolution.selectedSubmissionIds,
        rejectedSubmissionIds: resolution.rejectedSubmissionIds,
      });
      return resolution;
    });
  }
  async prepareExecution(id: string): Promise<Resolution> {
    return this.withResolution(id, async (r, resolution, w) => {
      if (
        resolution.status === "executing" ||
        resolution.status === "committed"
      )
        return resolution;
      if (resolution.status !== "selected")
        throw new InteractionError(
          "INVALID_STATE",
          "Resolution is not selected"
        );
      await this.billing.lockReservations(r, resolution.selectedSubmissionIds);
      for (const sid of resolution.selectedSubmissionIds) {
        const s = requireValue(await r.getSubmission(sid, true), "Submission");
        if (w.billingPolicy !== "pay_to_publish")
          await this.billing.captureInTransaction(r, s, w);
        else await this.assertPayable(r, s.id);
        await r.saveSubmission(s, "executing");
      }
      resolution.status = "executing";
      await r.updateResolution(resolution);
      if (w.state !== "open") await r.updateWindowState(w.id, "executing");
      await r.emit(w, "resolution_executing", { resolutionId: id });
      return resolution;
    });
  }
  /** Output is moderated before publication. The resulting hash is supplied by the owned execution adapter. */
  async commitResolution(
    id: string,
    output: unknown,
    commitTarget: string | Record<string, string>
  ): Promise<Resolution> {
    json(output, "output");
    const digest = createHash("sha256").update(canonical(output)).digest("hex");
    const initial = requireValue(
      await this.repository.getResolution(id),
      "Resolution"
    );
    if (initial.arbitrationPolicy === "parallel_branches") {
      record(commitTarget, "branch commits");
      if (
        Object.keys(commitTarget).length !==
          initial.selectedSubmissionIds.length ||
        initial.selectedSubmissionIds.some(
          (sid) => !Object.hasOwn(commitTarget, sid)
        )
      )
        throw new InteractionError(
          "INVALID_INPUT",
          "Supply one branch commit per selected submission"
        );
      for (const hash of Object.values(commitTarget))
        text(hash, "branch commit");
    } else text(commitTarget, "resultingCommitHash");
    const sameResult = (resolution: Resolution) => {
      if (
        resolution.appMetadata.outputDigest !== digest ||
        canonical(resolution.appMetadata.commitTarget) !==
          canonical(commitTarget)
      )
        throw new InteractionError(
          "IDEMPOTENCY_CONFLICT",
          "Resolution already committed with a different result"
        );
      return resolution;
    };
    if (initial.status === "committed") return sameResult(initial);
    if (initial.status !== "executing")
      throw new InteractionError(
        "INVALID_STATE",
        "Prepare execution before committing"
      );
    const w = requireValue(
      await this.repository.getWindow(initial.windowId),
      "Window"
    );
    const decision = await this.moderation.moderateOutput(output, {
      ...this.contextFor(w),
      contentRating: w.contentRating,
      policyVersion: w.moderationPolicyVersion,
    });
    return this.withResolution(id, async (r, resolution, current) => {
      if (resolution.status === "committed") {
        return sameResult(resolution);
      }
      if (resolution.status !== "executing")
        throw new InteractionError(
          "INVALID_STATE",
          "Prepare execution before committing"
        );
      if (resolution.baseCommitHash !== current.baseCommitHash)
        throw new InteractionError(
          "STALE_BASE",
          "Window head changed during execution"
        );
      for (const sid of resolution.selectedSubmissionIds)
        await r.createModerationDecision(
          { ...decision, id: randomUUID(), submissionId: sid },
          "output"
        );
      if (decision.status !== "allow")
        return this.failInTransaction(
          r,
          resolution,
          current,
          `output_${decision.status}`
        );
      await this.billing.lockReservations(r, resolution.selectedSubmissionIds);
      for (const sid of resolution.selectedSubmissionIds) {
        const s = requireValue(await r.getSubmission(sid, true), "Submission");
        await this.billing.captureInTransaction(r, s, current);
        await r.saveSubmission(s, "fulfilled");
      }
      resolution.status = "committed";
      resolution.resultingCommitHash =
        typeof commitTarget === "string" ? commitTarget : undefined;
      await r.updateResolution(resolution);
      // Keep the idempotency selection request separate from the committed output fingerprint.
      await r.query(
        "UPDATE resolutions SET app_metadata=app_metadata || jsonb_build_object('outputDigest',$2::text,'commitTarget',$3::jsonb) WHERE id=$1",
        [id, digest, JSON.stringify(commitTarget)]
      );
      resolution.appMetadata.outputDigest = digest;
      resolution.appMetadata.commitTarget = commitTarget;
      if (typeof commitTarget === "string")
        await r.advanceHead(current.id, commitTarget);
      if (current.state !== "open") {
        await r.updateWindowState(current.id, "committing");
        await r.updateWindowState(current.id, "published");
      }
      await r.emit(current, "resolution_committed", {
        resolutionId: id,
        commitTarget,
      });
      return resolution;
    });
  }
  async failResolution(id: string, reason: string): Promise<Resolution> {
    text(reason, "failure reason");
    return this.withResolution(id, (r, resolution, w) =>
      this.failInTransaction(r, resolution, w, reason)
    );
  }
  private async failInTransaction(
    r: InteractionRepository,
    resolution: Resolution,
    w: InputWindow,
    reason: string
  ): Promise<Resolution> {
    if (resolution.status === "failed") return resolution;
    if (resolution.status === "committed")
      throw new InteractionError(
        "INVALID_STATE",
        "Committed resolution cannot fail"
      );
    await this.billing.lockReservations(r, resolution.selectedSubmissionIds);
    for (const sid of resolution.selectedSubmissionIds) {
      const s = requireValue(await r.getSubmission(sid, true), "Submission");
      await this.billing.releaseInTransaction(r, s, w, reason);
      await r.saveSubmission(s, "failed");
    }
    resolution.status = "failed";
    await r.updateResolution(resolution);
    if (w.state !== "open") await r.updateWindowState(w.id, "failed");
    await r.emit(w, "resolution_failed", {
      resolutionId: resolution.id,
      reason,
    });
    return resolution;
  }
  async cancelWindow(id: string): Promise<void> {
    await this.repository.transaction(async (r) => {
      const w = requireValue(await r.getWindow(id, true), "Window");
      if (w.state === "cancelled") return;
      if (!["scheduled", "open", "qualifying"].includes(w.state))
        throw new InteractionError(
          "INVALID_STATE",
          "Cannot cancel an executing window"
        );
      const active = await r.query(
        "SELECT id FROM resolutions WHERE window_id=$1 AND status IN ('selected','executing')",
        [id]
      );
      if (active.rows.length)
        throw new InteractionError(
          "RESOLUTION_IN_PROGRESS",
          "Fail the active resolution before cancellation"
        );
      const submissions = await r.listSubmissions(id);
      await this.billing.lockReservations(
        r,
        submissions.map((s) => s.id)
      );
      for (const s of submissions)
        if (
          [
            "received",
            "moderating",
            "awaiting_entitlement",
            "eligible",
          ].includes(s.status)
        ) {
          await this.billing.releaseInTransaction(r, s, w, "window_cancelled");
          await r.saveSubmission(s, "cancelled");
        }
      await r.updateWindowState(id, "cancelled");
    });
  }
  private async assertPayable(
    r: InteractionRepository,
    id: string
  ): Promise<void> {
    const reservation = requireValue(
      await this.billing.getReservation(id, r),
      "Reservation"
    );
    if (
      reservation.state !== "reserved" ||
      Date.parse(reservation.expiresAt) <= (await r.now())
    )
      throw new InteractionError(
        "RESERVATION_EXPIRED",
        "Reservation expired before preview"
      );
  }
  private async withResolution<T>(
    id: string,
    work: (
      r: InteractionRepository,
      value: Resolution,
      w: InputWindow
    ) => Promise<T>
  ): Promise<T> {
    return this.repository.transaction(async (r) => {
      const initial = requireValue(await r.getResolution(id), "Resolution");
      const w = requireValue(
        await r.getWindow(initial.windowId, true),
        "Window"
      );
      const value = requireValue(await r.getResolution(id), "Resolution");
      return work(r, value, w);
    });
  }
}
