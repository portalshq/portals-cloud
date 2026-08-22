import assert from 'node:assert/strict'
import test, {type TestContext} from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import {POST} from '../../../app/api/leads/route'
import {PATCH as PATCH_PILOT} from '../../../app/api/pilot/[id]/route'
import {processLeadOutbox} from './processor'
import {
  consumeMagicLink,
  getApplicationUserByEmail,
  invitePilotMember,
  issueMagicLink,
  pilotMembershipRole,
} from './application-auth'
import {
  getProfileByToken,
  getPilotById,
  latestPilotByProfile,
  takeDueOutbox,
  updatePilot,
  type StoredPilot,
} from './store'

const DISCLOSURE = '2026-08-01'

type Captured = {url: string; body: {to?: string; subject?: string; text?: string}}

function tokenFrom(text: string): string {
  const match = text.match(/https:\/\/portals\.test\/auth\/verify\?token=([^&\s]+)/)
  assert.ok(match, 'pilot email should contain a direct auth verify link')
  return decodeURIComponent(match[1])
}

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

function patchPilot(
  id: string,
  body: Record<string, unknown>,
  init: {cookie?: string} = {},
) {
  const headers: Record<string, string> = {'content-type': 'application/json'}
  if (init.cookie) headers.cookie = init.cookie
  return PATCH_PILOT(
    new Request(`http://localhost/api/pilot/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }),
    {params: Promise.resolve({id})},
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
  attribution: {sourcePage: '/assessment'},
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
  assert.match(String(sent.text), /https:\/\/portals\.test\/auth\/verify\?token=/)
  const directSession = await consumeMagicLink(tokenFrom(String(sent.text)))
  assert.equal(directSession?.user.email, email.toLowerCase())
  assert.equal(await pilotMembershipRole(pilot.id, directSession!.user.id), 'owner')

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
  const user = await getApplicationUserByEmail(email)
  assert.ok(user, 'pilot applicant has an application user account')
  const magicLink = await issueMagicLink({userId: user.id, purpose: 'sign_in'})
  const authenticated = await consumeMagicLink(magicLink)
  assert.ok(authenticated, 'magic link creates a session')

  const revised = await post(
    pilotBody(email, {pilotWorkflow: 'asset variant production'}, {pilotId, name: 'Ava'}),
    {cookie: `portals_profile=${token}; portals_session=${authenticated.sessionToken}`},
  )
  assert.equal(revised.status, 200)
  const json = await revised.json()
  assert.equal(json.ok, true)

  const reloaded = await getPilotById(pilotId)
  assert.equal(reloaded?.answers.name, 'Ava')
  assert.equal(reloaded?.state, 'reviewing')
  assert.equal(reloaded?.answers.email, email.toLowerCase())
  assert.equal(reloaded?.version, pilot.version + 1)
  assert.equal(reloaded?.draft?.baseVersion, reloaded?.version)
  assert.equal(reloaded?.revisions.length, pilot.revisions.length + 1)
  assert.ok(
    reloaded?.revisions.at(-1)?.changes.some(
      (change) => change.field === 'answers.pilotWorkflow',
    ),
    'the full-form revision is committed into revision history',
  )
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
  assert.ok(
    queued.some(
      (row) =>
        row.action_type === 'pilot_email' &&
        row.action_key.includes(':terms_changed:') &&
        row.action_key.includes(':event:revision:'),
    ),
    'the same term-change notification path used by Save Changes is queued',
  )

  await processLeadOutbox(20)
  const sent = fetches.find(
    (entry) =>
      entry.body.subject === 'your pilot plan was updated' &&
      String(entry.body.text).includes('back under review'),
  )
  assert.ok(sent, 'the revised plan email is sent')
  assert.equal(sent.body.to, email.toLowerCase())
})

test('non-owner pilot members can invite reviewers, but reviewer admin actions stay owner-only', async (t) => {
  const ownerEmail = `owner-${crypto.randomUUID()}@studio.example`
  const participantEmail = `participant-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `security-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})

  const invitedMember = await invitePilotMember({
    pilotId: teamReviewPilot.id,
    email: participantEmail,
    displayName: 'Participant',
    role: 'participant',
  })
  const magicLink = await issueMagicLink({
    userId: invitedMember.user.id,
    purpose: 'sign_in',
  })
  const authenticated = await consumeMagicLink(magicLink)
  assert.ok(authenticated)
  const cookie = `portals_session=${authenticated.sessionToken}`

  const invite = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {
      role: 'security_reviewer',
      email: reviewerEmail,
      name: 'Security Reviewer',
    },
  }, {cookie})
  assert.equal(invite.status, 200)
  assert.equal((await invite.json()).ok, true)

  const resend = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {
      role: 'security_reviewer',
      email: reviewerEmail,
      name: 'Security Reviewer',
    },
  }, {cookie})
  assert.equal(resend.status, 200)
  assert.equal((await resend.json()).ok, true)

  const reloaded = await getPilotById(teamReviewPilot.id)
  const target = reloaded?.reviewers.find((reviewer) => reviewer.email === reviewerEmail)
  assert.ok(target, 'the non-owner invite creates or updates the reviewer row')

  const remove = await patchPilot(teamReviewPilot.id, {
    action: 'remove_reviewer',
    reviewerId: target.id,
  }, {cookie})
  assert.equal(remove.status, 403)

  const role = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_role',
    reviewerId: target.id,
    role: 'approver',
  }, {cookie})
  assert.equal(role.status, 403)

  const claim = await patchPilot(teamReviewPilot.id, {
    action: 'claim_role',
    reviewerId: target.id,
  }, {cookie})
  assert.equal(claim.status, 403)
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

test('an assessment override creates a one-call qualification exception', async (t) => {
  const email = `override-${crypto.randomUUID()}@studio.example`
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', {status: 200}))

  const response = await post(
    pilotBody(email, {assessmentOrigin: 'assessment_override'}),
  )
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.pilotState, 'exception_review')
  assert.equal(json.pilotRoute, 'one-call')

  const token = profileTokenFrom(response)
  const {pilot} = await pilotForProfile(token)
  assert.ok(
    pilot?.exceptions.some((item) => item.kind === 'assessment-qualification'),
  )
})

test('the API guards reject a foreign origin and an incomplete pilot form', async () => {
  const email = `guard-${crypto.randomUUID()}@studio.example`
  const foreign = await post(pilotBody(email), {origin: 'https://evil.example'})
  assert.equal(foreign.status, 403)

  const incomplete = await post(pilotBody(email, {pilotWorkflow: ''}))
  assert.equal(incomplete.status, 400)
})

test('reset_profile clears both profile and session cookies with complete attributes', async () => {
  const response = await post({action: 'reset_profile'})
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.ok, true)

  const cookies = response.headers.getSetCookie()
  assert.ok(cookies.length >= 2, 'should set deletion headers for both profile and session cookies')

  const profileCookie = cookies.find((c) => c.startsWith('portals_profile='))
  assert.ok(profileCookie, 'portals_profile deletion cookie must be present')
  assert.match(profileCookie, /Max-Age=0/i)
  assert.match(profileCookie, /Expires=Thu, 01 Jan 1970/i)
  assert.match(profileCookie, /HttpOnly/i)
  assert.match(profileCookie, /SameSite=lax/i)
  assert.match(profileCookie, /Path=\//i)

  const sessionCookie = cookies.find((c) => c.startsWith('portals_session='))
  assert.ok(sessionCookie, 'portals_session deletion cookie must be present')
  assert.match(sessionCookie, /Max-Age=0/i)
  assert.match(sessionCookie, /Expires=Thu, 01 Jan 1970/i)
  assert.match(sessionCookie, /HttpOnly/i)
  assert.match(sessionCookie, /SameSite=lax/i)
  assert.match(sessionCookie, /Path=\//i)
})
