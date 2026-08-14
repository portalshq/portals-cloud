import assert from 'node:assert/strict'
import test from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
import {
  applyTransition,
  buildCommercialSnapshot,
  buildSecurityDecisions,
  buildSuccessCriteria,
  buildValueModel,
  classifyPilot,
  computeUnresolved,
  recommendedReviewers,
  reviewerTokenRole,
  STANDARD_SUCCESS_KEYS,
} from './pilot'

const eligible = {
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'Ava Nguyen, Senior Producer',
  economicBuyer: 'Jordan Lee, Managing Director',
  economicBuyerEmail: 'jordan@studio.example',
  technicalEvaluator: 'Sam Rivera, Workflow Lead',
  technicalEvaluatorEmail: 'sam@studio.example',
  approvalPath: 'self',
  annualDeploymentOption: 'studio',
  annualPriceAcknowledged: true,
  participantsRange: '2-4',
  dataClassification: 'confidential',
  signerName: 'Ava Nguyen',
  signerEmail: 'ava@studio.example',
}

test('a standard configuration routes zero-call with no exceptions', () => {
  const result = classifyPilot(eligible)

  assert.equal(result.route, 'zero-call')
  assert.deepEqual(result.exceptions, [])
})

test('custom integration work routes one-call', () => {
  const result = classifyPilot({
    ...eligible,
    integrationMethod: 'custom-integration',
  })

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'custom-integration'))
})

test('engineering work inside the integration worksheet routes one-call', () => {
  const result = classifyPilot({
    ...eligible,
    integrationSystemsJson: JSON.stringify([
      {
        name: 'MAM',
        purpose: 'asset retrieval',
        method: 'api',
        portalsEngineering: true,
        mustHave: 'must-have',
        confirmedSupported: false,
      },
    ]),
  })

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'custom-integration'))
})

test('regulated data routes one-call with a security exception', () => {
  const result = classifyPilot({...eligible, dataClassification: 'regulated'})

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'regulated-data'))
})

test('SSO requirement is detected from free text', () => {
  const result = classifyPilot({
    ...eligible,
    securityRequirements: 'We need SSO/SAML for our production environment.',
  })

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'sso'))
})

test('no active workflow disqualifies', () => {
  const result = classifyPilot({...eligible, pilotWorkflow: 'none'})

  assert.equal(result.route, 'disqualified')
  assert.ok(result.reasons.some((reason) => reason.includes('workflow')))
})

test('no production owner disqualifies', () => {
  const result = classifyPilot({...eligible, productionOwner: ''})

  assert.equal(result.route, 'disqualified')
})

test('no approval path disqualifies', () => {
  const result = classifyPilot({...eligible, approvalPath: 'no'})

  assert.equal(result.route, 'disqualified')
})

test('exact reproduction guarantee disqualifies', () => {
  const result = classifyPilot({...eligible, exactReproductionRequired: true})

  assert.equal(result.route, 'disqualified')
})

test('procurement approval routes one-call', () => {
  const result = classifyPilot({...eligible, approvalPath: 'procurement'})

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'procurement'))
})

test('success criteria default to the standard five', () => {
  const criteria = buildSuccessCriteria({})

  assert.deepEqual(
    criteria.map((item) => item.key),
    STANDARD_SUCCESS_KEYS,
  )
  assert.ok(criteria.every((item) => item.status === 'accepted'))
})

test('a selected custom criterion routes one-call', () => {
  const result = classifyPilot({
    ...eligible,
    successCriterionKeysJson: JSON.stringify([...STANDARD_SUCCESS_KEYS, 'other']),
  })

  assert.equal(result.route, 'one-call')
  assert.ok(result.exceptions.some((item) => item.kind === 'custom-criteria'))
})

test('value model computes auditable low/high bounds', () => {
  const model = buildValueModel('monthly', '2-5-days', '2-5-people')

  assert.ok(model)
  assert.equal(model.formula.includes('frequency'), true)
  assert.equal(model.low, 12 * 16 * 2)
  assert.equal(model.high, 12 * 40 * 5)
  assert.ok(model.midpoint <= model.high && model.midpoint >= model.low)
})

test('commercial snapshot prices from the pilot spec amount and composes the annual credit', () => {
  const snapshot = buildCommercialSnapshot(
    {...eligible, targetStartPeriod: 'asap'},
    [],
    {startDate: '2026-09-01', termDays: 21},
  )

  assert.equal(snapshot.priceAmount, 5000)
  assert.equal(snapshot.paymentDue, 'on-signature')
  assert.equal(snapshot.termDays, 21)
  assert.equal(snapshot.termStart, '2026-09-01')
  assert.equal(snapshot.termEnd, '2026-09-21')
  assert.ok(snapshot.creditDeadline && snapshot.creditDeadline > '2026-09-21')
})

test('unresolved items cover signer, start date, and annual acknowledgment', () => {
  const unresolved = computeUnresolved({}, {route: 'zero-call'})

  const keys = unresolved.map((item) => item.key)
  assert.ok(keys.includes('start-date'))
  assert.ok(keys.includes('signer'))
  assert.ok(keys.includes('annual-ack'))
})

test('a resolved configuration has no unresolved items', () => {
  const unresolved = computeUnresolved(
    {...eligible, integrationMethod: 'manual-upload', signerEmail: 'ava@studio.example'},
    {startDate: '2026-09-01', route: 'zero-call'},
  )

  assert.equal(unresolved.length, 0)
})

