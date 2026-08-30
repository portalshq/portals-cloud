import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import {recipientRole, sendLeadConfirmation, sendPilotStatusEmail} from './email'
import {leadRequestSchema} from './contracts'
import {createPilotRecord, persistSubmission, type StoredPilot} from './store'
import {consumeMagicLink, ensureApplicationUser, highestPilotMembershipRole, inspectMagicLink, issueMagicLink, pilotMembershipRole} from './application-auth'
import {
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from './pilot'

const pilotAnswers = {
  email: 'ava@studio.example',
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'Ava Nguyen, Senior Producer',
  economicBuyer: 'Jordan Lee, Managing Director',
  technicalEvaluator: 'Sam Rivera, Workflow Lead',
  approvalPath: 'self',
  annualDeploymentOption: 'studio',
  annualPriceAcknowledged: true,
  participantsRange: '2-4',
  dataClassification: 'confidential',
  signerName: 'Ava Nguyen',
  signerEmail: 'ava@studio.example',
  integrationMethod: 'manual-upload',
  exactReproductionRequired: false,
}

async function createPilot(answers = pilotAnswers): Promise<StoredPilot> {
  const classification = classifyPilot(answers)
  return createPilotRecord({
    profileId: 'profile-test',
    initialSubmissionId: 'submission-test',
    answers,
    route: classification.route,
    state: 'reviewing',
    exceptions: classification.exceptions,
    unresolved: computeUnresolved(answers, {route: classification.route}),
    successCriteria: buildSuccessCriteria(answers),
    securityDecisions: buildSecurityDecisions(answers),
  })
}

type ResendCall = {to?: string; subject?: string; text?: string; idempotency?: string}

function tokenFrom(text: string): string {
  const match = text.match(/https:\/\/portals\.test\/auth\/verify\?token=([^&\s]+)/)
  assert.ok(match, 'email should contain a direct auth verify link')
  return decodeURIComponent(match[1])
}

function resendStub(t: TestContext) {
  const calls: ResendCall[] = []
  const stub: typeof fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers)
    calls.push({
      to: body.to,
      subject: body.subject,
      text: body.text,
      idempotency: headers.get('Idempotency-Key') || undefined,
    })
    return new Response('{}', {status: 200})
  }
  t.mock.method(globalThis, 'fetch', stub)
  return calls
}

test('sendPilotStatusEmail uses the stored submitter email and opens the room directly', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewing')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'ava@studio.example')
  assert.match(String(calls[0].subject), /approval room is ready/)
  assert.equal(calls[0].idempotency, `${pilot.id}-status-reviewing-ava@studio.example-owner`)
  assert.match(String(calls[0].text), /https:\/\/portals\.test\/auth\/verify\?token=/)
  const session = await consumeMagicLink(tokenFrom(String(calls[0].text)))
  assert.equal(session?.user.email, 'ava@studio.example')
  assert.equal(await pilotMembershipRole(pilot.id, session!.user.id), 'owner')
})

test('sendPilotStatusEmail honors an explicit recipient over the answers email', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'revised', 'approver@studio.example')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'approver@studio.example')
  assert.equal(calls[0].subject, 'your pilot agreement was revised')
})

test('sendPilotStatusEmail directs an explicit signer recipient through the secure room link', async (t) => {
  const pilot = await createPilot({...pilotAnswers, email: ''})
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'ava@studio.example')
  assert.match(String(calls[0].text), /https:\/\/portals\.test\/auth\/verify\?token=/)
  const session = await consumeMagicLink(tokenFrom(String(calls[0].text)))
  assert.equal(session?.user.email, 'ava@studio.example')
  assert.equal(await pilotMembershipRole(pilot.id, session!.user.id), 'signer')
})

test('sendPilotStatusEmail gives the Portals notification inbox secure room access', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewer_invited', 'ops@portals.test', 'stage-one')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'ops@portals.test')
  assert.equal(calls[0].idempotency, `${pilot.id}-status-reviewer_invited-ops@portals.test-approver-stage-one`)
  assert.match(String(calls[0].text), /https:\/\/portals\.test\/auth\/verify\?token=/)
  const session = await consumeMagicLink(tokenFrom(String(calls[0].text)))
  assert.equal(session?.user.email, 'ops@portals.test')
  assert.equal(await pilotMembershipRole(pilot.id, session!.user.id), 'approver')
})

test('sendPilotStatusEmail rejects when no recipient can be resolved', async (t) => {
  const pilot = await createPilot({...pilotAnswers, email: ''})
  resendStub(t)

  await assert.rejects(
    sendPilotStatusEmail(pilot.id, 'reviewing'),
    /Pilot recipient email is missing/,
  )
})

