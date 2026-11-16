import { NotificationPreferencesStore, validateTimeZone, verifyUnsubscribeToken } from '@portalshq/capability-email-notifications'
import { centralDb } from '../../../../lib/admin/db'
import { createHash } from 'node:crypto'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
function access(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const scope = verifyUnsubscribeToken(process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET ?? '', token)
  return scope?.kind === 'manage' ? { token, recipientId: scope.recipientId } : null
}
const timezoneScript = `const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(zone)document.querySelectorAll('form').forEach(form=>{const input=document.createElement('input');input.type='hidden';input.name='timezone';input.value=zone;form.append(input)})`
const scriptHash = createHash('sha256').update(timezoneScript).digest('base64')
const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${scriptHash}'; form-action 'self'; base-uri 'none'` }

export async function GET(request: Request) {
  const auth = access(request)
  if (!auth) return new Response('Invalid settings link.', { status: 400 })
  try {
    const db = centralDb()
    const result = await db.query('SELECT timezone, general_schedule_enabled FROM notification_recipients WHERE id = $1 AND verified_at IS NOT NULL', [auth.recipientId])
    const recipient = result.rows[0]
    if (!recipient) return new Response('Settings unavailable.', { status: 404 })
    const shows = await db.query(`SELECT s.program_id,p.name,s.episode_enabled,s.weekly_enabled FROM program_email_subscriptions s
      JOIN programs p ON p.id=s.program_id WHERE s.recipient_id=$1 ORDER BY p.name,s.program_id`, [auth.recipientId])
    const action = `?token=${encodeURIComponent(auth.token)}`
    const forms = shows.rows.map(show => `<form method="post" action="${action}"><h2>${escape(String(show.name))}</h2>
      <input type="hidden" name="programId" value="${escape(String(show.program_id))}">
      <label><input type="checkbox" name="episode" ${show.episode_enabled ? 'checked' : ''}> Remind me 5 minutes before each daily episode</label><br>
      <label><input type="checkbox" name="weekly" ${show.weekly_enabled ? 'checked' : ''}> Weekly scheduled of my followed shows</label><br>
      <button type="submit">Save show reminders</button></form>`).join('')
    const general = recipient.general_schedule_enabled ? `<form method="post" action="${action}">
      <label><input type="checkbox" name="generalSchedule" checked> Email me the weekly live schedule</label><br>
      <button type="submit">Save email settings</button></form>` : ''
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Reminder settings</title><body><main><h1>Reminder settings</h1>
      ${general}${forms}</main><script>${timezoneScript}</script></body></html>`, { headers })
  } catch (error) { console.error('[notification manage]', error); return new Response('Settings unavailable.', { status: 503 }) }
}

export async function POST(request: Request) {
  const auth = access(request)
  if (!auth) return new Response('Invalid settings link.', { status: 400 })
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden.', { status: 403 })
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 8192) return new Response('Request too large.', { status: 413 })
    const form = new URLSearchParams(raw)
    const db = centralDb(), client = await db.connect()
    try {
      await client.query('BEGIN')
      const recipient = await client.query('SELECT id FROM notification_recipients WHERE id=$1 AND verified_at IS NOT NULL FOR UPDATE', [auth.recipientId])
      if (!recipient.rowCount) { await client.query('ROLLBACK'); return new Response('Settings unavailable.', { status: 404 }) }
      const store = new NotificationPreferencesStore(client)
      const timezone = form.get('timezone')
      if (timezone) {
        try { validateTimeZone(timezone) } catch { await client.query('ROLLBACK'); return new Response('Invalid time zone.', { status: 400 }) }
        await store.setTimeZone(auth.recipientId, timezone)
      }
      const programId = form.get('programId')
      if (typeof programId === 'string') {
        const existing = await client.query('SELECT 1 FROM program_email_subscriptions WHERE recipient_id=$1 AND program_id=$2', [auth.recipientId, programId])
        if (!existing.rowCount) { await client.query('ROLLBACK'); return new Response('Show not found.', { status: 404 }) }
        await store.setProgram({ recipientId: auth.recipientId, programId, episode: form.has('episode'), weekly: form.has('weekly'), consentSource: 'email-settings', attribution: {} })
      } else {
        await store.setGeneralSchedule(auth.recipientId, form.has('generalSchedule'))
      }
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
    return Response.redirect(new URL(`/api/notifications/manage?token=${encodeURIComponent(auth.token)}`, request.url), 303)
  } catch (error) { console.error('[notification manage]', error); return new Response('Settings unavailable.', { status: 503 }) }
}
