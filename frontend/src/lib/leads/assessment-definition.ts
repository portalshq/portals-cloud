import {z} from 'zod'

export const ASSESSMENT_VERSION = 'assessment.v4'
export const assessmentStages = [
  'Your production',
  'Transferability',
  'Approved production state',
  'Manual handoff',
  'Production failures',
  'Production impact',
  'Active workflows',
  'Ownership and next steps',
] as const

export const assessmentTextMaximum = (id: string): number =>
  id === 'productionOwner' ? 300 : id === 'message' ? 3000 : 2000

export type AssessmentValues = Record<string, unknown>
export type Branch =
  | 'always'
  | 'scaling'
  | 'handoff'
  | 'controlled_ip'
  | 'incident'
  | 'economics'
  | 'agent'
export type AssessmentQuestion = {
  id: string
  stage: number
  label: string
  kind: 'select' | 'multi' | 'text'
  options?: readonly string[]
  labels?: Record<string, string>
  required?: boolean
  branch?: Branch
  exclusive?: string
  help?: string
}
const question = (q: AssessmentQuestion): AssessmentQuestion => q
export const assessmentQuestions: readonly AssessmentQuestion[] = [
  question({
    id: 'production_status',
    stage: 0,
    label:
      'Do you currently have an AI-heavy production that is live or starting soon?',
    kind: 'select',
    required: true,
    options: [
      'live_now',
      'within_30_days',
      'within_1_to_3_months',
      'experimenting_or_researching',
    ],
  }),
  question({
    id: 'contributors_count',
    stage: 0,
    label:
      'How many people need to create, reproduce, review, or extend work in this production?',
    kind: 'select',
    required: true,
    options: ['1', '2_5', '6_10', '11_25', '25_plus'],
  }),
  question({
    id: 'imminent_contributor_scaling',
    stage: 0,
    label: 'Will additional creators join this production within 30 days?',
    kind: 'select',
    branch: 'scaling',
    required: true,
    options: ['yes', 'no', 'unsure'],
  }),
  question({
    id: 'pilot_readiness_30d',
    stage: 0,
    label:
      'If we identify a meaningful bottleneck in one live production, could your team test a fix within the next 30 days without replacing your current tools?',
    kind: 'select',
    required: true,
    options: ['yes_live_production', 'possibly', 'no_researching'],
    labels: {
      yes_live_production: 'Yes — we have a live production suitable for this',
      possibly: 'Possibly — depending on the recommendation',
      no_researching: "No — we're researching for later",
    },
  }),
  question({
    id: 'transferability_without_originator',
    stage: 1,
    label:
      'Once a look, shot, character, asset, or workflow has been approved, could another qualified creator who was not involved originally reproduce or extend it without talking to the original creator?',
    kind: 'select',
    required: true,
    options: [
      'yes_reliably',
      'usually_minor_help',
      'substantial_handoff',
      'usually_not',
      'not_tested',
    ],
  }),
  question({
    id: 'time_to_transfer',
    stage: 1,
    label:
      'If the original creator became unavailable tomorrow, how long would it usually take another qualified creator to reproduce or meaningfully extend the approved work?',
    kind: 'select',
    required: true,
    options: [
      'under_30_minutes',
      '30m_to_2h',
      'half_day',
      'one_day',
      'two_to_five_days',
      'may_not_reproduce_reliably',
      'unknown',
    ],
  }),
  question({
    id: 'context_storage_locations',
    stage: 2,
    label: 'Where does the context needed to continue approved work live?',
    kind: 'multi',
    required: true,
    options: [
      'generation_workflow_or_graph',
      'project_or_asset_management_system',
      'shared_drive_or_cloud_storage',
      'prompt_docs_or_spreadsheets',
      'slack_teams_email',
      'creator_local_files',
      'creator_memory_or_undocumented',
      'internal_system',
      'other',
    ],
  }),
  question({
    id: 'captured_production_state',
    stage: 2,
    label:
      'Which parts of the approved production state are reliably captured today?',
    kind: 'multi',
    required: true,
    exclusive: 'none',
    help: 'Select the parts your production needs and reliably records. Leave out anything that does not apply.',
    options: [
      'prompt_or_template',
      'model_and_model_version',
      'lora_adapter_finetune_version',
      'seed_and_generation_parameters',
      'source_or_input_assets',
      'exact_source_asset_versions',
      'reference_selection',
      'control_or_preprocessing_inputs',
      'workflow_graph',
      'scripts_or_automation',
      'approval_state',
      'client_feedback_or_decisions',
      'canonical_approved_output',
      'dependencies_between_inputs_and_outputs',
      'negative_prompts_or_exclusions',
      'provenance_or_rights',
      'human_instructions_required_to_use_workflow',
      'other',
      'none',
    ],
  }),
  question({
    id: 'execution_state_complete',
    stage: 2,
    label:
      'Does the execution workflow contain all the production state needed to continue or reproduce approved work?',
    kind: 'select',
    required: true,
    options: ['yes', 'no_external_state_required', 'unsure'],
    labels: {
      no_external_state_required:
        'No — important state still has to be supplied from elsewhere',
    },
  }),
  question({
    id: 'manual_handoff_requirements',
    stage: 3,
    branch: 'handoff',
    label:
      'When another person continues the production, what still has to be communicated or copied manually?',
    kind: 'multi',
    required: true,
    exclusive: 'nothing_significant',
    options: [
      'references_to_use',
      'current_asset_versions',
      'prompt_or_workflow_instructions',
      'model_or_lora_selection',
      'generation_settings',
      'client_feedback_or_approval_history',
      'creative_intent_or_art_direction',
      'scripts_or_technical_setup',
      'known_failed_approaches',
      'nothing_significant',
      'other',
    ],
  }),
  question({
    id: 'context_interrupt_owner',
    stage: 3,
    branch: 'handoff',
    label: 'Who gets interrupted when another person needs production context?',
    kind: 'multi',
    required: true,
    exclusive: 'nobody',
    options: [
      'original_creator',
      'ai_lead',
      'producer',
      'creative_director',
      'pipeline_or_technical_artist',
      'client_or_account_team',
      'nobody',
      'other',
    ],
  }),
  question({
    id: 'production_failures',
    stage: 4,
    label: 'Which of these has happened in active production?',
    kind: 'multi',
    required: true,
    exclusive: 'none',
    options: [
      'wrong_reference',
      'outdated_source_asset',
      'wrong_approved_version',
      'character_product_style_drift',
      'unable_to_reproduce_approved_output',
      'unnecessary_generations_or_retries',
      'duplicate_work',
      'long_handoff_or_onboarding',
      'rd_workflow_rebuilt_for_production',
      'client_review_failure',
      'lost_or_unclear_provenance',
      'none',
      'other',
    ],
  }),
  question({
    id: 'most_recent_incident',
    stage: 4,
    branch: 'incident',
    label: 'What was the most recent example?',
    kind: 'text',
    required: true,
    help: 'What was being produced, what had to be rediscovered, transferred, or corrected, and what happened?',
  }),
  question({
    id: 'recreationFrequency',
    stage: 4,
    label: 'How often does rediscovery or recreation happen?',
    kind: 'select',
    required: true,
    options: ['never', 'quarterly', 'monthly', 'weekly', 'daily'],
  }),
  question({
    id: 'time_lost_per_incident',
    stage: 5,
    branch: 'economics',
    label:
      'When this problem occurs, approximately how much production time is lost?',
    kind: 'select',
    required: true,
    options: [
      'under_1_hour',
      '1_to_4_hours',
      'half_day',
      'one_day',
      '2_to_5_days',
      'more_than_week',
      'unknown',
    ],
  }),
  question({
    id: 'cost_bearer',
    stage: 5,
    branch: 'economics',
    label: 'Who primarily absorbs that cost?',
    kind: 'select',
    required: true,
    options: [
      'production_or_studio_margin',
      'client',
      'freelancers_or_vendors',
      'internal_creative_team',
      'schedule_or_delivery',
      'other',
    ],
  }),
  question({
    id: 'recurringWorkflow',
    stage: 5,
    label: 'How often does this workflow repeat?',
    kind: 'select',
    required: true,
    options: ['one-off', 'quarterly', 'monthly', 'weekly', 'daily'],
  }),
  question({
    id: 'assetVolume',
    stage: 5,
    label:
      'How many assets or variants does this production produce per month?',
    kind: 'select',
    branch: 'economics',
    options: ['under-25', '25-99', '100-499', '500-plus'],
  }),
  question({
    id: 'affected_work_value',
    stage: 5,
    branch: 'economics',
    label: 'Annual value of the affected work (optional)',
    kind: 'select',
    options: [
      'under_100k',
      '100k_500k',
      '500k_1m',
      '1m_5m',
      '5m_plus',
      'prefer_not_to_say',
    ],
  }),
  question({
    id: 'active_workflows',
    stage: 6,
    label: 'Which production patterns are active or starting soon?',
    kind: 'multi',
    required: true,
    options: [
      'make_twelve_more_like_this',
      'approved_version_retrieval',
      'character_or_identity_continuity',
      'campaign_variant_production',
      'production_handoff',
      'asset_reproduction',
      'rd_to_production_transfer',
      'multi_tool_ai_production',
      'agent_assisted_production',
      'localization_or_market_adaptation',
      'other',
    ],
  }),
  question({
    id: 'most_urgent_active_workflow',
    stage: 6,
    label:
      'Describe the one recurring deliverable or production workflow that is most urgent to make faster, cheaper, or easier to reproduce.',
    kind: 'text',
    required: true,
  }),
  question({
    id: 'agent_context_resolution',
    stage: 6,
    branch: 'agent',
    label:
      'How does the agent determine which project references, asset versions, production rules, and prior decisions are valid for its task?',
    kind: 'select',
    required: true,
    options: [
      'deterministic_approved_context',
      'manually_supplied',
      'searches_unverified_sources',
      'operator_memory',
      'unknown',
    ],
  }),
  question({
    id: 'agent_context_detail',
    stage: 6,
    branch: 'agent',
    label: 'Anything else about the agent context? (optional)',
    kind: 'text',
  }),
  question({
    id: 'production_type',
    stage: 7,
    label: 'What kind of production is this?',
    kind: 'select',
    required: true,
    options: [
      'commercial_branded',
      'film_episodic',
      'vfx_animation_virtual_production',
      'interactive_games',
      'social_short_form',
      'internal_creative',
      'other',
    ],
  }),
  question({
    id: 'teamSize',
    stage: 7,
    label: 'Overall production-team size (optional)',
    kind: 'select',
    options: ['1', '2-4', '5-9', '10-24', '25-plus'],
  }),
  question({
    id: 'workflow_role',
    stage: 7,
    label: 'What is your relationship to this workflow?',
    kind: 'select',
    required: true,
    options: [
      'owns_delivery_or_margin',
      'production_management',
      'ai_or_technical_workflow_owner',
      'creative_approver',
      'pipeline_or_engineering',
      'contributor',
      'executive_sponsor',
      'other',
    ],
  }),
  question({
    id: 'ai_tools',
    stage: 7,
    label: 'Which AI and creative tools does this production use?',
    kind: 'multi',
    required: true,
    options: [
      'ComfyUI',
      'Runway',
      'Midjourney',
      'Adobe Firefly',
      'Stable Diffusion',
      'ChatGPT / OpenAI',
      'Google Gemini / Veo',
      'Kling',
      'Luma',
      'Higgsfield',
      'fal',
      'Replicate',
      'Nuke',
      'Houdini',
      'Blender',
      'Unreal Engine',
      'other',
    ],
  }),
  question({
    id: 'ip_controlled_content',
    stage: 7,
    label:
      'Does this production use client-owned, licensed, likeness-sensitive, or otherwise controlled IP?',
    kind: 'select',
    required: true,
    options: ['yes', 'no', 'unsure'],
  }),
  question({
    id: 'incorrect_source_exposure',
    stage: 7,
    branch: 'controlled_ip',
    label:
      'Would incorrect or unapproved source usage create client, rights, contractual, or legal exposure?',
    kind: 'select',
    required: true,
    options: ['yes', 'no', 'unsure'],
  }),
  question({
    id: 'source_traceability_required',
    stage: 7,
    branch: 'controlled_ip',
    label:
      'Does the production require traceability from final output back to approved sources?',
    kind: 'select',
    required: true,
    options: ['yes', 'no', 'unsure'],
  }),
  question({
    id: 'productionOwner',
    stage: 7,
    label: 'Who is closest to this workflow? (name or role)',
    kind: 'text',
    branch: 'economics',
    required: true,
  }),
  question({
    id: 'adoption_authority',
    stage: 7,
    label: 'How would your team approve a worthwhile small test?',
    kind: 'select',
    branch: 'economics',
    required: true,
    options: [
      'can_approve',
      'can_recommend',
      'need_another_sponsor',
      'not_involved_in_purchase',
    ],
  }),
  question({
    id: 'approval_path_detail',
    stage: 7,
    label: 'Any additional approval requirements? (optional)',
    kind: 'text',
    branch: 'economics',
  }),
  question({
    id: 'primaryObjection',
    stage: 7,
    label: 'What would make this assessment useful?',
    kind: 'select',
    required: true,
    options: [
      'value',
      'workflow-fit',
      'pilot-scope',
      'security',
      'integration',
      'procurement',
      'timing-budget',
      'stakeholder-alignment',
      'other',
    ],
  }),
  question({
    id: 'message',
    stage: 7,
    label: 'Anything else we should know? (optional)',
    kind: 'text',
  }),
]

