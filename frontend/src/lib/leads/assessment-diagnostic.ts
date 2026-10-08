import {
  ASSESSMENT_VERSION,
  activeAssessmentAnswers,
  excellentTransfer,
  selected,
  type AssessmentValues,
} from './assessment-definition'

export const stateSignals = [
  'A_STATE_PERSON_DEPENDENT',
  'B_MISSING_GENERATIVE_STATE',
  'C_THROUGHPUT_CORRECTNESS',
] as const
export type StateSignal = (typeof stateSignals)[number]
export type DiagnosticScore = {
  version: typeof ASSESSMENT_VERSION
  operationalFitScore: number
  commercialReadinessScore: number
  total: number
  tier: 'high' | 'medium' | 'low'
  meaningfulProblem: boolean
  caps: string[]
  signals: Record<StateSignal, {active: boolean; evidence: string[]}>
  breakdown: Record<string, number>
}
const points = (value: unknown, weights: Record<string, number>) =>
  typeof value === 'string' ? weights[value] || 0 : 0
const meaningfulText = (value: unknown) =>
  typeof value === 'string' &&
  value.trim().length >= 12 &&
  !/^(no|none|unknown|not sure|not yet|n\/a)$/i.test(value.trim())
const correctnessFailures = [
  'wrong_reference',
  'outdated_source_asset',
  'wrong_approved_version',
  'character_product_style_drift',
  'unnecessary_generations_or_retries',
  'duplicate_work',
  'client_review_failure',
]
const reproductionFailures = [
  'unable_to_reproduce_approved_output',
  'rd_workflow_rebuilt_for_production',
]

