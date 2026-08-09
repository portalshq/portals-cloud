import {
  SCORE_VERSION,
  type QualificationOutcome,
  type QualificationReasonCode,
  type QualificationScores,
  type QualificationTier,
  type ScoreDimension,
} from './contracts'

export type QualificationAnswers = Record<string, unknown>

export const ASSESSMENT_SCORE_MAXIMUM = 24

export const assessmentWeights = {
  fit: 40,
  pain: 35,
  intent: 25,
} as const

export function assessmentScore(
  scores: Pick<QualificationScores, 'fit' | 'pain' | 'intent'>,
): number {
  const composite =
    (scores.fit.normalized * assessmentWeights.fit +
      scores.pain.normalized * assessmentWeights.pain +
      scores.intent.normalized * assessmentWeights.intent) /
    100
  return Math.round(
    Math.min(ASSESSMENT_SCORE_MAXIMUM, (composite / 100) * ASSESSMENT_SCORE_MAXIMUM),
  )
}

export function workflowRiskScore(
  scores: Pick<QualificationScores, 'pain'>,
): number {
  return Math.round(
    Math.min(ASSESSMENT_SCORE_MAXIMUM, (scores.pain.normalized / 100) * ASSESSMENT_SCORE_MAXIMUM),
  )
}

function hasAnswer(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null
}

export function mergeQualificationAnswers(
  ...sources: Array<QualificationAnswers | undefined>
): QualificationAnswers {
  return sources.reduce<QualificationAnswers>((merged, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (hasAnswer(value)) merged[key] = value
    }
    return merged
  }, {})
}

type Signal = {
  maximum: number
  value?: number
  eligible?: boolean
}

const targetTeams = new Set([
  'agency',
  'creative-studio',
  'production-company',
  'in-house-creative',
  'brand-marketing',
  'film-animation',
  'game-entertainment',
])

