import {leadDownloadUrl} from './downloads'
import {stateLabel, summarizeProposal} from './pilot'
import type {StoredPilot, StoredSubmission} from './store'
import {getPilotBySubmissionId, getPilotById} from './store'

export async function sendEmail({
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

function pilotDocuments(
  pilot: StoredPilot,
  submitterEmailOverride?: string,
): {
  roomUrl: string
  packetUrl: string
  securityUrl: string
} {
  const roomPath = `/paid-pilot/room/${pilot.id}`
  const roomUrl = `${siteUrl()}/auth/sign-in?next=${encodeURIComponent(roomPath)}`
  return {
    roomUrl,
    packetUrl: `${siteUrl()}/api/leads/documents/pilot-packet`,
    securityUrl: leadDownloadUrl('security_download') || '',
  }
}

export function submitterGreeting(pilot: StoredPilot): string | null {
  const name = String(pilot.answers.name || '').trim()
  if (name) {
    const first = name.split(/\s+/)[0]
    return `hi ${first.toLowerCase()},`
  }
  const email = String(pilot.answers.email || '').trim()
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  if (local && local.length >= 2) return `hi ${local.toLowerCase()},`
  return null
}

export function pilotCopy(
  pilot: StoredPilot,
  variant: string,
  submitterEmail?: string,
): {subject: string; text: string} {
  const {roomUrl, packetUrl, securityUrl} = pilotDocuments(pilot, submitterEmail)
  const calendar = process.env.PILOT_CALENDAR_URL
  const greeting = submitterGreeting(pilot)
  const base = [
    ...(greeting ? [greeting, ''] : []),
    `route: ${pilot.route}`,
    `status: ${stateLabel(pilot.state)}`,
    '',
    'review your personalized pilot approval room',
    roomUrl,
    'sign in with the email invited to this account to open the room.',
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
          'portals',
        ].join('\n'),
      }
    }
    case 'exception': {
      const exceptions = pilot.exceptions
        .map((item) => `- ${item.summary}`)
        .join('\n')
      return {
        subject: 'review your pilot terms',
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
        subject: 'payment received — schedule your pilot launch',
        text: [
          'your pilot payment is confirmed.',
          '',
          'schedule the pilot launch, or review the plan:',
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
          'the launch session, participants, and the plan are in your approval room:',
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
        subject: 'your pilot approval room is ready',
        text: [
          'thanks for scoping a paid production pilot with portals.',
          '',
          oneCall
            ? 'your free customized pilot plan is assembled; one pilot terms review is required:'
            : 'your free customized pilot plan is assembled — no call required:',
          roomUrl,
          '',
          'your customized pilot brief and the portals security brief are packaged together:',
          packetUrl,
          'open this link in the same browser used to complete the form.',
          ...(securityUrl ? ['', `security and architecture brief: ${securityUrl}`] : []),
          '',
          'in the approval room you can confirm the scope as drafted, request changes, or share the plan with the approver.',
          'the $5,000 fee applies only if you approve the plan and conduct the pilot.',
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
      security_download: 'portals Security and Architecture Brief',
      pilot_brief_download: 'portals Paid Production Pilot Brief',
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
      return pilotCopy(pilot, revised ? 'revised' : 'reviewing', submission.identity.email)
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
  const copy = pilotCopy(pilot, variant, target)
  await sendEmail({
    idempotencyKey: `${pilot.id}-status-${variant}-${target}`,
    to: target,
    ...copy,
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
  const answers = submission.request.answers as Record<string, unknown>
  const principalObjection = String(
    answers.objectionDetail || answers.pilotBlocker || answers.primaryObjection || 'none recorded',
  )
  const founderPilotLink = pilot
    ? `${siteUrl()}/auth/sign-in?next=${encodeURIComponent(`/paid-pilot/room/${pilot.id}`)}`
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
      ...(submission.response.qualificationOutcome
        ? [`public outcome: ${submission.response.qualificationOutcome}`]
        : []),
      ...(submission.response.reasonCodes?.length
        ? [`reason codes: ${submission.response.reasonCodes.join(', ')}`]
        : []),
      ...(submission.response.recommendedWorkflow
        ? [`recommended workflow: ${submission.response.recommendedWorkflow}`]
        : []),
      `principal objection: ${principalObjection}`,
      `next action: ${submission.response.nextAction}`,
      ...(pilot
        ? [
            '',
            `pilot route: ${pilot.route}`,
            `pilot state: ${pilot.state}`,
            `unresolved items: ${pilot.unresolved.length}`,
            `exceptions: ${pilot.exceptions.length}`,
            `approval room: ${founderPilotLink}`,
          ]
        : []),
      '',
      'the complete submission is retained in the application database and projected to apollo.',
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
      `submission: ${submissionId}`,
      `outbox action: ${outboxId}`,
      `action type: ${actionType}`,
      `last error: ${String(error).slice(0, 1000)}`,
      '',
      'a lead operation exhausted its automatic retries.',
      'review the lead_outbox record and replay it after correcting the integration.',
    ].join('\n'),
  })
}
