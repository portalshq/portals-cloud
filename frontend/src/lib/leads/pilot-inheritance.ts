import {ASSESSMENT_VERSION, diagnosticFields} from './assessment-definition'
import {pilotAssessmentPrefill} from './assessment-diagnostic'
import {assessmentAnswersSchema, pilotRequestAnswersSchema} from './contracts'
import {PRIMARY_PILOT_SUCCESS_TEST} from './pilot-success'

const diagnosticKeys = new Set([
  ...Object.keys(diagnosticFields),
  'assessment_version',
  'assessment_completion_seconds',
  'productionStateBottleneck',
  'productionBaseline',
  'assessmentSnapshot',
  'assessmentSubmissionId',
  'assessmentSubmittedAt',
])

export function editablePilotOverrides(
  assessment: Record<string, unknown>,
  overrides: Record<string, unknown>
) {
  const legacyFields = new Set([
    'recreationFrequency',
    'recurringWorkflow',
    'assetVolume',
    'primaryObjection',
    'message',
    'teamSize',
  ])
  return Object.fromEntries(
    Object.entries(overrides).filter(
      ([key]) =>
        key === 'productionOwner' ||
        !diagnosticKeys.has(key) ||
        (assessment.assessment_version !== ASSESSMENT_VERSION &&
          legacyFields.has(key))
    )
  )
}

/** Browser input configures a pilot; it cannot replace an authorized assessment. */
export function inheritPilotAssessment(
  assessment: Record<string, unknown>,
  overrides: Record<string, unknown>,
  source: {
    profileId?: string
    assessedAt?: string
    submissionId?: string
    explicitFields?: string[]
  } = {}
) {
  const explicit = editablePilotOverrides(assessment, overrides)
  // Schema defaults are empty strings. Empty missing fields inherit; submitted
  // editable fields remain explicit, including false and existing custom criteria.
  const meaningful = Object.fromEntries(
    Object.entries(explicit).filter(
      ([key, value]) =>
        value != null &&
        (!source.explicitFields || source.explicitFields.includes(key))
    )
  )
  const inherited = {...assessment, ...pilotAssessmentPrefill(assessment)}
  return pilotRequestAnswersSchema.parse({
    ...inherited,
    ...meaningful,
    successCriteria:
      meaningful.successCriteria ||
      inherited.successCriteria ||
      PRIMARY_PILOT_SUCCESS_TEST,
    ...(source.profileId && Object.keys(assessment).length
      ? {
          assessmentSnapshot: {
            profileId: source.profileId,
            assessedAt: source.assessedAt,
            submissionId: source.submissionId,
            answers: assessmentAnswersSchema.parse(assessment),
          },
        }
      : {}),
  })
}

export function pilotAssessmentContext(answers: Record<string, unknown>) {
  return {...answers, ...pilotAssessmentPrefill(answers)}
}
