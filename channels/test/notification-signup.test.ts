import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ db: null as unknown, send: vi.fn(), viewer: vi.fn() }))
vi.mock('../lib/admin/db', () => ({ centralDb: () => mocks.db }))
vi.mock('../lib/notification-auth', () => ({ notificationViewer: mocks.viewer }))
vi.mock('@portalshq/capability-email-notifications', async original => ({
  ...(await original<typeof import('@portalshq/capability-email-notifications')>()),
  createResendNotifications: () => ({ send: mocks.send }),
}))
import { GET as getSubscriptions, POST as signup } from '../app/api/notifications/subscriptions/route'
import { GET as verifyPage, POST as verify } from '../app/api/notifications/verify/route'
import { GET as unsubscribePage, POST as unsubscribe } from '../app/api/notifications/unsubscribe/route'
import { unsubscribeToken } from '@portalshq/capability-email-notifications'
import { GET as managePage, POST as manage } from '../app/api/notifications/manage/route'
import { POST as webhook } from '../app/api/notifications/webhook/route'
import { POST as verifyAccountEmail } from '../app/api/notifications/verify-email/route'

let pg: PGlite
beforeEach(async () => {
  pg = new PGlite()
  await pg.exec(`CREATE TABLE users (id text PRIMARY KEY, display_name text, email text, status text DEFAULT 'active', updated_at timestamptz DEFAULT now());
    CREATE TABLE programs (id text PRIMARY KEY, name text); CREATE TABLE program_follows (user_id text, program_id text, PRIMARY KEY(user_id, program_id));
    INSERT INTO programs VALUES ('bears','Bears');`)
  await pg.exec(await readFile(new URL('../../packages/capability-email-notifications/sql/001_notifications.sql', import.meta.url), 'utf8'))
  const query = async (sql: string, values?: unknown[]) => {
    const result = await pg.query(sql, values as never[] | undefined)
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 }
  }
  mocks.db = { query, connect: async () => ({ query, release() {} }) }
  mocks.viewer.mockReset().mockResolvedValue(null)
  mocks.send.mockReset().mockResolvedValue({ messageId: 'mail' })
  process.env.NOTIFICATIONS_PUBLIC_URL = 'https://shows.example.com'
  process.env.RESEND_API_KEY = 'test'; process.env.RESEND_FROM_EMAIL = 'shows@example.com'
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = '0123456789abcdef0123456789abcdef'
})
afterEach(async () => { delete process.env.NOTIFICATIONS_ALLOW_PRIVATE_HTTP; await pg.close() })