test('recipientRole selects the highest-privilege active role for a dual-role reviewer', async () => {
  const pilot = await createPilot({...pilotAnswers, email: ''})
  const dualRolePilot: StoredPilot = {
    ...pilot,
    reviewers: [
      {
        id: 'participant',
        role: 'production_owner',
        name: 'Ava Nguyen',
        email: 'ava@studio.example',
        status: 'invited',
        versionSeen: 1,
        notes: [],
      },
      {
        id: 'signer',
        role: 'signer',
        name: 'Ava Nguyen',
        email: 'ava@studio.example',
        status: 'invited',
        versionSeen: 1,
        notes: [],
      },
    ],
  }

  assert.deepEqual(recipientRole(dualRolePilot, 'AVA@studio.example'), {
    pilotRole: 'signer',
    customerRole: 'member',
    displayName: 'Ava Nguyen',
  })
})

test('recipientRole never downgrades an owner who is also the Portals notification inbox', async () => {
  const ownerEmail = `owner-notification-${crypto.randomUUID()}@studio.example`
  const pilot = await createPilot({...pilotAnswers, email: ownerEmail})
  const previousNotificationEmail = process.env.LEADS_NOTIFICATION_EMAIL
  process.env.LEADS_NOTIFICATION_EMAIL = ownerEmail
  try {
    assert.deepEqual(recipientRole(pilot, ownerEmail), {
      pilotRole: 'owner',
      customerRole: 'owner',
      displayName: undefined,
    })
  } finally {
    process.env.LEADS_NOTIFICATION_EMAIL = previousNotificationEmail
  }
})

test('owner remains the highest privilege when roles overlap', () => {
  assert.equal(highestPilotMembershipRole(['participant', 'signer', 'owner']), 'owner')
})

test('pilot status sends are persistently deduplicated per recipient and event', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'same-event')
  await sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'same-event')

  assert.equal(calls.length, 1)
})

test('concurrent pilot status sends claim delivery atomically', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await Promise.all([
    sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'concurrent-event'),
    sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'concurrent-event'),
  ])

  assert.equal(calls.length, 1)
})

test('a failed pilot status send releases its delivery claim for retry', async (t) => {
  const pilot = await createPilot()
  let attempts = 0
  t.mock.method(globalThis, 'fetch', async () => {
    attempts += 1
    return new Response(attempts === 1 ? 'boom' : '{}', {status: attempts === 1 ? 500 : 200})
  })

  await assert.rejects(
    sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'retryable-event'),
    /Resend failed/,
  )
  await sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example', 'retryable-event')

  assert.equal(attempts, 2)
})

test('expired or invalid room links fail closed but retain recovery context', async () => {
  const user = await ensureApplicationUser({email: `expired-${crypto.randomUUID()}@studio.example`})
  const token = await issueMagicLink({
    userId: user.id,
    purpose: 'invite',
    nextPath: '/paid-pilot/room/pilot-expired',
    maxAgeSeconds: -1,
  })

  assert.equal(await consumeMagicLink(token), null)
  const inspected = await inspectMagicLink(token)
  assert.equal(inspected?.expired, true)
  assert.equal(inspected?.nextPath, '/paid-pilot/room/pilot-expired')
  assert.equal(await inspectMagicLink('not-a-real-token'), null)
})

test('sendPilotStatusEmail requires Resend credentials', async (t) => {
  const pilot = await createPilot()
  resendStub(t)
  process.env.RESEND_API_KEY = ''
  process.env.LEADS_EMAIL_FROM = ''
  try {
    await assert.rejects(
      sendPilotStatusEmail(pilot.id, 'reviewing'),
      /RESEND_API_KEY and LEADS_EMAIL_FROM are required/,
    )
  } finally {
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
  }
})

test('sendLeadConfirmation addresses the submission identity', async (t) => {
  const email = `confirmation-${crypto.randomUUID()}@studio.example`
  const request = leadRequestSchema.parse({
    submissionType: 'guide_download',
    idempotencyKey: `guide:${crypto.randomUUID()}`,
    formVersion: 'resource.v1',
    provider: 'browser',
    identity: {email, company: 'Studio Example', role: 'producer', website: ''},
    attribution: {sourcePage: '/resource'},
    consent: {disclosureVersion: '2026-08-01', marketing: false, analytics: false},
    companyFax: '',
    answers: {interest: 'asset-reproduction'},
  })
  const persisted = await persistSubmission({
    request,
    identity: request.identity!,
    response: {ok: true, nextAction: 'follow_up'},
    verified: true,
  })
  const calls = resendStub(t)

  await sendLeadConfirmation(persisted.submission)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, email)
  assert.equal(calls[0].idempotency, `${persisted.submission.id}-confirmation`)
})
