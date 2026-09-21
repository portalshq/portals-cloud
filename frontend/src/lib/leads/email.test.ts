import assert from 'node:assert/strict'
import { internalPilotLabels } from './email'
import test, { type TestContext } from 'node:test'
process.env.LEADS_DRY_RUN = 'true'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.LEADS_EMAIL_FROM = 'leads@portals.test'
process.env.LEADS_NOTIFICATION_EMAIL = 'ops@portals.test'
process.env.NEXT_PUBLIC_SITE_URL = 'https://portals.test'
import { recipientRole, sendLeadConfirmation, sendPilotStatusEmail } from './email'
import { leadRequestSchema } from './contracts'
import { createPilotRecord, persistSubmission, type StoredPilot } from './store'
import { consumeMagicLink, ensureApplicationUser, highestPilotMembershipRole, inspectMagicLink, issueMagicLink, pilotMembershipRole } from './application-auth'
import {
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
} from './pilot'

const materialException = {
  kind: 'custom-integration',
  summary: 'custom integration',
  amendment: 'review required',
}

test('internal pilot labels distinguish assisted preference from standard terms', () => {
  assert.deepEqual(internalPilotLabels({ mode: 'assisted', exceptions: [] }), {
    preferredExperience: 'assisted',
    termsPath: 'standard',
  })
})

test('internal pilot labels distinguish self-serve preference from standard terms', () => {
  assert.deepEqual(internalPilotLabels({ mode: 'standard', exceptions: [] }), {
    preferredExperience: 'self-serve',
    termsPath: 'standard',
  })
})

test('internal pilot labels route self-serve preference to exception review when terms are material', () => {
  assert.deepEqual(internalPilotLabels({ mode: 'standard', exceptions: [materialException] }), {
    preferredExperience: 'self-serve',
    termsPath: 'exception review required',
  })
})

test('internal pilot labels preserve assisted preference when terms require exception review', () => {
  assert.deepEqual(internalPilotLabels({ mode: 'assisted', exceptions: [materialException] }), {
    preferredExperience: 'assisted',
    termsPath: 'exception review required',
  })
})