function text(answers: QualificationAnswers, key: string): string {
  const value = answers[key]
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function bool(answers: QualificationAnswers, key: string): boolean | undefined {
  const value = answers[key]
  return typeof value === 'boolean' ? value : undefined
}

function mapped(
  answers: QualificationAnswers,
  key: string,
  maximum: number,
  values: Record<string, number>,
  eligible = true,
): Signal {
  const answer = text(answers, key)
  return {
    maximum,
    eligible,
    value: Object.prototype.hasOwnProperty.call(values, answer)
      ? values[answer]
      : undefined,
  }
}

function dimension(signals: Signal[]): ScoreDimension {
  const eligible = signals.filter((signal) => signal.eligible !== false)
  const answered = eligible.filter((signal) => signal.value !== undefined)
  const earned = answered.reduce((total, signal) => total + (signal.value || 0), 0)
  const answeredMaximum = answered.reduce(
    (total, signal) => total + signal.maximum,
    0,
  )
  const eligibleMaximum = eligible.reduce(
    (total, signal) => total + signal.maximum,
    0,
  )

  return {
    earned,
    answeredMaximum,
    eligibleMaximum,
    normalized:
      answeredMaximum > 0 ? Math.round((earned / answeredMaximum) * 100) : 0,
    coverage:
      eligibleMaximum > 0
        ? Math.round((answeredMaximum / eligibleMaximum) * 100)
        : 0,
  }
}

function teamTypeSignal(answers: QualificationAnswers): Signal {
  const value = text(answers, 'teamType')
  if (!value || value === 'not-sure') return {maximum: 8}
  if (targetTeams.has(value)) return {maximum: 8, value: 8}
  if (value === 'independent-creator') return {maximum: 8, value: 3}
  return {maximum: 8, value: 2}
}

function incidentSignal(answers: QualificationAnswers): Signal {
  const incident = text(answers, 'incidentType')
  const frequency = text(answers, 'recreationFrequency')
  const people = text(answers, 'peopleAffected')

  if (frequency === 'never' || incident === 'none') {
    return {maximum: 8, value: 0}
  }

  const incidentPoints: Record<string, number> = {
    'version-confusion': 2,
    'missing-context': 3,
    'failed-reproduction': 4,
    'recreated-work': 4,
    other: 1,
  }
  const peoplePoints: Record<string, number> = {
    '1': 0,
    '2-4': 1,
    '5-9': 2,
    '10-24': 3,
    '25-plus': 4,
  }

  if (!(incident in incidentPoints) && !(people in peoplePoints)) {
    return {maximum: 8}
  }

  return {
    maximum: 8,
    value: Math.min(8, (incidentPoints[incident] || 0) + (peoplePoints[people] || 0)),
  }
}

function implicitZeroWhenNoIncident(
  answers: QualificationAnswers,
  signal: Signal,
): Signal {
  return text(answers, 'recreationFrequency') === 'never'
    ? {...signal, value: 0}
    : signal
}

export function calculateQualification(
  answers: QualificationAnswers,
): QualificationScores {
  const fit = dimension([
    teamTypeSignal(answers),
    mapped(answers, 'teamSize', 8, {
      '1': 0,
      '2-4': 4,
      '5-9': 8,
      '10-24': 8,
      '25-plus': 8,
    }),
    mapped(answers, 'workflowCollaborators', 6, {
      '1': 0,
      '2-4': 3,
      '5-9': 6,
      '10-plus': 6,
    }),
    mapped(answers, 'toolsUsed', 6, {
      '1': 0,
      '2': 3,
      '3-4': 5,
      '5-plus': 6,
    }),
    mapped(answers, 'recurringWorkflow', 6, {
      'one-off': 0,
      quarterly: 2,
      monthly: 4,
      weekly: 5,
      daily: 6,
    }),
    mapped(answers, 'assetVolume', 6, {
      'under-25': 0,
      '25-99': 2,
      '100-499': 4,
      '500-plus': 6,
    }),
  ])

  const pain = dimension([
    incidentSignal(answers),
    mapped(answers, 'approvedVersionMethod', 6, {
      'canonical-system': 0,
      'documented-review': 2,
      'folder-naming': 3,
      'chat-spreadsheet': 4,
      'creator-memory': 6,
      inconsistent: 6,
    }),
    mapped(answers, 'productionContextMethod', 6, {
      'attached-record': 0,
      'project-document': 2,
      'multiple-tools': 4,
      'chat-personal-notes': 5,
      'memory-inconsistent': 6,
    }),
    mapped(answers, 'recreationFrequency', 6, {
      never: 0,
      quarterly: 2,
      monthly: 4,
      weekly: 5,
      daily: 6,
    }),
    implicitZeroWhenNoIncident(
      answers,
      mapped(answers, 'hoursLost', 5, {
        none: 0,
        'under-1-hour': 1,
        '1-4-hours': 2,
        'one-day': 3,
        '2-5-days': 4,
        'week-plus': 5,
      }),
    ),
    implicitZeroWhenNoIncident(
      answers,
      mapped(answers, 'deliveryImpact', 4, {
        none: 0,
        'internal-delay': 1,
        'delivery-delayed': 2,
        'client-affected': 3,
        'revenue-relationship': 4,
      }),
    ),
  ])

  const activeWorkflow = text(answers, 'activeWorkflow')
  const intent = dimension([
    {
      maximum: 6,
      value: activeWorkflow
        ? activeWorkflow === 'no'
          ? 0
          : 6
        : undefined,
    },
    mapped(answers, 'timeline', 5, {
      'within-30-days': 5,
      '1-3-months': 3,
      '3-plus-months': 1,
      'not-planned': 0,
    }),
    mapped(answers, 'targetStartPeriod', 5, {
      'within-30-days': 5,
      'within-60-days': 4,
      'this-quarter': 3,
      later: 0,
    }, !text(answers, 'timeline')),
    {maximum: 3, value: bool(answers, 'productProofCompleted') === undefined ? undefined : bool(answers, 'productProofCompleted') ? 3 : 0},
    {maximum: 3, value: bool(answers, 'pricingOrPilotViewed') === undefined ? undefined : bool(answers, 'pricingOrPilotViewed') ? 3 : 0},
    {maximum: 3, value: bool(answers, 'workflowReviewRequested') === undefined ? undefined : bool(answers, 'workflowReviewRequested') ? 3 : 0},
    {maximum: 3, value: bool(answers, 'stakeholderInvolved') === undefined ? undefined : bool(answers, 'stakeholderInvolved') ? 3 : 0},
    {maximum: 2, value: bool(answers, 'securityDiligence') === undefined ? undefined : bool(answers, 'securityDiligence') ? 2 : 0},
  ])

  return {
    version: SCORE_VERSION,
    fit,
    pain,
    intent,
    assessmentScore: assessmentScore({fit, pain, intent}),
    workflowRiskScore: workflowRiskScore({pain}),
  }
}

export function qualificationTier(
  scores: QualificationScores,
  answers?: QualificationAnswers,
): QualificationTier {
  if (answers && !credibleActiveWorkflow(answers)) return 'low'
  if (
    scores.fit.coverage >= 60 &&
    scores.pain.coverage >= 60 &&
    scores.fit.normalized >= 70 &&
    scores.pain.normalized >= 57 &&
    scores.intent.normalized >= 50
  ) {
    return 'high'
  }

  if (
    scores.fit.coverage < 60 ||
    scores.pain.coverage < 60 ||
    scores.fit.normalized >= 50 ||
    scores.pain.normalized >= 40
  ) {
    return 'medium'
  }

  return 'low'
}

export function credibleActiveWorkflow(answers: QualificationAnswers): boolean {
  const workflow = text(answers, 'activeWorkflow') || text(answers, 'pilotWorkflow')
  return Boolean(workflow) && !/^(no|none|n\/a|not\s+(yet|sure)|unknown)$/i.test(workflow)
}

export function qualificationOutcome(
  tier: QualificationTier,
): QualificationOutcome {
  if (tier === 'high') return 'pilot_candidate'
  if (tier === 'medium' || tier === 'incomplete') return 'clarify'
  return 'education'
}

export function qualificationReasonCodes(
  answers: QualificationAnswers,
  scores: QualificationScores,
  outcome: QualificationOutcome,
): QualificationReasonCode[] {
  const reasons: QualificationReasonCode[] = []
  if (scores.fit.normalized >= 70) reasons.push('strong-workflow-fit')
  if (['daily', 'weekly', 'monthly'].includes(text(answers, 'recurringWorkflow'))) {
    reasons.push('repeatable-production')
  }
  if (scores.pain.normalized >= 57) reasons.push('measurable-rework-risk')
  if (['multiple-tools', 'chat-personal-notes', 'memory-inconsistent'].includes(text(answers, 'productionContextMethod'))) {
    reasons.push('production-context-fragmented')
  }
  if (['folder-naming', 'chat-spreadsheet', 'creator-memory', 'inconsistent'].includes(text(answers, 'approvedVersionMethod'))) {
    reasons.push('approved-version-risk')
  }
  if (!text(answers, 'activeWorkflow') || /^(no|none|n\/a|not\s+yet)$/i.test(text(answers, 'activeWorkflow'))) {
    reasons.push('workflow-definition-needed')
  } else if (outcome === 'clarify') {
    reasons.push('commercial-readiness-needed')
  }
  if (outcome === 'education' && scores.pain.normalized < 40) {
    reasons.push('limited-current-risk')
  }
  return [...new Set(reasons)].slice(0, 3)
}

export const readinessFields = [
  'targetStartPeriod',
  'approvalPath',
  'productionOwner',
  'primaryObjection',
] as const

export function missingReadinessFields(answers: QualificationAnswers): string[] {
  return readinessFields.filter((field) => !hasAnswer(answers[field]))
}

export function commercialReadinessComplete(answers: QualificationAnswers): boolean {
  const approvalPath = text(answers, 'approvalPath')
  const targetStartPeriod = text(answers, 'targetStartPeriod')
  return (
    credibleActiveWorkflow(answers) &&
    Boolean(text(answers, 'productionOwner')) &&
    ['self', 'other', 'procurement'].includes(approvalPath) &&
    ['within-30-days', 'within-60-days', 'this-quarter'].includes(targetStartPeriod)
  )
}

const workflowByRisk: Record<string, string> = {
  'approved-version': 'approved-version-retrieval',
  'version-confusion': 'approved-version-retrieval',
  reproducibility: 'asset-reproduction',
  'failed-reproduction': 'asset-reproduction',
  variants: 'five-more-like-this',
  continuity: 'character-continuity',
  handoff: 'production-handoff',
  'variant-control': 'campaign-variant-control',
}

export function recommendedWorkflow(answers: QualificationAnswers): string {
  const statedRisk = text(answers, 'workflowRisk')
  const incident = text(answers, 'incidentType')
  return (
    workflowByRisk[statedRisk] ||
    workflowByRisk[incident] ||
    'asset-reproduction'
  )
}
