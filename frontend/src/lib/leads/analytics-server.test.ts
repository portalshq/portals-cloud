import assert from 'node:assert/strict'
import test from 'node:test'
import {trackSubmissionEvents} from './analytics-server'
import {contactFields} from './crm'
import {validatedLeadRequestSchema} from './contracts'
import {highAssessment} from './assessment-fixtures'
import {calculateQualification} from './scoring'
import {persistSubmission} from './store'
import {pilotAssessmentPrefill} from './assessment-diagnostic'

async function storedSubmission(analytics: boolean) {
  const request = validatedLeadRequestSchema.parse({
    submissionType: 'assessment',
    formVersion: 'assessment.v4',
    idempotencyKey: `analytics:${crypto.randomUUID()}`,
    identity: {
      email: `producer-${crypto.randomUUID()}@studio.test`,
      name: 'Producer',
      company: 'Studio',
      role: 'production-operations',
    },
    attribution: {
      sourcePage: '/assessment',
      utmSource: 'email',
      utmCampaign: 'state-transfer',
    },
    consent: {disclosureVersion: '2026-08-01', analytics, marketing: false},
    answers: {...highAssessment, ...pilotAssessmentPrefill(highAssessment)},
  })
  const scores = calculateQualification(request.answers)
  return (
    await persistSubmission({
      request,
      identity: request.identity!,
      verified: true,
      scores,
      tier: 'high',
      response: {ok: true, nextAction: 'pilot_scope'},
      qualificationAnswers: request.answers,
    })
  ).submission
}
test('consented submission events include version, structured scores/signals and campaign attribution', async (t) => {
  const submission = await storedSubmission(true)
  const previous = process.env.MIXPANEL_PROJECT_TOKEN
  process.env.MIXPANEL_PROJECT_TOKEN = 'test-token'
  t.after(() => {
    if (previous === undefined) delete process.env.MIXPANEL_PROJECT_TOKEN
    else process.env.MIXPANEL_PROJECT_TOKEN = previous
  })
  let events: Array<{event: string; properties: Record<string, unknown>}> = []
  t.mock.method(globalThis, 'fetch', async (_: unknown, init: RequestInit) => {
    events = JSON.parse(String(init.body))
    return new Response('{}', {status: 200})
  })
  await trackSubmissionEvents(submission)
  assert.ok(events.some((e) => e.event === 'assessment_submitted'))
  assert.ok(events.some((e) => e.event === 'assessment_result_high'))
  const props = events.find(
    (e) => e.event === 'assessment_submitted',
  )!.properties
  assert.equal(props.utm_campaign, 'state-transfer')
  assert.equal(props.A_STATE_PERSON_DEPENDENT, true)
  assert.equal(props.score, submission.scores!.assessmentScore)
  assert.ok(
    !JSON.stringify(events).includes(
      String(highAssessment.most_recent_incident),
    ),
  )
  assert.ok(
    !JSON.stringify(events).includes(
      String(highAssessment.most_urgent_active_workflow),
    ),
  )
})
test('analytics rejected submissions never contact Mixpanel', async (t) => {
  const submission = await storedSubmission(false)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response('{}')
  })
  await trackSubmissionEvents(submission)
  assert.equal(calls, 0)
})
test('CRM projection carries canonical answers and internal evidence without losing historical fields', async () => {
  const submission = await storedSubmission(false)
  const fields = contactFields(submission)
  assert.equal(fields.assessment_version, 'assessment.v4')
  assert.equal(fields.production_status, 'live_now')
  assert.deepEqual(fields.active_workflows, highAssessment.active_workflows)
  assert.equal(
    fields.active_workflow,
    highAssessment.most_urgent_active_workflow,
  )
  assert.equal(fields.tools_used, 'ComfyUI, Runway, Midjourney')
  assert.equal(fields.a_state_person_dependent, true)
  assert.ok(
    String(fields.b_missing_generative_state_evidence).includes(
      'required-state-outside',
    ),
  )
  assert.ok(fields.production_baseline)
})
