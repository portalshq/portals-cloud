import type { PreferencesDatabase } from "./preferences.js";

/**
 * Queue due mail from materialized production slots. A stable occurrence key
 * and database uniqueness permit multiple worker processes to run this safely.
 * Delivery must recheck slot status and preferences before sending.
 */
export async function enqueueDueNotifications(db: PreferencesDatabase, now: Date, programId?: string): Promise<void> {
  await db.query(
    `INSERT INTO notification_deliveries (recipient_id, kind, occurrence_key)
     SELECT s.recipient_id, 'episode', slot.id
     FROM program_email_subscriptions s
     JOIN notification_recipients r ON r.id = s.recipient_id
     JOIN station_program_slots slot ON slot.program_id = s.program_id
     WHERE s.episode_enabled AND r.verified_at IS NOT NULL AND r.suppressed_at IS NULL
       AND slot.status = 'scheduled' AND slot.starts_at > $1
       AND slot.starts_at <= $1::timestamptz + interval '6 minutes'
       AND ($2::text IS NULL OR slot.program_id = $2)
     ON CONFLICT (recipient_id, kind, occurrence_key) DO NOTHING`, [now, programId ?? null],
  );
  await db.query(
    `INSERT INTO notification_deliveries (recipient_id, kind, occurrence_key)
     SELECT r.id, kind.kind, to_char($1::timestamptz AT TIME ZONE r.timezone, 'YYYY-MM-DD')
     FROM notification_recipients r
     CROSS JOIN (VALUES ('followed_weekly'), ('general_weekly')) AS kind(kind)
     WHERE r.verified_at IS NOT NULL AND r.suppressed_at IS NULL
       AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM program_email_subscriptions own
         WHERE own.recipient_id = r.id AND own.program_id = $2 AND own.weekly_enabled))
       AND extract(isodow FROM $1::timestamptz AT TIME ZONE r.timezone) = 1
       AND extract(hour FROM $1::timestamptz AT TIME ZONE r.timezone) >= 12
       AND EXISTS (
         SELECT 1 FROM station_program_slots slot
         WHERE slot.status = 'scheduled' AND slot.starts_at > $1
           AND slot.starts_at <= $1::timestamptz + interval '7 days'
           AND ((kind.kind = 'general_weekly' AND r.general_schedule_enabled)
             OR (kind.kind = 'followed_weekly' AND EXISTS (
               SELECT 1 FROM program_email_subscriptions s
               WHERE s.recipient_id = r.id AND s.program_id = slot.program_id AND s.weekly_enabled
                 AND (r.user_id IS NULL OR EXISTS (SELECT 1 FROM program_follows f WHERE f.user_id = r.user_id AND f.program_id = slot.program_id))
             )))
       )
     ON CONFLICT (recipient_id, kind, occurrence_key) DO NOTHING`, [now, programId ?? null],
  );
}
