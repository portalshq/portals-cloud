import { randomUUID } from "node:crypto";
import { resolveCollectiveChoice, type ChoiceOption } from "./collective-choice.js";
import type { InteractionRepository } from "./db/repository.js";
import type { NarrativeHandoffQueue } from "./narrative-handoff.js";
import type { InteractionMetrics } from "./metrics.js";
import { noopMetrics } from "./metrics.js";
import type {
  BillingTerms,
  ContentRating,
  InputWindow,
  Resolution,
} from "./types.js";
import {
  InteractionError,
  integer,
  json,
  record,
  requireValue,
  text,
} from "./validation.js";

/** One server-authored option in a viewer collective choice. */
export interface ChoiceOptionDescriptor extends ChoiceOption {
  /** Concise canonical description handed to generation. */
  description?: string;
  /** Stable PX URI for existing entities, or a server-created prop identity. */
  pxUri?: string;
  /** True for a prop created by this product (guide- or model-introduced). */
  createdProp?: boolean;
}

export interface OpenChoiceInput {
  worldId: string;
  branchId: string;
  baseCommitHash?: string;
  sessionId?: string;
  options: readonly ChoiceOptionDescriptor[];
  durationSeconds: number;
  /** Billing terms when the vote costs credits. Omit or amountCredits 0 for a free vote. */
  billingTerms?: BillingTerms;
  conflictKey?: string;
  contentRating?: ContentRating;
  moderationPolicyVersion?: string;
  rulesetVersion?: string;
  appMetadata?: Record<string, unknown>;
}

export type ChoiceResolutionResult =
  | { status: "open"; windowId: string }
  | { status: "pending"; windowId: string; pendingSubmissionIds: string[] }
  | { status: "resolved"; windowId: string; resolution: Resolution; winner: ChoiceOption | null };

export function validateChoiceOptions(options: readonly ChoiceOptionDescriptor[]): ChoiceOptionDescriptor[] {
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    throw new InteractionError("INVALID_INPUT", "A choice requires two to six options");
  }
  const seen = new Set<string>();
  return options.map((option, index) => {
    record(option, `choice option ${index}`);
    text(option.id, `choice option ${index} id`, 512);
    text(option.name, `choice option ${index} name`, 200);
    if (option.kind !== "character" && option.kind !== "prop") {
      throw new InteractionError("INVALID_INPUT", `choice option ${index} kind must be character or prop`);
    }
    if (seen.has(option.id)) {
      throw new InteractionError("INVALID_INPUT", `Duplicate choice option id: ${option.id}`);
    }
    seen.add(option.id);
    if (option.description !== undefined) text(option.description, `choice option ${index} description`, 1000);
    if (option.pxUri !== undefined) {
      text(option.pxUri, `choice option ${index} pxUri`, 512);
      if (!/^px:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(option.pxUri)) {
        throw new InteractionError("INVALID_INPUT", `choice option ${index} pxUri is malformed`);
      }
    }
    if (option.createdProp !== undefined && typeof option.createdProp !== "boolean") {
      throw new InteractionError("INVALID_INPUT", `choice option ${index} createdProp must be boolean`);
    }
    return {
      id: option.id,
      kind: option.kind,
      name: option.name,
      ...(option.description !== undefined ? { description: option.description } : {}),
      ...(option.pxUri !== undefined ? { pxUri: option.pxUri } : {}),
      ...(option.createdProp === true ? { createdProp: true } : {}),
    };
  });
}

const PENDING_STATUSES = new Set(["received", "moderating", "awaiting_entitlement"]);
const CHOICE_RESOLUTION_KEY = "choice";

/**
 * Collective choice lifecycle: open a disclosed, time-bounded vote and resolve
 * it into one winner handed to the next generation.
 *
 * The server owns option content, timing, price and eligibility; the browser
 * only supplies a ballot. Resolution waits for every admitted submission to
 * reach a definitive billing result, so a vote admitted before the deadline is
 * counted after its debit confirms — or rejected without charge — and the
 * window records exactly one winner (random among ties, none when empty).
 */
