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
  pilotMembershipRoles,
  pilotMembershipRole,
} from './application-auth'
import {
  getProfileByToken,
  getPilotById,
  getTermsAcceptanceByPilotAndEmail,
  latestPilotByProfile,
  takeDueOutbox,
  updatePilot,
  type StoredPilot,
} from './store'
import {TEST_PACKAGE_SPECIFICATIONS} from './test-package-specifications'
import {commitPilotTermRevision, pilotMutableTermsFromState} from './pilot-room-revisions'

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
    const requestUrl = url instanceof Request ? url.url : String(url)
    if (requestUrl.includes('.api.sanity.io/')) {
      return Response.json({result: TEST_PACKAGE_SPECIFICATIONS})
    }
    fetches.push({
      url: requestUrl,
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
  formVersion: 'assessment.v2',
  provider: 'browser',
  identity: {email, company: 'Studio Example', role: 'producer', website: ''},
  attribution: {sourcePage: '/assessment'},
  consent: {disclosureVersion: DISCLOSURE, marketing: false, analytics: false},
  companyFax: '',
  answers: {
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '5-9',
    toolsUsed: 'Adobe Firefly, Runway, Midjourney, ChatGPT, ComfyUI',
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
    targetStartPeriod: 'within-30-days',
    productionOwner: 'Ava Nguyen, Senior Producer',
    approvalPath: 'self',
    primaryObjection: 'value',
    objectionDetail: 'We keep rebuilding approved campaign variants because the production context is spread across several tools.',
  },
})

const pilotBody = (
  email: string,
  overrides: Record<string, unknown> = {},
  opts: {identity?: boolean; pilotId?: string; name?: string; website?: string} = {},
) => ({
  submissionType: 'pilot_request',
  idempotencyKey: `pilot:${crypto.randomUUID()}`,
  formVersion: 'paid-pilot.v1',
  provider: 'browser',
  ...(opts.identity === false
    ? {}
    : {identity: {email, name: opts.name || 'Ava Nguyen', company: 'Studio Example', role: 'producer', website: opts.website || ''}}),
  ...(opts.pilotId ? {pilotId: opts.pilotId} : {}),
  attribution: {sourcePage: '/pilot'},
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

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

test('pilot API admits personal email only under the private development opt-in', async (t) => {
  const email = `dev-pilot-${crypto.randomUUID()}@gmail.com`
  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  const fetches = captureFetch(t)
  process.env.NODE_ENV = 'development'
  delete process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV

  try {
    const rejected = await post(pilotBody(email, {}, {website: 'https://dev-pilot.example'}))
    assert.equal(rejected.status, 400)

    process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV = 'true'
    const accepted = await post(pilotBody(email, {}, {website: 'https://dev-pilot.example'}))
    assert.equal(accepted.status, 200)
    assert.equal((await accepted.json()).nextAction, 'pilot_room')

    await processLeadOutbox(20)
    assert.equal(fetches.length, 1)
    assert.equal(fetches[0].body.to, email)
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }
})

test('pilot API enforces the development-only policy for role emails', async (t) => {
  const email = `role-policy-${crypto.randomUUID()}@studio.example`
  const previousNodeEnv = process.env.NODE_ENV
  const previousPersonalEmailFlag = process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV
  const fetches = captureFetch(t)
  process.env.NODE_ENV = 'test'
  process.env.LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV = 'true'

  try {
    const rejected = await post(pilotBody(email, {signerEmail: 'signer@gmail.com'}))
    assert.equal(rejected.status, 400)

    process.env.NODE_ENV = 'development'
    const accepted = await post(pilotBody(email, {signerEmail: 'signer@gmail.com'}))
    assert.equal(accepted.status, 200)
    await processLeadOutbox(20)
    assert.equal(fetches.length, 1)
  } finally {
    restoreEnvironment('NODE_ENV', previousNodeEnv)
    restoreEnvironment('LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV', previousPersonalEmailFlag)
  }
})

test('pilot_request through POST delivers the approval-room email to the submitter', async (t) => {
  const email = `journey-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const assessment = await post(assessmentBody(email))
  assert.equal(assessment.status, 200)
  assert.equal(
    (await assessment.json()).nextAction,
    'pilot_scope',
    'the assessment establishes pilot context without a second readiness step',
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
  assert.equal(pilotEmail.action_key, `${pilot.id}:pilot_email:reviewing::event:revision:${pilot.version}:reviewing`)

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
      entry.body.subject === 'your pilot agreement was revised' &&
      String(entry.body.text).includes('pilot plan agreement has been revised'),
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

test('a dual-role reviewer keeps both memberships and one confirmation completes both reviewer entries', async (t) => {
  const ownerEmail = `dual-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `dual-reviewer-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerLink = await issueMagicLink({userId: owner.id, purpose: 'sign_in'})
  const ownerSession = await consumeMagicLink(ownerLink)
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`

  for (const role of ['production_owner', 'economic_buyer'] as const) {
    const response = await patchPilot(teamReviewPilot.id, {
      action: 'invite_reviewer',
      invite: {role, email: reviewerEmail, name: 'Dual Role Reviewer'},
    }, {cookie: ownerCookie})
    assert.equal(response.status, 200)
  }

  const beforeConfirmation = await getPilotById(teamReviewPilot.id)
  assert.ok(beforeConfirmation)
  const assigned = beforeConfirmation.reviewers.filter(
    (reviewer) => reviewer.email === reviewerEmail,
  )
  assert.deepEqual(assigned.map((reviewer) => reviewer.role).sort(), ['economic_buyer', 'production_owner'])
  assert.ok(assigned.length > 0)

  const reviewerUser = await getApplicationUserByEmail(reviewerEmail)
  assert.ok(reviewerUser)
  assert.deepEqual(
    new Set(await pilotMembershipRoles(teamReviewPilot.id, reviewerUser.id)),
    new Set(['participant', 'approver']),
  )
  const reviewerLink = await issueMagicLink({userId: reviewerUser.id, purpose: 'sign_in'})
  const reviewerSession = await consumeMagicLink(reviewerLink)
  assert.ok(reviewerSession)

  const confirmation = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_decision',
    reviewerId: assigned[0].id,
    decision: 'confirm',
    versionSeen: beforeConfirmation.version,
  }, {cookie: `portals_session=${reviewerSession.sessionToken}`})
  assert.equal(confirmation.status, 200)

  const confirmed = await getPilotById(teamReviewPilot.id)
  assert.ok(confirmed)
  const confirmedEntries = confirmed.reviewers.filter(
    (reviewer) => reviewer.email === reviewerEmail,
  )
  assert.equal(confirmedEntries.length, 2)
  assert.ok(confirmedEntries.every((reviewer) => reviewer.status === 'reviewed'))
  assert.ok(confirmedEntries.every((reviewer) => reviewer.versionSeen === confirmed.version))
  assert.equal(
    fetches.filter((entry) => entry.body.to === reviewerEmail).length,
    1,
    'a dual-role reviewer receives one direct room invitation',
  )
})

