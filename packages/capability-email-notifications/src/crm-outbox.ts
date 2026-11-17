import { randomUUID } from "node:crypto";
import type { PreferencesDatabase } from "./preferences.js";

/** Delivers a verified signup event to the authenticated CRM intake. */
export async function deliverOneCrmEvent(options: {
  db: PreferencesDatabase; endpoint: string; secret: string; now?: Date; fetcher?: typeof fetch;
}): Promise<boolean> {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !options.secret) throw new Error("CRM intake requires HTTPS and a secret");
  const now = options.now ?? new Date(), lease = randomUUID();
  const claimed = await options.db.query(
    `WITH candidate AS (SELECT id FROM notification_crm_outbox
       WHERE delivered_at IS NULL AND next_attempt_at <= $1 AND (lease_until IS NULL OR lease_until < $1)
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     UPDATE notification_crm_outbox o SET lease_token = $2, lease_until = $1::timestamptz + interval '2 minutes', attempts = attempts + 1
       FROM candidate WHERE o.id = candidate.id RETURNING o.*`, [now, lease],
  );
  const job = claimed.rows[0];
  if (!job) return false;
  try {
    const payload = job.payload as Record<string, unknown>;
    const recipient = await options.db.query(`SELECT r.email, r.general_schedule_enabled, s.episode_enabled, s.weekly_enabled
      FROM notification_recipients r LEFT JOIN program_email_subscriptions s ON s.recipient_id = r.id AND s.program_id = $2
      WHERE r.id = $1 AND r.verified_at IS NOT NULL`, [job.recipient_id, payload.programId]);
    if (!recipient.rows[0]) throw new Error('Recipient is not verified');
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.secret}` },
      body: JSON.stringify({ id: job.id, email: recipient.rows[0].email, payload: { ...payload,
        episode: Boolean(recipient.rows[0].episode_enabled), weekly: Boolean(recipient.rows[0].weekly_enabled),
        generalSchedule: Boolean(recipient.rows[0].general_schedule_enabled) } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`CRM intake returned ${response.status}`);
    await options.db.query('UPDATE notification_crm_outbox SET delivered_at = $3, lease_until = NULL WHERE id = $1 AND lease_token = $2', [job.id, lease, now]);
  } catch (error) {
    const seconds = Math.min(3600, 30 * 2 ** Math.min(Number(job.attempts ?? 1), 7));
    await options.db.query(`UPDATE notification_crm_outbox SET lease_until = NULL,
      next_attempt_at = $3::timestamptz + $4 * interval '1 second' WHERE id = $1 AND lease_token = $2`, [job.id, lease, now, seconds]);
    throw error;
  }
  return true;
}
