import { verifyResendEvent } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? ''
  const id = request.headers.get('svix-id') ?? '', timestamp = request.headers.get('svix-timestamp') ?? ''
  const signature = request.headers.get('svix-signature') ?? ''
  if (!secret || !id || !timestamp || !signature) return new Response('Invalid signature', { status: 401 })
  const payload = await request.text()
  if (Buffer.byteLength(payload) > 65_536) return new Response('Too large', { status: 413 })
  let event: ReturnType<typeof verifyResendEvent>
  try { event = verifyResendEvent(payload, { id, timestamp, signature }, secret) }
  catch { return new Response('Invalid signature', { status: 401 }) }
  try {
    if (event.type === 'email.bounced' || event.type === 'email.complained' || event.type === 'email.suppressed') {
      const emails = event.data.to.map(email => email.trim().toLowerCase()).filter(Boolean)
      if (emails.length) await centralDb().query(
        'UPDATE notification_recipients SET suppressed_at = COALESCE(suppressed_at, now()), updated_at = now() WHERE lower(email) = ANY($1::text[])', [emails],
      )
    }
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('[notification webhook]', error)
    return new Response('Unable to process event', { status: 503 })
  }
}