test('reviewer decisions acknowledge the invite; removed reviewers are rejected', async (t) => {
  const ownerEmail = `review-state-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `review-state-reviewer-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const {pilot} = await pilotForProfile(profileTokenFrom(created))
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`
  const proposedReviewer = {
    id: crypto.randomUUID(),
    role: 'technical_evaluator' as const,
    name: 'Reviewer',
    email: reviewerEmail,
    status: 'proposed' as const,
    versionSeen: teamReviewPilot.version,
    notes: [],
  }
  await updatePilot(teamReviewPilot.id, {reviewers: [proposedReviewer]})

  // Acting inside the room is the invite acknowledgement: a proposed reviewer
  // can be confirmed without a formal invitation being sent first.
  const proposed = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_decision',
    reviewerId: proposedReviewer.id,
    decision: 'confirm',
    versionSeen: teamReviewPilot.version,
  }, {cookie: ownerCookie})
  assert.equal(proposed.status, 200)
  const acknowledged = (await getPilotById(teamReviewPilot.id))!.reviewers.find(
    (reviewer) => reviewer.id === proposedReviewer.id,
  )
  assert.ok(acknowledged)
  assert.equal(acknowledged.status, 'reviewed')
  assert.ok(acknowledged.invitedAt)
  assert.ok(acknowledged.openedAt)
  assert.ok(acknowledged.reviewedAt)

  await patchPilot(teamReviewPilot.id, {
    action: 'remove_reviewer',
    reviewerId: proposedReviewer.id,
  }, {cookie: ownerCookie})
  const revoked = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_decision',
    reviewerId: proposedReviewer.id,
    decision: 'confirm',
    versionSeen: (await getPilotById(teamReviewPilot.id))!.version,
  }, {cookie: ownerCookie})
  assert.equal(revoked.status, 403)
  assert.deepEqual(await revoked.json(), {
    ok: false,
    code: 'reviewer_revoked',
    message: 'This reviewer was removed from the pilot. Contact the pilot owner to be re-invited.',
  })
})

test('a room member confirms their seeded proposed review without an invitation', async (t) => {
  const ownerEmail = `self-confirm-owner-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail, {productionOwnerEmail: ownerEmail}))
  const {pilot} = await pilotForProfile(profileTokenFrom(created))
  assert.ok(pilot)
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)

  const seeded = pilot.reviewers.find((reviewer) => reviewer.role === 'production_owner')
  assert.ok(seeded)
  assert.equal(seeded.status, 'proposed')
  assert.equal(seeded.email.toLowerCase(), ownerEmail.toLowerCase())

  const confirmation = await patchPilot(pilot.id, {
    action: 'reviewer_decision',
    reviewerId: seeded.id,
    decision: 'confirm',
    versionSeen: pilot.version,
  }, {cookie: `portals_session=${ownerSession.sessionToken}`})
  assert.equal(confirmation.status, 200)

  const updated = await getPilotById(pilot.id)
  assert.ok(updated)
  const confirmed = updated.reviewers.find((reviewer) => reviewer.id === seeded.id)
  assert.ok(confirmed)
  assert.equal(confirmed.status, 'reviewed')
  assert.ok(confirmed.invitedAt)
  assert.ok(confirmed.openedAt)
  assert.equal(confirmed.versionSeen, updated.version)
})

