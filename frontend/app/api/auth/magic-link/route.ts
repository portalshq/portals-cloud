import {NextResponse} from 'next/server'
import {sendApplicationAccessEmail} from '@/lib/leads/account-email'
import {ensureApplicationUser, ensurePortalsTeamAccess, getApplicationUserByEmail} from '@/lib/leads/application-auth'
import {hashValue} from '@/lib/leads/crypto'
import {normalizeEmail} from '@/lib/leads/identity'
import {consumeRateLimit, getPilotById} from '@/lib/leads/store'
import {isPortalsTeamReviewerEmail, portalsTeamEmailsFromEnv} from '@/lib/leads/pilot-team-reviewer'
import {extractLegacyPilotId, pilotRoomPath, safeInternalPath} from '@/lib/leads/account-paths'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  let body: {email?: string; next?: string}
  try {
    body = await request.json() as {email?: string; next?: string}
  } catch {
    return NextResponse.json({ok: false, error: 'invalid request'}, {status: 400})
  }
  const email = String(body.email || '').trim()
  if (!email.includes('@')) return NextResponse.json({ok: true})
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashValue(`application-magic-link:${normalizedEmail}`)
  const allowed = await consumeRateLimit(emailHash, 3)
  if (!allowed) {
    console.warn('magic-link request skipped', { reason: 'rate_limited', emailHash })
    return NextResponse.json({ok: true})
  }
  const portalsTeamEmails = portalsTeamEmailsFromEnv()
  let user = await getApplicationUserByEmail(normalizedEmail)
  if (!user && isPortalsTeamReviewerEmail(normalizedEmail, portalsTeamEmails)) {
    // Configured Portals staff auto-provision on first sign-in so team access
    // works even when the account predates or postdates pilot creation.
    user = await ensureApplicationUser({ email: normalizedEmail, displayName: 'portals team' })
    await ensurePortalsTeamAccess(user)
  }
  if (!user) {
    console.warn('magic-link request skipped', { reason: 'unknown_email', emailHash })
    return NextResponse.json({ok: true})
  }
  if (user.status !== 'active') {
    console.warn('magic-link request skipped', { reason: 'inactive_user', emailHash })
    return NextResponse.json({ok: true})
  }
  let next = safeInternalPath(body.next)
  const legacyPilotId = extractLegacyPilotId(next)
  if (legacyPilotId) {
    try {
      const pilot = await getPilotById(legacyPilotId)
      if (pilot?.customerAccountId) {
        const legacyUrl = new URL(next, 'https://example.com')
        next = pilotRoomPath(pilot.customerAccountId, pilot.id) + legacyUrl.search
      } else if (pilot) {
        next = '/account'
      }
    } catch {}
  }
  try {
    await sendApplicationAccessEmail({
      user,
      idempotencyKey: `application-sign-in:${user.id}:${Math.floor(Date.now() / 60_000)}`,
      nextPath: next,
    })
  } catch (error) {
    console.error('magic-link email delivery failed', { emailHash, error })
    return NextResponse.json({ok: false, error: 'email_send_failed'}, {status: 500})
  }
  return NextResponse.json({ok: true})
}
