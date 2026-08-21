import {NextResponse} from 'next/server'
import {sendApplicationAccessEmail} from '@/lib/leads/account-email'
import {inspectMagicLink} from '@/lib/leads/application-auth'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData()
  const token = String(form.get('token') || '')
  const link = token ? await inspectMagicLink(token) : null
  const url = new URL(request.url)
  if (!link) {
    return NextResponse.redirect(new URL('/auth/recover', url))
  }
  await sendApplicationAccessEmail({
    user: link.user,
    purpose: link.purpose,
    customerAccountId: link.customerAccountId,
    role: link.role,
    nextPath: link.nextPath || '/account',
    idempotencyKey: `application-link-reissue:${link.user.id}:${Math.floor(Date.now() / 60_000)}`,
  })
  return NextResponse.redirect(
    new URL(`/auth/recover?token=${encodeURIComponent(token)}&sent=1`, url),
  )
}
