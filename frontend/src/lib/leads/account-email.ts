import {issueMagicLink, type ApplicationUser} from './application-auth'
import {sendEmail, siteUrl} from './email'

export async function sendApplicationAccessEmail(input: {
  user: ApplicationUser
  idempotencyKey: string
  nextPath?: string
  purpose?: 'sign_in' | 'invite'
  customerAccountId?: string
  role?: 'owner' | 'admin' | 'member'
}): Promise<void> {
  const token = await issueMagicLink({
    userId: input.user.id,
    purpose: input.purpose || 'sign_in',
    customerAccountId: input.customerAccountId,
    role: input.role,
  })
  const next = input.nextPath || '/account'
  const url = `${siteUrl()}/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`
  await sendEmail({
    idempotencyKey: input.idempotencyKey,
    to: input.user.email,
    subject: 'sign in to your portals account',
    text: [
      'use this secure link to sign in to your portals account:',
      url,
      '',
      'this link expires in 15 minutes and can be used once.',
      "if you didn't request this, you can ignore this email.",
    ].join('\n'),
  })
}
