import {
  INACTIVE_ACCOUNT_ERROR,
  type AudienceIdentity, type ChannelHistoryEntry, type ChannelInteraction, type IdentityStore,
} from "./identity-provider.js";

/** Minimal shape of `pg.Pool`, so the published types need no pg typings. */
export interface QueryRunner {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: Array<Record<string, unknown>> }>;
}

export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly pool: QueryRunner) {}

  async getIdentity(userId: string): Promise<AudienceIdentity | undefined> {
    const result = await this.pool.query(
      "SELECT id, display_name FROM application_users WHERE id = $1 AND status = 'active'",
      [userId],
    );
    const row = result.rows[0];
    return row ? { userId: String(row.id), displayName: String(row.display_name) } : undefined;
  }

  /**
   * The active-account check and the write are one statement, so a suspension
   * can never land between them. GREATEST keeps the newest interaction when
   * concurrent transactions commit out of order.
   */
  async recordInteraction(userId: string, interaction: ChannelInteraction): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO application_user_channel_history (user_id, channel_id, session_id, last_interaction_at)
       SELECT $1, $2, $3, now()
       WHERE EXISTS (SELECT 1 FROM application_users WHERE id = $1 AND status = 'active')
       ON CONFLICT (user_id, channel_id, session_id) DO UPDATE
       SET last_interaction_at = GREATEST(application_user_channel_history.last_interaction_at, EXCLUDED.last_interaction_at)`,
      [userId, interaction.channelId, interaction.sessionId],
    );
    if (!result.rowCount) throw new Error(INACTIVE_ACCOUNT_ERROR);
  }

  async getHistory(userId: string, limit: number): Promise<readonly ChannelHistoryEntry[]> {
    const result = await this.pool.query(
      `SELECT channel_id, session_id, last_interaction_at
       FROM application_user_channel_history
       WHERE user_id = $1 ORDER BY last_interaction_at DESC LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(historyFromRow);
  }
}

function historyFromRow(row: Record<string, unknown>): ChannelHistoryEntry {
  return {
    channelId: String(row.channel_id),
    sessionId: String(row.session_id),
    lastInteractionAt: new Date(row.last_interaction_at as string | number | Date).toISOString(),
  };
}
