/** Minimal database interface for the shared central program-follow store. */
export interface ProgramFollowsDatabase {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Follows represent an app relationship and do not enable email. */
export class ProgramFollowsStore {
  constructor(private readonly db: ProgramFollowsDatabase) {}

  async follow(userId: string, programId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO program_follows (user_id, program_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active')
       ON CONFLICT (user_id, program_id) DO NOTHING`,
      [userId, programId],
    );
  }

  async unfollow(userId: string, programId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM program_follows WHERE user_id = $1 AND program_id = $2`,
      [userId, programId],
    );
  }

  async list(userId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT program_id FROM program_follows WHERE user_id = $1
       AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active') ORDER BY created_at, program_id`,
      [userId],
    );
    return result.rows.map((row) => String(row.program_id));
  }
}