export function scoreDiagnostic(raw: AssessmentValues): DiagnosticScore {
  const a = activeAssessmentAnswers(raw)
  const failures = selected(a, 'production_failures').filter(
    (v) => v !== 'none',
  )
  const manual = selected(a, 'manual_handoff_requirements').filter(
    (v) => v !== 'nothing_significant',
  )
  const interruptions = selected(a, 'context_interrupt_owner').filter(
    (v) => v !== 'nobody',
  )
  const storage = selected(a, 'context_storage_locations')
  const captured = selected(a, 'captured_production_state')
  const patterns = selected(a, 'active_workflows')
  const poorTransfer = ['substantial_handoff', 'usually_not'].includes(
    String(a.transferability_without_originator),
  )
  const agentProblem =
    patterns.includes('agent_assisted_production') &&
    [
      'manually_supplied',
      'searches_unverified_sources',
      'operator_memory',
    ].includes(String(a.agent_context_resolution))
  const provenanceProblem =
    a.ip_controlled_content === 'yes' &&
    (a.incorrect_source_exposure === 'yes' ||
      a.source_traceability_required === 'yes') &&
    !captured.includes('provenance_or_rights')
  const externalState =
    a.execution_state_complete === 'no_external_state_required'
  const evidenceA = [
    ...(poorTransfer ? ['substantial-originator-handoff'] : []),
    ...(failures.includes('long_handoff_or_onboarding')
      ? ['observed-long-handoff']
      : []),
    ...(storage.includes('creator_memory_or_undocumented')
      ? ['undocumented-creator-context']
      : []),
    ...(manual.length && interruptions.length
      ? ['manual-context-interruptions']
      : []),
  ]
  const evidenceB = [
    ...(externalState ? ['required-state-outside-execution-workflow'] : []),
    ...failures.filter(
      (v) =>
        reproductionFailures.includes(v) || v === 'lost_or_unclear_provenance',
    ),
    ...(manual.includes('current_asset_versions') &&
    !captured.includes('exact_source_asset_versions')
      ? ['exact-source-versions-not-captured']
      : []),
    ...(provenanceProblem ? ['required-source-lineage-not-captured'] : []),
    ...(agentProblem ? ['agent-context-not-deterministic'] : []),
  ]
  const evidenceC = [
    ...failures.filter((v) => correctnessFailures.includes(v)),
    ...(manual.length &&
    ['weekly', 'daily'].includes(String(a.recurringWorkflow))
      ? ['recurring-manual-context-reconstruction']
      : []),
  ]
  const meaningfulProblem =
    evidenceA.length + evidenceB.length + evidenceC.length > 0
  const severeFailure = failures.some(
    (v) =>
      correctnessFailures.includes(v) ||
      reproductionFailures.includes(v) ||
      v === 'lost_or_unclear_provenance',
  )
  const strongSoloException =
    severeFailure &&
    ['weekly', 'daily'].includes(String(a.recurringWorkflow)) &&
    points(a.time_lost_per_incident, {
      one_day: 1,
      '2_to_5_days': 1,
      more_than_week: 1,
    }) > 0
  const multi =
    (a.contributors_count !== '1' && Boolean(a.contributors_count)) ||
    a.imminent_contributor_scaling === 'yes'
  const fragmentation =
    externalState ||
    manual.length > 0 ||
    storage.includes('creator_memory_or_undocumented')
  const weights = {
    active_production: points(a.production_status, {
      live_now: 10,
      within_30_days: 10,
      within_1_to_3_months: 6,
    }),
    contributors:
      points(a.contributors_count, {
        '2_5': 5,
        '6_10': 8,
        '11_25': 8,
        '25_plus': 8,
      }) || (a.imminent_contributor_scaling === 'yes' ? 5 : 0),
    tool_state_complexity: Math.min(
      7,
      Math.max(0, selected(a, 'ai_tools').length - 1) * 2 +
        (externalState ? 3 : 0),
    ),
    state_fragmentation: fragmentation
      ? Math.min(
          12,
          (externalState ? 7 : 0) +
            manual.length * 2 +
            (storage.includes('creator_memory_or_undocumented') ? 5 : 0) +
            (storage.length > 1 ? 2 : 0),
        )
      : 0,
    transferability: Math.min(
      12,
      points(a.transferability_without_originator, {
        usually_minor_help: 3,
        substantial_handoff: 8,
        usually_not: 10,
      }) +
        points(a.time_to_transfer, {
          '30m_to_2h': 1,
          half_day: 3,
          one_day: 4,
          two_to_five_days: 5,
          may_not_reproduce_reliably: 6,
        }),
    ),
    failures: meaningfulProblem
      ? Math.min(
          8,
          points(a.recreationFrequency, {
            quarterly: 2,
            monthly: 4,
            weekly: 6,
            daily: 8,
          }) + (failures.length ? 2 : 0),
        )
      : 0,
    repeatability: Math.min(
      5,
      points(a.recurringWorkflow, {
        quarterly: 1,
        monthly: 3,
        weekly: 4,
        daily: 5,
      }) +
        (patterns.some((v) =>
          [
            'campaign_variant_production',
            'make_twelve_more_like_this',
            'localization_or_market_adaptation',
          ].includes(v),
        )
          ? 1
          : 0),
    ),
    impact: meaningfulProblem
      ? points(a.time_lost_per_incident, {
          under_1_hour: 1,
          '1_to_4_hours': 3,
          half_day: 4,
          one_day: 6,
          '2_to_5_days': 8,
          more_than_week: 8,
        })
      : 0,
  }
  const commercial = {
    pilot_readiness: points(a.pilot_readiness_30d, {
      yes_live_production: 10,
      possibly: 6,
    }),
    owner:
      typeof a.productionOwner === 'string' &&
      a.productionOwner.trim().length >= 3 &&
      !/^(none|unknown|not sure|n\/a)$/i.test(a.productionOwner.trim())
        ? 5
        : 0,
    approval_path: points(a.adoption_authority, {
      can_approve: 5,
      can_recommend: 3,
      need_another_sponsor: 1,
    }),
    affected_value: points(a.affected_work_value, {
      under_100k: 1,
      '100k_500k': 3,
      '500k_1m': 4,
      '1m_5m': 5,
      '5m_plus': 5,
    }),
    urgent_workflow: meaningfulText(a.most_urgent_active_workflow) ? 5 : 0,
  }
  const operationalFitScore = Object.values(weights).reduce(
    (sum, v) => sum + v,
    0,
  )
  const commercialReadinessScore = Object.values(commercial).reduce(
    (sum, v) => sum + v,
    0,
  )
  let total = operationalFitScore + commercialReadinessScore
  const caps: string[] = []
  const cap = (maximum: number, reason: string) => {
    total = Math.min(total, maximum)
    caps.push(reason)
  }
  if (a.production_status === 'experimenting_or_researching')
    cap(49, 'research-only')
  if (!multi && !strongSoloException) cap(44, 'solo-without-imminent-scaling')
  if (!meaningfulProblem) cap(39, 'no-meaningful-production-state-problem')
  // Excellent handoff alone cannot hide independent correctness, reproduction, rights or agent evidence.
  if (excellentTransfer(a) && !meaningfulProblem)
    cap(39, 'state-transfers-reliably')
  const highGates =
    ['live_now', 'within_30_days'].includes(String(a.production_status)) &&
    multi &&
    meaningfulProblem &&
    ['yes_live_production', 'possibly'].includes(
      String(a.pilot_readiness_30d),
    ) &&
    commercial.owner > 0 &&
    ['can_approve', 'can_recommend'].includes(String(a.adoption_authority)) &&
    commercial.urgent_workflow > 0
  const tier =
    total >= 70 && highGates
      ? 'high'
      : total >= 50 && meaningfulProblem
      ? 'medium'
      : 'low'
  return {
    version: ASSESSMENT_VERSION,
    operationalFitScore,
    commercialReadinessScore,
    total,
    tier,
    meaningfulProblem,
    caps,
    breakdown: {...weights, ...commercial},
    signals: {
      A_STATE_PERSON_DEPENDENT: {
        active: evidenceA.length > 0,
        evidence: evidenceA,
      },
      B_MISSING_GENERATIVE_STATE: {
        active: evidenceB.length > 0,
        evidence: evidenceB,
      },
      C_THROUGHPUT_CORRECTNESS: {
        active: evidenceC.length > 0,
        evidence: evidenceC,
      },
    },
  }
}

