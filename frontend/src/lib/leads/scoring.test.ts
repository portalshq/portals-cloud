import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSESSMENT_SCORE_MAXIMUM,
  assessmentScore,
  calculateQualification,
  mergeQualificationAnswers,
  qualificationTier,
} from './scoring'
import {SCORE_VERSION, commercialReadinessAnswersSchema, pilotRequestAnswersSchema} from './contracts'

test('progressive answers preserve known values when hidden fields submit blanks', () => {
  const merged = mergeQualificationAnswers(
    {teamType: 'creative-studio', activeWorkflow: 'campaign variants'},
    {teamType: '', activeWorkflow: '', toolsUsed: '3-4'},
  )

  assert.deepEqual(merged, {
    teamType: 'creative-studio',
    activeWorkflow: 'campaign variants',
    toolsUsed: '3-4',
  })
})

test('explicit no-incident answers resolve conditional pain to zero', () => {
  const scores = calculateQualification({
    approvedVersionMethod: 'canonical-system',
    productionContextMethod: 'attached-record',
    recreationFrequency: 'never',
    incidentType: 'none',
  })

  assert.equal(scores.pain.earned, 0)
  assert.equal(scores.pain.coverage, 100)
})

test('strong fit and pain with incomplete intent routes to review', () => {
  const scores = calculateQualification({
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '5-9',
    toolsUsed: '5-plus',
    recurringWorkflow: 'weekly',
    assetVolume: '500-plus',
    approvedVersionMethod: 'creator-memory',
    productionContextMethod: 'memory-inconsistent',
    recreationFrequency: 'weekly',
    incidentType: 'failed-reproduction',
    peopleAffected: '10-24',
    hoursLost: '2-5-days',
    deliveryImpact: 'client-affected',
  })

  assert.equal(qualificationTier(scores), 'medium')
})

test('strong declared intent produces a high qualification', () => {
  const scores = calculateQualification({
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '5-9',
    toolsUsed: '5-plus',
    recurringWorkflow: 'weekly',
    assetVolume: '500-plus',
    approvedVersionMethod: 'creator-memory',
    productionContextMethod: 'memory-inconsistent',
    recreationFrequency: 'weekly',
    incidentType: 'failed-reproduction',
    peopleAffected: '10-24',
    hoursLost: '2-5-days',
    deliveryImpact: 'client-affected',
    activeWorkflow: 'a live campaign workflow',
    timeline: 'within-30-days',
    workflowReviewRequested: true,
    stakeholderInvolved: true,
  })

  assert.equal(qualificationTier(scores), 'high')
})

test('unknown values reduce coverage instead of lowering the normalized score', () => {
  const scores = calculateQualification({teamType: 'creative-studio'})

  assert.equal(scores.fit.normalized, 100)
  assert.equal(scores.fit.coverage, 20)
  assert.equal(qualificationTier(scores), 'medium')
})

test('assessment score is a bounded composite of the three dimensions', () => {
  const scores = calculateQualification({
    teamType: 'creative-studio',
    teamSize: '5-9',
    workflowCollaborators: '5-9',
    toolsUsed: '5-plus',
    recurringWorkflow: 'weekly',
    assetVolume: '500-plus',
    approvedVersionMethod: 'creator-memory',
    productionContextMethod: 'memory-inconsistent',
    recreationFrequency: 'weekly',
    incidentType: 'failed-reproduction',
    peopleAffected: '10-24',
    hoursLost: '2-5-days',
    deliveryImpact: 'client-affected',
    activeWorkflow: 'a live campaign workflow',
    timeline: 'within-30-days',
  })

  assert.equal(scores.assessmentScore, assessmentScore(scores))
  assert.ok(scores.assessmentScore >= 0)
  assert.ok(scores.assessmentScore <= ASSESSMENT_SCORE_MAXIMUM)
  assert.ok(scores.assessmentScore > 0, 'high-risk answers should raise the composite')
})

test('the supplied 93/63/55 profile clears the widened high threshold', () => {
  const dimension = (normalized: number, coverage: number) => ({
    earned: normalized,
    answeredMaximum: 100,
    eligibleMaximum: 100,
    normalized,
    coverage,
  })
  assert.equal(
    qualificationTier({
      version: SCORE_VERSION,
      fit: dimension(93, 100),
      pain: dimension(63, 100),
      intent: dimension(55, 44),
      assessmentScore: 18,
      workflowRiskScore: 15,
    }),
    'high',
  )
})

test('approval paths preserve every canonical serialized value', () => {
  for (const approvalPath of ['self', 'other', 'procurement', 'not-established', 'no'] as const) {
    const readiness = commercialReadinessAnswersSchema.parse({
      targetStartPeriod: 'within-30-days',
      approvalPath,
      productionOwner: 'Senior producer',
      primaryObjection: 'none',
    })
    const pilot = pilotRequestAnswersSchema.parse({approvalPath})
    assert.equal(readiness.approvalPath, approvalPath)
    assert.equal(pilot.approvalPath, approvalPath)
  }
})
