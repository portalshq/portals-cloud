import { validateTimeZone } from "./schedule.js";

/** Caller must authorize the recipient before using this server-side store. */
export interface PreferencesDatabase {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class NotificationPreferencesStore {
  constructor(private readonly db: PreferencesDatabase) {}

  /** Changes only the chosen program. A follow is never added or removed here. */
  async setProgram(input: {
    recipientId: string; programId: string; episode: boolean; weekly: boolean;
    consentSource: string; attribution: Record<string, unknown>;
  }): Promise<void> {
    if (!input.recipientId || !input.programId || !input.consentSource) throw new Error("Missing subscription fields");
    // The preference and CRM projection are committed in the same statement.
    const result = await this.db.query(
      `WITH changed AS (
         INSERT INTO program_email_subscriptions
           (recipient_id, program_id, episode_enabled, weekly_enabled, consent_at, consent_source)
         VALUES ($1, $2, $3, $4, now(), $5)
         ON CONFLICT (recipient_id, program_id) DO UPDATE SET
           episode_enabled = EXCLUDED.episode_enabled, weekly_enabled = EXCLUDED.weekly_enabled,
           consent_at = now(), consent_source = EXCLUDED.consent_source, updated_at = now()
         RETURNING recipient_id, program_id
       )
       INSERT INTO notification_crm_outbox (recipient_id, payload)
       SELECT changed.recipient_id, $6::jsonb || jsonb_build_object('generalSchedule', r.general_schedule_enabled)
       FROM changed JOIN notification_recipients r ON r.id = changed.recipient_id RETURNING id`,
      [input.recipientId, input.programId, input.episode, input.weekly, input.consentSource,
        JSON.stringify({ ...input.attribution, programId: input.programId, episode: input.episode,
          weekly: input.weekly, consentSource: input.consentSource })],
    );
    if (!result.rows.length) throw new Error("Subscription was not saved");
  }

  async setGeneralSchedule(recipientId: string, enabled: boolean): Promise<void> {
    const result = await this.db.query(
      `WITH prior AS (SELECT id, general_schedule_enabled FROM notification_recipients WHERE id = $1 FOR UPDATE),
       changed AS (UPDATE notification_recipients r SET general_schedule_enabled = $2,
         general_schedule_consent_at = CASE WHEN $2 AND NOT prior.general_schedule_enabled THEN now() ELSE r.general_schedule_consent_at END,
         updated_at = now() FROM prior WHERE r.id = prior.id RETURNING r.id, prior.general_schedule_enabled AS previous),
       projection AS (INSERT INTO notification_crm_outbox (recipient_id, payload)
         SELECT s.recipient_id, jsonb_build_object('programId',s.program_id,'episode',s.episode_enabled,'weekly',s.weekly_enabled,
           'generalSchedule',$2::boolean,'consentSource','settings')
         FROM changed JOIN program_email_subscriptions s ON s.recipient_id = changed.id
         WHERE changed.previous IS DISTINCT FROM $2 RETURNING id)
       SELECT id FROM changed`, [recipientId, enabled],
    );
    if (!result.rows.length) throw new Error("Recipient not found");
  }

  async setTimeZone(recipientId: string, timeZone: string): Promise<void> {
    const zone = validateTimeZone(timeZone);
    const result = await this.db.query(
      `UPDATE notification_recipients SET timezone = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [recipientId, zone],
    );
    if (!result.rows.length) throw new Error("Recipient not found");
  }
}
