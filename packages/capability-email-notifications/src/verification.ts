import { createHash, randomBytes } from "node:crypto";
import type { PreferencesDatabase } from "./preferences.js";
import { validateTimeZone } from "./schedule.js";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export interface VerificationIntent {
  programId: string;
  episode: boolean;
  weekly: boolean;
  generalSchedule: boolean;
  source: string;
  timezone?: string;
  attribution: Record<string, string>;
}

/** Mailbox proof tokens are one-time, expire, and are never stored in plaintext. */
export class EmailVerificationStore {
  constructor(private readonly db: PreferencesDatabase) {}

  async issue(email: string, userId: string | null, now = new Date(), intent?: VerificationIntent): Promise<string> {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Invalid email");
    const token = randomBytes(32).toString("base64url");
    const expiry = new Date(now.getTime() + 30 * 60_000);
    await this.db.query(
      `INSERT INTO notification_email_verifications (token_hash, email, user_id, expires_at, intent)
       VALUES ($1, $2, $3, $4, $5::jsonb)`, [digest(token), normalized, userId, expiry, intent ? JSON.stringify(intent) : null],
    );
    return token;
  }

}

export interface VerificationTransaction extends PreferencesDatabase {
  release(): void;
}
export interface VerificationPool {
  connect(): Promise<VerificationTransaction>;
}

/**
 * Consume a mailbox proof and associate its recipient atomically. A verified
 * address already attached to another account is never reassigned. Suppression
 * and existing program choices survive linking.
 */
export async function claimVerifiedEmail(
  pool: VerificationPool, token: string, timeZone: string, now = new Date(), currentUserId: string | null = null,
): Promise<{ recipientId: string; email: string; userId: string | null; hasIntent: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const zone = validateTimeZone(timeZone);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proof = await client.query(
      `SELECT v.email, v.user_id, v.intent FROM notification_email_verifications v
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.token_hash = $1 AND v.consumed_at IS NULL AND v.expires_at > $2
         AND (v.user_id IS NULL OR u.status = 'active') FOR UPDATE OF v`,
      [digest(token), now],
    );
    const row = proof.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    const email = String(row.email);
    const userId = row.user_id == null ? null : String(row.user_id);
    if (userId && userId !== currentUserId) throw Object.assign(new Error("Sign in to the account that requested this confirmation"), { code: "AUTH_REQUIRED" });
    const recipient = await client.query(
      `INSERT INTO notification_recipients (email, user_id, timezone, verified_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(email)) DO UPDATE SET
         user_id = COALESCE(notification_recipients.user_id, EXCLUDED.user_id),
         timezone = EXCLUDED.timezone, verified_at = EXCLUDED.verified_at, updated_at = $4
       WHERE notification_recipients.user_id IS NULL OR EXCLUDED.user_id IS NULL
          OR notification_recipients.user_id = EXCLUDED.user_id
       RETURNING id`, [email, userId, zone, now],
    );
    if (!recipient.rows[0]) throw new Error("Email is linked to another account");
    const recipientId = String(recipient.rows[0].id);
    if (row.intent) {
      const intent = row.intent as VerificationIntent;
      if (typeof intent.programId !== "string" || !intent.programId || typeof intent.episode !== "boolean"
        || typeof intent.weekly !== "boolean" || typeof intent.generalSchedule !== "boolean"
        || typeof intent.source !== "string") throw new Error("Invalid verification intent");
      await client.query(
        `INSERT INTO program_email_subscriptions (recipient_id, program_id, episode_enabled, weekly_enabled, consent_at, consent_source)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipient_id,program_id) DO UPDATE SET
         episode_enabled = EXCLUDED.episode_enabled, weekly_enabled = EXCLUDED.weekly_enabled,
         consent_at = EXCLUDED.consent_at, consent_source = EXCLUDED.consent_source, updated_at = $5`,
        [recipientId, intent.programId, intent.episode, intent.weekly, now, intent.source],
      );
      if (intent.generalSchedule) await client.query(
        "UPDATE notification_recipients SET general_schedule_enabled = true, general_schedule_consent_at = $2 WHERE id = $1",
        [recipientId, now],
      );
      if (userId) await client.query(
        `INSERT INTO program_follows (user_id,program_id)
         SELECT $1,$2 WHERE EXISTS (SELECT 1 FROM users WHERE id=$1 AND status='active')
         ON CONFLICT (user_id,program_id) DO NOTHING`, [userId, intent.programId],
      );
      await client.query("INSERT INTO notification_crm_outbox (recipient_id,payload) VALUES ($1,$2::jsonb)",
        [recipientId, JSON.stringify({ ...intent.attribution, programId: intent.programId, episode: intent.episode,
          weekly: intent.weekly, generalSchedule: intent.generalSchedule, consentSource: intent.source })]);
      await client.query(`INSERT INTO notification_deliveries (recipient_id,kind,occurrence_key,program_id)
        VALUES ($1,'confirmation',$2,$3) ON CONFLICT (recipient_id,kind,occurrence_key) DO NOTHING`,
        [recipientId, digest(token), intent.programId]);
    }
    await client.query("UPDATE notification_email_verifications SET consumed_at = $2 WHERE token_hash = $1", [digest(token), now]);
    await client.query("COMMIT");
    return { recipientId, email, userId, hasIntent: Boolean(row.intent) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
