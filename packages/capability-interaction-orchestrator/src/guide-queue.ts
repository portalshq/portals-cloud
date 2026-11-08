import type { InteractionRepository } from "./db/repository.js";
import type { ExternalBilling } from "./external-billing.js";
import type { ISubmissionGateway } from "./submission-gateway.js";
import type {
  BillingTerms,
  ContentRating,
  InputWindow,
  Submission,
} from "./types.js";
import { InteractionError, integer, text } from "./validation.js";

export interface EnsureGuideWindowInput {
  worldId: string;
  branchId: string;
  sessionId: string;
  /** Which configured guide event this queue belongs to. Default "default". */
  guideKey?: string;
  baseCommitHash?: string;
  billingTerms: BillingTerms;
  maxSubmissionsPerUser?: number;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
}

export interface OpenGuideWindowInput {
  worldId: string;
  branchId: string;
  sessionId: string;
  /** Which configured guide event to open. Default "default". */
  guideKey?: string;
  /** Narrative hook rendered on the client card (model-proposed or static). */
  theme?: string;
  durationSeconds: number;
  baseCommitHash?: string;
  billingTerms: BillingTerms;
  maxSubmissionsPerUser?: number;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
  appMetadata?: Record<string, unknown>;
}

export interface SubmitGuideInput {
  worldId: string;
  branchId: string;
  sessionId: string;
  /** Which configured guide event receives the submission. Default "default". */
  guideKey?: string;
  /** true → the standing always-open queue; false → the currently open
   *  scheduled window (WINDOW_CLOSED when none is open). */
  alwaysOpen: boolean;
  actorId: string;
  prompt: string;
  displayName?: string | null;
  idempotencyKey: string;
  billingTerms: BillingTerms;
  maxSubmissionsPerUser?: number;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
}

export interface GuideQueueItem {
  id: string;
  displayName: string | null;
  promptPreview: string;
  status: string;
  position: number;
}

export interface GuideQueueStatus {
  count: number;
  items: GuideQueueItem[];
}

const GUIDE_CLAIM_ATTEMPTS = 10;
const DEFAULT_GUIDE_KEY = "default";
/** Submission statuses that pin a closing guide window open: admission and
 *  billing settlement must finish before the window can publish. */
const IN_FLIGHT_SUBMISSION_STATUSES = ["received", "moderating", "awaiting_entitlement"];

function guideKeyOf(window: InputWindow): string {
  const key = window.appMetadata.guideKey;
  return typeof key === "string" && key.length > 0 ? key : DEFAULT_GUIDE_KEY;
}

function isGuideWindow(window: InputWindow): boolean {
  return window.appMetadata.guideQueue === true;
}

/**
 * Paid guides on the shared submission infrastructure.
 *
 * Two shapes share one FIFO claim path:
 *
 * - Always-open queues (`alwaysOpen` configs): one standing window per
 *   session and guide key accepts submissions at any time.
 * - Scheduled windows (interval- or model-driven configs): bounded
 *   `guideWindow` records that open on a trigger, emit `guide_opened`, and
 *   publish when their deadline passes. `admit` enforces `closesAt`, so a
 *   published window rejects new guides while its admitted submissions stay
 *   `eligible` for the claim sweep.
 *
 * Admission runs the normal moderation path and costs nothing; the charge
 * happens at claim, when the guide actually reaches a generation turn —
 * preserving charge-at-claim semantics. Claiming durably moves the
 * submission to `awaiting_entitlement` before the debit call, so a crash
 * cannot lose a paid guide or unclaim it into a second consumption, and the
 * idempotent debit (operation id = submission id) makes every retry safe.
 */
