import { CentralIdentityStore } from '@portalshq/capability-identity'
import { validateTimeZone } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'
import { notificationViewer } from '../../../../lib/notification-auth'
import { NotificationVerificationError, sendNotificationVerification } from '../../../../lib/notification-verification'

export async function POST(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const viewer = await notificationViewer(request)
    if (!viewer) return Response.json({ error: 'Sign in required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body.timezone !== 'string') return Response.json({ error: 'Invalid request' }, { status: 400 })
    let timezone: string
    try { timezone = validateTimeZone(body.timezone) } catch { return Response.json({ error: 'Unable to detect your time zone' }, { status: 400 }) }
    const db = centralDb()
    await new CentralIdentityStore(db).syncFromAuthGateway(viewer.userId, viewer.displayName)
    const user = await db.query("SELECT email FROM users WHERE id = $1 AND status = 'active'", [viewer.userId])
    if (!user.rowCount) return Response.json({ error: 'Account unavailable' }, { status: 403 })
    const existing = await db.query('SELECT 1 FROM notification_recipients WHERE user_id = $1 AND verified_at IS NOT NULL', [viewer.userId])
    if (existing.rowCount) return Response.json({ error: 'Your email is already verified' }, { status: 409 })
    const storedEmail = typeof user.rows[0]?.email === 'string' ? user.rows[0].email.trim() : ''
    const accountEmail = storedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storedEmail) ? storedEmail : ''
    const email = (accountEmail || (typeof body.email === 'string' ? body.email : '')).trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Enter a valid email address' }, { status: 400 })
    await sendNotificationVerification(db, request, email, viewer.userId, timezone)
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof NotificationVerificationError) return Response.json({ error: error.message }, { status: error.status })
    if ([7, 16].includes((error as { code?: number }).code ?? -1)) return Response.json({ error: 'Session expired' }, { status: 401 })
    console.error('[notification verify email]', error)
    return Response.json({ error: 'Email verification unavailable' }, { status: 503 })
  }
}