export function diagnosticResult(
  a: AssessmentValues,
  score = scoreDiagnostic(a),
) {
  const explanations: string[] = []
  const range = String(a.contributors_count || '')
    .replace('_', '–')
    .replace('plus', '+')
  if (a.contributors_count !== '1' && range)
    explanations.push(
      `${range} contributors need to continue or review this production.`,
    )
  if (
    ['substantial_handoff', 'usually_not'].includes(
      String(a.transferability_without_originator),
    )
  )
    explanations.push(
      'Approved work depends on substantial help from the original creator.',
    )
  if (a.execution_state_complete === 'no_external_state_required')
    explanations.push(
      'Important approved production state remains outside the execution workflow.',
    )
  if (
    selected(a, 'production_failures').some((v) =>
      correctnessFailures.includes(v),
    )
  )
    explanations.push(
      'Your team has encountered incorrect inputs, continuity drift, or avoidable production retries.',
    )
  if (['weekly', 'daily', 'monthly'].includes(String(a.recreationFrequency)))
    explanations.push(
      `Context reconstruction or recreation happens ${a.recreationFrequency}.`,
    )
  if (a.pilot_readiness_30d === 'yes_live_production')
    explanations.push(
      'Your team can test a fix in a live production within 30 days.',
    )
  if (a.pilot_readiness_30d === 'no_researching')
    explanations.push(
      'A near-term test is not currently practical; keep this recommendation for a future production.',
    )
  if (a.production_status === 'within_1_to_3_months')
    explanations.push(
      'The production starts in one to three months, so timing needs to be established before deployment.',
    )
  if (
    a.adoption_authority === 'need_another_sponsor' ||
    a.adoption_authority === 'not_involved_in_purchase'
  )
    explanations.push(
      'A sponsor or approval owner still needs to be involved before a test can proceed.',
    )
  if (
    score.signals.B_MISSING_GENERATIVE_STATE.evidence.includes(
      'agent-context-not-deterministic',
    )
  )
    explanations.push(
      'The agent depends on manually supplied or unverified production context.',
    )
  if (score.tier === 'low')
    explanations.push(
      'The current production does not yet show enough active coordination or production-state complexity to justify deployment.',
    )
  const workflow =
    typeof a.most_urgent_active_workflow === 'string'
      ? a.most_urgent_active_workflow.trim()
      : ''
  const intervention =
    score.signals.C_THROUGHPUT_CORRECTNESS.active &&
    !score.signals.A_STATE_PERSON_DEPENDENT.active
      ? 'Keep creators on approved references and source versions'
      : 'Make approved production state reproducible and transferable'
  return {
    title:
      score.tier === 'high'
        ? 'Strong production-pilot candidate'
        : score.tier === 'medium'
        ? 'Potential production-pilot fit'
        : 'A useful starting point for future production',
    explanations,
    recommendation:
      score.tier === 'low'
        ? 'Explore relevant production use cases and reassess when a live team workflow needs to transfer or scale.'
        : `${intervention}${workflow ? ` for: ${workflow}` : '.'}`,
  }
}