export class ChoiceCoordinator {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly handoffs: NarrativeHandoffQueue,
    private readonly metrics: InteractionMetrics = noopMetrics,
  ) {}

  async openChoice(input: OpenChoiceInput): Promise<InputWindow> {
    const options = validateChoiceOptions(input.options);
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
      throw new InteractionError("INVALID_INPUT", "durationSeconds must be positive");
    }
    const paid = (input.billingTerms?.amountCredits ?? 0) > 0;
    const now = new Date();
    const window = await this.repository.createWindow({
      worldId: input.worldId,
      branchId: input.branchId,
      baseCommitHash: input.baseCommitHash ?? `choice:${now.toISOString()}`,
      conflictKey: input.conflictKey ?? `choice:${input.sessionId ?? "main"}`,
      allowedInputKinds: ["vote"],
      arbitrationPolicy: "collective_choice",
      arbitrationPolicyConfig: {},
      billingPolicy: paid ? "prepaid_credits" : "free",
      billingTerms: input.billingTerms
        ? { ...input.billingTerms, settle: "admission" }
        : undefined,
      maxSubmissionsPerUser: 1,
      maxSelectedInputs: 1,
      opensAt: now.toISOString(),
      closesAt: new Date(now.getTime() + input.durationSeconds * 1000).toISOString(),
      contentRating: input.contentRating ?? "E",
      moderationPolicyVersion: input.moderationPolicyVersion,
      rulesetVersion: input.rulesetVersion,
      appMetadata: {
        ...(input.appMetadata ?? {}),
        choiceOptions: options,
        sessionId: input.sessionId,
      },
    });
    await this.repository.updateWindowState(window.id, "open");
    await this.repository.emit(
      { ...window, state: "open" },
      "choice_opened",
      { options, price: input.billingTerms?.amountCredits ?? 0, closesAt: window.closesAt },
    );
    return { ...window, state: "open" };
  }

  /** The options a window was opened with (server-authoritative). */
  optionsFor(w: InputWindow): ChoiceOptionDescriptor[] {
    const options = w.appMetadata.choiceOptions;
    if (!Array.isArray(options)) {
      throw new InteractionError("INVALID_STATE", "Window carries no choice options");
    }
    return options as ChoiceOptionDescriptor[];
  }

  /**
   * Resolve a closed choice window into one durable winner.
   *
   * - An open window past its deadline is closed first.
   * - Admitted submissions still pending billing hold the resolution in
   *   `pending` — a billing outage is visible, never silently resolved over.
   * - The resolution, winner, complete tally, ballot outcomes and the
   *   narrative handoff commit atomically; a retried call replays to the
   *   stored resolution via the `choice:<windowId>` idempotency key.
   */
  async resolveChoice(windowId: string): Promise<ChoiceResolutionResult> {
    text(windowId, "windowId");
    return this.repository.transaction(async (r) => {
      const w = requireValue(await r.getWindow(windowId, true), "Window");
      const key = `${CHOICE_RESOLUTION_KEY}:${windowId}`;
      const existing = await r.findResolution(windowId, key, {});
      if (existing) {
        const choice = existing.appMetadata.choice as { winner?: ChoiceOption } | undefined;
        return { status: "resolved", windowId, resolution: existing, winner: choice?.winner ?? null };
      }
      const now = await r.now();
      if (w.state === "open" && w.closesAt !== null && Date.parse(w.closesAt) <= now) {
        await r.updateWindowState(windowId, "qualifying");
        return this.resolveChoice(windowId);
      }
      if (w.state === "open") return { status: "open", windowId };
      if (w.state !== "qualifying") {
        throw new InteractionError("INVALID_STATE", `Cannot resolve a ${w.state} window`);
      }
      const submissions = await r.listSubmissions(windowId);
      const pending = submissions.filter((s) => PENDING_STATUSES.has(s.status));
      if (pending.length) {
        return {
          status: "pending",
          windowId,
          pendingSubmissionIds: pending.map((s) => s.id),
        };
      }
      const options = this.optionsFor(w);
      const validIds = new Set(options.map((option) => option.id));
      const eligible = submissions.filter((s) => s.status === "eligible");
      const ballotsByActor = new Map<string, string>();
      const invalidBallots: string[] = [];
      for (const s of [...eligible].sort((a, b) => a.admissionSequence - b.admissionSequence)) {
        const optionId = String(s.payload.option ?? s.payload.targetId ?? "");
        if (!validIds.has(optionId)) {
          invalidBallots.push(s.id);
          continue;
        }
        if (!ballotsByActor.has(s.actorId)) ballotsByActor.set(s.actorId, optionId);
      }
      const ballots = [...ballotsByActor.entries()].map(([actorId, optionId]) => ({ actorId, optionId }));
      const tally = [...ballotsByActor.values()].reduce<Map<string, number>>((map, optionId) => {
        map.set(optionId, (map.get(optionId) ?? 0) + 1);
        return map;
      }, new Map());
      const resolved = resolveCollectiveChoice(options, ballots);
      const resolution = await r.createResolution(
        {
          id: randomUUID(),
          windowId,
          selectedSubmissionIds: [],
          rejectedSubmissionIds: [],
          arbitrationPolicy: "collective_choice",
          policyVersion: "1.0.0",
          resolutionSequence: 0,
          baseCommitHash: w.baseCommitHash,
          status: "committed",
          appMetadata: {
            choice: {
              options,
              tally: [...tally.entries()].map(([optionId, votes]) => ({ optionId, votes })),
              winner: resolved?.winner ?? null,
              ballotCount: ballots.length,
            },
          },
        },
        key,
        {},
      );
      // Choice resolutions are terminal on creation: the winner and tally are
      // already recorded and ballots are never executed individually.
      resolution.status = "committed";
      await r.updateResolution(resolution);
      for (const s of eligible) await r.saveSubmission(s, "fulfilled");
      for (const id of invalidBallots) {
        const s = await r.getSubmission(id, true);
        if (s) await r.saveSubmission(s, "rejected");
      }
      if (resolved) {
        const winner = options.find((option) => option.id === resolved.winner.id)!;
        await this.handoffs.enqueue(r, {
          worldId: w.worldId,
          windowId,
          resolutionId: resolution.id,
          option: winner as unknown as Record<string, unknown>,
        });
        await this.recordSelections(r, w.worldId, options);
      }
      for (const state of ["resolving", "executing", "committing", "published"] as const) {
        await r.updateWindowState(windowId, state);
      }
      await r.emit(w, "choice_resolved", {
        resolutionId: resolution.id,
        winner: resolved?.winner ?? null,
        tally: [...tally.entries()].map(([optionId, votes]) => ({ optionId, votes })),
        ballotCount: ballots.length,
      });
      this.metrics.observe(
        "interaction.choice.resolution_delay_ms",
        Date.now() - (w.closesAt ? Date.parse(w.closesAt) : now),
        { world: w.worldId },
      );
      return { status: "resolved", windowId, resolution, winner: resolved?.winner ?? null };
    });
  }

  /** Persist per-option offer counts so weighted candidate selection survives restarts. */
  private async recordSelections(
    r: InteractionRepository,
    worldId: string,
    options: readonly ChoiceOptionDescriptor[],
  ): Promise<void> {
    for (const option of options) {
      await r.query(
        `INSERT INTO interaction_selection_counts(world_id, option_ref, count) VALUES($1,$2,1)
         ON CONFLICT(world_id, option_ref) DO UPDATE SET count=interaction_selection_counts.count+1, updated_at=now()`,
        [worldId, option.pxUri ?? option.id],
      );
    }
  }

  /** Offer counts keyed by `pxUri ?? id`, for `weightedChoices` candidates. */
  async getOptionSelectionCounts(worldId: string): Promise<Map<string, number>> {
    text(worldId, "worldId");
    const result = await this.repository.query(
      "SELECT option_ref, count FROM interaction_selection_counts WHERE world_id=$1",
      [worldId],
    );
    return new Map(result.rows.map((row) => [String(row.option_ref), Number(row.count)]));
  }
}

/** A model-produced proposal validated to the server-owned option set. */
export function validateChoiceProposal(proposal: unknown): ChoiceOptionDescriptor[] {
  record(proposal, "choice proposal");
  const options = (proposal as { options?: unknown }).options;
  if (!Array.isArray(options)) {
    throw new InteractionError("INVALID_INPUT", "Choice proposal requires an options array");
  }
  json(options, "choice proposal options");
  return validateChoiceOptions(options as ChoiceOptionDescriptor[]);
}
