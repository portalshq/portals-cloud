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
  updatePilot,
} from './store'
import {
  recordPilotCheckoutPaid,
  recordPilotInvoicePaid,
} from './pilot-payments'

const eligible = {
  email: 'ava@studio.example',
  company: 'Studio Example',
  pilotWorkflow: 'campaign variant production',
  productionOwner: 'Ava Nguyen, Senior Producer',
  productionOwnerEmail: 'ava@studio.example',
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
  const submissionId = `submission-${crypto.randomUUID()}`
  const answers = {...eligible}
  const classification = classifyPilot(answers)
  const criteria = buildSuccessCriteria(answers)
  const security = buildSecurityDecisions(answers)
  const unresolved = computeUnresolved(answers, {route: classification.route})
  const pilot = await createPilotRecord({
    profileId: `profile-${crypto.randomUUID()}`,
    initialSubmissionId: submissionId,
    answers,
    route: classification.route,
    state: 'reviewing',
    exceptions: classification.exceptions,
    unresolved,
    successCriteria: criteria,
    securityDecisions: security,
  })
  await attachSubmissionToPilot(submissionId, pilot.id)
  return pilot
}

test('recordPilotCheckoutPaid transitions a signed pilot to paid with card details', async () => {
  const pilot = await createEligiblePilot()
  const signed = await updatePilot(pilot.id, {state: 'signed'})

  const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
    signed,
    {id: 'cs_test_reconcile', amount_total: 150000, customer: 'cus_test'},
    'paid:reconcile:test-1',
  )

  assert.equal(recorded, true)
  assert.equal(updated.state, 'paid')
  assert.equal(updated.payment?.sessionId, 'cs_test_reconcile')
  assert.equal(updated.payment?.paymentMethod, 'card')
  assert.equal(updated.payment?.paymentStatus, 'paid')
  assert.ok(updated.payment?.paidAt, 'paidAt should be recorded')
})

test('recordPilotCheckoutPaid treats a launched pilot as already paid without rewriting payment', async () => {
  const pilot = await createEligiblePilot()
  const paidAt = new Date().toISOString()
  const launched = await updatePilot(pilot.id, {
    state: 'launch',
    kickoffScheduledAt: '2026-10-01T15:00:00.000Z',
    payment: {sessionId: 'cs_test_original', paymentMethod: 'card', paymentStatus: 'paid', paidAt},
  })

  const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
    launched,
    {id: 'cs_test_late', amount_total: 150000, customer: 'cus_test'},
    'paid:reconcile:test-2',
  )

  // Launch is only reachable through paid, so a replayed or stray event must
  // not overwrite the originally recorded payment.
  assert.equal(recorded, true)
  assert.equal(updated.state, 'launch')
  assert.equal(updated.payment?.sessionId, 'cs_test_original')
  assert.equal(updated.payment?.paidAt, paidAt)
})

test('recordPilotCheckoutPaid records nothing for a pilot that cannot be paid', async () => {
  const pilot = await createEligiblePilot()

  const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
    pilot,
    {id: 'cs_test_early', amount_total: 150000, customer: 'cus_test'},
    'paid:reconcile:test-3',
  )

  assert.equal(recorded, false)
  assert.equal(updated.state, 'reviewing')
  assert.equal(updated.payment?.paymentStatus, undefined)
})

test('recordPilotCheckoutPaid is idempotent for an already-paid pilot', async () => {
  const pilot = await createEligiblePilot()
  const paid = await updatePilot(pilot.id, {
    state: 'paid',
    payment: {sessionId: 'cs_test_first', paymentStatus: 'paid', paidAt: new Date().toISOString()},
  })

  const {pilot: updated, recorded} = await recordPilotCheckoutPaid(
    paid,
    {id: 'cs_test_second', amount_total: 150000, customer: 'cus_test'},
    'paid:reconcile:test-4',
  )

  assert.equal(recorded, true)
  assert.equal(updated.state, 'paid')
  assert.equal(updated.payment?.sessionId, 'cs_test_first', 'the original session id is preserved')
})

test('recordPilotInvoicePaid transitions a signed pilot to paid with invoice details', async () => {
  const pilot = await createEligiblePilot()
  const signed = await updatePilot(pilot.id, {
    state: 'signed',
    payment: {invoiceId: 'in_test_1', invoiceStatus: 'open', paymentMethod: 'invoice', paymentStatus: 'processing'},
  })

  const {pilot: updated, recorded} = await recordPilotInvoicePaid(
    signed,
    {id: 'in_test_1'},
    'invoice-paid:reconcile:test-1',
  )

  assert.equal(recorded, true)
  assert.equal(updated.state, 'paid')
  assert.equal(updated.payment?.invoiceId, 'in_test_1')
  assert.equal(updated.payment?.invoiceStatus, 'paid')
  assert.equal(updated.payment?.paymentMethod, 'invoice')
  assert.equal(updated.payment?.paymentStatus, 'paid')
  assert.ok(updated.payment?.paidAt)
})

test('recordPilotInvoicePaid records nothing for a pilot that cannot be paid', async () => {
  const pilot = await createEligiblePilot()

  const {pilot: updated, recorded} = await recordPilotInvoicePaid(
    pilot,
    {id: 'in_test_early'},
    'invoice-paid:reconcile:test-2',
  )

  assert.equal(recorded, false)
  assert.equal(updated.state, 'reviewing')
})
