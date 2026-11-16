import { applyUnsubscribe, verifyUnsubscribeToken } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'

function scopeFor(request: Request) {
  const secret = process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET ?? ''
  const scope = verifyUnsubscribeToken(secret, new URL(request.url).searchParams.get('token') ?? '')
  return scope?.kind === 'manage' ? null : scope
}

export async function GET(request: Request) {
  if (!scopeFor(request)) return new Response('Invalid unsubscribe link.', { status: 400 })
  const token = encodeURIComponent(new URL(request.url).searchParams.get('token') ?? '')
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><body><main><h1>Stop these emails?</h1><form method="post" action="?token=${token}"><button type="submit">Unsubscribe</button></form></main></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'" },
  })
}

export async function POST(request: Request) {
  const scope = scopeFor(request)
  if (!scope) return new Response('Invalid unsubscribe link.', { status: 400 })
  try {
    await applyUnsubscribe(centralDb(), scope)
    return new Response('You are unsubscribed.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[notification unsubscribe]', error)
    return new Response('Unable to unsubscribe right now. Please try again.', { status: 503 })
  }
}