export function pilotAssessmentPrefill(a: AssessmentValues): AssessmentValues {
  if (a.assessment_version !== ASSESSMENT_VERSION) return {}
  const score = scoreDiagnostic(a)
  return {
    pilotWorkflow: a.most_urgent_active_workflow,
    activeWorkflow: a.most_urgent_active_workflow,
    toolsUsed: selected(a, 'ai_tools').join(', '),
    targetStartPeriod:
      a.production_status === 'within_1_to_3_months'
        ? 'this-quarter'
        : a.production_status === 'experimenting_or_researching'
        ? 'later'
        : 'within-30-days',
    approvalPath:
      (
        {
          can_approve: 'self',
          can_recommend: 'other',
          need_another_sponsor: 'not-established',
          not_involved_in_purchase: 'no',
        } as Record<string, string>
      )[String(a.adoption_authority)] || '',
    productionStateBottleneck: diagnosticResult(a, score).recommendation,
    // Starting baselines are observations, never guaranteed savings or accepted targets.
    productionBaseline: `Time to transfer: ${String(
      a.time_to_transfer || 'unknown',
    ).replaceAll('_', ' ')}. Reconstruction frequency: ${
      a.recreationFrequency || 'unknown'
    }. Time lost per incident: ${String(
      a.time_lost_per_incident || 'unknown',
    ).replaceAll('_', ' ')}.`,
    successCriteria:
      'Compare before and after: creator time to become productive; original-creator interruptions; context reconstruction and handoff time; wrong-reference/version failures; reproduction success; retries caused by missing state; required production state captured. Agree a baseline and target for each relevant measure.',
    workflowCollaborators:
      (
        {
          '1': '1',
          '2_5': '2-4',
          '6_10': '5-9',
          '11_25': '10-plus',
          '25_plus': '10-plus',
        } as Record<string, string>
      )[String(a.contributors_count)] || '',
  }
}

export function diagnosticAnalyticsProperties(
  a: AssessmentValues,
  score?: DiagnosticScore,
): Record<string, unknown> {
  return {
    assessment_version: a.assessment_version,
    production_status: a.production_status,
    contributor_range: a.contributors_count,
    primary_active_workflow: selected(a, 'active_workflows')[0],
    completion_seconds: a.assessment_completion_seconds,
    ...(score
      ? {
          score: score.total,
          operational_fit_score: score.operationalFitScore,
          commercial_readiness_score: score.commercialReadinessScore,
          ...Object.fromEntries(
            stateSignals.map((key) => [key, score.signals[key].active]),
          ),
        }
      : {}),
  }
}
