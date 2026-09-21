import {hashValue} from './crypto'
import {issueMagicLink, type ApplicationUser} from './application-auth'
import {sendEmail, siteUrl} from './email'
import type {ReviewerRole} from './pilot'
import {
  claimPilotEmailDeduplication,
  completePilotEmailDeduplication,
  releasePilotEmailDeduplication,
} from './store'

const REVIEW_AREAS: Record<ReviewerRole, string> = {
  production_owner: 'workflow and scope terms',
  economic_buyer: 'commercial terms',
  technical_evaluator: 'technical scope',
  security_reviewer: 'security terms',
  procurement_reviewer: 'procurement terms',
  approver: 'approval terms',
  signer: 'agreement terms',
}

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
    nextPath: input.nextPath || '/account',
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

export async function sendPilotReviewInviteEmail(input: {
  user: ApplicationUser
  pilotId: string
  customerAccountId: string
  roles: readonly ReviewerRole[]
  inviterName?: string
  idempotencyKey: string
  eventKey: string
}): Promise<boolean> {
  const roles = [...new Set(input.roles)]
  if (roles.length === 0) throw new Error('A reviewer invitation requires at least one role.')
  const recipientKey = hashValue(input.user.email.trim().toLowerCase())
  const claimToken = await claimPilotEmailDeduplication({
    pilotId: input.pilotId,
    recipientKey,
    eventType: 'reviewer_invited',
    eventKey: input.eventKey,
  })
  if (!claimToken) return false
  try {
    const token = await issueMagicLink({
      userId: input.user.id,
      purpose: 'invite',
      customerAccountId: input.customerAccountId,
      role: 'member',
      nextPath: `/paid-pilot/room/${input.pilotId}`,
    })
    const url = `${siteUrl()}/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(`/paid-pilot/room/${input.pilotId}`)}`
    const inviter = input.inviterName?.trim() || 'The pilot owner'
    const reviewAreas = roles.map((role) => REVIEW_AREAS[role])
    await sendEmail({
      idempotencyKey: input.idempotencyKey,
      to: input.user.email,
      subject: 'You’re invited to review a portals paid pilot',
      text: [
        `${inviter} has invited you to review terms for a portals paid pilot.`,
        '',
        `You will review the ${reviewAreas.join(' and ')}.`,
        '',
        'Open the pilot approval room:',
        url,
        '',
        'This secure link expires in 15 minutes and can be used once.',
        '',
        'portals',
      ].join('\n'),
    })
    await completePilotEmailDeduplication({
      pilotId: input.pilotId,
      recipientKey,
      eventType: 'reviewer_invited',
      eventKey: input.eventKey,
      claimToken,
    })
    return true
  } catch (error) {
    await releasePilotEmailDeduplication({
      pilotId: input.pilotId,
      recipientKey,
      eventType: 'reviewer_invited',
      eventKey: input.eventKey,
      claimToken,
    })
    throw error
  }
}
