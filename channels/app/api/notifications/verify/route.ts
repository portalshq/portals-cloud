import { claimVerifiedEmail, validateTimeZone } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'
import { notificationViewer } from '../../../../lib/notification-auth'

function parameters(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const timezone = url.searchParams.get('timezone') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  try { return { token, timezone: validateTimeZone(timezone) } } catch { return null }
}

export async function GET(request: Request) {
  const input = parameters(request)
  if (!input) return new Response('Invalid confirmation link.', { status: 400 })
  const params = new URLSearchParams(input)
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Confirm reminders</title><body><main><h1>Confirm your show reminders</h1><form method="post" action="?${params.toString()}"><button type="submit">Confirm email</button></form></main></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'" },
  })
}

export async function POST(request: Request) {
  const input = parameters(request)
  if (!input) return new Response('Invalid confirmation link.', { status: 400 })
  try {
    const viewer = await notificationViewer(request)
    const recipient = await claimVerifiedEmail(centralDb(), input.token, input.timezone, new Date(), viewer?.userId ?? null)
    if (!recipient) return new Response('This confirmation link has expired or was already used.', { status: 400 })
    return new Response(recipient.hasIntent ? 'Your email is confirmed and your reminder choices are saved.' : 'Your account email is confirmed.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (error) {
    if ((error as { code?: string | number }).code === 'AUTH_REQUIRED' || [7, 16].includes(Number((error as { code?: number }).code))) {
      return new Response('Sign in to the account that requested this confirmation.', { status: 401 })
    }
    console.error('[notification verify]', error)
    return new Response('Unable to confirm right now. Please try again.', { status: 503 })
  }
}
