import {NextResponse} from 'next/server'
import {sendApplicationAccessEmail} from '@/lib/leads/account-email'
import {getApplicationUserByEmail} from '@/lib/leads/application-auth'
import {hashValue} from '@/lib/leads/crypto'
import {normalizeEmail} from '@/lib/leads/identity'
import {consumeRateLimit, getPilotById} from '@/lib/leads/store'
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
  const allowed = await consumeRateLimit(hashValue(`application-magic-link:${normalizedEmail}`), 3)
  if (!allowed) return NextResponse.json({ok: true})
  const user = await getApplicationUserByEmail(normalizedEmail)
  if (user?.status === 'active') {
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
    await sendApplicationAccessEmail({
      user,
      idempotencyKey: `application-sign-in:${user.id}:${Math.floor(Date.now() / 60_000)}`,
      nextPath: next,
    })
  }
  return NextResponse.json({ok: true})
}
