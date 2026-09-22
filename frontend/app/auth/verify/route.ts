import {NextResponse} from 'next/server'
import {
  APP_SESSION_COOKIE,
  APP_SESSION_MAX_AGE_SECONDS,
  consumeMagicLink,
} from '@/lib/leads/application-auth'
import {extractLegacyPilotId, pilotRoomPath, safeInternalPath} from '@/lib/leads/account-paths'
import {getPilotById} from '@/lib/leads/store'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return NextResponse.redirect(new URL('/auth/sign-in?error=invalid', url))
  const result = await consumeMagicLink(token)
  if (!result) {
    return NextResponse.redirect(
      new URL(`/auth/recover?token=${encodeURIComponent(token)}`, url),
    )
  }
  let next = safeInternalPath(url.searchParams.get('next') || result.nextPath)
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
  const response = NextResponse.redirect(new URL(next, url))
  response.cookies.set(APP_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: APP_SESSION_MAX_AGE_SECONDS,
  })
  return response
}
