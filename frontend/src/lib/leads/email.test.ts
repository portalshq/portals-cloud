import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import {sendLeadConfirmation, sendPilotStatusEmail} from './email'
import {verifyRoomToken} from './pilot-tokens'
import {leadRequestSchema} from './contracts'
import {createPilotRecord, persistSubmission, type StoredPilot} from './store'
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

test('sendPilotStatusEmail uses the stored submitter email and mints a submitter room link', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewing')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'ava@studio.example')
  assert.match(String(calls[0].subject), /approval room is ready/)
  assert.equal(calls[0].idempotency, `${pilot.id}-status-reviewing-ava@studio.example`)
  const link = String(calls[0].text).match(
    /https:\/\/portals\.test\/paid-pilot\/room\/[^?]+\?t=([a-zA-Z0-9._-]+)/,
  )
  assert.ok(link, 'the email contains a tokenized room link')
  assert.deepEqual(verifyRoomToken(link[1]), {
    pilotId: pilot.id,
    role: 'submitter',
    email: 'ava@studio.example',
  })
})

test('sendPilotStatusEmail honors an explicit recipient over the answers email', async (t) => {
  const pilot = await createPilot()
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'revised', 'approver@studio.example')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'approver@studio.example')
  assert.equal(calls[0].subject, 'your pilot plan was updated')
})

test('sendPilotStatusEmail mints a tokenized room link from the recipient even when answers.email is absent', async (t) => {
  const pilot = await createPilot({...pilotAnswers, email: ''})
  const calls = resendStub(t)

  await sendPilotStatusEmail(pilot.id, 'reviewing', 'ava@studio.example')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'ava@studio.example')
  const link = String(calls[0].text).match(
    /https:\/\/portals\.test\/paid-pilot\/room\/[^?]+\?t=([a-zA-Z0-9._-]+)/,
  )
  assert.ok(link, 'the email must contain a tokenized room link when answers.email is empty')
  assert.deepEqual(verifyRoomToken(link[1]), {
    pilotId: pilot.id,
    role: 'submitter',
    email: 'ava@studio.example',
  })
})

test('sendPilotStatusEmail rejects when no recipient can be resolved', async (t) => {
  const pilot = await createPilot({...pilotAnswers, email: ''})
  resendStub(t)

  await assert.rejects(
    sendPilotStatusEmail(pilot.id, 'reviewing'),
    /Pilot recipient email is missing/,
  )
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