test('removing a reviewer revokes only the membership role no longer assigned', async (t) => {
  const ownerEmail = `remove-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `remove-reviewer-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`

  for (const role of ['production_owner', 'economic_buyer'] as const) {
    const response = await patchPilot(teamReviewPilot.id, {
      action: 'invite_reviewer',
      invite: {role, email: reviewerEmail, name: 'Dual Role Reviewer'},
    }, {cookie: ownerCookie})
    assert.equal(response.status, 200)
  }

  const reviewerUser = await getApplicationUserByEmail(reviewerEmail)
  assert.ok(reviewerUser)
  const reviewerSession = await consumeMagicLink(await issueMagicLink({userId: reviewerUser.id, purpose: 'sign_in'}))
  assert.ok(reviewerSession)
  const reviewerCookie = `portals_session=${reviewerSession.sessionToken}`
  const assigned = (await getPilotById(teamReviewPilot.id))!.reviewers.filter(
    (reviewer) => reviewer.email === reviewerEmail,
  )
  const economicBuyer = assigned.find((reviewer) => reviewer.role === 'economic_buyer')
  const productionOwner = assigned.find((reviewer) => reviewer.role === 'production_owner')
  assert.ok(economicBuyer)
  assert.ok(productionOwner)

  const removeEconomicBuyer = await patchPilot(teamReviewPilot.id, {
    action: 'remove_reviewer',
    reviewerId: economicBuyer.id,
  }, {cookie: ownerCookie})
  assert.equal(removeEconomicBuyer.status, 200)
  assert.deepEqual(await pilotMembershipRoles(teamReviewPilot.id, reviewerUser.id), ['participant'])

  const revokedDecision = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_decision',
    reviewerId: economicBuyer.id,
    decision: 'changes',
    note: 'This must remain unavailable after removal.',
    versionSeen: (await getPilotById(teamReviewPilot.id))!.version,
  }, {cookie: reviewerCookie})
  assert.equal(revokedDecision.status, 403)

  const removeProductionOwner = await patchPilot(teamReviewPilot.id, {
    action: 'remove_reviewer',
    reviewerId: productionOwner.id,
  }, {cookie: ownerCookie})
  assert.equal(removeProductionOwner.status, 200)
  assert.deepEqual(await pilotMembershipRoles(teamReviewPilot.id, reviewerUser.id), [])
})

test('reviewer role additions stay proposed until an explicit invitation is sent', async (t) => {
  const ownerEmail = `role-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `role-reviewer-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`

  const invite = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {role: 'production_owner', email: reviewerEmail, name: 'Reviewer'},
  }, {cookie: ownerCookie})
  assert.equal(invite.status, 200)
  fetches.length = 0

  const reviewer = (await getPilotById(teamReviewPilot.id))!.reviewers.find(
    (candidate) => candidate.email === reviewerEmail && candidate.role === 'production_owner',
  )
  assert.ok(reviewer)
  const added = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_role',
    reviewerId: reviewer.id,
    role: 'economic_buyer',
  }, {cookie: ownerCookie})
  assert.equal(added.status, 200)

  const reloaded = await getPilotById(teamReviewPilot.id)
  assert.equal(
    reloaded?.reviewers.find((candidate) => candidate.email === reviewerEmail && candidate.role === 'economic_buyer')?.status,
    'proposed',
  )
  const reviewerUser = await getApplicationUserByEmail(reviewerEmail)
  assert.ok(reviewerUser)
  assert.deepEqual(await pilotMembershipRoles(teamReviewPilot.id, reviewerUser.id), ['participant'])
  assert.equal(fetches.filter((entry) => entry.body.to === reviewerEmail).length, 0)

  const invitePerson = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {role: 'economic_buyer', email: reviewerEmail},
  }, {cookie: ownerCookie})
  assert.equal(invitePerson.status, 200)
  const invitedRoles = (await getPilotById(teamReviewPilot.id))!.reviewers.filter(
    (candidate) => candidate.email === reviewerEmail,
  )
  assert.deepEqual(invitedRoles.map((candidate) => candidate.status), ['invited', 'invited'])
})

test('an existing pilot member with no reviewer role can be assigned one', async (t) => {
  const ownerEmail = `roleless-owner-${crypto.randomUUID()}@studio.example`
  const memberEmail = `roleless-member-${crypto.randomUUID()}@studio.example`
  captureFetch(t)
  const created = await post(pilotBody(ownerEmail))
  const {pilot} = await pilotForProfile(profileTokenFrom(created))
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`
  await invitePilotMember({pilotId: teamReviewPilot.id, email: memberEmail, role: 'participant'})

  const added = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_role',
    email: memberEmail,
    role: 'technical_evaluator',
  }, {cookie: ownerCookie})
  assert.equal(added.status, 200)
  const assigned = (await getPilotById(teamReviewPilot.id))!.reviewers.find(
    (reviewer) => reviewer.email === memberEmail && reviewer.role === 'technical_evaluator',
  )
  assert.equal(assigned?.status, 'proposed')

  const outsider = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_role',
    email: `not-a-member-${crypto.randomUUID()}@studio.example`,
    role: 'economic_buyer',
  }, {cookie: ownerCookie})
  assert.equal(outsider.status, 404)
})

test('reviewer invitation endpoints reject unknown roles', async (t) => {
  const ownerEmail = `invalid-role-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `invalid-role-reviewer-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const ownerCookie = `portals_session=${ownerSession.sessionToken}`

  const invalidInvite = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {role: 'not_a_real_role', email: reviewerEmail},
  }, {cookie: ownerCookie})
  assert.equal(invalidInvite.status, 400)

  const validInvite = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {role: 'production_owner', email: reviewerEmail},
  }, {cookie: ownerCookie})
  assert.equal(validInvite.status, 200)
  const reviewer = (await getPilotById(teamReviewPilot.id))!.reviewers.find(
    (candidate) => candidate.email === reviewerEmail,
  )
  assert.ok(reviewer)
  const invalidRole = await patchPilot(teamReviewPilot.id, {
    action: 'reviewer_role',
    reviewerId: reviewer.id,
    role: 'not_a_real_role',
  }, {cookie: ownerCookie})
  assert.equal(invalidRole.status, 400)
})

test('a reviewer invitation explains the paid-pilot review and assigned terms', async (t) => {
  const ownerEmail = `invite-owner-${crypto.randomUUID()}@studio.example`
  const reviewerEmail = `invite-security-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)

  const created = await post(pilotBody(ownerEmail, {}, {name: 'Ava Nguyen'}))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerLink = await issueMagicLink({userId: owner.id, purpose: 'sign_in'})
  const ownerSession = await consumeMagicLink(ownerLink)
  assert.ok(ownerSession)

  const invite = await patchPilot(teamReviewPilot.id, {
    action: 'invite_reviewer',
    invite: {
      role: 'security_reviewer',
      email: reviewerEmail,
      name: 'Security Reviewer',
    },
  }, {cookie: `portals_session=${ownerSession.sessionToken}`})
  assert.equal(invite.status, 200)
  assert.equal((await invite.json()).ok, true)

  const directInvite = fetches.find((entry) => entry.body.to === reviewerEmail)
  assert.ok(directInvite, 'the reviewer receives a direct invitation email')
  assert.equal(directInvite.body.subject, 'You’re invited to review a portals paid pilot')
  assert.match(String(directInvite.body.text), /Ava Nguyen has invited you to review terms for a portals paid pilot\./)
  assert.match(String(directInvite.body.text), /security terms/)
  assert.match(String(directInvite.body.text), /Review your pilot terms:/)
})

