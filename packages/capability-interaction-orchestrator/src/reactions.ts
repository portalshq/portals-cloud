import { randomUUID } from "node:crypto";
import type { InteractionRepository } from "./db/repository.js";
import type { InteractionMetrics } from "./metrics.js";
import { noopMetrics } from "./metrics.js";
import { integer, InteractionError, text } from "./validation.js";

export const REACTION_EMOTIONS = ["love", "laugh", "fire", "sad", "angry"] as const;
export type ReactionEmotion = (typeof REACTION_EMOTIONS)[number];

export interface Reaction {
  id: string;
  seq: number;
  worldId: string;
  sessionId: string | null;
  actorId: string;
  emotion: ReactionEmotion;
  eventId: string | null;
  createdAt: string;
}

export interface RecordReactionInput {
  worldId: string;
  actorId: string;
  sessionId?: string;
  emotion: string;
  /** Current event id; absent → attributed to the world's most recent event. */
  eventId?: string;
}

export interface ReactionOptions {
  /** Max reactions per (actor, session) per windowMs. */
  maxPerWindow?: number;
  windowMs?: number;
  metrics?: InteractionMetrics;
}

const DEFAULT_MAX_PER_WINDOW = 30;
const DEFAULT_WINDOW_MS = 60_000;

function reactionFromRow(r: Record<string, unknown>): Reaction {
  return {
    id: String(r.id),
    seq: Number(r.seq),
    worldId: String(r.world_id),
    sessionId: r.session_id === null ? null : String(r.session_id),
    actorId: String(r.actor_id),
    emotion: r.emotion as ReactionEmotion,
    eventId: r.event_id === null ? null : String(r.event_id),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

/**
 * Free-form viewer reactions, available throughout viewing — no input window
 * is required. All identifiers and timestamps are server-authoritative; the
 * client supplies only an emotion from the fixed enum.
 *
 * Ingestion is bounded by a per-(actor, session) rate limit enforced with a
 * counting query rather than an unbounded in-memory buffer: an over-limit
 * caller gets a retryable RATE_LIMITED error instead of queue time.
 */
export class ReactionGateway {
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly metrics: InteractionMetrics;
  constructor(
    private readonly repository: InteractionRepository,
    options: ReactionOptions = {},
  ) {
    this.maxPerWindow = options.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.metrics = options.metrics ?? noopMetrics;
    integer(this.maxPerWindow, "maxPerWindow", 1);
    integer(this.windowMs, "windowMs", 1000);
  }

  async record(input: RecordReactionInput): Promise<Reaction> {
    text(input.worldId, "worldId");
    text(input.actorId, "actorId");
    if (!(REACTION_EMOTIONS as readonly string[]).includes(input.emotion)) {
      throw new InteractionError("INVALID_INPUT", `emotion must be one of ${REACTION_EMOTIONS.join(", ")}`);
    }
    if (input.sessionId !== undefined) text(input.sessionId, "sessionId");
    if (input.eventId !== undefined) text(input.eventId, "eventId", 128);
    return this.repository.transaction(async (r) => {
      const rate = await r.query(
        `SELECT COUNT(*)::int AS n FROM interaction_reactions
         WHERE actor_id=$1 AND COALESCE(session_id,'') = COALESCE($2,'')
           AND created_at > clock_timestamp() - ($3::text || ' milliseconds')::interval`,
        [input.actorId, input.sessionId ?? null, String(this.windowMs)],
      );
      if (Number(rate.rows[0].n) >= this.maxPerWindow) {
        this.metrics.increment("interaction.reaction.rate_limited", { world: input.worldId });
        throw new InteractionError("RATE_LIMITED", "Too many reactions — slow down and retry");
      }
      const eventId =
        input.eventId ??
        (await r.query(
          "SELECT id FROM interaction_outbox WHERE world_id=$1 ORDER BY sequence DESC LIMIT 1",
          [input.worldId],
        )).rows[0]?.id ??
        null;
      const result = await r.query(
        `INSERT INTO interaction_reactions(id,world_id,session_id,actor_id,emotion,event_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), input.worldId, input.sessionId ?? null, input.actorId, input.emotion, eventId],
      );
      const reaction = reactionFromRow(result.rows[0]);
      await r.publishEvent({
        worldId: input.worldId,
        eventType: "reaction_recorded",
        data: { reactionId: reaction.id, emotion: reaction.emotion },
        occurredAt: reaction.createdAt,
      });
      this.metrics.increment("interaction.reaction.recorded", { world: input.worldId });
      return reaction;
    });
  }

  /** World-scoped retrieval for authorized callers. */
  async list(worldId: string, options: { afterSeq?: number; limit?: number } = {}): Promise<Reaction[]> {
    text(worldId, "worldId");
    integer(options.afterSeq ?? 0, "afterSeq", 0);
    integer(options.limit ?? 100, "limit", 1, 1000);
    const result = await this.repository.query(
      "SELECT * FROM interaction_reactions WHERE world_id=$1 AND seq>$2 ORDER BY seq LIMIT $3",
      [worldId, options.afterSeq ?? 0, options.limit ?? 100],
    );
    return result.rows.map(reactionFromRow);
  }

  /** Retention: delete a world's reactions older than `olderThanMs`. Scoped delete; returns the count removed. */
  async prune(worldId: string, olderThanMs: number): Promise<number> {
    text(worldId, "worldId");
    integer(olderThanMs, "olderThanMs", 1);
    const result = await this.repository.query(
      "DELETE FROM interaction_reactions WHERE world_id=$1 AND created_at < clock_timestamp() - ($2::text || ' milliseconds')::interval",
      [worldId, String(olderThanMs)],
    );
    return result.rowCount ?? (result as { affectedRows?: number }).affectedRows ?? 0;
  }
}
