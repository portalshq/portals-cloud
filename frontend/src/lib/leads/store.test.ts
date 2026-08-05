import assert from 'node:assert/strict'
import test from 'node:test'
import {leadRequestSchema, type LeadResponse} from './contracts'
import {calculateQualification, qualificationTier} from './scoring'
import {getProfileById, getProfileByToken, persistSubmission} from './store'

process.env.LEADS_DRY_RUN = 'true'

test('signed delivery promotes an idempotent provisional Tally submission', async () => {
  const idempotencyKey = `tally:test:${crypto.randomUUID()}`
  const base = {
    submissionType: 'assessment' as const,
    idempotencyKey,
    formVersion: 'assessment.v1',
    identity: {
      email: 'lead@studio.example',
      company: 'Studio',
      role: 'production-operations',
      website: '',
    },
    attribution: {sourcePage: '/workflow-assessment'},
    consent: {
      disclosureVersion: '2026-08-01' as const,
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
  }
  const provisionalRequest = leadRequestSchema.parse({
    ...base,
    provider: 'tally_client',
  })
  const provisionalScores = calculateQualification(provisionalRequest.answers)
  const provisionalResponse: LeadResponse = {
    ok: true,
    nextAction: 'assessment_review',
    provisional: true,
  }
  const provisional = await persistSubmission({
    request: provisionalRequest,
    identity: provisionalRequest.identity!,
    scores: provisionalScores,
    tier: qualificationTier(provisionalScores),
    response: provisionalResponse,
    verified: false,
  })

  const verifiedRequest = leadRequestSchema.parse({
    ...base,
    provider: 'tally_webhook',
  })
  const verifiedScores = calculateQualification({
    ...verifiedRequest.answers,
    timeline: 'within-30-days',
    workflowReviewRequested: true,
    stakeholderInvolved: true,
  })
  const verifiedResponse: LeadResponse = {
    ok: true,
    nextAction: 'pilot_scope',
    qualificationTier: 'high',
  }
  const verified = await persistSubmission({
    request: verifiedRequest,
    identity: verifiedRequest.identity!,
    scores: verifiedScores,
    tier: 'high',
    response: verifiedResponse,
    verified: true,
    qualificationAnswers: {
      ...verifiedRequest.answers,
      timeline: 'within-30-days',
      workflowReviewRequested: true,
      stakeholderInvolved: true,
    },
  })

  assert.equal(verified.created, false)
  assert.equal(verified.upgradedToVerified, true)
  assert.equal(verified.submission.id, provisional.submission.id)
  assert.equal(verified.submission.request.provider, 'tally_webhook')
  assert.equal(verified.submission.profile.identityVerified, true)
  assert.equal(verified.submission.response.nextAction, 'pilot_scope')
  assert.equal(
    (await getProfileById(verified.submission.profile.id)).identityVerified,
    true,
  )
  assert.equal(
    (await getProfileById(verified.submission.profile.id)).qualification?.answers
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

test('webhook-first Tally delivery can establish the browser profile', async () => {
  const email = `webhook-first-${crypto.randomUUID()}@studio.example`
  const base = {
    submissionType: 'assessment' as const,
    idempotencyKey: `tally:test:${crypto.randomUUID()}`,
    formVersion: 'assessment.v1',
    identity: {email, company: 'Webhook Studio', role: 'producer', website: ''},
    attribution: {sourcePage: '/workflow-assessment'},
    consent: {disclosureVersion: '2026-08-01' as const, marketing: false, analytics: false},
    answers: {teamType: 'creative-studio', teamSize: '5-9'},
  }
  const webhookRequest = leadRequestSchema.parse({...base, provider: 'tally_webhook'})
  const scores = calculateQualification(webhookRequest.answers)
  const webhook = await persistSubmission({
    request: webhookRequest,
    identity: webhookRequest.identity!,
    scores,
    tier: qualificationTier(scores),
    response: {ok: true, nextAction: 'assessment_review'},
    verified: true,
    qualificationAnswers: webhookRequest.answers,
  })
  const browserRequest = leadRequestSchema.parse({...base, provider: 'tally_client'})
  const browser = await persistSubmission({
    request: browserRequest,
    identity: browserRequest.identity!,
    scores,
    tier: qualificationTier(scores),
    response: {ok: true, nextAction: 'assessment_review', provisional: true},
    verified: false,
  })

  assert.equal(browser.submission.id, webhook.submission.id)
  assert.ok(browser.profileToken)
  assert.equal(
    (await getProfileByToken(browser.profileToken))?.id,
    webhook.submission.profile.id,
  )
})
