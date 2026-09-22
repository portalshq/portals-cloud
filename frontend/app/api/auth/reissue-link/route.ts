import {NextResponse} from 'next/server'
import {sendApplicationAccessEmail} from '@/lib/leads/account-email'
import {inspectMagicLink} from '@/lib/leads/application-auth'
import {extractLegacyPilotId, pilotRoomPath, safeInternalPath} from '@/lib/leads/account-paths'
import {getPilotById} from '@/lib/leads/store'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData()
  const token = String(form.get('token') || '')
  const link = token ? await inspectMagicLink(token) : null
  const url = new URL(request.url)
  if (!link) {
    return NextResponse.redirect(new URL('/auth/recover', url))
  }
  let nextPath = safeInternalPath(link.nextPath)
  const legacyPilotId = extractLegacyPilotId(nextPath)
  if (legacyPilotId) {
    try {
      const pilot = await getPilotById(legacyPilotId)
      if (pilot?.customerAccountId) {
        const legacyUrl = new URL(nextPath, 'https://example.com')
        const search = legacyUrl.search
        nextPath = pilotRoomPath(pilot.customerAccountId, pilot.id) + search
      } else if (pilot) {
        nextPath = '/account'
      }
    } catch {
      // keep original nextPath as safe fallback
    }
  }
  await sendApplicationAccessEmail({
    user: link.user,
    purpose: link.purpose,
    customerAccountId: link.customerAccountId,
    role: link.role,
    nextPath,
    idempotencyKey: `application-link-reissue:${link.user.id}:${Math.floor(Date.now() / 60_000)}`,
  })
  return NextResponse.redirect(
    new URL(`/auth/recover?token=${encodeURIComponent(token)}&sent=1`, url),
  )
}
