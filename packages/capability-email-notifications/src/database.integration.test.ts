import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { enqueueDueNotifications } from "./enqueue.js";
import { NotificationPreferencesStore } from "./preferences.js";
import { claimVerifiedEmail, EmailVerificationStore } from "./verification.js";
import { deliverOneNotification } from "./delivery.js";
import { deliverOneCrmEvent } from "./crm-outbox.js";
import { vi } from "vitest";

let db: PGlite | undefined;
afterEach(async () => { await db?.close(); db = undefined; });

describe("notification central schema", () => {
  it("limits an app's reminder processing to its subscribed program", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      INSERT INTO programs VALUES ('p','Ebook'),('q','Other');`);
    await db.exec(await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES
      ('a','a@example.com','UTC',now()),('b','b@example.com','UTC',now());
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('a','p',true,true,now(),'test'),('b','q',true,true,now(),'test');
      INSERT INTO station_program_slots VALUES ('sp','p','2026-07-06T16:06:00Z','scheduled','ebook'),
        ('sq','q','2026-07-06T16:06:00Z','scheduled','other');`);
    const adapter = { query: async (sql: string, values?: unknown[]) => ({ rows: (await db!.query(sql, values as never[] | undefined)).rows as Array<Record<string, unknown>> }) };
    const now = new Date('2026-07-06T16:00:00Z');
    await enqueueDueNotifications(adapter, now);
    const send = vi.fn().mockResolvedValue({ messageId: 'mail' });
    const options = { db: adapter, notifications: { send }, publicBaseUrl: 'https://shows.example.com', unsubscribeSecret: 'a long enough unsubscribe secret for tests', now, programId: 'p' };
    while (await deliverOneNotification(options)) { /* drain this program */ }
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every(call => call[0].to === 'a@example.com')).toBe(true);
    expect((await db.query("SELECT count(*)::int AS count FROM notification_deliveries WHERE recipient_id = 'b' AND status = 'pending'")).rows).toEqual([{ count: 2 }]);
  });
  it("saves independent preferences and enqueues actual scheduled slots once", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY (user_id, program_id));
      INSERT INTO programs VALUES ('show', 'Bears');`);
    const migration = await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.query("INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES ('r','viewer@example.com','America/New_York',now())");
    const adapter = { query: async (sql: string, values?: unknown[]) => {
      const result = await db!.query(sql, values as never[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    await new NotificationPreferencesStore(adapter).setProgram({ recipientId: "r", programId: "show", episode: true,
      weekly: true, consentSource: "show", attribution: { utmCampaign: "spring" } });
    const now = new Date("2026-07-06T16:00:00Z");
    await db.query("INSERT INTO station_program_slots VALUES ('slot','show',$1,'scheduled','bears')", [new Date(now.getTime() + 360_000)]);
    await enqueueDueNotifications(adapter, now);
    await enqueueDueNotifications(adapter, now);
    const jobs = await db.query<{ kind: string }>("SELECT kind FROM notification_deliveries ORDER BY kind");
    expect(jobs.rows.map(row => row.kind)).toEqual(["episode", "followed_weekly"]);
    expect((await db.query("SELECT id FROM notification_crm_outbox")).rows).toHaveLength(1);
    await db.query("UPDATE notification_crm_outbox SET next_attempt_at = '2020-01-01'");
    const crmFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await deliverOneCrmEvent({ db: adapter, endpoint: "https://crm.example.com/intake", secret: "test-secret", now, fetcher: crmFetch })).toBe(true);
    expect(JSON.parse(crmFetch.mock.calls[0][1].body)).toMatchObject({ email: "viewer@example.com", payload: { programId: "show", utmCampaign: "spring" } });
    await db.query("UPDATE notification_deliveries SET created_at = '2020-01-01' WHERE kind = 'episode'");
    const send = vi.fn().mockResolvedValue({ messageId: "provider-id" });
    const options = { db: adapter, notifications: { send }, publicBaseUrl: "http://100.125.2.45:4000", allowPrivateHttp: true, unsubscribeSecret: "a long enough unsubscribe secret for tests", now };
    expect(await deliverOneNotification(options)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: "viewer@example.com", subject: "Bears starts in 5 minutes" });
    expect(send.mock.calls[0][0].text).toContain("http://100.125.2.45:4000/api/notifications/unsubscribe");
    expect(send.mock.calls[0][0].text).not.toContain("undefined");
    expect(send.mock.calls[0][0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect((await db.query("SELECT status FROM notification_deliveries WHERE kind = 'episode'")).rows).toEqual([{ status: "sent" }]);
    await db.query("UPDATE program_email_subscriptions SET weekly_enabled = false WHERE recipient_id = 'r'");
    expect(await deliverOneNotification(options)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect((await db.query("SELECT status FROM notification_deliveries WHERE kind = 'followed_weekly'")).rows).toEqual([{ status: "cancelled" }]);
    await db.query("INSERT INTO station_program_slots VALUES ('slot2','show',$1,'scheduled','bears')", [new Date(now.getTime() + 300_000)]);
    await enqueueDueNotifications(adapter, now);
    send.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ messageId: 'retry-id' });
    await expect(deliverOneNotification(options)).rejects.toThrow('temporary failure');
    await deliverOneNotification(options);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[2][0]);
    expect((await db.query("SELECT status, attempts FROM notification_deliveries WHERE occurrence_key = 'slot2'")).rows)
      .toEqual([{ status: 'sent', attempts: 2 }]);
  });

  it("atomically verifies a mailbox and records its selected subscriptions", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
      INSERT INTO users (id) VALUES ('u'); INSERT INTO programs VALUES ('p','Bears');`);
    await db.exec(await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8"));
    const adapter = { query: async (sql: string, values?: unknown[]) => {
      const result = await db!.query(sql, values as never[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    const now = new Date("2026-01-01T00:00:00Z");
    const token = await new EmailVerificationStore(adapter).issue("viewer@example.com", "u", now, {
      programId: "p", episode: true, weekly: true, generalSchedule: false, source: "bears", attribution: {},
    });
    const pool = { connect: async () => ({ ...adapter, release() {} }) };
    await expect(claimVerifiedEmail(pool, token, "America/New_York", now)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    const claimed = await claimVerifiedEmail(pool, token, "America/New_York", now, 'u');
    expect(claimed?.userId).toBe("u");
    expect((await db.query("SELECT episode_enabled, weekly_enabled FROM program_email_subscriptions")).rows)
      .toEqual([{ episode_enabled: true, weekly_enabled: true }]);
    expect((await db.query("SELECT user_id, program_id FROM program_follows")).rows).toEqual([{ user_id: "u", program_id: "p" }]);
    const send = vi.fn().mockResolvedValue({ messageId: 'confirmation' });
    await deliverOneNotification({ db: adapter, notifications: { send }, publicBaseUrl: 'https://shows.example.com',
      unsubscribeSecret: 'a long enough unsubscribe secret for tests', postalAddress: '123 Example Street', now });
    expect(send.mock.calls[0][0]).toMatchObject({ subject: 'Your Bears reminders' });
    expect(send.mock.calls[0][0].text).toContain('next episode not yet scheduled');
    expect(await claimVerifiedEmail(pool, token, "UTC", now)).toBeNull();
  });

  it("keeps the general schedule separate and filters a signed-in viewer's weekly shows", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      INSERT INTO users (id) VALUES ('u'); INSERT INTO programs VALUES ('p','Followed'),('q','Other');
      INSERT INTO program_follows VALUES ('u','p');`);
    await db.exec(await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO notification_recipients (id,email,user_id,timezone,verified_at,general_schedule_enabled)
      VALUES ('r','viewer@example.com','u','America/New_York',now(),true);
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('r','p',false,true,now(),'test'),('r','q',false,true,now(),'test');
      INSERT INTO station_program_slots VALUES ('a','p','2026-07-07T16:00:00Z','scheduled','followed'),
        ('b','q','2026-07-08T16:00:00Z','scheduled','other');`);
    const adapter = { query: async (sql: string, values?: unknown[]) => {
      const result = await db!.query(sql, values as never[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    const now = new Date('2026-07-06T16:00:00Z');
    await enqueueDueNotifications(adapter, now);
    const send = vi.fn().mockResolvedValue({ messageId: 'mail' });
    const options = { db: adapter, notifications: { send }, publicBaseUrl: 'https://shows.example.com',
      unsubscribeSecret: 'a long enough unsubscribe secret for tests', postalAddress: '123 Example Street', now };
    await deliverOneNotification(options); await deliverOneNotification(options);
    expect(send).toHaveBeenCalledTimes(2);
    const messages = send.mock.calls.map(call => call[0]);
    const followed = messages.find(message => message.subject === 'Your followed shows this week');
    const general = messages.find(message => message.subject === 'Your weekly live schedule');
    expect(followed.text).toContain('Followed'); expect(followed.text).not.toContain('Other');
    expect(general.text).toContain('Followed'); expect(general.text).toContain('Other');
  });

  it("does not deliver one occurrence twice when workers race", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      INSERT INTO programs VALUES ('p','Bears');`);
    await db.exec(await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES ('r','viewer@example.com','UTC',now());
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('r','p',true,false,now(),'test');
      INSERT INTO station_program_slots VALUES ('slot','p','2026-07-06T16:06:00Z','scheduled','bears');`);
    const adapter = { query: async (sql: string, values?: unknown[]) => {
      const result = await db!.query(sql, values as never[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    const now = new Date('2026-07-06T16:00:00Z');
    await enqueueDueNotifications(adapter, now);
    const send = vi.fn().mockResolvedValue({ messageId: 'mail' });
    const options = { db: adapter, notifications: { send }, publicBaseUrl: 'https://shows.example.com',
      unsubscribeSecret: 'a long enough unsubscribe secret for tests', postalAddress: '123 Example Street', now };
    await Promise.all([deliverOneNotification(options), deliverOneNotification(options)]);
    expect(send).toHaveBeenCalledOnce();
  });

  it("queues episode reminders against the same absolute instant across time zones and DST", async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, status text DEFAULT 'active');
      CREATE TABLE programs (id text PRIMARY KEY, name text);
      CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
      CREATE TABLE station_program_slots (id text PRIMARY KEY, program_id text, starts_at timestamptz, status text, channel_id text);
      INSERT INTO programs VALUES ('p','Bears');`);
    await db.exec(await readFile(new URL("../sql/001_notifications.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES
      ('la','la@example.com','America/Los_Angeles',now()),('ktm','ktm@example.com','Asia/Kathmandu',now());
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('la','p',true,false,now(),'test'),('ktm','p',true,false,now(),'test');
      INSERT INTO station_program_slots VALUES ('slot','p','2026-03-08T10:06:00Z','scheduled','bears');`);
    const adapter = { query: async (sql: string, values?: unknown[]) => {
      const result = await db!.query(sql, values as never[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    await enqueueDueNotifications(adapter, new Date('2026-03-08T09:59:59Z'));
    expect((await db.query('SELECT id FROM notification_deliveries')).rows).toHaveLength(0);
    const now = new Date('2026-03-08T10:00:00Z');
    await enqueueDueNotifications(adapter, now);
    expect((await db.query('SELECT id FROM notification_deliveries')).rows).toHaveLength(2);
    const send = vi.fn().mockResolvedValue({ messageId: 'mail' });
    const options = { db: adapter, notifications: { send }, publicBaseUrl: 'https://shows.example.com',
      unsubscribeSecret: 'a long enough unsubscribe secret for tests', postalAddress: '123 Example Street', now };
    await deliverOneNotification(options); await deliverOneNotification(options);
    const messages = send.mock.calls.map(call => call[0]);
    expect(messages.find(message => message.to === 'la@example.com').text).toContain('3:06 AM PDT');
    expect(messages.find(message => message.to === 'ktm@example.com').text).toContain('3:51 PM');
  });
});
