import {leadDownloadUrl} from './downloads'
import {stateLabel, summarizeProposal} from './pilot'
import {roomToken, type RoomToken} from './pilot-tokens'
import type {StoredPilot, StoredSubmission} from './store'
import {getPilotBySubmissionId, getPilotById} from './store'

async function sendEmail({
  idempotencyKey,
  to,
  subject,
  text,
  replyTo,
}: {
  idempotencyKey: string
  to: string | string[]
  subject: string
  text: string
  replyTo?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.LEADS_EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and LEADS_EMAIL_FROM are required.')
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'portals-lead-operations/1.0',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      ...(replyTo ? {reply_to: replyTo} : {}),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`)
  }
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works').replace(/\/$/, '')
}

function pilotRoomLink(
  pilot: StoredPilot,
  role: RoomToken['role'],
  email: string,
): string {
  const token = roomToken(pilot.id, role, email)
  return `${siteUrl()}/pilot/${pilot.id}?t=${encodeURIComponent(token)}`
}

function pilotDocuments(pilot: StoredPilot): {
  roomUrl: string
  packetUrl: string
  securityUrl: string
} {
  const submitterEmail = String(pilot.answers.email || '')
  let roomUrl = `${siteUrl()}/pilot/${pilot.id}`
  if (submitterEmail) {
    try {
      const token = roomToken(pilot.id, 'submitter', submitterEmail)
      roomUrl = `${siteUrl()}/pilot/${pilot.id}?t=${encodeURIComponent(token)}`
    } catch {
      roomUrl = `${siteUrl()}/pilot/${pilot.id}`
    }
  }
  return {
    roomUrl,
    packetUrl: `${siteUrl()}/api/leads/documents/pilot-packet`,
    securityUrl: leadDownloadUrl('security_download') || '',
  }
}

function pilotCopy(
  pilot: StoredPilot,
  variant: string,
): {subject: string; text: string} {
  const {roomUrl, packetUrl, securityUrl} = pilotDocuments(pilot)
  const calendar = process.env.PILOT_CALENDAR_URL
  const base = [
    `route: ${pilot.route}`,
    `status: ${stateLabel(pilot.state)}`,
    '',
    'review your personalized pilot approval room:',
    roomUrl,
    'open the link in the same browser used to complete the form.',
  ]

  switch (variant) {
    case 'revised': {
      return {
        subject: 'your pilot plan was updated',
        text: [
          'your pilot plan was updated and is back under review.',
          '',
          ...base,
          '',
          'the plan is ready to confirm as drafted, request changes, or schedule a review:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'exception': {
      const exceptions = pilot.exceptions
        .map((item) => `- ${item.summary}`)
        .join('\n')
      return {
        subject: 'your pilot needs a pilot terms review',
        text: [
          'your pilot request includes items outside the standard scope, so a single pilot terms review is required.',
          '',
          ...(exceptions ? [`the items:`, '', exceptions, ''] : []),
          'during the review we will resolve the terms, then you can confirm scope and sign.',
          '',
          'open your pilot approval room:',
          roomUrl,
          ...(calendar ? ['', 'or schedule the pilot terms review directly:', calendar] : []),
          ...(securityUrl ? ['', `security and architecture brief: ${securityUrl}`] : []),
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'ready_sign': {
      const snapshot = pilot.proposal
      return {
        subject: 'your pilot agreement is ready to sign',
        text: [
          'your pilot scope is confirmed and the standard pilot agreement is ready.',
          '',
          summarizeProposal(snapshot),
          '',
          ...(snapshot?.annualOption?.creditNote
            ? [`annual deployment note: ${snapshot.annualOption.creditNote}`, '']
            : []),
          'your personalized plan and order form:',
          packetUrl,
          ...(securityUrl ? ['', `security and architecture brief: ${securityUrl}`] : []),
          '',
          'sign and fund the pilot in your approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'paid': {
      return {
        subject: 'payment received — schedule your pilot kickoff',
        text: [
          'your pilot payment is confirmed.',
          '',
          'schedule the pilot kickoff, or review the plan:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'kickoff': {
      return {
        subject: 'your production pilot is live',
        text: [
          'your production pilot is live.',
          '',
          'the kickoff session, participants, and the plan are in your approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'change_requested': {
      return {
        subject: 'a reviewer requested changes to your pilot plan',
        text: [
          'one of your reviewers requested changes to the pilot plan.',
          '',
          'open your pilot approval room to review the requested changes and submit a revised plan:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'revised_ready': {
      return {
        subject: 'the pilot plan was revised — please re-review',
        text: [
          'the pilot plan you were invited to review has been revised.',
          '',
          'review the updated plan and confirm your decision in the approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'technical_confirmed': {
      return {
        subject: 'technical scope confirmed — next review steps',
        text: [
          'the technical evaluator has confirmed the technical scope of your pilot plan.',
          '',
          'track the remaining reviews in your approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'buyer_nudge': {
      return {
        subject: 'the pilot plan awaits your review',
        text: [
          `you have been asked to review the commercial terms of a portals production pilot for ${String(pilot.answers.company || 'the customer')}.`,
          '',
          'the technical scope is confirmed and the remaining decision sits with the economic buyer.',
          '',
          'open the pilot approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    case 'terms_confirmed': {
      return {
        subject: 'commercial terms confirmed — your pilot agreement can be finalized',
        text: [
          'the economic buyer has confirmed the commercial terms of your pilot plan.',
          '',
          'confirm scope and finalize the agreement in your approval room:',
          roomUrl,
          '',
          'portals',
        ].join('\n'),
      }
    }
    default: {
      const oneCall = pilot.route === 'one-call'
      return {
        subject: 'your personalized pilot approval room is ready',
        text: [
          'thanks for scoping a paid production pilot with portals.',
          '',
          'your personalized pilot plan is assembled — no call required:',
          roomUrl,
          '',
          'your customized pilot brief and the portals security brief are packaged together:',
          packetUrl,
          'open this link in the same browser used to complete the form.',
          ...(securityUrl ? ['', `security and architecture brief: ${securityUrl}`] : []),
          '',
          'in the approval room you can confirm the scope as drafted, request changes, or share the plan with the approver.',
          ...(oneCall && calendar
            ? ['', `a pilot terms review is required: choose a time: ${calendar}`]
            : []),
          '',
          'portals',
        ].join('\n'),
      }
    }
  }
}

async function confirmationCopy(
  submission: StoredSubmission,
): Promise<{subject: string; text: string}> {
  const {submissionType} = submission.request
  const downloadUrl = leadDownloadUrl(submissionType)
  if (downloadUrl) {
    const labels = {
      guide_download: 'Production Memory Field Guide',
      security_download: 'Portals Security and Architecture Brief',
      pilot_brief_download: 'Portals Paid Production Pilot Brief',
    } as const
    return {
      subject: `your ${labels[submissionType as keyof typeof labels].toLowerCase()}`,
      text: [
        'thanks for your interest in portals.',
        '',
        `download ${labels[submissionType as keyof typeof labels]}:`,
        downloadUrl,
        '',
        'portals',
      ].join('\n'),
    }
  }

  if (submissionType === 'pilot_request') {
    const pilot = await getPilotBySubmissionId(submission.id)
    if (pilot) {
      const revised = pilot.history.some(
        (entry) => entry.action === 'revised' || entry.note === 'revision submitted',
      )
      return pilotCopy(pilot, revised ? 'revised' : 'reviewing')
    }
    const calendar = process.env.PILOT_CALENDAR_URL
    const packetUrl = `${siteUrl()}/api/leads/documents/pilot-packet`
    return {
      subject: 'your portals paid pilot packet',
      text: [
        'thanks for scoping a paid production pilot with portals.',
        '',
        'your customized pilot brief and the portals security brief are packaged together:',
        packetUrl,
        'open this link in the same browser used to complete the form.',
        '',
        'we will review the workflow, people, integrations, timing, security requirements, and desired outcome before confirming fit.',
        ...(calendar ? ['', `choose a time: ${calendar}`] : ["", "we'll follow up with next steps."]),
        '',
        'portals',
      ].join('\n'),
    }
  }

  return {
    subject: 'portals received your request',
    text: [
      'thanks for contacting portals.',
      '',
      'we received your request and will follow up with the most useful next step.',
      '',
      'portals',
    ].join('\n'),
  }
}

export async function sendLeadConfirmation(
  submission: StoredSubmission,
): Promise<void> {
  if (!submission.identity.email) throw new Error('Submission email is missing.')
  const copy = await confirmationCopy(submission)
  await sendEmail({
    idempotencyKey: `${submission.id}-confirmation`,
    to: submission.identity.email,
    ...copy,
  })
}

export async function sendPilotStatusEmail(
  pilotId: string,
  variant: string,
  recipient?: string,
): Promise<void> {
  const pilot = await getPilotById(pilotId)
  if (!pilot) throw new Error('Pilot record not found.')
  const target = recipient
    ? String(recipient).trim()
    : String(pilot.answers.email || '')
  if (!target) throw new Error('Pilot recipient email is missing.')
  const copy = pilotCopy(pilot, variant)
  await sendEmail({
    idempotencyKey: `${pilot.id}-status-${variant}-${target}`,
    to: target,
    ...copy,
  })
}

export async function sendPilotShareEmail(
  pilot: StoredPilot,
  role: 'participant' | 'approver' | 'signer',
  recipient: string,
): Promise<void> {
  const link = pilotRoomLink(pilot, role, recipient)
  const subject =
    role === 'approver'
      ? 'you have been asked to approve a portals production pilot'
      : role === 'signer'
        ? 'you have been asked to sign a portals production pilot'
        : 'you have been added to a portals production pilot'
  await sendEmail({
    idempotencyKey: `${pilot.id}-share-${role}-${recipient}`,
    to: recipient,
    subject,
    text: [
      `you have been invited as ${role} on a portals production pilot.`,
      '',
      `status: ${stateLabel(pilot.state)}`,
      summarizeProposal(pilot.proposal),
      '',
      'open the pilot approval room:',
      link,
      '',
      'portals',
    ].join('\n'),
  })
}

export async function sendFounderNotification(
  submission: StoredSubmission,
): Promise<void> {
  const recipient = process.env.LEADS_NOTIFICATION_EMAIL
  if (!recipient) throw new Error('LEADS_NOTIFICATION_EMAIL is required.')
  const pilot =
    submission.request.submissionType === 'pilot_request'
      ? await getPilotBySubmissionId(submission.id)
      : null
  await sendEmail({
    idempotencyKey: `${submission.id}-founder`,
    to: recipient,
    subject: `${submission.request.submissionType.replaceAll('_', ' ')} - ${submission.identity.company}`,
    replyTo: submission.identity.email,
    text: [
      `new ${submission.request.submissionType.replaceAll('_', ' ')}`,
      '',
      `company: ${submission.identity.company}`,
      `role: ${submission.identity.role}`,
      `source: ${submission.request.attribution.sourcePage}`,
      ...(submission.tier ? [`qualification: ${submission.tier}`] : []),
      ...(pilot
        ? [
            '',
            `pilot route: ${pilot.route}`,
            `pilot state: ${pilot.state}`,
            `unresolved items: ${pilot.unresolved.length}`,
            `exceptions: ${pilot.exceptions.length}`,
          ]
        : []),
      '',
      'the complete submission is recorded in attio.',
    ].join('\n'),
  })
}

export async function sendDeadLetterNotification({
  outboxId,
  submissionId,
  actionType,
  error,
}: {
  outboxId: string
  submissionId: string
  actionType: string
  error: unknown
}): Promise<void> {
  const recipient = process.env.LEADS_NOTIFICATION_EMAIL
  if (!recipient) throw new Error('LEADS_NOTIFICATION_EMAIL is required.')
  await sendEmail({
    idempotencyKey: `lead-outbox-${outboxId}-dead-letter`,
    to: recipient,
    subject: `lead operation needs attention: ${actionType}`,
    text: [
      'a lead operation exhausted its automatic retries.',
      '',
      `submission: ${submissionId}`,
      `outbox action: ${outboxId}`,
      `action type: ${actionType}`,
      `last error: ${String(error).slice(0, 1000)}`,
      '',
      'review the lead_outbox record and replay it after correcting the integration.',
    ].join('\n'),
  })
}
