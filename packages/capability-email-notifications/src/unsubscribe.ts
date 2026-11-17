import { createHmac, timingSafeEqual } from "node:crypto";
import type { PreferencesDatabase } from "./preferences.js";

export type UnsubscribeScope = { recipientId: string; kind: "program"; programId: string }
  | { recipientId: string; kind: "general" | "weekly" | "all" };
export type NotificationLinkScope = UnsubscribeScope | { recipientId: string; kind: "manage" };

/** Signed links contain no email address and cannot be modified by a viewer. */
export function unsubscribeToken(secret: string, scope: NotificationLinkScope): string {
  if (Buffer.byteLength(secret) < 32) throw new Error("Unsubscribe secret must be at least 32 bytes");
  const body = Buffer.from(JSON.stringify(scope)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): NotificationLinkScope | null {
  if (Buffer.byteLength(secret) < 32 || token.length > 2048) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (typeof item.recipientId !== "string" || !item.recipientId || item.recipientId.length > 256) return null;
    if (item.kind === "program" && typeof item.programId === "string" && item.programId && item.programId.length <= 256) {
      return { recipientId: item.recipientId, kind: "program", programId: item.programId };
    }
    if (item.kind === "general" || item.kind === "weekly" || item.kind === "all" || item.kind === "manage") return { recipientId: item.recipientId, kind: item.kind };
  } catch { /* Invalid token. */ }
  return null;
}

/** Safe to repeat; does not delete the viewer's app follows. */
export async function applyUnsubscribe(db: PreferencesDatabase, scope: UnsubscribeScope): Promise<void> {
  if (scope.kind === "program") {
    await db.query(`WITH changed AS (
      UPDATE program_email_subscriptions SET episode_enabled = false, weekly_enabled = false, updated_at = now()
      WHERE recipient_id = $1 AND program_id = $2 AND (episode_enabled OR weekly_enabled) RETURNING *)
      INSERT INTO notification_crm_outbox (recipient_id,payload)
      SELECT changed.recipient_id, jsonb_build_object('programId',changed.program_id,'episode',false,'weekly',false,
        'generalSchedule',r.general_schedule_enabled,'consentSource','unsubscribe')
      FROM changed JOIN notification_recipients r ON r.id = changed.recipient_id`, [scope.recipientId, scope.programId]);
  } else if (scope.kind === "general") {
    await db.query(`WITH recipient AS (UPDATE notification_recipients SET general_schedule_enabled = false, updated_at = now()
      WHERE id = $1 AND general_schedule_enabled RETURNING id)
      INSERT INTO notification_crm_outbox (recipient_id,payload)
      SELECT s.recipient_id, jsonb_build_object('programId',s.program_id,'episode',s.episode_enabled,'weekly',s.weekly_enabled,
        'generalSchedule',false,'consentSource','unsubscribe') FROM program_email_subscriptions s JOIN recipient r ON r.id = s.recipient_id`, [scope.recipientId]);
  } else if (scope.kind === "weekly") {
    await db.query(`WITH changed AS (UPDATE program_email_subscriptions SET weekly_enabled = false, updated_at = now()
      WHERE recipient_id = $1 AND weekly_enabled RETURNING *)
      INSERT INTO notification_crm_outbox (recipient_id,payload)
      SELECT changed.recipient_id, jsonb_build_object('programId',changed.program_id,'episode',changed.episode_enabled,'weekly',false,
        'generalSchedule',r.general_schedule_enabled,'consentSource','unsubscribe')
      FROM changed JOIN notification_recipients r ON r.id = changed.recipient_id`, [scope.recipientId]);
  } else {
    await db.query(`WITH programs AS (
      UPDATE program_email_subscriptions SET episode_enabled = false, weekly_enabled = false, updated_at = now()
      WHERE recipient_id = $1 AND (episode_enabled OR weekly_enabled) RETURNING *),
      recipient AS (UPDATE notification_recipients SET general_schedule_enabled = false, updated_at = now() WHERE id = $1 RETURNING id)
      INSERT INTO notification_crm_outbox (recipient_id,payload)
      SELECT programs.recipient_id, jsonb_build_object('programId',programs.program_id,'episode',false,'weekly',false,
        'generalSchedule',false,'consentSource','unsubscribe') FROM programs`, [scope.recipientId]);
  }
}