test('requesting an exception review notifies the customer and Portals', async () => {
  const ownerEmail = `exception-owner-${crypto.randomUUID()}@studio.example`
  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerLink = await issueMagicLink({userId: owner.id, purpose: 'sign_in'})
  const ownerSession = await consumeMagicLink(ownerLink)
  assert.ok(ownerSession)

  const requested = await patchPilot(pilot.id, {
    action: 'request_exception',
    note: 'Portals review requested',
  }, {cookie: `portals_session=${ownerSession.sessionToken}`})
  assert.equal(requested.status, 200)
  assert.equal((await requested.json()).pilot.state, 'exception_review')

  const queued = (await takeDueOutbox(100))
    .filter((row) => row.action_key.startsWith(`${pilot.id}:`))
    .map((row) => row.action_key)
  assert.ok(
    queued.some((key) => key.includes(`:pilot_email:exception:${ownerEmail}:event:exception-review:`)),
    'the customer receives the exception-review acknowledgment',
  )
  assert.ok(
    queued.some((key) => key.includes(':pilot_email:portals_review_requested:ops@portals.test:event:exception-review:')),
    'the Portals inbox receives the review request',
  )
})

test('members can submit a shared draft while only the owner advances the pilot', async (t) => {
  const ownerEmail = `draft-owner-${crypto.randomUUID()}@studio.example`
  const participantEmail = `draft-participant-${crypto.randomUUID()}@studio.example`
  captureFetch(t)

  const created = await post(pilotBody(ownerEmail))
  const token = profileTokenFrom(created)
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const teamReviewPilot = await updatePilot(pilot.id, {state: 'team_review'})

  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerLink = await issueMagicLink({userId: owner.id, purpose: 'sign_in'})
  const ownerSession = await consumeMagicLink(ownerLink)
  assert.ok(ownerSession)

  const invitedMember = await invitePilotMember({
    pilotId: teamReviewPilot.id,
    email: participantEmail,
    displayName: 'Participant',
    role: 'participant',
  })
  const memberLink = await issueMagicLink({userId: invitedMember.user.id, purpose: 'sign_in'})
  const memberSession = await consumeMagicLink(memberLink)
  assert.ok(memberSession)
  const memberCookie = `portals_session=${memberSession.sessionToken}`

  const draft = await patchPilot(teamReviewPilot.id, {
    action: 'draft',
    baseVersion: teamReviewPilot.version,
    criteria: teamReviewPilot.successCriteria,
    startDate: '2026-10-01',
  }, {cookie: memberCookie})
  assert.equal(draft.status, 200)

  const legacySubmit = await patchPilot(teamReviewPilot.id, {
    action: 'submit_draft',
  }, {cookie: memberCookie})
  assert.equal(legacySubmit.status, 410)

  const committed = await patchPilot(teamReviewPilot.id, {
    action: 'commit_draft',
    baseVersion: teamReviewPilot.version,
    criteria: teamReviewPilot.successCriteria,
    startDate: '2026-10-01',
  }, {cookie: memberCookie})
  assert.equal(committed.status, 200)

  const reloaded = await getPilotById(teamReviewPilot.id)
  assert.equal(reloaded?.version, teamReviewPilot.version + 1)
  assert.equal(reloaded?.resolvedStartDate, '2026-10-01')
  assert.equal(reloaded?.revisions.at(-1)?.committedBy, participantEmail)
  assert.equal(reloaded?.revisions.at(-1)?.submittedBy, participantEmail)
})

