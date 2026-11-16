import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import type { Pool } from 'pg'
import { createResendNotifications, EmailVerificationStore, type VerificationIntent } from '@portalshq/capability-email-notifications'

export class NotificationVerificationError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Sends a mailbox proof without treating a claimed account address as verified. */
export async function sendNotificationVerification(db: Pool, request: Request, email: string, userId: string | null,
  timezone: string, intent?: VerificationIntent): Promise<void> {
  const publicUrl = new URL(process.env.NOTIFICATIONS_PUBLIC_URL ?? '')
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('Notifications public URL must be an HTTPS origin')
  const key = process.env.RESEND_API_KEY ?? '', from = process.env.RESEND_FROM_EMAIL ?? ''
  if (!key || !from) throw new Error('Notification email is not configured')
  const rateSecret = process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET ?? ''
  if (Buffer.byteLength(rateSecret) < 32) throw new Error('Notification secret is not configured')
  const ipHeader = process.env.NOTIFICATIONS_TRUSTED_CLIENT_IP_HEADER?.trim() || (process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : '')
  const candidateIp = ipHeader ? request.headers.get(ipHeader)?.trim() ?? '' : ''
  const ip = isIP(candidateIp) ? candidateIp : 'unknown'
  const rateKey = createHmac('sha256', rateSecret).update(`notification-verification:${ip}`).digest('hex')
  const rate = await db.query(`INSERT INTO notification_rate_limits (key,requests,expires_at)
    VALUES ($1,1,now() + interval '1 hour') ON CONFLICT (key) DO UPDATE SET
    requests = CASE WHEN notification_rate_limits.expires_at <= now() THEN 1 ELSE notification_rate_limits.requests + 1 END,
    expires_at = CASE WHEN notification_rate_limits.expires_at <= now() THEN now() + interval '1 hour' ELSE notification_rate_limits.expires_at END
    RETURNING requests`, [rateKey])
  if (Number(rate.rows[0]?.requests) > 200) throw new NotificationVerificationError('Please try again later', 429)
  const recent = await db.query(`SELECT count(*)::int AS n FROM notification_email_verifications
    WHERE email = $1 AND created_at > now() - interval '1 hour'`, [email])
  if (Number(recent.rows[0]?.n) >= 5) throw new NotificationVerificationError('Please try again later', 429)
  const token = await new EmailVerificationStore(db).issue(email, userId, new Date(), intent)
  const link = new URL('/notifications/verify', publicUrl)
  link.searchParams.set('token', token); link.searchParams.set('timezone', timezone)
  await createResendNotifications({ apiKey: key, from }).send({ to: email,
    subject: intent ? 'Confirm your show reminders' : 'Confirm your account email',
    text: `${intent ? 'Confirm your email to enable the reminders you selected' : 'Confirm this email for your account'}: ${link.href}` })
}
