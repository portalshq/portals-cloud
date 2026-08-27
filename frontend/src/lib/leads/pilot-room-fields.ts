export const PILOT_DIRECT_ANSWER_FIELDS = [
  'pilotWorkflow',
  'historicalProject',
  'historicalProjectName',
  'targetStartPeriod',
  'productionOwner',
  'productionOwnerEmail',
  'participantsRange',
  'integrationMethod',
  'integrationSystemsJson',
  'requiredIntegrations',
  'technicalEvaluator',
  'technicalEvaluatorEmail',
  'successCriterionKeysJson',
  'successCriteria',
  'pilotBlocker',
] as const

export type PilotDirectAnswerField = (typeof PILOT_DIRECT_ANSWER_FIELDS)[number]

export type PilotDirectAnswers = Partial<Record<PilotDirectAnswerField, string>>

export function isPilotDirectAnswerField(value: string): value is PilotDirectAnswerField {
  return (PILOT_DIRECT_ANSWER_FIELDS as readonly string[]).includes(value)
}

export const PILOT_DIRECT_ANSWER_LABELS: Record<PilotDirectAnswerField, string> = {
  pilotWorkflow: 'Pilot workflow',
  historicalProject: 'Historical project',
  historicalProjectName: 'Historical project name',
  targetStartPeriod: 'Target start period',
  productionOwner: 'Production owner',
  productionOwnerEmail: 'Production owner email',
  participantsRange: 'Participants',
  integrationMethod: 'Integration method',
  integrationSystemsJson: 'Integration systems',
  requiredIntegrations: 'Required integrations or export paths',
  technicalEvaluator: 'Technical evaluator',
  technicalEvaluatorEmail: 'Technical evaluator email',
  successCriterionKeysJson: 'Success criteria selection',
  successCriteria: 'Success criteria',
  pilotBlocker: 'Pilot blocker',
}

export function pilotDirectAnswersFrom(
  answers: Record<string, unknown> | undefined,
): PilotDirectAnswers {
  return Object.fromEntries(
    PILOT_DIRECT_ANSWER_FIELDS.map((field) => [field, String(answers?.[field] || '')]),
  ) as PilotDirectAnswers
}

export type PilotRoomComparableTerms = {
  startDate: string | null
  valueConfirmed: boolean
  criteria: SuccessCriterion[]
  answers: PilotDirectAnswers
}

/**
 * The room and API both use these paths to make a save a narrow operation.
 * Keeping this independent from the Automerge module also keeps WASM server-only.
 */
export function changedPilotTermPaths(
  base: PilotRoomComparableTerms,
  next: PilotRoomComparableTerms,
): string[] {
  const paths: string[] = []
  if ((base.startDate || null) !== (next.startDate || null)) paths.push('startDate')
  if (Boolean(base.valueConfirmed) !== Boolean(next.valueConfirmed)) paths.push('valueConfirmed')

  for (const field of PILOT_DIRECT_ANSWER_FIELDS) {
    if ((base.answers?.[field] || '') !== (next.answers?.[field] || '')) {
      paths.push(`answers.${field}`)
    }
  }

  const baseCriteria = new Map(base.criteria.map((criterion) => [criterion.key, criterion]))
  const nextCriteria = new Map(next.criteria.map((criterion) => [criterion.key, criterion]))
  const keys = new Set([...baseCriteria.keys(), ...nextCriteria.keys()])
  for (const key of keys) {
    const prior = baseCriteria.get(key)
    const current = nextCriteria.get(key)
    if (!current) {
      if (prior) paths.push(`criteria.${key}.__removed`)
      continue
    }
    if (!prior || prior.status !== current.status) paths.push(`criteria.${key}.status`)
    if (!prior || prior.target !== current.target) paths.push(`criteria.${key}.target`)
    if (!prior || prior.participant !== current.participant) paths.push(`criteria.${key}.participant`)
    if (!prior || prior.evidence !== current.evidence) paths.push(`criteria.${key}.evidence`)
  }
  return paths
}
import type {SuccessCriterion} from './contracts'