test('choosing the current value resolves and clears a pilot draft conflict without a new revision', async (t) => {
  const ownerEmail = `draft-conflict-${crypto.randomUUID()}@studio.example`
  captureFetch(t)
  const created = await post(pilotBody(ownerEmail))
  const {pilot: createdPilot} = await pilotForProfile(profileTokenFrom(created))
  assert.ok(createdPilot)
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const cookie = `portals_session=${ownerSession.sessionToken}`

  const baseTerms = {...pilotMutableTermsFromState(createdPilot), startDate: '2026-10-23'}
  const baseline = commitPilotTermRevision({pilot: createdPilot, nextTerms: baseTerms, actor: ownerEmail})
  const baselinePilot = await updatePilot(createdPilot.id, {
    version: baseline.version,
    draft: baseline.draft,
    revisions: baseline.revisions,
    resolvedStartDate: baseTerms.startDate,
  })

  const draft = await patchPilot(baselinePilot.id, {
    action: 'draft',
    baseVersion: baselinePilot.version,
    criteria: baselinePilot.successCriteria,
    startDate: '2026-10-25',
    fieldPaths: ['startDate'],
  }, {cookie})
  assert.equal(draft.status, 200)

  const currentTerms = {...baseTerms, startDate: '2026-10-24'}
  const currentRevision = commitPilotTermRevision({
    pilot: (await getPilotById(baselinePilot.id))!,
    nextTerms: currentTerms,
    actor: 'concurrent-editor@studio.example',
  })
  await updatePilot(baselinePilot.id, {
    version: currentRevision.version,
    revisions: currentRevision.revisions,
    resolvedStartDate: currentTerms.startDate,
  })

  const conflict = await patchPilot(baselinePilot.id, {
    action: 'commit_draft',
    criteria: baselinePilot.successCriteria,
    startDate: '2026-10-25',
    fieldPaths: ['startDate'],
  }, {cookie})
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).conflicts[0].field, 'startDate')

  const resolved = await patchPilot(baselinePilot.id, {
    action: 'commit_draft',
    criteria: baselinePilot.successCriteria,
    startDate: '2026-10-24',
    fieldPaths: ['startDate'],
    resolutions: {startDate: 'current'},
  }, {cookie})
  assert.equal(resolved.status, 200)
  const finalPilot = await getPilotById(baselinePilot.id)
  assert.equal(finalPilot?.resolvedStartDate, '2026-10-24')
  assert.equal(finalPilot?.version, currentRevision.version)
  assert.deepEqual(finalPilot?.draft?.changes, [])
})