export class GuideQueue {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly billing: ExternalBilling,
    private readonly submissions?: ISubmissionGateway,
    private readonly onError: (error: unknown) => void = (error) =>
      console.error("[guide windows]", error),
  ) {}

  /** Find or create the standing always-open guide queue for a session. */
  async ensureWindow(input: EnsureGuideWindowInput): Promise<InputWindow> {
    const guideKey = input.guideKey ?? DEFAULT_GUIDE_KEY;
    text(guideKey, "guideKey");
    const existing = await this.openGuideWindows(input.worldId, input.sessionId);
    // Match on metadata, not conflictKey: windows opened before guide keys
    // existed carry `guides:<session>` keys but still belong to "default".
    const found = existing.find(
      (w) => w.appMetadata.guideWindow !== true && guideKeyOf(w) === guideKey && w.allowedInputKinds.includes("custom_prompt"),
    );
    if (found) return found;
    const conflictKey = `guides:${input.sessionId}:${guideKey}`;
    const window = await this.repository.createWindow({
      worldId: input.worldId,
      branchId: input.branchId,
      baseCommitHash: input.baseCommitHash ?? `guides:${input.sessionId}:${guideKey}`,
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
      appMetadata: { guideQueue: true, sessionId: input.sessionId, guideKey },
    });
    await this.repository.updateWindowState(window.id, "open");
    return { ...window, state: "open" };
  }

  /**
   * Open a scheduled guide window for a session. Returns the already-open
   * window when one exists for the same guide key — a racing timed/model
   * trigger loses here instead of double-opening.
   */
  async openWindow(input: OpenGuideWindowInput): Promise<InputWindow> {
    const guideKey = input.guideKey ?? DEFAULT_GUIDE_KEY;
    text(guideKey, "guideKey");
    integer(input.durationSeconds, "durationSeconds", 1);
    const existing = await this.findScheduledOpenWindow(input.worldId, input.sessionId, guideKey);
    if (existing) return existing;
    const prior = await this.repository.query(
      `SELECT COUNT(*)::int AS n FROM input_windows
       WHERE world_id=$1 AND app_metadata->>'sessionId'=$2 AND app_metadata->>'guideKey'=$3`,
      [input.worldId, input.sessionId, guideKey],
    );
    const sequence = Number(prior.rows[0].n) + 1;
    const now = Date.now();
    const closesAt = new Date(now + input.durationSeconds * 1000).toISOString();
    const window = await this.repository.createWindow({
      worldId: input.worldId,
      branchId: input.branchId,
      baseCommitHash: input.baseCommitHash ?? `guides:${input.sessionId}:${guideKey}`,
      conflictKey: `guides:${input.sessionId}:${guideKey}:${sequence}`,
      allowedInputKinds: ["custom_prompt"],
      arbitrationPolicy: "fifo",
      arbitrationPolicyConfig: {},
      billingPolicy: "prepaid_credits",
      billingTerms: { ...input.billingTerms, settle: "claim" },
      maxSubmissionsPerUser: input.maxSubmissionsPerUser ?? 10,
      maxSelectedInputs: 1,
      opensAt: new Date(now).toISOString(),
      closesAt,
      contentRating: input.contentRating ?? "E",
      moderationPolicyVersion: input.moderationPolicyVersion,
      rulesetVersion: input.rulesetVersion,
      appMetadata: {
        ...(input.appMetadata ?? {}),
        guideQueue: true,
        guideWindow: true,
        sessionId: input.sessionId,
        guideKey,
        ...(input.theme ? { theme: input.theme } : {}),
      },
    });
    await this.repository.updateWindowState(window.id, "open");
    const opened = { ...window, state: "open" as const };
    await this.repository.emit(opened, "guide_opened", {
      sessionId: input.sessionId,
      guideKey,
      ...(input.theme ? { theme: input.theme } : {}),
      closesAt,
      price: input.billingTerms.amountCredits,
    });
    return opened;
  }

  /** Submit a guide prompt to the standing queue or the open scheduled window. */
  async submit(input: SubmitGuideInput): Promise<Submission> {
    if (!this.submissions) {
      throw new InteractionError("INVALID_STATE", "Guide submission requires the submission gateway");
    }
    text(input.actorId, "actorId");
    text(input.prompt, "prompt");
    text(input.idempotencyKey, "idempotencyKey");
    const guideKey = input.guideKey ?? DEFAULT_GUIDE_KEY;
    let window: InputWindow;
    if (input.alwaysOpen) {
      window = await this.ensureWindow({
        worldId: input.worldId,
        branchId: input.branchId,
        sessionId: input.sessionId,
        guideKey,
        billingTerms: input.billingTerms,
        maxSubmissionsPerUser: input.maxSubmissionsPerUser,
        contentRating: input.contentRating,
        moderationPolicyVersion: input.moderationPolicyVersion,
        rulesetVersion: input.rulesetVersion,
      });
    } else {
      const open = await this.findScheduledOpenWindow(input.worldId, input.sessionId, guideKey);
      if (!open) {
        throw new InteractionError("WINDOW_CLOSED", "No guide window is open");
      }
      window = open;
    }
    return this.submissions.submitIntent({
      windowId: window.id,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      kind: "custom_prompt",
      payload: { prompt: input.prompt },
      appMetadata: input.displayName ? { displayName: input.displayName } : {},
    });
  }

  /**
   * Publish scheduled guide windows whose intake deadline passed and whose
   * submissions all finished admission. `admit` already rejects new guides on
   * `closesAt`, so publishing only retires the window record — admitted
   * submissions stay `eligible` for the claim path. Windows with in-flight
   * admissions stay `open` (still closed to new intake) until the next sweep.
   */
  async expireClosed(worldId: string): Promise<number> {
    text(worldId, "worldId");
    const rows = await this.repository.query(
      `SELECT w.id FROM input_windows w
       WHERE w.world_id=$1 AND w.state='open' AND w.closes_at IS NOT NULL
         AND w.closes_at <= clock_timestamp()
         AND w.app_metadata->>'guideWindow'='true'
         AND NOT EXISTS (
           SELECT 1 FROM submissions s
           WHERE s.window_id=w.id AND s.status = ANY($2::text[])
         )
       LIMIT 50`,
      [worldId, IN_FLIGHT_SUBMISSION_STATUSES],
    );
    let published = 0;
    for (const row of rows.rows) {
      try {
        await this.repository.updateWindowState(String(row.id), "published");
        published += 1;
      } catch (cause) {
        this.onError(cause);
      }
    }
    return published;
  }

  /** Live FIFO story-guide queue snapshot for the session. */
  async queueStatus(worldId: string, sessionId: string): Promise<GuideQueueStatus> {
    text(worldId, "worldId");
    text(sessionId, "sessionId");
    const rows = await this.repository.query(
      `SELECT s.id, s.status, s.app_metadata->>'displayName' AS display_name, s.payload->>'prompt' AS prompt
       FROM submissions s
       JOIN input_windows w ON w.id = s.window_id
       WHERE w.world_id = $1
         AND w.app_metadata->>'guideQueue' = 'true'
         AND w.app_metadata->>'sessionId' = $2
         AND w.state IN ('open', 'published')
         AND s.status IN ('executing', 'eligible', 'received')
       ORDER BY CASE WHEN s.status = 'executing' THEN 0 ELSE 1 END, s.admitted_at ASC
       LIMIT 5`,
      [worldId, sessionId],
    );
    const list = rows.rows;
    return {
      count: list.length,
      items: list.map((row, idx) => ({
        id: String(row.id ?? `q-${idx}`),
        displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : null,
        promptPreview: String(row.prompt ?? "").slice(0, 60),
        status: String(row.status ?? "eligible"),
        position: idx + 1,
      })),
    };
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
    return this.claimOldest(
      async () => {
        const rows = await this.repository.query(
          `SELECT id FROM submissions WHERE window_id=$1 AND status='eligible' ORDER BY admission_sequence, id LIMIT 1`,
          [windowId],
        );
        return rows.rows[0] ? this.repository.getSubmission(String(rows.rows[0].id)) : null;
      },
      attempts,
    );
  }

  /**
   * Claim and charge the oldest eligible guide across every guide window of
   * the session — standing queues and scheduled windows drain into one FIFO.
   */
  async claimNextForSession(worldId: string, sessionId: string, attempts = GUIDE_CLAIM_ATTEMPTS): Promise<Submission | null> {
    text(worldId, "worldId");
    text(sessionId, "sessionId");
    integer(attempts, "attempts", 1, 100);
    return this.claimOldest(
      async () => {
        const rows = await this.repository.query(
          `SELECT s.id FROM submissions s
           JOIN input_windows w ON w.id = s.window_id
           WHERE w.world_id=$1 AND w.app_metadata->>'guideQueue'='true'
             AND w.app_metadata->>'sessionId'=$2 AND s.status='eligible'
           ORDER BY s.admitted_at, s.id LIMIT 1`,
          [worldId, sessionId],
        );
        return rows.rows[0] ? this.repository.getSubmission(String(rows.rows[0].id)) : null;
      },
      attempts,
    );
  }

  private async claimOldest(
    findOldest: () => Promise<Submission | null>,
    attempts: number,
  ): Promise<Submission | null> {
    for (let i = 0; i < attempts; i += 1) {
      const candidate = await findOldest();
      if (!candidate) return null;
      const claimed = await this.repository.withSubmission(
        candidate.id,
        async (r, s) => {
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

  /** Mark a charged guide consumed by a generation turn. */
  async complete(submissionId: string): Promise<void> {
    text(submissionId, "submissionId");
    await this.repository.withSubmission(submissionId, async (r, s) => {
      if (s.status === "executing") await r.saveSubmission(s, "fulfilled");
    });
  }

  private async openGuideWindows(worldId: string, sessionId: string): Promise<InputWindow[]> {
    const windows = await this.repository.listWindows(worldId, "open");
    return windows.filter((w) => isGuideWindow(w) && w.appMetadata.sessionId === sessionId);
  }

  private async findScheduledOpenWindow(worldId: string, sessionId: string, guideKey: string): Promise<InputWindow | null> {
    const windows = await this.openGuideWindows(worldId, sessionId);
    return windows.find((w) => w.appMetadata.guideWindow === true && guideKeyOf(w) === guideKey) ?? null;
  }
}