describe('notification signup', () => {
  it('supports an explicitly configured private HTTP Channels origin', async () => {
    process.env.NOTIFICATIONS_PUBLIC_URL = 'http://100.125.2.45:4000'
    process.env.NOTIFICATIONS_ALLOW_PRIVATE_HTTP = 'true'
    const response = await signup(new Request('http://100.125.2.45:4000/api/notifications/subscriptions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@example.com', programId: 'bears', episode: true, weekly: true, timezone: 'UTC' }),
    }))
    expect(response.status).toBe(200)
    const text = mocks.send.mock.calls[0][0].text as string
    const link = text.match(/http:\/\/100\.125\.2\.45:4000\/\S+/)?.[0]
    expect(link).toBeDefined()
    expect((await verify(new Request(link!, { method: 'POST' }))).status).toBe(200)
    expect((await pg.query('SELECT episode_enabled,weekly_enabled FROM program_email_subscriptions')).rows)
      .toEqual([{ episode_enabled: true, weekly_enabled: true }])
  })
  it('confirms a guest mailbox before activating both options', async () => {
    const response = await signup(new Request('https://shows.example.com/api/notifications/subscriptions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@example.com', programId: 'bears', episode: true, weekly: true,
        generalSchedule: false, timezone: 'America/New_York', utmCampaign: 'launch' }),
    }))
    expect(response.status).toBe(200)
    expect((await pg.query('SELECT id FROM notification_recipients')).rows).toHaveLength(0)
    const text = mocks.send.mock.calls[0][0].text as string
    const link = text.match(/https:\/\/\S+/)?.[0]
    expect(link).toBeDefined()
    expect((await verifyPage(new Request(link!))).status).toBe(200)
    expect((await pg.query('SELECT id FROM notification_recipients')).rows).toHaveLength(0)
    expect((await verify(new Request(link!, { method: 'POST' }))).status).toBe(200)
    expect((await pg.query('SELECT episode_enabled, weekly_enabled FROM program_email_subscriptions')).rows)
      .toEqual([{ episode_enabled: true, weekly_enabled: true }])
    expect((await pg.query('SELECT payload FROM notification_crm_outbox')).rows[0]).toMatchObject({ payload: { programId: 'bears', utmCampaign: 'launch' } })
    expect((await verify(new Request(link!, { method: 'POST' }))).status).toBe(400)
  })

  it('requires confirmation for a browser visit and handles one-click unsubscribe', async () => {
    await pg.exec(`INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES ('r','viewer@example.com','UTC',now());
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('r','bears',true,true,now(),'test');`)
    const token = unsubscribeToken(process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET!, { recipientId: 'r', kind: 'program', programId: 'bears' })
    const link = `https://shows.example.com/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
    expect((await unsubscribePage(new Request(link))).status).toBe(200)
    expect((await pg.query('SELECT episode_enabled FROM program_email_subscriptions')).rows).toEqual([{ episode_enabled: true }])
    expect((await unsubscribe(new Request(link, { method: 'POST', body: 'List-Unsubscribe=One-Click' }))).status).toBe(200)
    expect((await pg.query('SELECT episode_enabled, weekly_enabled FROM program_email_subscriptions')).rows)
      .toEqual([{ episode_enabled: false, weekly_enabled: false }])
  })

  it('lets a signed-in viewer reuse a verified mailbox and change reminder choices', async () => {
    await pg.exec("INSERT INTO users (id, display_name) VALUES ('u','Viewer')")
    mocks.viewer.mockResolvedValue({ userId: 'u', displayName: 'Viewer' })
    const payload = { email: 'viewer@example.com', programId: 'bears', episode: true, weekly: true,
      generalSchedule: false, timezone: 'UTC' }
    const submit = (body: object) => signup(new Request('https://shows.example.com/api/notifications/subscriptions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' }, body: JSON.stringify(body),
    }))
    expect((await submit(payload)).status).toBe(200)
    const link = (mocks.send.mock.calls[0][0].text as string).match(/https:\/\/\S+/)![0]
    mocks.viewer.mockResolvedValue(null)
    expect((await verify(new Request(link, { method: 'POST' }))).status).toBe(401)
    mocks.viewer.mockResolvedValue({ userId: 'u', displayName: 'Viewer' })
    expect((await verify(new Request(link, { method: 'POST' }))).status).toBe(200)
    expect((await pg.query('SELECT user_id, program_id FROM program_follows')).rows).toEqual([{ user_id: 'u', program_id: 'bears' }])
    expect((await submit({ ...payload, email: undefined, episode: false, weekly: true, generalSchedule: true })).status).toBe(200)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect((await pg.query('SELECT episode_enabled, weekly_enabled FROM program_email_subscriptions')).rows)
      .toEqual([{ episode_enabled: false, weekly_enabled: true }])
    expect((await pg.query('SELECT general_schedule_enabled FROM notification_recipients')).rows).toEqual([{ general_schedule_enabled: true }])
    const { generalSchedule: _generalSchedule, ...withoutGeneral } = payload
    expect((await submit({ ...withoutGeneral, email: undefined, episode: true, weekly: false })).status).toBe(200)
    expect((await pg.query('SELECT general_schedule_enabled FROM notification_recipients')).rows).toEqual([{ general_schedule_enabled: true }])
    const settings = await getSubscriptions(new Request('https://shows.example.com/api/notifications/subscriptions', { headers: { authorization: 'Bearer token' } }))
    expect(await settings.json()).toMatchObject({ verified: true, follows: [{ program_id: 'bears', program_name: 'Bears' }],
      subscriptions: [{ program_id: 'bears', episode_enabled: true, weekly_enabled: false }] })
  })

  it('uses the account email without asking the signed-in viewer to enter it', async () => {
    await pg.exec("INSERT INTO users (id,display_name,email) VALUES ('u','Viewer','registered@example.com')")
    mocks.viewer.mockResolvedValue({ userId: 'u', displayName: 'Viewer' })
    const initial = await getSubscriptions(new Request('https://shows.example.com/api/notifications/subscriptions', { headers: { authorization: 'Bearer token' } }))
    expect(await initial.json()).toMatchObject({ verified: false, accountEmail: 'registered@example.com' })
    const response = await signup(new Request('https://shows.example.com/api/notifications/subscriptions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
      body: JSON.stringify({ email: 'different@example.com', programId: 'bears', episode: true, weekly: true, timezone: 'Asia/Kathmandu' }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.send.mock.calls[0][0].to).toBe('registered@example.com')
    expect((await pg.query('SELECT email, verified_at FROM notification_recipients')).rows).toHaveLength(0)
  })

  it('lets an account without an available address verify one in settings', async () => {
    await pg.exec("INSERT INTO users (id,display_name) VALUES ('u','Viewer')")
    mocks.viewer.mockResolvedValue({ userId: 'u', displayName: 'Viewer' })
    const response = await verifyAccountEmail(new Request('https://shows.example.com/api/notifications/verify-email', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
      body: JSON.stringify({ email: 'viewer@example.com', timezone: 'UTC' }),
    }))
    expect(response.status).toBe(200)
    const link = (mocks.send.mock.calls[0][0].text as string).match(/https:\/\/\S+/)![0]
    expect((await verify(new Request(link, { method: 'POST' }))).status).toBe(200)
    expect((await pg.query('SELECT email,user_id FROM notification_recipients')).rows).toEqual([{ email: 'viewer@example.com', user_id: 'u' }])
  })

  it('allows mailbox owners to change show preferences without an account', async () => {
    await pg.exec(`INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES ('r','viewer@example.com','UTC',now());
      INSERT INTO program_email_subscriptions (recipient_id,program_id,episode_enabled,weekly_enabled,consent_at,consent_source)
      VALUES ('r','bears',true,true,now(),'test');`)
    const token = unsubscribeToken(process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET!, { recipientId: 'r', kind: 'manage' })
    const url = `https://shows.example.com/api/notifications/manage?token=${encodeURIComponent(token)}`
    const page = await managePage(new Request(url))
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).not.toContain('Time zone <input')
    expect(html).toContain('Weekly scheduled of my followed shows')
    expect((await manage(new Request(url, { method: 'POST', body: new URLSearchParams({ programId: 'bears', weekly: 'on' }) }))).status).toBe(303)
    expect((await pg.query('SELECT episode_enabled,weekly_enabled FROM program_email_subscriptions')).rows)
      .toEqual([{ episode_enabled: false, weekly_enabled: true }])
    expect((await manage(new Request(url, { method: 'POST', body: new URLSearchParams({ programId: 'another', episode: 'on' }) }))).status).toBe(404)
  })

  it('suppresses a bounced mailbox only after verifying the provider signature', async () => {
    await pg.exec("INSERT INTO notification_recipients (id,email,timezone,verified_at) VALUES ('r','viewer@example.com','UTC',now())")
    const key = Buffer.from('a-webhook-secret-with-enough-bytes')
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${key.toString('base64')}`
    const body = JSON.stringify({ type: 'email.bounced', created_at: new Date().toISOString(), data: { to: ['viewer@example.com'], email_id: 'mail' } })
    const id = 'msg_123', timestamp = String(Math.floor(Date.now() / 1000))
    const signature = `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`
    const request = (value: string) => new Request('https://shows.example.com/api/notifications/webhook', { method: 'POST',
      headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': value }, body })
    expect((await webhook(request('v1,bad'))).status).toBe(401)
    expect((await webhook(request(signature))).status).toBe(204)
    expect((await pg.query('SELECT suppressed_at IS NOT NULL AS suppressed FROM notification_recipients')).rows).toEqual([{ suppressed: true }])
  })
})