test('choosing your value commits the conflict and preserves other pilot edits', async (t) => {
  const ownerEmail = `draft-conflict-mine-${crypto.randomUUID()}@studio.example`
  captureFetch(t)
  const created = await post(pilotBody(ownerEmail))
  const {pilot: createdPilot} = await pilotForProfile(profileTokenFrom(created))
  assert.ok(createdPilot)
  const owner = await getApplicationUserByEmail(ownerEmail)
  assert.ok(owner)
  const ownerSession = await consumeMagicLink(await issueMagicLink({userId: owner.id, purpose: 'sign_in'}))
  assert.ok(ownerSession)
  const cookie = `portals_session=${ownerSession.sessionToken}`

  const baseTerms = {
    ...pilotMutableTermsFromState(createdPilot),
    startDate: '2026-10-23',
    answers: {...pilotMutableTermsFromState(createdPilot).answers, productionOwnerEmail: ownerEmail},
  }
  const baseline = commitPilotTermRevision({pilot: createdPilot, nextTerms: baseTerms, actor: ownerEmail})
  const baselinePilot = await updatePilot(createdPilot.id, {
    version: baseline.version,
    draft: baseline.draft,
    revisions: baseline.revisions,
    resolvedStartDate: baseTerms.startDate,
    answers: {...createdPilot.answers, productionOwnerEmail: ownerEmail},
  })

  const mineTerms = {
    ...baseTerms,
    startDate: '2026-10-25',
    answers: {...baseTerms.answers, productionOwnerEmail: 'updated-owner@studio.example'},
  }
  const draft = await patchPilot(baselinePilot.id, {
    action: 'draft',
    baseVersion: baselinePilot.version,
    criteria: mineTerms.criteria,
    startDate: mineTerms.startDate,
    draftAnswers: mineTerms.answers,
    fieldPaths: ['startDate', 'answers.productionOwnerEmail'],
  }, {cookie})
  assert.equal(draft.status, 200)

  const currentTerms = {...baseTerms, startDate: '2026-10-24'}
  const currentRevision = commitPilotTermRevision({
    pilot: (await getPilotById(baselinePilot.id))!,
    nextTerms: currentTerms,
    actor: 'concurrent-editor@studio.example',
  })
  await updatePilot(baselinePilot.id, {
    version: currentRevision.version,
    revisions: currentRevision.revisions,
    resolvedStartDate: currentTerms.startDate,
  })

  const conflict = await patchPilot(baselinePilot.id, {
    action: 'commit_draft',
    criteria: mineTerms.criteria,
    startDate: mineTerms.startDate,
    draftAnswers: mineTerms.answers,
    fieldPaths: ['startDate', 'answers.productionOwnerEmail'],
  }, {cookie})
  assert.equal(conflict.status, 409)
  assert.deepEqual((await conflict.json()).conflicts.map((item: {field: string}) => item.field), ['startDate'])

  const resolved = await patchPilot(baselinePilot.id, {
    action: 'commit_draft',
    criteria: mineTerms.criteria,
    startDate: mineTerms.startDate,
    draftAnswers: mineTerms.answers,
    fieldPaths: ['startDate', 'answers.productionOwnerEmail'],
    resolutions: {startDate: 'mine'},
  }, {cookie})
  assert.equal(resolved.status, 200)

  const finalPilot = await getPilotById(baselinePilot.id)
  assert.equal(finalPilot?.resolvedStartDate, '2026-10-25')
  assert.equal(finalPilot?.answers.productionOwnerEmail, 'updated-owner@studio.example')
  assert.equal(finalPilot?.version, currentRevision.version + 1)
  assert.deepEqual(finalPilot?.draft?.changes, [])
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

// Current diagnostic boundary, persistence, and self-serve routes.
import {ASSESSMENT_VERSION} from './assessment-definition'
import {completeAssessment, highAssessment, vfxAssessment, throughputAssessment} from './assessment-fixtures'

function diagnosticBody(email: string, answers = highAssessment) {
  return {...assessmentBody(email), formVersion: ASSESSMENT_VERSION,
    identity: {name: 'Test Producer', email, company: 'Studio Example', role: 'production-operations', website: ''},
    answers, idempotencyKey: `diagnostic:${crypto.randomUUID()}`}
}
test('v4 High and Mid results enter pilot application and keep internal tags out of public responses', async () => {
  for (const [label, answers] of [['high', highAssessment], ['medium', {...highAssessment, production_status: 'within_1_to_3_months'}]] as const) {
    const response = await post(diagnosticBody(`v4-${label}@studio.example`, answers))
    assert.equal(response.status, 200)
    const json = await response.json()
    assert.equal(json.nextAction, 'pilot_scope')
    assert.equal(json.qualificationTier, label)
    assert.ok(json.diagnosticResult.explanations.length)
    assert.ok(!JSON.stringify(json).includes('A_STATE_PERSON_DEPENDENT'))
    const profile = await getProfileByToken(profileTokenFrom(response))
    assert.ok(profile?.qualification?.scores.diagnostic)
    assert.equal(profile.qualification.answers.pilotWorkflow, answers.most_urgent_active_workflow)
    assert.ok(String(profile.qualification.answers.productionBaseline).includes('Time to transfer'))
  }
})
test('v4 Low result routes to materials even when a legacy commercial readiness path was strong', async () => {
  const email = 'v4-low-after-high@studio.example'
  const first = await post(diagnosticBody(email))
  const response = await post(diagnosticBody(email, completeAssessment), {cookie: `portals_profile=${profileTokenFrom(first)}`})
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.nextAction, 'use_case')
  assert.equal(json.qualificationTier, 'low')
  const profile = await getProfileByToken(profileTokenFrom(first))
  assert.equal(profile!.qualification!.scores.diagnostic!.meaningfulProblem, false)
  assert.equal(profile!.qualification!.answers.manual_handoff_requirements, undefined)
})
test('v4 server rejects missing required and conditional answers before persistence', async () => {
  for (const override of [{contributors_count: undefined}, {most_recent_incident: ''}, {ip_controlled_content: 'yes'}]) {
    const response = await post(diagnosticBody(`v4-invalid-${crypto.randomUUID()}@studio.example`, {...highAssessment, ...override}))
    assert.equal(response.status, 400)
    assert.equal(response.headers.getSetCookie().length, 0)
  }
})

test('assessment evidence reaches rooms without browser tampering or owner replacement', async () => {
  for (const [name, fixture] of Object.entries({A: highAssessment, B: vfxAssessment, C: throughputAssessment, MULTI: highAssessment, MID: {...highAssessment, production_status: 'within_1_to_3_months'}, LOW: completeAssessment})) {
    const email = `inherit-${name.toLowerCase()}-${crypto.randomUUID()}@studio.example`
    const assessment = await post(diagnosticBody(email, fixture))
    assert.equal(assessment.status, 200, name)
    const token = profileTokenFrom(assessment)
    const before = (await getProfileByToken(token))!.qualification!
    const original = JSON.stringify(before.answers)
    const response = await post(pilotBody(email, {productionOwner: 'Another producer', productionOwnerEmail: 'owner@studio.example', assessment_version: ASSESSMENT_VERSION, production_status: 'live_now', productionBaseline: 'Forged baseline', successCriteria: '', successCriterionKeysJson: ''}), {cookie: `portals_profile=${token}`})
    assert.equal(response.status, 200, name)
    const json = await response.json()
    assert.equal(json.pilotAuthToken, undefined)
    const {profile, pilot} = await pilotForProfile(token)
    assert.ok(pilot)
    assert.equal(JSON.stringify(profile.qualification!.answers), original)
    assert.equal(pilot.answers.productionOwnerEmail, 'owner@studio.example')
    assert.equal(pilot.answers.productionOwner, 'Another producer')
    assert.equal(pilot.answers.assessmentSnapshot.profileId, profile.id)
    assert.equal(pilot.answers.assessmentSnapshot.answers.production_status, fixture.production_status)
    assert.ok(pilot.answers.assessmentSnapshot.submissionId)
    assert.notEqual(pilot.answers.productionBaseline, 'Forged baseline')
    assert.match(pilot.answers.successCriteria, /exact approved production version/)
    if (before.tier === 'low') assert.equal(pilot.state, 'exception_review')
  }
})

test('replayed and concurrent application submissions return the same room', async () => {
  const email = `replay-${crypto.randomUUID()}@studio.example`
  const assessment = await post(diagnosticBody(email))
  const cookie = `portals_profile=${profileTokenFrom(assessment)}`
  const body = pilotBody(email)
  const responses = await Promise.all([post(body, {cookie}), post(body, {cookie})])
  const first = await responses[0].json(), second = await responses[1].json()
  assert.equal(responses[0].status, 200)
  assert.equal(responses[1].status, 200)
  assert.equal(first.pilotUrl, second.pilotUrl)
  const replay = await post({...body, answers: {...body.answers, pilotWorkflow: 'Tampered replay'}}, {cookie})
  assert.equal((await replay.json()).pilotUrl, first.pilotUrl)
  const stored = await pilotForProfile(profileTokenFrom(assessment))
  assert.equal(stored.pilot!.answers.pilotWorkflow, body.answers.pilotWorkflow)
})

test('claimed returning emails and forged assessment identifiers cannot disclose another lead', async (t) => {
  const fetches = captureFetch(t)
  const victimEmail = `victim-${crypto.randomUUID()}@studio.example`
  const assessment = await post(diagnosticBody(victimEmail))
  const token = profileTokenFrom(assessment)
  const before = JSON.stringify((await getProfileByToken(token))!.qualification)
  // A pilot request on a claimed email is captured without binding the
  // browser: no profile cookie is minted, no claimed identifiers are
  // disclosed, and no immediate room token is issued. Room access still
  // requires the emailed secure link sent to the claimed inbox.
  const claimed = await post(pilotBody(victimEmail, {assessmentId: 'forged-id', productionOwner: 'Attacker'}))
  assert.equal(claimed.status, 200)
  assert.equal(claimed.headers.getSetCookie().filter((c) => c.startsWith('portals_profile=')).length, 0)
  const claimedJson = await claimed.json()
  assert.ok(claimedJson.pilotUrl)
  assert.equal(claimedJson.pilotAuthToken, undefined)
  assert.equal(claimedJson.profileId, undefined)
  assert.equal(claimedJson.analyticsPersonId, undefined)
  assert.equal(claimedJson.downloadUrl, undefined)
  assert.equal(JSON.stringify((await getProfileByToken(token))!.qualification), before)
  const {profile: claimedProfileRecord, pilot: claimedPilot} = await pilotForProfile(token)
  assert.ok(claimedPilot)
  assert.equal(claimedPilot.answers.assessmentId, undefined)
  assert.equal(claimedPilot.answers.assessmentSnapshot?.profileId, claimedProfileRecord.id)
  // Room access for the claimed identity arrives through the emailed secure
  // link, which verifies straight into the pilot room.
  await processLeadOutbox(2000)
  const claimedAccessEmail = fetches.find(
    (entry) => entry.body.to === victimEmail && String(entry.body.text).includes('/auth/verify?token='),
  )
  assert.ok(claimedAccessEmail, 'the claimed applicant receives the existing secure email continuation')
  const claimedSession = await consumeMagicLink(tokenFrom(String(claimedAccessEmail.body.text)))
  assert.ok(claimedSession)
  assert.equal(claimedSession.nextPath, claimedJson.pilotUrl)
  const unsignedProvider = await post({...pilotBody(victimEmail), provider: 'apollo'})
  assert.equal(unsignedProvider.status, 400)
  assert.equal(unsignedProvider.headers.getSetCookie().length, 0)
  const other = await post(pilotBody(`other-${crypto.randomUUID()}@studio.example`, {...highAssessment, assessmentId: 'forged-id'}))
  assert.equal(other.status, 200)
  const otherPilot = (await pilotForProfile(profileTokenFrom(other))).pilot!
  assert.equal(otherPilot.answers.assessmentSnapshot, undefined)
  assert.equal(otherPilot.answers.assessment_version, undefined)
})

test('unbound claimed-email assessments render results without binding the browser', async () => {
  const email = `unbound-${crypto.randomUUID()}@studio.example`
  const first = await post(diagnosticBody(email, {
    ...highAssessment,
    // A schema-allowed field that is neither a v4 question id nor a
    // pilotAssessmentPrefill target, so it only survives via a proper
    // prior-answers merge.
    incidentDescription: 'historical-marker',
  }))
  assert.equal(first.status, 200)
  const ownerToken = profileTokenFrom(first)

  // A fresh browser claiming the same email gets its own results but is never
  // bound to the stored profile: no token cookie is issued, the document
  // download CTA (which requires the token) is omitted, and the claimed
  // profile's identifiers are withheld so this browser cannot alias the
  // owner's analytics identity.
  const resumed = await post(diagnosticBody(email, vfxAssessment))
  assert.equal(resumed.status, 200)
  const resumedJson = await resumed.json()
  assert.equal(resumedJson.ok, true)
  assert.ok(resumedJson.diagnosticResult)
  assert.equal(resumedJson.downloadUrl, undefined)
  assert.equal(resumedJson.profileId, undefined)
  assert.equal(resumedJson.analyticsPersonId, undefined)
  assert.equal(
    resumed.headers.getSetCookie().filter((c) => c.startsWith('portals_profile=')).length,
    0,
  )

  // The owner's existing token still resolves and now holds the fresh
  // diagnostic, matching re-assessment replacement semantics. Stored
  // historical (non-question) fields survive the merge instead of being
  // overwritten by the fresh diagnostic alone.
  const profile = await getProfileByToken(ownerToken)
  assert.ok(profile)
  assert.equal(profile.qualification!.answers.production_type, 'vfx_animation_virtual_production')
  assert.equal(profile.qualification!.answers.incidentDescription, 'historical-marker')

  // Submissions that are neither assessments nor pilot requests still
  // require sign-in on a claimed email.
  const rejected = await post({
    submissionType: 'contact',
    idempotencyKey: `contact:${crypto.randomUUID()}`,
    formVersion: 'contact.v1',
    provider: 'browser',
    identity: {email, name: 'Ava Nguyen', company: 'Studio Example', role: 'producer', website: ''},
    attribution: {sourcePage: '/contact'},
    consent: {disclosureVersion: DISCLOSURE, marketing: false, analytics: false},
    companyFax: '',
    answers: {question: 'Tell me more about the pilot.', interest: ''},
  })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.headers.getSetCookie().length, 0)
})

