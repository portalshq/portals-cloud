import { CentralIdentityStore, ProgramFollowsStore } from '@portalshq/capability-identity'
import { NotificationPreferencesStore, notificationOrigin, validateTimeZone } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'
import { notificationViewer } from '../../../../lib/notification-auth'
import { NotificationVerificationError, sendNotificationVerification } from '../../../../lib/notification-verification'

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
function settingsUrl(): string | null {
  try {
    const origin = notificationOrigin(process.env.NOTIFICATIONS_PUBLIC_URL ?? '', process.env.NOTIFICATIONS_ALLOW_PRIVATE_HTTP === 'true')
    return new URL('/account/notifications', origin).href
  } catch { return null }
}

export async function GET(request: Request) {
  try {
    const viewer = await notificationViewer(request)
    if (!viewer) return response({ verified: false })
    const db = centralDb()
    const follows = await db.query(`SELECT f.program_id, p.name AS program_name FROM program_follows f
      JOIN programs p ON p.id = f.program_id JOIN users u ON u.id = f.user_id AND u.status = 'active'
      WHERE f.user_id = $1 ORDER BY p.name, f.program_id`, [viewer.userId])
    const result = await db.query(`SELECT id, email, timezone, general_schedule_enabled FROM notification_recipients
      WHERE user_id = $1 AND verified_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active')`, [viewer.userId])
    const recipient = result.rows[0]
    if (!recipient) {
      const account = await db.query("SELECT email FROM users WHERE id = $1 AND status = 'active'", [viewer.userId])
      const email = typeof account.rows[0]?.email === 'string' ? account.rows[0].email.trim() : ''
      const accountEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
      return response({ verified: false, accountEmail, follows: follows.rows, settingsUrl: settingsUrl() })
    }
    const subscriptions = await db.query(`SELECT s.program_id, p.name AS program_name, s.episode_enabled, s.weekly_enabled
      FROM program_email_subscriptions s JOIN programs p ON p.id = s.program_id
      WHERE s.recipient_id = $1 ORDER BY p.name, s.program_id`, [recipient.id])
    return response({ verified: true, email: recipient.email, timezone: recipient.timezone,
      generalSchedule: recipient.general_schedule_enabled, subscriptions: subscriptions.rows, follows: follows.rows })
  } catch (error) {
    if (error instanceof NotificationVerificationError) return response({ error: error.message }, error.status)
    if ([7, 16].includes((error as { code?: number }).code ?? -1)) return response({ error: 'Session expired' }, 401)
    console.error('[notification subscriptions]', error)
    return response({ error: 'Notifications unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return response({ error: 'Forbidden' }, 403)
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.programId !== 'string' || !body.programId.trim() || body.programId.length > 256 ||
      typeof body.episode !== 'boolean' || typeof body.weekly !== 'boolean' ||
      (body.generalSchedule !== undefined && typeof body.generalSchedule !== 'boolean') ||
      typeof body.timezone !== 'string') return response({ error: 'Invalid request' }, 400)
    let timezone: string
    try { timezone = validateTimeZone(body.timezone) } catch { return response({ error: 'Choose a valid time zone' }, 400) }
    const viewer = await notificationViewer(request)
    const db = centralDb()
    if (!(await db.query('SELECT 1 FROM programs WHERE id = $1', [body.programId])).rowCount) return response({ error: 'Program not found' }, 404)
    if (viewer) {
      await new CentralIdentityStore(db).syncFromAuthGateway(viewer.userId, viewer.displayName)
      const active = await db.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [viewer.userId])
      if (!active.rowCount) return response({ error: 'Account unavailable' }, 403)
    }
    const fields = ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'referrer', 'referral', 'sourcePage', 'locale'] as const
    const attribution: Record<string, string> = {}
    for (const key of fields) if (typeof body[key] === 'string') attribution[key] = body[key].slice(0, key === 'sourcePage' || key === 'referrer' ? 500 : 160)
    const existing = viewer ? await db.query('SELECT id FROM notification_recipients WHERE user_id = $1 AND verified_at IS NOT NULL', [viewer.userId]) : null
    if (viewer && existing?.rows[0]) {
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        const recipientId = String(existing.rows[0].id)
        const store = new NotificationPreferencesStore(client)
        if (typeof body.generalSchedule === 'boolean') await store.setGeneralSchedule(recipientId, body.generalSchedule)
        await store.setProgram({ recipientId, programId: body.programId, episode: body.episode, weekly: body.weekly,
          consentSource: 'show-page', attribution })
        await store.setTimeZone(recipientId, timezone)
        if (body.ensureFollow !== false) await new ProgramFollowsStore(client).follow(viewer.userId, body.programId)
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
      return response({ ok: true, verified: true })
    }
    const account = viewer ? await db.query('SELECT email FROM users WHERE id = $1 AND status = \'active\'', [viewer.userId]) : null
    const storedEmail = typeof account?.rows[0]?.email === 'string' ? account.rows[0].email.trim() : ''
    const accountEmail = storedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storedEmail) ? storedEmail : ''
    const email = (accountEmail || (typeof body.email === 'string' ? body.email : '')).trim().toLowerCase()
    if (viewer && !email) return response({ error: 'Add and verify your account email in notification settings.', settingsUrl: settingsUrl() }, 409)
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: 'Enter a valid email address' }, 400)
    await sendNotificationVerification(db, request, email, viewer?.userId ?? null, timezone, {
      programId: body.programId, episode: body.episode, weekly: body.weekly, generalSchedule: body.generalSchedule === true,
      source: 'show-page', timezone, attribution,
    })
    return response({ ok: true, verified: false })
  } catch (error) {
    if (error instanceof NotificationVerificationError) return response({ error: error.message }, error.status)
    if ([7, 16].includes((error as { code?: number }).code ?? -1)) return response({ error: 'Session expired' }, 401)
    console.error('[notification subscriptions]', error)
    return response({ error: 'Notifications unavailable' }, 503)
  }
}
