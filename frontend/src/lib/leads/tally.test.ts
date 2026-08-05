import assert from 'node:assert/strict'
import test from 'node:test'
import {tallyLeadRequest} from './tally'

test('Tally fields normalize to the authoritative assessment contract', () => {
  const request = tallyLeadRequest(
    {
      submissionId: 'submission-1',
      formId: 'form-1',
      fields: [
        {title: 'Work email', value: 'lead@studio.example'},
        {title: 'Company', value: 'Studio'},
        {title: 'Role', value: 'production-operations'},
        {title: 'Team type', value: 'Creative Studio'},
        {title: 'Production team size', value: '5-9'},
        {title: 'Active workflow to test', value: 'A live campaign'},
        {title: 'Pricing or pilot viewed', value: 'true'},
        {title: 'Security diligence', value: 'false'},
        {title: 'Analytics consent', value: 'true'},
      ],
    },
    'tally_webhook',
  )

  assert.equal(request.idempotencyKey, 'tally:form-1:submission-1')
  assert.equal(request.identity?.email, 'lead@studio.example')
  assert.equal(request.answers.teamType, 'creative-studio')
  assert.equal(request.answers.activeWorkflow, 'A live campaign')
  assert.equal(request.answers.pricingOrPilotViewed, true)
  assert.equal(request.answers.securityDiligence, false)
  assert.equal(request.consent.analytics, true)
})
