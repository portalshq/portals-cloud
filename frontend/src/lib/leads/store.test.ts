import assert from 'node:assert/strict'
import test from 'node:test'
import {leadRequestSchema, type LeadResponse} from './contracts'
import {calculateQualification, qualificationTier} from './scoring'
import {getProfileById, getProfileByToken, outboxActions, persistSubmission} from './store'

process.env.LEADS_DRY_RUN = 'true'

test('assessment founder notifications are limited to medium and high tiers', () => {
  const request = leadRequestSchema.parse({
    submissionType: 'assessment',
    idempotencyKey: `assessment:${crypto.randomUUID()}`,
    formVersion: 'assessment.v1',
    provider: 'browser',
    identity: {email: 'notify@studio.example', company: 'Studio', role: 'producer', website: ''},
    attribution: {sourcePage: '/assessment'},
    consent: {disclosureVersion: '2026-08-01', marketing: false, analytics: false},
    answers: {activeWorkflow: 'weekly campaign variants'},
  })
  assert.equal(outboxActions(request, 'low').includes('founder_notification'), false)
  assert.equal(outboxActions(request, 'medium').includes('founder_notification'), true)
  assert.equal(outboxActions(request, 'high').includes('founder_notification'), true)
})

test('an idempotent repeat submission returns the stored submission', async () => {
  const idempotencyKey = `assessment:${crypto.randomUUID()}`
  const request = leadRequestSchema.parse({
    submissionType: 'assessment',
    idempotencyKey,
    formVersion: 'assessment.v1',
    provider: 'browser',
    identity: {
      email: 'lead@studio.example',
      company: 'Studio',
      role: 'production-operations',
      website: '',
    },
    attribution: {sourcePage: '/assessment'},
    consent: {
      disclosureVersion: '2026-08-01',
      marketing: false,
      analytics: true,
    },
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
  const scores = calculateQualification({
    ...request.answers,
    timeline: 'within-30-days',
    workflowReviewRequested: true,
    stakeholderInvolved: true,
  })
  const response: LeadResponse = {
    ok: true,
    nextAction: 'pilot_scope',
    qualificationTier: 'high',
  }
  const first = await persistSubmission({
    request,
    identity: request.identity!,
    scores,
    tier: 'high',
    response,
    verified: true,
    qualificationAnswers: request.answers,
  })
  const second = await persistSubmission({
    request,
    identity: request.identity!,
    scores,
    tier: 'high',
    response,
    verified: true,
    qualificationAnswers: request.answers,
  })

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.submission.id, first.submission.id)
  assert.equal(second.submission.request.provider, 'browser')
  assert.equal(second.submission.profile.id, first.submission.profile.id)
  assert.equal(second.submission.profile.identityVerified, true)
  assert.equal(second.submission.response.nextAction, 'pilot_scope')
  assert.equal(
    (await getProfileById(second.submission.profile.id)).identityVerified,
    true,
  )
  assert.equal(
    (await getProfileById(second.submission.profile.id)).qualification?.answers
      .teamType,
    'creative-studio',
  )
})

test('an unchecked transactional form does not withdraw prior marketing consent', async () => {
  const email = `consent-${crypto.randomUUID()}@studio.example`
  const common = {
    formVersion: 'resource.v1',
    provider: 'browser' as const,
    identity: {email, company: 'Studio', role: 'producer', website: ''},
    attribution: {sourcePage: '/resource'},
    companyFax: '',
  }
  const optedIn = leadRequestSchema.parse({
    ...common,
    submissionType: 'guide_download',
    idempotencyKey: `guide:${crypto.randomUUID()}`,
    consent: {disclosureVersion: '2026-08-01', marketing: true, analytics: false},
    answers: {interest: 'asset-reproduction'},
  })
  const first = await persistSubmission({
    request: optedIn,
    identity: optedIn.identity!,
    response: {ok: true, nextAction: 'download'},
    verified: true,
  })
  const transactional = leadRequestSchema.parse({
    ...common,
    submissionType: 'contact',
    idempotencyKey: `contact:${crypto.randomUUID()}`,
    consent: {disclosureVersion: '2026-08-01', marketing: false, analytics: false},
    answers: {question: 'Security review'},
  })
  const second = await persistSubmission({
    request: transactional,
    identity: transactional.identity!,
    response: {ok: true, nextAction: 'follow_up'},
    verified: true,
  })

  assert.equal(second.submission.profile.id, first.submission.profile.id)
  assert.equal(second.submission.profile.marketingConsent, true)
})

test('a different email cannot overwrite the cookie-bound profile', async () => {
  const firstRequest = leadRequestSchema.parse({
    submissionType: 'contact',
    idempotencyKey: `contact:${crypto.randomUUID()}`,
    formVersion: 'contact.v1',
    provider: 'browser',
    identity: {
      email: `first-${crypto.randomUUID()}@studio.example`,
      company: 'First Studio',
      role: 'producer',
      website: '',
    },
    attribution: {sourcePage: '/contact'},
    consent: {disclosureVersion: '2026-08-01', marketing: false, analytics: false},
    answers: {question: 'first request'},
  })
  const first = await persistSubmission({
    request: firstRequest,
    identity: firstRequest.identity!,
    response: {ok: true, nextAction: 'follow_up'},
    verified: true,
  })
  const secondRequest = leadRequestSchema.parse({
    ...firstRequest,
    idempotencyKey: `contact:${crypto.randomUUID()}`,
    identity: {
      email: `second-${crypto.randomUUID()}@studio.example`,
      company: 'Second Studio',
      role: 'producer',
      website: '',
    },
  })
  const second = await persistSubmission({
    request: secondRequest,
    identity: secondRequest.identity!,
    response: {ok: true, nextAction: 'follow_up'},
    verified: true,
    currentProfileToken: first.profileToken,
  })

  assert.notEqual(second.submission.profile.id, first.submission.profile.id)
  assert.equal(
    (await getProfileById(first.submission.profile.id)).identity.company,
    'First Studio',
  )
  assert.equal(
    (await getProfileByToken(second.profileToken))?.id,
    second.submission.profile.id,
  )
})

test('a repeat submission reuses the stored profile without re-issuing a token', async () => {
  const email = `repeat-${crypto.randomUUID()}@studio.example`
  const request = leadRequestSchema.parse({
    submissionType: 'assessment',
    idempotencyKey: `assessment:${crypto.randomUUID()}`,
    formVersion: 'assessment.v1',
    provider: 'browser',
    identity: {email, company: 'Repeat Studio', role: 'producer', website: ''},
    attribution: {sourcePage: '/assessment'},
    consent: {disclosureVersion: '2026-08-01', marketing: false, analytics: false},
    answers: {teamType: 'creative-studio', teamSize: '5-9'},
  })
  const scores = calculateQualification(request.answers)
  const first = await persistSubmission({
    request,
    identity: request.identity!,
    scores,
    tier: qualificationTier(scores),
    response: {ok: true, nextAction: 'assessment_review'},
    verified: true,
    qualificationAnswers: request.answers,
  })
  const second = await persistSubmission({
    request,
    identity: request.identity!,
    scores,
    tier: qualificationTier(scores),
    response: {ok: true, nextAction: 'assessment_review'},
    verified: true,
    qualificationAnswers: request.answers,
  })

  assert.equal(second.submission.id, first.submission.id)
  assert.equal(second.submission.profile.id, first.submission.profile.id)
  assert.equal(second.profileToken, undefined)
  assert.equal(
    (await getProfileByToken(first.profileToken))?.id,
    first.submission.profile.id,
  )
})
