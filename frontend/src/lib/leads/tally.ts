import {
  assessmentAnswersSchema,
  type LeadAttribution,
  type LeadIdentity,
  type LeadRequest,
} from './contracts'

type TallyField = {
  id?: string
  key?: string
  title?: string
  label?: string
  type?: string
  answer?: {value?: unknown; raw?: unknown}
  value?: unknown
  options?: Array<{id: string; text: string}>
}

type TallyPayload = {
  id?: string
  responseId?: string
  submissionId?: string
  respondentId?: string
  formId?: string
  formName?: string
  createdAt?: string
  fields?: TallyField[]
  data?: {
    responseId?: string
    submissionId?: string
    respondentId?: string
    formId?: string
    formName?: string
    createdAt?: string
    fields?: TallyField[]
  }
}

const identityFields: Record<string, keyof LeadIdentity> = {
  work_email: 'email',
  email: 'email',
  full_name: 'name',
  name: 'name',
  your_name: 'name',
  contact_name: 'name',
  company: 'company',
  role: 'role',
  company_website: 'website',
  website: 'website',
}

const answerFields: Record<string, string> = {
  team_type: 'teamType',
  production_team_size: 'teamSize',
  team_size: 'teamSize',
  workflow_collaborators: 'workflowCollaborators',
  number_of_people_involved_in_production: 'workflowCollaborators',
  tools_used: 'toolsUsed',
  number_of_ai_creative_tools_used: 'toolsUsed',
  approved_version_method: 'approvedVersionMethod',
  current_approved_version_method: 'approvedVersionMethod',
  production_context_method: 'productionContextMethod',
  where_generation_context_is_stored: 'productionContextMethod',
  recreation_frequency: 'recreationFrequency',
  frequency_of_rediscovery_recreation: 'recreationFrequency',
  most_recent_incident: 'incidentType',
  incident_type: 'incidentType',
  people_affected: 'peopleAffected',
  hours_lost: 'hoursLost',
  delivery_client_impact: 'deliveryImpact',
  recurring_workflow: 'recurringWorkflow',
  asset_volume: 'assetVolume',
  annual_affected_value: 'annualAffectedValue',
  active_workflow_to_test: 'activeWorkflow',
  active_workflow: 'activeWorkflow',
  pricing_or_pilot_viewed: 'pricingOrPilotViewed',
  security_diligence: 'securityDiligence',
  optional_message: 'message',
  message: 'message',
}

const freeTextAnswers = new Set(['message', 'activeWorkflow'])
const booleanAnswers = new Set(['pricingOrPilotViewed', 'securityDiligence'])

function normalizedFieldName(field: TallyField): string {
  const configured = process.env.TALLY_ASSESSMENT_FIELD_MAP
  if (configured) {
    const mapping = JSON.parse(configured) as Record<string, string>
    const id = field.id || field.key || ''
    if (mapping[id]) return mapping[id]
  }
  return (field.title || field.label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function resolvedValue(field: TallyField): unknown {
  const raw = field.answer?.value ?? field.value ?? field.answer?.raw
  if (!field.options?.length) return raw
  const byId = new Map(field.options.map((option) => [option.id, option.text]))
  if (Array.isArray(raw)) return raw.map((value) => byId.get(String(value)) || value)
  return byId.get(String(raw)) || raw
}

function optionValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value
    .trim()
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseTallyAssessment(payload: TallyPayload): {
  idempotencyKey: string
  identity: LeadIdentity
  answers: Record<string, unknown>
  attribution: LeadAttribution
  marketingConsent: boolean
  analyticsConsent: boolean
  tallyContext?: string
} {
  const data = payload.data || payload
  const fields = data.fields || []
  const identity: LeadIdentity = {website: ''}
  const answers: Record<string, unknown> = {}
  const hidden: Record<string, string> = {}

  for (const field of fields) {
    const name = normalizedFieldName(field)
    const value = resolvedValue(field)
    const identityKey = identityFields[name]
    if (identityKey && typeof value === 'string') {
      identity[identityKey] = value.trim()
      continue
    }
    const answerKey = answerFields[name]
    if (answerKey) {
      answers[answerKey] = booleanAnswers.has(answerKey)
        ? value === true || String(value).toLowerCase() === 'true'
        : freeTextAnswers.has(answerKey)
          ? value
          : optionValue(value)
      continue
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      hidden[name] = String(value)
    }
  }

  const submissionId = data.submissionId || data.responseId || payload.id
  const formId = data.formId || 'assessment'
  if (!submissionId) throw new Error('Tally submission id is missing.')
  return {
    idempotencyKey: `tally:${formId}:${submissionId}`,
    identity,
    answers,
    attribution: {
      sourcePage: hidden.source_page || '/workflow-assessment',
      ctaLabel: hidden.cta_label || 'Assess Your Workflow',
      intent: 'workflow_assessment',
      useCase: hidden.use_case || '',
      referrer: hidden.referrer || '',
      utmSource: hidden.utm_source || '',
      utmMedium: hidden.utm_medium || '',
      utmCampaign: hidden.utm_campaign || '',
      utmContent: hidden.utm_content || '',
      utmTerm: hidden.utm_term || '',
    },
    marketingConsent: hidden.marketing_consent === 'true',
    analyticsConsent: hidden.analytics_consent === 'true',
    tallyContext: hidden.portals_context,
  }
}

export function tallyLeadRequest(
  payload: TallyPayload,
  provider: 'tally_client' | 'tally_webhook',
): LeadRequest {
  const parsed = parseTallyAssessment(payload)
  return {
    submissionType: 'assessment',
    idempotencyKey: parsed.idempotencyKey,
    formVersion: 'assessment.v1',
    provider,
    identity: parsed.identity,
    attribution: parsed.attribution,
    consent: {
      disclosureVersion: '2026-08-01',
      marketing: parsed.marketingConsent,
      analytics: parsed.analyticsConsent,
    },
    companyFax: '',
    answers: assessmentAnswersSchema.parse(parsed.answers),
  }
}

export function tallyContextFromPayload(payload: TallyPayload): string | undefined {
  return parseTallyAssessment(payload).tallyContext
}
