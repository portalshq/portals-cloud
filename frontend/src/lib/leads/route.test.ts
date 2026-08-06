import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import {POST} from '../../../app/api/leads/route'
import {processLeadOutbox} from './processor'
import {verifyRoomToken} from './pilot-tokens'
import {
  getProfileByToken,
  getPilotById,
  latestPilotByProfile,
  takeDueOutbox,
  type StoredPilot,
} from './store'

const DISCLOSURE = '2026-08-01'

type Captured = {url: string; body: {to?: string; subject?: string; text?: string}}

function captureFetch(t: TestContext) {
  const fetches: Captured[] = []
  const captured: typeof fetch = async (url, init) => {
    fetches.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    })
    return new Response(JSON.stringify({id: 'sent'}), {status: 200})
  }
  t.mock.method(globalThis, 'fetch', captured)
  return fetches
}

function post(
  body: Record<string, unknown>,
  init: {origin?: string; cookie?: string} = {},
) {
  const headers: Record<string, string> = {'content-type': 'application/json'}
  if (init.origin) headers.origin = init.origin
  if (init.cookie) headers.cookie = init.cookie
  return POST(
    new Request('http://localhost/api/leads', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

function profileTokenFrom(response: Response): string {
  const cookies = response.headers.getSetCookie()
  for (const cookie of cookies) {
    const match = cookie.match(/(?:^|;\s*)portals_profile=([^;]+)/)
    if (match) return match[1]
  }
  throw new Error('No portals_profile cookie was set.')
}

async function pilotForProfile(token: string): Promise<{profile: NonNullable<Awaited<ReturnType<typeof getProfileByToken>>>; pilot: StoredPilot | null}> {
  const profile = await getProfileByToken(token)
  assert.ok(profile, 'profile should exist for the issued token')
  const latest = await latestPilotByProfile(profile.id)
  return {profile, pilot: latest ? await getPilotById(latest.id) : null}
}

const assessmentBody = (email: string) => ({
  submissionType: 'assessment',
  idempotencyKey: `assessment:${email}`,
  formVersion: 'assessment.v1',
  provider: 'browser',
  identity: {email, company: 'Studio Example', role: 'producer', website: ''},
  attribution: {sourcePage: '/workflow-assessment'},
  consent: {disclosureVersion: DISCLOSURE, marketing: false, analytics: false},
  companyFax: '',
  answers: {
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '5-9',
    toolsUsed: '5-plus',
    approvedVersionMethod: 'creator-memory',
    productionContextMethod: 'memory-inconsistent',
    recreationFrequency: 'weekly',
    incidentType: 'failed-reproduction',
    peopleAffected: '10-24',
    hoursLost: '2-5-days',
    deliveryImpact: 'client-affected',
    recurringWorkflow: 'weekly',
    assetVolume: '500-plus',
    activeWorkflow: 'live campaign',
  },
})

const pilotBody = (
  email: string,
  overrides: Record<string, unknown> = {},
  opts: {identity?: boolean; pilotId?: string; name?: string} = {},
) => ({
  submissionType: 'pilot_request',
  idempotencyKey: `pilot:${crypto.randomUUID()}`,
  formVersion: 'paid-pilot.v1',
  provider: 'browser',
  ...(opts.identity === false
    ? {}
    : {identity: {email, name: opts.name || 'Ava Nguyen', company: 'Studio Example', role: 'producer', website: ''}}),
  ...(opts.pilotId ? {pilotId: opts.pilotId} : {}),
  attribution: {sourcePage: '/paid-pilot'},
  consent: {disclosureVersion: DISCLOSURE, marketing: false, analytics: false},
  companyFax: '',
  answers: {
    pilotWorkflow: 'campaign variant production',
    productionOwner: 'Ava Nguyen, Senior Producer',
    economicBuyer: 'Jordan Lee, Managing Director',
    economicBuyerEmail: 'jordan@studio.example',
    technicalEvaluator: 'Sam Rivera, Workflow Lead',
    technicalEvaluatorEmail: 'sam@studio.example',
    requiredIntegrations: 'MAM',
    targetStartPeriod: 'asap',
    successCriteria: 'approved-retrieval,production-context,reproduction',
    securityRequirements: 'None',
    budgetReadiness: 'funded',
    budgetOwner: 'Jordan Lee',
    approvalPath: 'self',
    annualDeploymentOption: 'studio',
    annualPriceAcknowledged: true,
    participantsRange: '2-4',
    dataClassification: 'confidential',
    signerName: 'Ava Nguyen',
    signerEmail: 'ava@studio.example',
    historicalProject: 'none',
    integrationMethod: 'manual-upload',
    ...overrides,
  },
})

test('pilot_request through POST delivers the approval-room email to the submitter', async (t) => {
  const email = `journey-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const assessment = await post(assessmentBody(email))
  assert.equal(assessment.status, 200)
  assert.ok(
    ['pilot_scope', 'assessment_review'].includes((await assessment.json()).nextAction),
    'the assessment qualifies into the review funnel',
  )
  const token = profileTokenFrom(assessment)

  const response = await post(pilotBody(email), {cookie: `portals_profile=${token}`})
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.ok, true)
  assert.equal(json.nextAction, 'pilot_room')
  assert.equal(json.pilotState, 'reviewing')
  assert.match(String(json.message), /approval room is ready/)

  const {profile, pilot} = await pilotForProfile(token)
  assert.ok(pilot, 'pilot record is created')
  assert.equal(pilot.route, 'zero-call')
  assert.equal(pilot.state, 'reviewing')
  assert.equal(pilot.answers.name, 'Ava Nguyen')
  assert.equal(pilot.answers.email, profile.identity.email)
  assert.equal(pilot.answers.email, email.toLowerCase())

  const queued = await takeDueOutbox()
  const pilotEmail = queued.find((row) => row.action_type === 'pilot_email')
  assert.ok(pilotEmail, 'a pilot_email outbox action is queued')
  assert.equal(pilotEmail.action_key, `${pilot.id}:pilot_email:reviewing:`)

  await processLeadOutbox(20)

  assert.equal(fetches.length, 1, 'exactly one email is sent')
  const sent = fetches[0].body
  assert.equal(sent.to, email.toLowerCase())
  assert.match(String(sent.subject), /pilot approval room/)
  const link = String(sent.text).match(
    /https:\/\/portals\.test\/pilot\/[^?]+\?t=([a-zA-Z0-9._-]+)/,
  )
  assert.ok(link, 'the email carries a tokenized room link')
  assert.deepEqual(verifyRoomToken(link[1]), {
    pilotId: pilot.id,
    role: 'submitter',
    email: email.toLowerCase(),
  })

  await processLeadOutbox(20)
  assert.equal(fetches.length, 1, 'the processed row is not replayed')
})

test('the submitter email is resolved from the profile when identity is not resent', async (t) => {
  const email = `cookie-only-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const first = await post(pilotBody(email))
  const token = profileTokenFrom(first)
  await processLeadOutbox(20)
  fetches.length = 0

  const second = await post(pilotBody(email, {}, {identity: false}), {
    cookie: `portals_profile=${token}`,
  })
  assert.equal(second.status, 200)
  const json = await second.json()
  assert.equal(json.nextAction, 'pilot_room')

  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  assert.equal(pilot.answers.email, email.toLowerCase())
  assert.equal(pilot.answers.name, 'Ava Nguyen')

  await processLeadOutbox(20)
  assert.equal(fetches.length, 1)
  assert.equal(fetches[0].body.to, email.toLowerCase())
})

test('a revision preserves the submitter email and re-emails the pilot plan', async (t) => {
  const email = `revise-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const created = await post(pilotBody(email))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const pilotId = pilot.id

  const revised = await post(
    pilotBody(email, {pilotWorkflow: 'asset variant production'}, {pilotId, name: 'Ava'}),
    {cookie: `portals_profile=${token}`},
  )
  assert.equal(revised.status, 200)
  const json = await revised.json()
  assert.equal(json.ok, true)

  const reloaded = await getPilotById(pilotId)
  assert.equal(reloaded?.answers.name, 'Ava')
  assert.equal(reloaded?.state, 'reviewing')
  assert.equal(reloaded?.answers.email, email.toLowerCase())
  assert.equal(
    reloaded?.history.some((entry) => entry.note === 'revision submitted'),
    true,
  )

  const queued = await takeDueOutbox()
  assert.ok(
    queued.some(
      (row) => row.action_type === 'pilot_email' && row.action_key.includes(':revised:'),
    ),
    'a revised pilot email is queued',
  )

  await processLeadOutbox(20)
  const sent = fetches.find((entry) => entry.body.subject === 'your pilot plan was updated')
  assert.ok(sent, 'the revised plan email is sent')
  assert.equal(sent.body.to, email.toLowerCase())
})

test('a disqualified pilot request is held for clarification', async (t) => {
  const email = `disqualified-${crypto.randomUUID()}@studio.example`
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', {status: 200}))

  const response = await post(pilotBody(email, {pilotWorkflow: 'none'}))
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.pilotState, 'not_eligible')
  assert.match(String(json.message), /needs clarification/)

  const token = profileTokenFrom(response)
  const {pilot} = await pilotForProfile(token)
  assert.equal(pilot?.state, 'not_eligible')
})

test('the API guards reject a foreign origin and an incomplete pilot form', async () => {
  const email = `guard-${crypto.randomUUID()}@studio.example`
  const foreign = await post(pilotBody(email), {origin: 'https://evil.example'})
  assert.equal(foreign.status, 403)

  const incomplete = await post(pilotBody(email, {pilotWorkflow: ''}))
  assert.equal(incomplete.status, 400)
})