test('state machine allows only valid transitions', () => {
  assert.deepEqual(applyTransition('reviewing', 'confirm_scope'), {
    state: 'scope_confirmed',
    allowed: true,
  })
  assert.deepEqual(applyTransition('reviewing', 'sign'), {
    state: 'reviewing',
    allowed: false,
  })
  assert.deepEqual(applyTransition('ready_sign', 'sign'), {
    state: 'signed',
    allowed: true,
  })
  assert.deepEqual(applyTransition('signed', 'pay'), {
    state: 'paid',
    allowed: true,
  })
  assert.deepEqual(applyTransition('exception_review', 'qualify'), {
    state: 'reviewing',
    allowed: true,
  })
  assert.deepEqual(applyTransition('exception_review', 'disqualify'), {
    state: 'not_eligible',
    allowed: true,
  })
})

test('team review phase gates invitations behind the draft review', () => {
  assert.deepEqual(applyTransition('reviewing', 'start_team_review'), {
    state: 'team_review',
    allowed: true,
  })
  assert.deepEqual(applyTransition('revision', 'start_team_review'), {
    state: 'team_review',
    allowed: true,
  })
  assert.deepEqual(applyTransition('team_review', 'confirm_scope'), {
    state: 'scope_confirmed',
    allowed: true,
  })
  assert.deepEqual(applyTransition('team_review', 'revise'), {
    state: 'revision',
    allowed: true,
  })
  assert.deepEqual(applyTransition('scope_confirmed', 'start_team_review'), {
    state: 'scope_confirmed',
    allowed: false,
  })
  assert.deepEqual(applyTransition('ready_sign', 'start_team_review'), {
    state: 'ready_sign',
    allowed: false,
  })
})

test('recommended reviewers adapt to the answers', () => {
  const plain = recommendedReviewers(eligible)
  assert.deepEqual(
    plain.map((row) => row.role),
    ['production_owner', 'economic_buyer', 'technical_evaluator', 'signer'],
  )
  assert.equal(plain.find((row) => row.role === 'signer')?.email, 'ava@studio.example')
  assert.equal(plain.find((row) => row.role === 'production_owner')?.name, 'Ava Nguyen, Senior Producer')
  assert.equal(plain.find((row) => row.role === 'economic_buyer')?.email, 'jordan@studio.example')
  assert.equal(plain.find((row) => row.role === 'technical_evaluator')?.email, 'sam@studio.example')

  const procurement = recommendedReviewers({
    ...eligible,
    approvalPath: 'procurement',
    approverName: 'Ben Wu',
    approverEmail: 'ben@studio.example',
  })
  const roles = procurement.map((row) => row.role)
  assert.ok(roles.includes('approver'))
  assert.ok(roles.includes('procurement_reviewer'))
  assert.ok(!roles.includes('security_reviewer'))

  const regulated = recommendedReviewers({
    ...eligible,
    dataClassification: 'regulated',
  })
  assert.ok(regulated.some((row) => row.role === 'security_reviewer'))

  const sso = recommendedReviewers({
    ...eligible,
    securityRequirements: 'SSO/SAML required',
  })
  assert.ok(sso.some((row) => row.role === 'security_reviewer'))
})

test('reviewer token roles map by responsibility', () => {
  assert.equal(reviewerTokenRole('economic_buyer'), 'approver')
  assert.equal(reviewerTokenRole('approver'), 'approver')
  assert.equal(reviewerTokenRole('security_reviewer'), 'approver')
  assert.equal(reviewerTokenRole('procurement_reviewer'), 'approver')
  assert.equal(reviewerTokenRole('production_owner'), 'participant')
  assert.equal(reviewerTokenRole('technical_evaluator'), 'participant')
  assert.equal(reviewerTokenRole('signer'), 'signer')
})

test('security decisions mark SSO as an exception when required', () => {
  const decisions = buildSecurityDecisions({
    ...eligible,
    securityRequirements: 'SSO required',
  })

  const sso = decisions.find((item) => item.key === 'sso')
  assert.equal(sso?.decision, 'exception')
  const training = decisions.find((item) => item.key === 'training-data')
  assert.equal(training?.decision, 'confirm')
})

test('commercial snapshot synthesizes the studio annual option without specs', () => {
  const snapshot = buildCommercialSnapshot(
    {...eligible, annualDeploymentOption: 'studio'},
    [],
    {startDate: '2026-08-10'},
  )

  assert.equal(snapshot.priceAmount, 5000)
  assert.equal(snapshot.termDays, 21)
  assert.equal(snapshot.termStart, '2026-08-10')
  assert.equal(snapshot.termEnd, '2026-08-30')
  assert.equal(snapshot.decisionDate, '2026-08-31')
  assert.equal(snapshot.creditDeadline, '2026-09-06')
  assert.equal(snapshot.annualOption?.slug, 'studio')
  assert.equal(snapshot.annualOption?.annualTotal, 30000)
  assert.match(String(snapshot.annualOption?.creditNote), /credited if the annual order form/)
})

test('commercial snapshot omits the annual option when not chosen', () => {
  const snapshot = buildCommercialSnapshot(
    {...eligible, annualDeploymentOption: 'not-known'},
    [],
    {},
  )

  assert.equal(snapshot.annualOption, undefined)
})
