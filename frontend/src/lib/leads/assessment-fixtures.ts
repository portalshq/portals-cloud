import {
  ASSESSMENT_VERSION,
  type AssessmentValues,
} from './assessment-definition'

// Shared representative records for source tests and local funnel checks.
export const highAssessment: AssessmentValues = {
  assessment_version: ASSESSMENT_VERSION,
  production_status: 'live_now',
  contributors_count: '6_10',
  pilot_readiness_30d: 'yes_live_production',
  transferability_without_originator: 'substantial_handoff',
  time_to_transfer: 'one_day',
  context_storage_locations: [
    'generation_workflow_or_graph',
    'slack_teams_email',
    'creator_memory_or_undocumented',
  ],
  captured_production_state: [
    'prompt_or_template',
    'workflow_graph',
    'model_and_model_version',
  ],
  execution_state_complete: 'no_external_state_required',
  manual_handoff_requirements: [
    'current_asset_versions',
    'references_to_use',
    'client_feedback_or_approval_history',
  ],
  context_interrupt_owner: ['original_creator', 'ai_lead'],
  production_failures: [
    'unable_to_reproduce_approved_output',
    'wrong_reference',
  ],
  most_recent_incident:
    'A campaign extension used an old reference and required a day of reconstruction.',
  recreationFrequency: 'weekly',
  recurringWorkflow: 'daily',
  assetVolume: '500-plus',
  time_lost_per_incident: 'one_day',
  cost_bearer: 'production_or_studio_margin',
  affected_work_value: '1m_5m',
  active_workflows: ['campaign_variant_production', 'production_handoff'],
  most_urgent_active_workflow:
    'Weekly client campaign variants with approved character and product references.',
  production_type: 'commercial_branded',
  workflow_role: 'owns_delivery_or_margin',
  ai_tools: ['ComfyUI', 'Runway', 'Midjourney'],
  ip_controlled_content: 'no',
  productionOwner: 'Senior producer',
  adoption_authority: 'can_approve',
  primaryObjection: 'value',
}
export const completeAssessment: AssessmentValues = {
  ...highAssessment,
  transferability_without_originator: 'yes_reliably',
  time_to_transfer: 'under_30_minutes',
  context_storage_locations: ['generation_workflow_or_graph'],
  captured_production_state: [
    'prompt_or_template',
    'model_and_model_version',
    'source_or_input_assets',
    'exact_source_asset_versions',
    'reference_selection',
    'approval_state',
    'client_feedback_or_decisions',
    'canonical_approved_output',
    'dependencies_between_inputs_and_outputs',
    'human_instructions_required_to_use_workflow',
    'provenance_or_rights',
  ],
  execution_state_complete: 'yes',
  manual_handoff_requirements: ['nothing_significant'],
  context_interrupt_owner: ['nobody'],
  production_failures: ['none'],
  recreationFrequency: 'never',
  time_lost_per_incident: 'unknown',
}
export const vfxAssessment: AssessmentValues = {
  ...highAssessment,
  production_type: 'vfx_animation_virtual_production',
  context_storage_locations: [
    'generation_workflow_or_graph',
    'project_or_asset_management_system',
  ],
  transferability_without_originator: 'yes_reliably',
  time_to_transfer: 'under_30_minutes',
  production_failures: [
    'unable_to_reproduce_approved_output',
    'rd_workflow_rebuilt_for_production',
  ],
  time_lost_per_incident: '2_to_5_days',
}
export const throughputAssessment: AssessmentValues = {
  ...completeAssessment,
  production_failures: ['wrong_reference', 'wrong_approved_version'],
  recreationFrequency: 'daily',
  time_lost_per_incident: '2_to_5_days',
  execution_state_complete: 'no_external_state_required',
  active_workflows: [
    'campaign_variant_production',
    'localization_or_market_adaptation',
  ],
}
