/**
 * Central database identity store.
 *
 * This store is for central Portals identity data (users table in central database).
 * For app-specific user data, use ApplicationIdentityStore.
 *
 * The central database contains cross-app identity data shared across all Portals applications.
 */
import {
  INACTIVE_ACCOUNT_ERROR,
  type AudienceIdentity,
  type ChannelHistoryEntry,
  type ChannelInteraction,
  type SyncableIdentityStore,
} from "./identity-provider.js";

import type { QueryRunner } from "./postgres-store.js";

/**
 * Central database identity store.
 *
 * This store queries the central database users table for cross-app identity.
 * The central database schema is defined in central-schema.sql.
 */
export class CentralIdentityStore implements SyncableIdentityStore {
  constructor(private readonly pool: QueryRunner) {}

  async getIdentity(userId: string): Promise<AudienceIdentity | undefined> {
    const result = await this.pool.query(
      `SELECT u.id, u.display_name, u.email,
       (SELECT jsonb_object_agg(key, value) FROM user_preferences WHERE user_id = u.id) AS preferences
       FROM users u WHERE id = $1 AND status = 'active'`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    return {
      userId: String(row.id),
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      preferences: row.preferences ? (row.preferences as Record<string, unknown>) : undefined,
    };
  }

  /**
   * Record interaction in central database channel history.
   *
   * The active-account check and write share one PostgreSQL statement snapshot.
   * GREATEST keeps the newest interaction when
   * concurrent transactions commit out of order.
   */
  async recordInteraction(userId: string, interaction: ChannelInteraction): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO user_channel_history (user_id, channel_id, session_id, last_interaction_at)
       SELECT $1, $2, $3, now()
       WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active')
       ON CONFLICT (user_id, channel_id, session_id) DO UPDATE
       SET last_interaction_at = GREATEST(user_channel_history.last_interaction_at, EXCLUDED.last_interaction_at)`,
      [userId, interaction.channelId, interaction.sessionId],
    );
    if (!result.rowCount) throw new Error(INACTIVE_ACCOUNT_ERROR);
  }

  async getHistory(userId: string, limit: number): Promise<readonly ChannelHistoryEntry[]> {
    const result = await this.pool.query(
      `SELECT channel_id, session_id, last_interaction_at
       FROM user_channel_history
       WHERE user_id = $1 ORDER BY last_interaction_at DESC LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(historyFromRow);
  }

  /**
   * Update user information in central database.
   *
   * This is used by syncFromAuthGateway to update user data from auth-gateway.
   * Note: Auth-gateway only provides user_id and display_name. Email and
   * preferences must be managed by the application.
   */
  async syncFromAuthGateway(userId: string, displayName: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, display_name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`,
      [userId, displayName],
    );
  }

  async updateUserInfo(userId: string, displayName: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1",
      [userId, displayName],
    );
  }
}

function historyFromRow(row: Record<string, unknown>): ChannelHistoryEntry {
  return {
    channelId: String(row.channel_id),
    sessionId: String(row.session_id),
    lastInteractionAt: new Date(row.last_interaction_at as string | number | Date).toISOString(),
  };
}