test('a qualified assessment reaches accepted terms, simulated payment and activation through the API', async (t) => {
  const email = `commercial-journey-${crypto.randomUUID()}@studio.example`
  const fetches = captureFetch(t)
  const assessment = await post(diagnosticBody(email))
  const profileToken = profileTokenFrom(assessment)
  const created = await post(pilotBody(email, {
    targetStartPeriod: 'within-30-days', historicalProject: 'one-completed',
    productionOwner: 'Ava Nguyen', productionOwnerEmail: email,
    successCriteria: '', successCriterionKeysJson: '',
  }), {cookie: `portals_profile=${profileToken}`})
  assert.equal(created.status, 200)
  const {pilot} = await pilotForProfile(profileToken)
  assert.ok(pilot)
  assert.equal(pilot.route, 'zero-call')
  const originalPrice = pilot.proposal!.priceAmount
  const originalDuration = pilot.proposal!.termDays
  await processLeadOutbox(2000)
  const accessEmail = fetches.find(entry => entry.body.to === email && String(entry.body.text).includes('/auth/verify?token='))
  assert.ok(accessEmail, 'the application supplies its existing secure email continuation')
  const session = await consumeMagicLink(tokenFrom(String(accessEmail.body.text)))
  assert.ok(session)
  const cookie = `portals_session=${session.sessionToken}`
  const act = async (body: Record<string, unknown>, expectedState: string) => {
    const response = await patchPilot(pilot.id, body, {cookie})
    const json = await response.json()
    assert.equal(response.status, 200, JSON.stringify(json))
    assert.equal(json.pilot.state, expectedState)
    return json.pilot as StoredPilot
  }
  assert.equal((await patchPilot(pilot.id, {action: 'sign', signer: {name: 'Ava Nguyen', email}}, {cookie})).status, 400)
  assert.equal((await patchPilot(pilot.id, {action: 'pay'}, {cookie})).status, 400)
  const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const scoped = await act({action: 'update', startDate, answers: {signerName: 'Ava Nguyen', signerEmail: email}, priceAmount: 1, proposal: {priceAmount: 1, termDays: 1}}, 'reviewing')
  assert.equal(scoped.proposal!.priceAmount, originalPrice)
  assert.equal(scoped.proposal!.termDays, originalDuration)
  await act({action: 'confirm_scope'}, 'scope_confirmed')
  const finalized = await act({action: 'finalize'}, 'ready_sign')
  const signed = await act({action: 'sign', signer: {name: 'Ava Nguyen', email}, answers: {pilotWorkflow: 'Unapproved signature-time terms'}}, 'signed')
  assert.ok(signed.signing.termsAcceptanceId)
  const acceptance = await getTermsAcceptanceByPilotAndEmail(pilot.id, email, signed.signing.termsHash!, signed.signing.scopeHash!)
  assert.ok(acceptance)
  assert.equal((acceptance.termsSnapshot as {scope: {answers: Record<string, unknown>}}).scope.answers.pilotWorkflow, finalized.answers.pilotWorkflow)
  assert.equal((await patchPilot(pilot.id, {action: 'draft', draftAnswers: {pilotWorkflow: 'Late change'}}, {cookie})).status, 400)
  assert.equal(signed.proposal!.priceAmount, originalPrice)
  assert.ok((await patchPilot(pilot.id, {action: 'sign', signer: {name: 'Ava Nguyen', email}}, {cookie})).status >= 400)
  assert.equal((await getPilotById(pilot.id))!.signing.termsAcceptanceId, signed.signing.termsAcceptanceId)
  await act({action: 'pay', payment: {amount: originalPrice, method: 'local-test'}}, 'paid')
  await act({action: 'launch', launch: {date: startDate, timezone: 'UTC', slotLabel: 'Local fixture', availabilityVersion: 'default'}}, 'launch')
  const active = await act({action: 'activate'}, 'active')
  assert.ok(active.payment.paidAt)
  assert.deepEqual(active.answers.assessmentSnapshot, finalized.answers.assessmentSnapshot)
})