export function selected(a: AssessmentValues, key: string): string[] {
  return Array.isArray(a[key])
    ? [
        ...new Set(
          (a[key] as unknown[]).filter(
            (v): v is string => typeof v === 'string',
          ),
        ),
      ]
    : []
}
export function excellentTransfer(a: AssessmentValues): boolean {
  return (
    a.transferability_without_originator === 'yes_reliably' &&
    a.time_to_transfer === 'under_30_minutes'
  )
}
export const assessmentBranchRules: Record<
  Branch,
  (a: AssessmentValues) => boolean
> = {
  always: () => true,
  scaling: (a) => a.contributors_count === '1',
  handoff: (a) => !excellentTransfer(a),
  controlled_ip: (a) => a.ip_controlled_content === 'yes',
  incident: (a) => selected(a, 'production_failures').some((v) => v !== 'none'),
  economics: (a) => a.production_status !== 'experimenting_or_researching',
  agent: (a) =>
    selected(a, 'active_workflows').includes('agent_assisted_production'),
}
export function questionVisible(
  q: AssessmentQuestion,
  a: AssessmentValues,
): boolean {
  return assessmentBranchRules[q.branch || 'always'](a)
}
export function visibleAssessmentStages(a: AssessmentValues): number[] {
  return assessmentStages
    .map((_, index) => index)
    .filter((stage) =>
      assessmentQuestions.some(
        (q) => q.stage === stage && questionVisible(q, a),
      ),
    )
}
export function answerLabel(q: AssessmentQuestion, value: string): string {
  const labels: Record<string, string> = {
    '2_5': '2–5',
    '6_10': '6–10',
    '11_25': '11–25',
    '25_plus': '25+',
    '30m_to_2h': '30 minutes to 2 hours',
    may_not_reproduce_reliably: 'May not be possible to reproduce reliably',
    lora_adapter_finetune_version: 'LoRA, adapter, or fine-tune version',
    rd_to_production_transfer: 'R&D to production transfer',
    rd_workflow_rebuilt_for_production: 'R&D workflow rebuilt for production',
    'ChatGPT / OpenAI': 'ChatGPT / OpenAI',
  }
  return (
    q.labels?.[value] ||
    labels[value] ||
    value.replaceAll('_', ' ').replaceAll('-', ' ')
  )
}
export const diagnosticFields = Object.fromEntries(
  assessmentQuestions.map((q) => [
    q.id,
    q.kind === 'multi'
      ? z
          .array(z.enum(q.options as [string, ...string[]]))
          .max(q.options!.length)
          .refine(
            (values) => new Set(values).size === values.length,
            'Choose each answer once.',
          )
          .optional()
      : q.kind === 'select'
      ? z
          .enum(q.options as [string, ...string[]])
          .or(z.literal(''))
          .optional()
      : z.string().trim().max(assessmentTextMaximum(q.id)).optional(),
  ]),
)
export const diagnosticAnswersSchema = z.object(diagnosticFields)
export function assessmentValidationErrors(
  a: AssessmentValues,
  stage?: number,
): Array<{field: string; message: string}> {
  return assessmentQuestions
    .filter(
      (q) =>
        (stage === undefined || q.stage === stage) && questionVisible(q, a),
    )
    .flatMap((q) => {
      const value = a[q.id]
      if (
        q.required &&
        (q.kind === 'multi'
          ? !selected(a, q.id).length
          : typeof value !== 'string' || !value.trim())
      ) {
        return [{field: q.id, message: `Please answer: ${q.label}`}]
      }
      if (
        q.exclusive &&
        selected(a, q.id).includes(q.exclusive) &&
        selected(a, q.id).length > 1
      ) {
        return [
          {field: q.id, message: 'Choose the no-problem answer on its own.'},
        ]
      }
      return []
    })
}
export function activeAssessmentAnswers(a: AssessmentValues): AssessmentValues {
  return Object.fromEntries(
    assessmentQuestions
      .filter((q) => questionVisible(q, a) && a[q.id] !== undefined)
      .map((q) => [q.id, a[q.id]]),
  )
}
export function assessmentAnswersFromDraft(
  draft: Record<string, string>,
): AssessmentValues {
  return Object.fromEntries(
    assessmentQuestions.flatMap<[string, unknown]>((q) =>
      q.kind === 'multi'
        ? q.options!.some((v) => draft[`${q.id}:${v}`] === 'on')
          ? [[q.id, q.options!.filter((v) => draft[`${q.id}:${v}`] === 'on')]]
          : []
        : draft[q.id]
        ? [[q.id, draft[q.id]]]
        : [],
    ),
  )
}
