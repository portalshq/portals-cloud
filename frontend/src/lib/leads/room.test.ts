import assert from 'node:assert/strict'
import test from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
import {
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from './pilot'
import {
  attachSubmissionToPilot,
  createPilotRecord,
  getPilotById,
  getPilotByPaymentSession,
  updatePilot,
} from './store'

const eligible = {
  email: 'ava@studio.example',
  company: 'Studio Example',
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'Ava Nguyen, Senior Producer',
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

async function createEligiblePilot() {
  const answers = {...eligible}
  const classification = classifyPilot(answers)
  const criteria = buildSuccessCriteria(answers)
  const security = buildSecurityDecisions(answers)
  const unresolved = computeUnresolved(answers, {route: classification.route})
  const pilot = await createPilotRecord({
    profileId: 'profile-1',
    initialSubmissionId: 'submission-1',
    answers,
    route: classification.route,
    state: 'reviewing',
    exceptions: classification.exceptions,
    unresolved,
    successCriteria: criteria,
    securityDecisions: security,
  })
  await attachSubmissionToPilot('submission-1', pilot.id)
  return pilot
}

test('the room flow confirms, finalizes, signs, pays, kickoffs, and activates', async () => {
  const pilot = await createEligiblePilot()
  assert.equal(pilot.state, 'reviewing')
  assert.equal(pilot.route, 'zero-call')

  const confirmed = await updatePilot(pilot.id, {
    state: 'scope_confirmed',
    resolvedStartDate: '2026-09-01',
    unresolved: computeUnresolved(pilot.answers, {
      startDate: '2026-09-01',
      route: 'zero-call',
    }),
  })
  assert.equal(confirmed.unresolved.length, 0)
  assert.equal(confirmed.state, 'scope_confirmed')

  const finalized = await updatePilot(pilot.id, {state: 'ready_sign'})
  assert.equal(finalized.state, 'ready_sign')

  const signed = await updatePilot(pilot.id, {
    state: 'signed',
    signing: {
      name: 'Ava Nguyen',
      email: 'ava@studio.example',
      signedAt: new Date().toISOString(),
      consented: true,
    },
  })
  assert.equal(signed.signing.name, 'Ava Nguyen')

  const paid = await updatePilot(pilot.id, {state: 'paid', payment: {provider: 'manual', paidAt: new Date().toISOString()}})
  assert.equal(paid.payment.provider, 'manual')

  const kickoff = await updatePilot(pilot.id, {state: 'kickoff', kickoff: {scheduledAt: new Date().toISOString()}})
  assert.equal(kickoff.state, 'kickoff')

  const active = await updatePilot(pilot.id, {state: 'active', historyNote: 'pilot activated'})
  assert.equal(active.state, 'active')
  assert.ok(active.history.some((entry) => entry.note === 'pilot activated'))

  const reloaded = await getPilotById(pilot.id)
  assert.equal(reloaded?.state, 'active')
  assert.equal(reloaded?.answers.company, 'Studio Example')
})

test('an unresolved start date blocks confirmation', async () => {
  const pilot = await createEligiblePilot()
  const unresolved = computeUnresolved(pilot.answers, {route: 'zero-call'})
  assert.ok(unresolved.some((item) => item.key === 'start-date'))
  assert.ok(pilot.unresolved.some((item) => item.key === 'start-date'))
})

test('signing records identity and consent, and history is appended', async () => {
  const pilot = await createEligiblePilot()
  const signed = await updatePilot(pilot.id, {
    state: 'signed',
    signing: {name: 'Ava Nguyen', email: 'ava@studio.example', consented: true, signedAt: new Date().toISOString()},
    historyNote: 'signed by Ava Nguyen (ava@studio.example)',
    by: 'ava@studio.example',
  })
  assert.ok(signed.history.length >= 2)
  const latest = signed.history[signed.history.length - 1]
  assert.equal(latest.action, 'system')
  assert.equal(latest.by, 'ava@studio.example')
})

test('a payment session id finds the pilot record', async () => {
  const pilot = await createEligiblePilot()
  const sessionId = `cs_test_${pilot.id}`
  await updatePilot(pilot.id, {
    state: 'paid',
    payment: {sessionId, paidAt: new Date().toISOString()},
  })
  const found = await getPilotByPaymentSession(sessionId)
  assert.equal(found?.id, pilot.id)
  assert.equal(found?.state, 'paid')
  assert.equal(await getPilotByPaymentSession('cs_test_missing'), null)
})

test('creating a pilot seeds proposed reviewers from the answers', async () => {
  const pilot = await createEligiblePilot()
  assert.deepEqual(
    pilot.reviewers.map((reviewer) => reviewer.role),
    ['production_owner', 'economic_buyer', 'technical_evaluator', 'signer'],
  )
  assert.ok(pilot.reviewers.every((reviewer) => reviewer.status === 'proposed'))
  assert.ok(pilot.reviewers.every((reviewer) => reviewer.versionSeen === 1))
  const signer = pilot.reviewers.find((reviewer) => reviewer.role === 'signer')
  assert.equal(signer?.email, 'ava@studio.example')
  assert.equal(pilot.version, 1)
})

test('version bumps leave stale reviewers flagged for reconfirmation', async () => {
  const pilot = await createEligiblePilot()
  const bumped = await updatePilot(pilot.id, {version: 2, historyNote: 'material revision'})
  assert.equal(bumped.version, 2)
  assert.ok(bumped.reviewers.every((reviewer) => reviewer.versionSeen < bumped.version))
  const reloaded = await getPilotById(pilot.id)
  assert.equal(reloaded?.version, 2)
  assert.ok(reloaded?.history.some((entry) => entry.note === 'material revision'))
})

test('reviewer decisions persist status and change requests', async () => {
  const pilot = await createEligiblePilot()
  const buyer = pilot.reviewers.find((reviewer) => reviewer.role === 'economic_buyer')
  assert.ok(buyer)
  const updated = await updatePilot(pilot.id, {
    reviewers: pilot.reviewers.map((reviewer) =>
      reviewer.id === buyer.id
        ? {...reviewer, status: 'reviewed', reviewedAt: new Date().toISOString(), requestedChanges: true, versionSeen: pilot.version}
        : reviewer,
    ),
  })
  const reloaded = await getPilotById(pilot.id)
  const buyerAfter = reloaded?.reviewers.find((reviewer) => reviewer.id === buyer.id)
  assert.equal(buyerAfter?.status, 'reviewed')
  assert.equal(buyerAfter?.requestedChanges, true)
  assert.equal(updated.history.length, pilot.history.length)
})