test('room edits cannot forge assessment evidence or erase required founder qualification', async () => {
  const email = `room-low-${crypto.randomUUID()}@studio.example`
  const assessment = await post(diagnosticBody(email, completeAssessment))
  const token = profileTokenFrom(assessment)
  await post(pilotBody(email), {cookie: `portals_profile=${token}`})
  const {pilot} = await pilotForProfile(token)
  assert.ok(pilot)
  const owner = await getApplicationUserByEmail(email)
  const session = await consumeMagicLink(await issueMagicLink({userId: owner!.id, purpose: 'sign_in'}))
  const cookie = `portals_session=${session!.sessionToken}`
  const originalSnapshot = structuredClone(pilot.answers.assessmentSnapshot)
  const updated = await patchPilot(pilot.id, {action: 'update', answers: {
    assessmentOrigin: 'standard', assessmentSnapshot: {profileId: 'foreign'},
    production_status: 'live_now', productionBaseline: 'Forged baseline',
  }}, {cookie})
  assert.equal(updated.status, 200)
  const room = (await updated.json()).pilot
  assert.equal(room.answers.assessmentOrigin, 'assessment_override')
  assert.deepEqual(room.answers.assessmentSnapshot, originalSnapshot)
  assert.ok(room.exceptions.some((exception: {kind: string}) => exception.kind === 'assessment-qualification'))
  assert.equal((await patchPilot(pilot.id, {action: 'resolve_exceptions'}, {cookie})).status, 403)
  assert.equal((await patchPilot(pilot.id, {action: 'sign', signer: {name: 'Ava', email}}, {cookie})).status, 422)
})
