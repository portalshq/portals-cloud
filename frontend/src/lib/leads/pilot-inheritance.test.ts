import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inheritPilotAssessment,
  pilotAssessmentContext,
} from './pilot-inheritance'
import {PRIMARY_PILOT_SUCCESS_TEST} from './pilot-success'
import {
  highAssessment,
  vfxAssessment,
  throughputAssessment,
  completeAssessment,
} from './assessment-fixtures'

test('all production-state fields survive inheritance without lossy contributor conversion', () => {
  for (const fixture of [
    highAssessment,
    vfxAssessment,
    throughputAssessment,
    completeAssessment,
  ]) {
    const result = inheritPilotAssessment(
      fixture,
      {},
      {profileId: 'owned-profile', submissionId: 'assessment-1'}
    )
    for (const field of [
      'contributors_count',
      'context_storage_locations',
      'captured_production_state',
      'production_failures',
      'active_workflows',
      'most_recent_incident',
      'adoption_authority',
    ]) {
      assert.deepEqual(result[field as keyof typeof result], fixture[field])
    }
    assert.equal(result.toolsUsed, 'ComfyUI, Runway, Midjourney')
    assert.equal(result.requiredIntegrations, result.toolsUsed)
    assert.equal(result.successCriteria, PRIMARY_PILOT_SUCCESS_TEST)
    assert.equal(result.workflowCollaborators, '')
    assert.equal(result.assessmentSnapshot?.profileId, 'owned-profile')
    assert.equal(result.assessmentSnapshot?.submissionId, 'assessment-1')
  }
})

test('pilot overrides preserve original diagnosis, baseline and assessment snapshot', () => {
  const result = inheritPilotAssessment(
    highAssessment,
    {
      pilotWorkflow: 'Updated campaign',
      productionOwner: 'New owner',
      approvalPath: 'other',
      production_status: 'experimenting_or_researching',
      productionBaseline: 'forged',
      assessmentSnapshot: {profileId: 'foreign'},
      annualPriceAcknowledged: false,
    },
    {profileId: 'owned'}
  )
  assert.equal(result.pilotWorkflow, 'Updated campaign')
  assert.equal(result.production_status, 'live_now')
  assert.notEqual(result.productionBaseline, 'forged')
  assert.equal(result.annualPriceAcknowledged, false)
  assert.equal(
    result.assessmentSnapshot?.answers.productionOwner,
    highAssessment.productionOwner
  )
  assert.equal(result.assessmentSnapshot?.profileId, 'owned')
  assert.equal(highAssessment.productionOwner, 'Senior producer')
})

test('legacy and direct entries retain truthful unknowns and do not trust forged v4 facts', () => {
  const legacy = inheritPilotAssessment(
    {
      toolsUsed: 'Runway',
      activeWorkflow: 'Current campaign',
      targetStartPeriod: 'later',
    },
    {}
  )
  assert.equal(legacy.toolsUsed, 'Runway')
  assert.equal(legacy.targetStartPeriod, 'later')
  const direct = inheritPilotAssessment(
    {},
    {...highAssessment, pilotWorkflow: 'Direct production'}
  )
  assert.equal(direct.assessment_version, undefined)
  assert.equal(direct.production_status, undefined)
  assert.equal(direct.pilotWorkflow, 'Direct production')
  assert.equal(
    pilotAssessmentContext({assessment_version: 'assessment.v4'})
      .targetStartPeriod,
    ''
  )
})

test('new assessment defaults refresh while explicit cleared and changed pilot fields survive', () => {
  const updated = {
    ...highAssessment,
    most_urgent_active_workflow: 'New assessment workflow',
    production_status: 'within_1_to_3_months',
  }
  const result = inheritPilotAssessment(
    updated,
    {pilotWorkflow: '', targetStartPeriod: '', securityRequirements: ''},
    {explicitFields: ['securityRequirements']}
  )
  assert.equal(result.pilotWorkflow, 'New assessment workflow')
  assert.equal(result.targetStartPeriod, 'this-quarter')
  assert.equal(result.securityRequirements, '')
  const custom = inheritPilotAssessment(updated, {
    pilotWorkflow: 'Saved override',
    successCriteria: 'Agreed custom target',
  })
  assert.equal(custom.pilotWorkflow, 'Saved override')
  assert.equal(custom.successCriteria, 'Agreed custom target')
})
