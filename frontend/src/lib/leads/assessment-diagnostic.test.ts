import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSESSMENT_VERSION,
  activeAssessmentAnswers,
  assessmentAnswersFromDraft,
  assessmentQuestions,
  assessmentValidationErrors,
  questionVisible,
  visibleAssessmentStages,
} from './assessment-definition'
import {
  diagnosticAnalyticsProperties,
  diagnosticResult,
  pilotAssessmentPrefill,
  scoreDiagnostic,
} from './assessment-diagnostic'
import {
  completeAssessment,
  highAssessment,
  throughputAssessment,
  vfxAssessment,
} from './assessment-fixtures'
import {assessmentAnswersSchema, validatedLeadRequestSchema} from './contracts'
import {
  assessmentScore,
  calculateQualification,
  qualificationTier,
} from './scoring'

const body = (
  answers: Record<string, unknown>,
  formVersion = ASSESSMENT_VERSION,
) => ({
  submissionType: 'assessment',
  formVersion,
  idempotencyKey: 'assessment-validation-test',
  identity: {
    name: 'Test Producer',
    email: 'producer@studio.test',
    company: 'Studio',
    role: 'production-operations',
  },
  attribution: {sourcePage: '/assessment'},
  consent: {
    disclosureVersion: '2026-08-01',
    analytics: false,
    marketing: false,
  },
  answers,
})

