import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateQualification,
  mergeQualificationAnswers,
  qualificationTier,
} from './scoring'

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
  assert.equal(qualificationTier(scores), 'incomplete')
})
