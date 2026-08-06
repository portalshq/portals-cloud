import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import {processLeadOutbox} from './processor'
import {
  attachSubmissionToPilot,
  createPilotRecord,
  enqueuePilotEmail,
  persistSubmission,
  takeDueOutbox,
  type StoredPilot,
  type StoredSubmission,
} from './store'
import {
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from './pilot'

const pilotAnswers = {
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

async function createPilot(email: string): Promise<{pilot: StoredPilot; submission: StoredSubmission}> {
  const request = {
    submissionType: 'guide_download' as const,
    idempotencyKey: `processor-helper:${crypto.randomUUID()}`,
    formVersion: 'resource.v1',
    provider: 'browser' as const,
    identity: {email, company: 'Studio Example', role: 'producer', website: ''},
    attribution: {sourcePage: '/paid-pilot'},
    consent: {disclosureVersion: '2026-08-01' as const, marketing: false, analytics: false},
    companyFax: '',
    answers: {interest: 'asset-reproduction'},
  }
  const persisted = await persistSubmission({
    request,
    identity: request.identity,
    response: {ok: true, nextAction: 'follow_up'},
    verified: true,
  })
  const classification = classifyPilot(pilotAnswers)
  const pilot = await createPilotRecord({
    profileId: persisted.submission.profile.id,
    initialSubmissionId: persisted.submission.id,
    answers: pilotAnswers,
    route: classification.route,
    state: 'reviewing',
    exceptions: classification.exceptions,
    unresolved: computeUnresolved(pilotAnswers, {route: classification.route}),
    successCriteria: buildSuccessCriteria(pilotAnswers),
    securityDecisions: buildSecurityDecisions(pilotAnswers),
  })
  await attachSubmissionToPilot(persisted.submission.id, pilot.id)
  return {pilot, submission: persisted.submission}
}

function resendStub(t: TestContext, status = 200) {
  const calls: Array<{to?: string; subject?: string; key?: string}> = []
  const stub: typeof fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers)
    calls.push({
      to: body.to,
      subject: body.subject,
      key: headers.get('Idempotency-Key') || undefined,
    })
    return new Response(status === 200 ? '{}' : 'boom', {status})
  }
  t.mock.method(globalThis, 'fetch', stub)
  return calls
}

test('pilot email is addressed to the submission identity when the queue carries no recipient', async (t) => {
  const email = `fallback-${crypto.randomUUID()}@studio.example`
  const {pilot} = await createPilot(email)
  await enqueuePilotEmail(pilot.id, 'reviewing')
  const calls = resendStub(t)

  await processLeadOutbox(20)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, email.toLowerCase())
  assert.match(String(calls[0].subject), /pilot approval room/)
  assert.deepEqual(await takeDueOutbox(), [])
})

test('an explicit recipient on the queued action wins over the submission identity', async (t) => {
  const email = `explicit-${crypto.randomUUID()}@studio.example`
  const {pilot} = await createPilot(email)
  await enqueuePilotEmail(pilot.id, 'revised_ready', 'reviewer@studio.example')
  const calls = resendStub(t)

  await processLeadOutbox(20)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, 'reviewer@studio.example')
  assert.equal(calls[0].key, `${pilot.id}-status-revised_ready-reviewer@studio.example`)
})

test('a failing pilot email backs off, retries, and dead-letters after six attempts', async (t) => {
  const email = `retry-${crypto.randomUUID()}@studio.example`
  const {pilot} = await createPilot(email)
  await enqueuePilotEmail(pilot.id, 'reviewing')
  const calls = resendStub(t, 500)

  const realNow = Date.now()
  let now = realNow
  t.mock.method(Date, 'now', () => now)

  for (let run = 0; run < 6; run++) {
    await processLeadOutbox(20)
    now += 25 * 60 * 60_000
  }

  assert.equal(calls.length, 7, 'six resend attempts plus one dead-letter notification')
  assert.match(String(calls[0].subject), /approval room is ready/)
  assert.equal(calls[6].subject, 'lead operation needs attention: pilot_email')
  assert.deepEqual(await takeDueOutbox(), [], 'the dead row is no longer due')

  await processLeadOutbox(20)
  assert.equal(calls.length, 7, 'a dead letter is never replayed')
})

test('a successful pilot email marks the outbox row complete', async (t) => {
  const email = `complete-${crypto.randomUUID()}@studio.example`
  const {pilot} = await createPilot(email)
  await enqueuePilotEmail(pilot.id, 'reviewing')
  resendStub(t)

  await processLeadOutbox(20)
  assert.deepEqual(await takeDueOutbox(), [])
})
