import { randomUUID } from "node:crypto";
import type { InteractionRepository } from "./db/repository.js";
import type { InteractionMetrics } from "./metrics.js";
import { noopMetrics } from "./metrics.js";
import { integer, record, requireValue, text } from "./validation.js";

/** A choice winner (or any narrative input) waiting for the next generation. */
export interface NarrativeHandoff {
  id: string;
  worldId: string;
  windowId: string;
  resolutionId: string;
  /** Server-authored option: stable PX URI or server prop id + canonical description. */
  option: Record<string, unknown>;
  state: "pending" | "claimed" | "done" | "dead";
  claimedAt?: string;
  createdAt: string;
}

function handoffFromRow(r: Record<string, unknown>): NarrativeHandoff {
  return {
    id: String(r.id),
    worldId: String(r.world_id),
    windowId: String(r.window_id),
    resolutionId: String(r.resolution_id),
    option: r.option as Record<string, unknown>,
    state: r.state as NarrativeHandoff["state"],
    claimedAt: r.claimed_at ? new Date(String(r.claimed_at)).toISOString() : undefined,
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

const DEFAULT_VISIBILITY_TIMEOUT_MS = 300_000;

/** pg reports `rowCount`; PGlite reports `affectedRows`. */
function affected(result: { rowCount?: number | null; affectedRows?: number }): number {
  return result.rowCount ?? result.affectedRows ?? 0;
}

/**
 * Durable, ordered handoff of narrative inputs to production generation.
 *
 * A resolution enqueues the winner inside its own transaction, so the choice
 * outcome and the handoff commit or roll back together. Generation claims the
 * oldest pending row exactly once via a conditional UPDATE … FOR UPDATE SKIP
 * LOCKED — concurrent claimants never see the same row, and a process crash
 * after claiming is repaired by the visibility timeout, which makes the row
 * claimable again. `ack` marks the input consumed; `fail` retires it without
 * retry — generated content is never retried for a missed choice.
 */
export class NarrativeHandoffQueue {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly metrics: InteractionMetrics = noopMetrics,
  ) {}

  async enqueue(
    r: InteractionRepository,
    input: { worldId: string; windowId: string; resolutionId: string; option: Record<string, unknown> },
  ): Promise<NarrativeHandoff> {
    text(input.worldId, "worldId");
    text(input.windowId, "windowId");
    text(input.resolutionId, "resolutionId");
    record(input.option, "handoff option");
    const result = await r.query(
      `INSERT INTO interaction_narrative_handoffs(id,world_id,window_id,resolution_id,option,state)
       VALUES($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [randomUUID(), input.worldId, input.windowId, input.resolutionId, JSON.stringify(input.option)],
    );
    return handoffFromRow(result.rows[0]);
  }

  /** Claim the oldest unclaimed input for a world. Null when none is due. */
  async claimNext(
    worldId: string,
    options: { visibilityTimeoutMs?: number } = {},
  ): Promise<{ token: string; handoff: NarrativeHandoff } | null> {
    text(worldId, "worldId");
    integer(options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS, "visibilityTimeoutMs", 1);
    const token = randomUUID();
    const result = await this.repository.query(
      `UPDATE interaction_narrative_handoffs SET state='claimed', claim_token=$2, claimed_at=now()
       WHERE id = (
         SELECT id FROM interaction_narrative_handoffs
         WHERE world_id=$1 AND (state='pending' OR (state='claimed' AND claimed_at < now() - ($3::text || ' milliseconds')::interval))
         ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING *`,
      [worldId, token, String(options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS)],
    );
    const row = result.rows[0];
    if (!row) return null;
    const handoff = handoffFromRow(row);
    this.metrics.observe(
      "interaction.handoff.pending_age_ms",
      Date.now() - Date.parse(handoff.createdAt),
      { world: worldId },
    );
    return { token, handoff };
  }

  /** Mark a claimed input consumed by a generation turn. */
  async ack(id: string, token: string): Promise<void> {
    text(token, "claim token");
    const result = await this.repository.query(
      "UPDATE interaction_narrative_handoffs SET state='done' WHERE id=$1 AND claim_token=$2 AND state='claimed'",
      [id, token],
    );
    if (!affected(result)) {
      throw new Error("Handoff is not claimed by this token");
    }
  }

  /** Retire a claimed input without consuming it (generation will not retry it). */
  async fail(id: string, token: string): Promise<void> {
    text(token, "claim token");
    const result = await this.repository.query(
      "UPDATE interaction_narrative_handoffs SET state='dead' WHERE id=$1 AND claim_token=$2 AND state='claimed'",
      [id, token],
    );
    if (!affected(result)) {
      throw new Error("Handoff is not claimed by this token");
    }
  }

  async list(worldId: string, state?: NarrativeHandoff["state"]): Promise<NarrativeHandoff[]> {
    text(worldId, "worldId");
    const result = await this.repository.query(
      "SELECT * FROM interaction_narrative_handoffs WHERE world_id=$1 AND ($2::text IS NULL OR state=$2) ORDER BY created_at, id LIMIT 200",
      [worldId, state ?? null],
    );
    return result.rows.map(handoffFromRow);
  }

  async get(id: string): Promise<NarrativeHandoff | null> {
    const result = await this.repository.query(
      "SELECT * FROM interaction_narrative_handoffs WHERE id=$1",
      [id],
    );
    return result.rows[0] ? handoffFromRow(result.rows[0]) : null;
  }
}

export function requireHandoff(value: { token: string; handoff: NarrativeHandoff } | null): { token: string; handoff: NarrativeHandoff } {
  return requireValue(value, "NarrativeHandoff");
}
