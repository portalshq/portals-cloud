import { NotificationPreferencesStore, validateTimeZone } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'
import { notificationViewer } from '../../../../lib/notification-auth'

export async function POST(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const viewer = await notificationViewer(request)
    if (!viewer) return Response.json({ error: 'Sign in required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body.timezone !== 'string' || typeof body.generalSchedule !== 'boolean') return Response.json({ error: 'Invalid request' }, { status: 400 })
    try { validateTimeZone(body.timezone) } catch { return Response.json({ error: 'Choose a valid time zone' }, { status: 400 }) }
    const db = centralDb()
    const recipient = await db.query(`SELECT r.id FROM notification_recipients r JOIN users u ON u.id = r.user_id AND u.status = 'active'
      WHERE r.user_id = $1 AND r.verified_at IS NOT NULL`, [viewer.userId])
    if (!recipient.rows[0]) return Response.json({ error: 'Verify your email first' }, { status: 400 })
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const store = new NotificationPreferencesStore(client)
      await store.setTimeZone(recipient.rows[0].id, body.timezone)
      await store.setGeneralSchedule(recipient.rows[0].id, body.generalSchedule)
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if ([7, 16].includes((error as { code?: number }).code ?? -1)) return Response.json({ error: 'Session expired' }, { status: 401 })
    console.error('[notification settings]', error)
    return Response.json({ error: 'Notifications unavailable' }, { status: 503 })
  }
}
