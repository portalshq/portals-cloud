import { randomUUID } from "node:crypto";
import type { NotificationMessage, Notifications } from "./index.js";
import type { PreferencesDatabase } from "./preferences.js";
import { formatOccurrence } from "./schedule.js";
import { unsubscribeToken, type UnsubscribeScope } from "./unsubscribe.js";
import { notificationOrigin } from "./origin.js";

interface DeliveryRow extends Record<string, unknown> {
  id: string; recipient_id: string; kind: "episode" | "followed_weekly" | "general_weekly" | "confirmation";
  occurrence_key: string; program_id: string | null; payload: NotificationMessage | null;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};

/** Claims one delivery with an expiring lease and sends it at most once per
 * Resend idempotency window. Retries retain the exact original payload. */
export async function deliverOneNotification(options: {
  db: PreferencesDatabase; notifications: Notifications; publicBaseUrl: string;
  unsubscribeSecret: string; postalAddress?: string; allowPrivateHttp?: boolean; now?: Date; programId?: string;
}): Promise<boolean> {
  const { db, notifications } = options;
  const now = options.now ?? new Date();
  const base = notificationOrigin(options.publicBaseUrl, options.allowPrivateHttp);
  const postalAddress = options.postalAddress?.trim();
  await db.query(`UPDATE notification_deliveries SET status = 'failed', last_error = 'Retry window expired'
    WHERE status IN ('pending','sending') AND first_attempt_at <= $1::timestamptz - interval '23 hours'
      AND (lease_until IS NULL OR lease_until < $1)
      AND ($2::text IS NULL OR (kind = 'confirmation' AND program_id = $2)
        OR (kind = 'episode' AND EXISTS (SELECT 1 FROM station_program_slots slot WHERE slot.id = occurrence_key AND slot.program_id = $2))
        OR (kind IN ('followed_weekly', 'general_weekly') AND EXISTS (SELECT 1 FROM program_email_subscriptions s WHERE s.recipient_id = notification_deliveries.recipient_id AND s.program_id = $2 AND s.weekly_enabled)))`, [now, options.programId ?? null]);
  const lease = randomUUID();
  const claimed = await db.query(
    `WITH candidate AS (
       SELECT id FROM notification_deliveries
       WHERE (status = 'pending' OR (status = 'sending' AND lease_until < $1))
         AND (first_attempt_at IS NULL OR first_attempt_at > $1::timestamptz - interval '23 hours')
         AND ($3::text IS NULL OR (kind = 'confirmation' AND program_id = $3)
           OR (kind = 'episode' AND EXISTS (SELECT 1 FROM station_program_slots slot WHERE slot.id = occurrence_key AND slot.program_id = $3))
           OR (kind IN ('followed_weekly', 'general_weekly') AND EXISTS (SELECT 1 FROM program_email_subscriptions s WHERE s.recipient_id = notification_deliveries.recipient_id AND s.program_id = $3 AND s.weekly_enabled)))
       ORDER BY CASE WHEN kind = 'episode' THEN 0 ELSE 1 END, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
     ) UPDATE notification_deliveries d SET status = 'sending', lease_token = $2,
       lease_until = $1::timestamptz + interval '2 minutes', attempts = d.attempts + 1,
       first_attempt_at = COALESCE(d.first_attempt_at, $1)
       FROM candidate WHERE d.id = candidate.id RETURNING d.*`, [now, lease, options.programId ?? null],
  );
  const job = claimed.rows[0] as DeliveryRow | undefined;
  if (!job) return false;
  try {
    const rows = await db.query(
      `SELECT r.email, r.timezone, slot.id AS slot_id, p.id AS program_id, slot.channel_id,
              slot.starts_at, p.name AS program_name, s.episode_enabled, s.weekly_enabled
       FROM notification_recipients r JOIN programs p ON ($2 <> 'confirmation' OR p.id = $5)
       LEFT JOIN station_program_slots slot ON slot.program_id = p.id AND slot.status = 'scheduled' AND slot.starts_at > $4
       LEFT JOIN program_email_subscriptions s ON s.recipient_id = r.id AND s.program_id = p.id
       WHERE r.id = $1 AND r.verified_at IS NOT NULL AND r.suppressed_at IS NULL
         AND (($2 = 'episode' AND slot.id = $3 AND s.episode_enabled
               AND slot.starts_at <= $4::timestamptz + interval '6 minutes')
           OR ($2 = 'followed_weekly' AND s.weekly_enabled AND slot.starts_at <= $4::timestamptz + interval '7 days'
               AND (r.user_id IS NULL OR EXISTS (SELECT 1 FROM program_follows f WHERE f.user_id = r.user_id AND f.program_id = slot.program_id)))
           OR ($2 = 'general_weekly' AND r.general_schedule_enabled AND slot.starts_at <= $4::timestamptz + interval '7 days')
           OR ($2 = 'confirmation' AND s.recipient_id IS NOT NULL))
       ORDER BY slot.starts_at NULLS LAST, slot.id`, [job.recipient_id, job.kind, job.occurrence_key, now, job.program_id],
    );
    if (!rows.rows.length) {
      await db.query("UPDATE notification_deliveries SET status = 'cancelled', lease_until = NULL WHERE id = $1 AND lease_token = $2", [job.id, lease]);
      return true;
    }
    const first = rows.rows[0];
    const email = String(first.email), zone = String(first.timezone);
    const scope: UnsubscribeScope = job.kind === "episode" || job.kind === "confirmation"
      ? { recipientId: job.recipient_id, kind: "program", programId: String(first.program_id) }
      : { recipientId: job.recipient_id, kind: job.kind === "general_weekly" ? "general" : "weekly" };
    const link = new URL("/api/notifications/unsubscribe", base);
    link.searchParams.set("token", unsubscribeToken(options.unsubscribeSecret, scope));
    const manage = new URL("/api/notifications/manage", base);
    manage.searchParams.set("token", unsubscribeToken(options.unsubscribeSecret, { recipientId: job.recipient_id, kind: "manage" }));
    const stopLabel = scope.kind === "program" ? "Stop emails for this show" : scope.kind === "weekly" ? "Stop followed-show schedules" : "Stop the general schedule";
    const selected = job.kind === "confirmation" ? rows.rows.slice(0, 1) : rows.rows;
    const lines = selected.map(row => {
      if (!row.starts_at || !row.channel_id) return `${String(row.program_name)} — next episode not yet scheduled`;
      const watch = new URL(`/${encodeURIComponent(String(row.channel_id))}`, base).href;
      return `${String(row.program_name)} — ${formatOccurrence(new Date(String(row.starts_at)), zone)}\n${watch}`;
    });
    if (job.kind === "confirmation") lines.push(`Episode reminders: ${first.episode_enabled ? "on" : "off"}\nWeekly followed-show schedule: ${first.weekly_enabled ? "on" : "off"}`);
    const calendar = job.kind === "confirmation" && first.channel_id
      ? new URL(`/api/channels/${encodeURIComponent(String(first.channel_id))}/sessions/next.ics`, base).href : null;
    if (calendar) lines.push(`Add the next episode to your calendar: ${calendar}`);
    const subject = job.kind === "confirmation" ? `Your ${String(first.program_name)} reminders` : job.kind === "episode" ? `${String(first.program_name)} starts in 5 minutes` :
      job.kind === "general_weekly" ? "Your weekly live schedule" : "Your followed shows this week";
    const text = `${lines.join("\n\n")}\n\nManage reminders: ${manage.href}\n${stopLabel}: ${link.href}${postalAddress ? `\n${postalAddress}` : ""}`;
    const htmlLines = selected.map(row => {
      if (!row.starts_at || !row.channel_id) return `<p><strong>${escapeHtml(String(row.program_name))}</strong> — next episode not yet scheduled</p>`;
      const watch = new URL(`/${encodeURIComponent(String(row.channel_id))}`, base).href;
      return `<p><strong>${escapeHtml(String(row.program_name))}</strong> — ${escapeHtml(formatOccurrence(new Date(String(row.starts_at)), zone))}<br><a href="${escapeHtml(watch)}">Watch</a></p>`;
    });
    const message: NotificationMessage = { to: email, subject, text,
      html: `${htmlLines.join("")}${job.kind === "confirmation" ? `<p>Episode reminders: ${first.episode_enabled ? "on" : "off"}<br>Weekly followed-show schedule: ${first.weekly_enabled ? "on" : "off"}</p>${calendar ? `<p><a href="${escapeHtml(calendar)}">Add next episode to calendar</a></p>` : ""}` : ""}<p><a href="${escapeHtml(manage.href)}">Manage reminders</a> · <a href="${escapeHtml(link.href)}">${stopLabel}</a>${postalAddress ? `<br>${escapeHtml(postalAddress)}` : ""}</p>`, idempotencyKey: `notification/${job.id}`,
      headers: { "List-Unsubscribe": `<${link.href}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    // A retry must use identical content. If preferences or slots changed,
    // cancel rather than send a stale or differently scoped message.
    if (job.payload && canonical(job.payload) !== canonical(message)) {
      await db.query("UPDATE notification_deliveries SET status = 'cancelled', lease_until = NULL WHERE id = $1 AND lease_token = $2", [job.id, lease]);
      return true;
    }
    const saved = await db.query(
      `UPDATE notification_deliveries SET payload = COALESCE(payload, $3::jsonb)
       WHERE id = $1 AND lease_token = $2 AND status = 'sending' RETURNING id`, [job.id, lease, JSON.stringify(message)],
    );
    if (!saved.rows.length) return true;
    const sent = await notifications.send(job.payload ?? message);
    await db.query(
      "UPDATE notification_deliveries SET status = 'sent', provider_message_id = $3, sent_at = $4, lease_until = NULL WHERE id = $1 AND lease_token = $2",
      [job.id, lease, sent.messageId ?? null, new Date()],
    );
    return true;
  } catch (error) {
    await db.query(
      "UPDATE notification_deliveries SET status = 'pending', lease_until = NULL, last_error = $3 WHERE id = $1 AND lease_token = $2",
      [job.id, lease, String(error instanceof Error ? error.message : error).slice(0, 500)],
    );
    throw error;
  }
}