test('representative live fragmented production scores High with A/B/C evidence', () => {
  const scores = calculateQualification(highAssessment)
  assert.equal(qualificationTier(scores, highAssessment), 'high')
  assert.ok(scores.assessmentScore >= 70 && scores.assessmentScore <= 100)
  assert.ok(scores.diagnostic!.operationalFitScore <= 70)
  assert.ok(scores.diagnostic!.commercialReadinessScore <= 30)
  assert.equal(assessmentScore(scores), scores.diagnostic!.total)
  for (const signal of Object.values(scores.diagnostic!.signals)) {
    assert.equal(signal.active, true)
    assert.ok(signal.evidence.length)
  }
})
test('mature VFX pipeline still qualifies when generative reproduction state is incomplete', () => {
  const score = scoreDiagnostic(vfxAssessment)
  assert.equal(score.tier, 'high')
  assert.equal(score.signals.A_STATE_PERSON_DEPENDENT.active, false)
  assert.equal(score.signals.B_MISSING_GENERATIVE_STATE.active, true)
  assert.equal(score.signals.C_THROUGHPUT_CORRECTNESS.active, false)
  assert.ok(!score.caps.includes('state-transfers-reliably'))
})
test('high volume client variants with wrong inputs qualify independently of handoff', () => {
  const score = scoreDiagnostic(throughputAssessment)
  assert.equal(score.tier, 'high')
  assert.equal(score.signals.C_THROUGHPUT_CORRECTNESS.active, true)
  assert.equal(score.signals.A_STATE_PERSON_DEPENDENT.active, false)
})
test('later production, unavailable test, or missing sponsor remains Mid despite strong pain', () => {
  for (const missing of [
    {production_status: 'within_1_to_3_months'},
    {pilot_readiness_30d: 'no_researching'},
    {adoption_authority: 'need_another_sponsor'},
  ]) {
    const score = scoreDiagnostic({...highAssessment, ...missing})
    assert.equal(score.tier, 'medium')
  }
})
test('solo experiments and untested transfer do not manufacture pain', () => {
  const score = scoreDiagnostic({
    ...completeAssessment,
    contributors_count: '1',
    production_status: 'experimenting_or_researching',
    pilot_readiness_30d: 'no_researching',
    recurringWorkflow: 'one-off',
    transferability_without_originator: 'not_tested',
    time_to_transfer: 'unknown',
  })
  assert.equal(score.tier, 'low')
  assert.ok(score.total <= 44)
  assert.ok(score.caps.includes('research-only'))
  assert.ok(score.caps.includes('solo-without-imminent-scaling'))
  assert.equal(score.meaningfulProblem, false)
})
test('large company and value cannot qualify a state-complete workflow', () => {
  const score = scoreDiagnostic({
    ...completeAssessment,
    contributors_count: '25_plus',
    teamSize: '25-plus',
    affected_work_value: '5m_plus',
  })
  assert.equal(score.tier, 'low')
  assert.ok(score.total <= 39)
  assert.equal(score.meaningfulProblem, false)
  assert.ok(Object.values(score.signals).every((signal) => !signal.active))
})
test('solo caps have documented strong-state exceptions; imminent scaling can qualify', () => {
  const solo = scoreDiagnostic({
    ...highAssessment,
    contributors_count: '1',
    imminent_contributor_scaling: 'no',
    time_lost_per_incident: 'under_1_hour',
  })
  assert.ok(solo.total <= 44)
  const severe = scoreDiagnostic({
    ...highAssessment,
    contributors_count: '1',
    imminent_contributor_scaling: 'no',
  })
  assert.ok(!severe.caps.includes('solo-without-imminent-scaling'))
  assert.notEqual(severe.tier, 'high')
  assert.equal(
    scoreDiagnostic({
      ...highAssessment,
      contributors_count: '1',
      imminent_contributor_scaling: 'yes',
    }).tier,
    'high',
  )
})
test('research cap holds even with contradictory severe answers', () => {
  const score = scoreDiagnostic({
    ...highAssessment,
    production_status: 'experimenting_or_researching',
  })
  assert.ok(score.total <= 49)
  assert.equal(score.tier, 'low')
})
test('declarative branches skip excellent handoff and incident-free examples, and add IP/agent followups', () => {
  const visible = (id: string, a: Record<string, unknown>) =>
    questionVisible(assessmentQuestions.find((q) => q.id === id)!, a)
  assert.equal(
    visible('manual_handoff_requirements', completeAssessment),
    false,
  )
  assert.ok(!visibleAssessmentStages(completeAssessment).includes(3))
  assert.equal(visible('most_recent_incident', completeAssessment), false)
  assert.equal(visible('most_recent_incident', highAssessment), true)
  assert.equal(visible('incorrect_source_exposure', highAssessment), false)
  assert.equal(
    visible('incorrect_source_exposure', {
      ...highAssessment,
      ip_controlled_content: 'yes',
    }),
    true,
  )
  assert.equal(
    visible('agent_context_resolution', {
      ...highAssessment,
      active_workflows: ['agent_assisted_production'],
    }),
    true,
  )
  assert.equal(
    visible('affected_work_value', {
      ...highAssessment,
      production_status: 'experimenting_or_researching',
    }),
    false,
  )
})
test('current-version server validation requires applicable fields and rejects invalid choices', () => {
  assert.equal(
    validatedLeadRequestSchema.safeParse(body(highAssessment)).success,
    true,
  )
  assert.equal(
    validatedLeadRequestSchema.safeParse(body(completeAssessment)).success,
    true,
  )
  for (const override of [
    {production_status: 'bogus'},
    {contributors_count: ''},
    {most_recent_incident: ''},
    {assessment_version: undefined},
    {production_failures: ['none', 'wrong_reference']},
    {ai_tools: ['unknown-tool']},
  ]) {
    assert.equal(
      validatedLeadRequestSchema.safeParse(
        body({...highAssessment, ...override}),
      ).success,
      false,
    )
  }
  assert.deepEqual(assessmentValidationErrors(highAssessment), [])
  assert.equal(
    validatedLeadRequestSchema.safeParse(
      body({...highAssessment, affected_work_value: undefined}),
    ).success,
    true,
  )
  assert.equal(
    validatedLeadRequestSchema.safeParse(
      body({...highAssessment, ip_controlled_content: 'yes'}),
    ).success,
    false,
  )
})
test('historical submission shape and fields remain parseable', () => {
  const legacy = {
    teamType: 'creative-studio',
    activeWorkflow: 'Campaign variants',
    toolsUsed: '5-plus',
    annualAffectedValue: '500k-plus',
  }
  assert.equal(
    validatedLeadRequestSchema.safeParse(body(legacy, 'assessment.v3')).success,
    true,
  )
  assert.equal(
    assessmentAnswersSchema.parse(legacy).annualAffectedValue,
    '500k-plus',
  )
  assert.equal(calculateQualification(legacy).diagnostic, undefined)
})
test('hidden stale answers cannot influence state signals after branches change', () => {
  const stale = {
    ...completeAssessment,
    manual_handoff_requirements: ['current_asset_versions'],
    context_interrupt_owner: ['original_creator'],
    ip_controlled_content: 'no',
    incorrect_source_exposure: 'yes',
    agent_context_resolution: 'operator_memory',
  }
  assert.equal(
    activeAssessmentAnswers(stale).manual_handoff_requirements,
    undefined,
  )
  assert.equal(scoreDiagnostic(stale).meaningfulProblem, false)
})
test('draft restoration preserves structured choices and ignores unknown fields', () => {
  const draft = {
    production_status: 'live_now',
    'context_storage_locations:creator_memory_or_undocumented': 'on',
    'context_storage_locations:internal_system': '',
    'active_workflows:production_handoff': 'on',
    irrelevant: 'secret',
  }
  assert.deepEqual(assessmentAnswersFromDraft(draft), {
    production_status: 'live_now',
    context_storage_locations: ['creator_memory_or_undocumented'],
    active_workflows: ['production_handoff'],
  })
})
test('public explanation and recommendation reflect answers without internal segmentation', () => {
  const result = diagnosticResult(highAssessment)
  assert.ok(result.explanations.some((v) => v.includes('6–10')))
  assert.ok(result.explanations.some((v) => v.includes('weekly')))
  assert.ok(
    result.recommendation.includes(
      String(highAssessment.most_urgent_active_workflow),
    ),
  )
  assert.ok(!JSON.stringify(result).includes('A_STATE'))
  assert.ok(
    diagnosticResult(completeAssessment).recommendation.includes('reassess'),
  )
})
test('assessment prepopulation supplies reviewed scope, owner path, tool list and measurement baseline', () => {
  const prefill = pilotAssessmentPrefill(highAssessment)
  assert.equal(
    prefill.pilotWorkflow,
    highAssessment.most_urgent_active_workflow,
  )
  assert.equal(prefill.approvalPath, 'self')
  assert.equal(prefill.targetStartPeriod, 'within-30-days')
  assert.equal(prefill.toolsUsed, 'ComfyUI, Runway, Midjourney')
  assert.ok(String(prefill.successCriteria).includes('interruptions'))
  assert.ok(String(prefill.productionBaseline).includes('one day'))
  assert.deepEqual(pilotAssessmentPrefill({activeWorkflow: 'legacy'}), {})
})
test('analytics includes structured qualification and attribution-ready dimensions without free text', () => {
  const props = diagnosticAnalyticsProperties(
    {
      ...highAssessment,
      most_recent_incident: 'private incident',
      message: 'secret',
    },
    scoreDiagnostic(highAssessment),
  )
  assert.equal(props.assessment_version, ASSESSMENT_VERSION)
  assert.equal(props.A_STATE_PERSON_DEPENDENT, true)
  assert.ok(!JSON.stringify(props).includes('private incident'))
  assert.ok(!JSON.stringify(props).includes('secret'))
})
