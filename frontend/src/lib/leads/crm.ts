import {assessmentScore} from './scoring'
import {companyScoreContext, getPilotBySubmissionId, leadPool, leadsDryRun, type StoredSubmission} from './store'
import {isPublicEmailDomain, normalizeEmail} from './identity'
import schemaSource from '../../../config/apollo-lead-operations.json'

type ListKey =
  | 'inboundLeads'
  | 'guideDownloads'
  | 'productionAssessments'
  | 'pilotRequests'
  | 'qualifiedOpportunities'
  | 'paidPilots'
  | 'customers'
  | 'nurture'

type ApolloRecord = {
  id?: string
  web_url?: string
  url?: string
  data?: ApolloRecord
  account?: ApolloRecord
  contact?: ApolloRecord
  opportunity?: ApolloRecord
  deal?: ApolloRecord
}
type RemoteType = 'contact' | 'account' | 'deal'
type SourceType = 'lead_profile' | 'customer_account' | 'pilot'

type FieldModality = 'contact' | 'account' | 'opportunity'
type FieldTarget = 'contact' | 'account' | 'deal'
type ApolloSchema = {
  fields: Record<FieldTarget, Record<string, string>>
  contactStages: Record<string, string>
  accountStages: Record<string, string>
  dealStages: Record<string, string>
}
type ApolloField = {id: string; label: string; modality: FieldModality}
type ApolloStage = {id: string; name?: string; label?: string}
type ApolloAccount = {id: string; name?: string; domain?: string; primary_domain?: string}
type ApolloContact = {id: string; email?: string; web_url?: string; url?: string}
type ApolloMethod = 'GET' | 'POST' | 'PATCH'

const defaultLists: Record<ListKey, string> = {
  inboundLeads: 'Inbound Leads',
  guideDownloads: 'Guide Downloads',
  productionAssessments: 'Production Assessments',
  pilotRequests: 'Pilot Requests',
  qualifiedOpportunities: 'Qualified Opportunities',
  paidPilots: 'Paid Pilots',
  customers: 'Customers',
  nurture: 'Nurture',
}

const configuredFields = schemaSource.customFields as Array<{
  key: string
  label: string
  modalities: FieldModality[]
}>
const configuredDealStages = schemaSource.dealStages as string[]
const configuredNativeStages = (schemaSource.nativeStages || {}) as {
  contact?: Record<'not_qualified' | 'qualified' | 'pilot_requested', string>
  account?: Record<'pilot_requested' | 'paid_pilot' | 'customer', string>
}

const automatedLifecycleRank: Record<string, number> = {
  'Captured Lead': 0,
  'Engaged Lead': 1,
  Assessed: 2,
  Qualified: 3,
  'Pilot Requested': 4,
}

const founderControlledLifecycle = new Set([
  'Pilot Scoped',
  'Paid Pilot',
  'Annual Proposal',
  'Customer',
  'Nurture',
  'Disqualified',
])

const dryRunRemoteRecords = new Map<string, {id: string; url?: string}>()
let cachedApolloSchema: {value: ApolloSchema; expiresAt: number} | undefined

export class ApolloRequestError extends Error {
  method: ApolloMethod
  path: string
  status: number
  bodyText: string
  bodyJson?: unknown

  constructor(input: {method: ApolloMethod; path: string; status: number; bodyText: string}) {
    super(`Apollo ${input.method} ${input.path} failed (${input.status}): ${input.bodyText}`)
    this.name = 'ApolloRequestError'
    this.method = input.method
    this.path = input.path
    this.status = input.status
    this.bodyText = input.bodyText
    try {
      this.bodyJson = input.bodyText ? JSON.parse(input.bodyText) : undefined
    } catch {
      this.bodyJson = undefined
    }
  }
}

function remoteKey(sourceType: SourceType, sourceId: string, remoteType: RemoteType) {
  return `${sourceType}:${sourceId}:${remoteType}`
}

function jsonEnvironment<T>(name: string, fallback: T): T {
  const raw = process.env[name]
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`${name} must be valid JSON.`)
  }
}

function listConfig(): Record<ListKey, string> {
  return {...defaultLists, ...jsonEnvironment<Partial<Record<ListKey, string>>>('APOLLO_LIST_MAP', {})}
}

async function apolloRequest<T>(path: string, method: ApolloMethod, body?: unknown): Promise<T> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) throw new Error('APOLLO_API_KEY is required.')
  const response = await fetch(`https://api.apollo.io${path}`, {
    method,
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) {
    throw new ApolloRequestError({method, path, status: response.status, bodyText: text})
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function optionalApolloRequest<T>(path: string, method: ApolloMethod, body?: unknown): Promise<T | undefined> {
  try {
    return await apolloRequest<T>(path, method, body)
  } catch (error) {
    console.warn(`Optional Apollo ${method} ${path} unavailable:`, error)
    return undefined
  }
}

function collection<T>(payload: Record<string, unknown>, keys: string[]): T[] {
  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return value as T[]
  }
  return []
}

/** Discovers workspace-specific IDs by the declarative Apollo schema, not environment variables. */
async function discoverApolloSchema(): Promise<ApolloSchema> {
  if (cachedApolloSchema && cachedApolloSchema.expiresAt > Date.now()) return cachedApolloSchema.value
  const [fieldPayload, dealStagePayload, contactStagePayload, accountStagePayload] = await Promise.all([
    apolloRequest<Record<string, unknown>>('/api/v1/fields', 'GET'),
    apolloRequest<Record<string, unknown>>('/api/v1/opportunity_stages', 'GET'),
    optionalApolloRequest<Record<string, unknown>>('/api/v1/contact_stages', 'GET'),
    optionalApolloRequest<Record<string, unknown>>('/api/v1/account_stages', 'GET'),
  ])
  const availableFields = collection<ApolloField>(fieldPayload, ['fields', 'custom_fields', 'data'])
  const fields: ApolloSchema['fields'] = {contact: {}, account: {}, deal: {}}
  const missingFields: string[] = []
  for (const field of configuredFields) {
    for (const modality of field.modalities) {
      const record = availableFields.find((item) => item.modality === modality && item.label === field.label)
      const target: FieldTarget = modality === 'opportunity' ? 'deal' : modality
      if (!record?.id) missingFields.push(`${modality}:${field.label}`)
      else fields[target][field.key] = record.id
    }
  }
  const availableDealStages = collection<ApolloStage>(dealStagePayload, ['opportunity_stages', 'stages', 'data'])
  const dealStages = Object.fromEntries(
    configuredDealStages.flatMap((name) => {
      const record = availableDealStages.find((stage) => (stage.name || stage.label) === name)
      return record?.id ? [[name, record.id]] : []
    }),
  )
  const missingStages = configuredDealStages.filter((name) => !dealStages[name])
  if (missingFields.length || missingStages.length) {
    throw new Error(
      `Apollo schema is incomplete.${missingFields.length ? ` Missing fields: ${missingFields.join(', ')}.` : ''}${missingStages.length ? ` Missing deal stages: ${missingStages.join(', ')}.` : ''} Run npm --workspace frontend run provision:apollo.`,
    )
  }
  const contactStages = stageIds(contactStagePayload, configuredNativeStages.contact || {})
  const accountStages = stageIds(accountStagePayload, configuredNativeStages.account || {})
  const value = {fields, contactStages, accountStages, dealStages}
  cachedApolloSchema = {value, expiresAt: Date.now() + 5 * 60_000}
  return value
}

function stageIds(payload: Record<string, unknown> | undefined, desired: Record<string, string>): Record<string, string> {
  if (!payload) return {}
  const available = collection<ApolloStage>(payload, ['contact_stages', 'account_stages', 'stages', 'data'])
  return Object.fromEntries(
    Object.entries(desired).flatMap(([key, name]) => {
      const record = available.find((stage) => (stage.name || stage.label) === name)
      return record?.id ? [[key, record.id]] : []
    }),
  )
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0),
    ),
  )
}

function splitName(name: string | undefined): {first_name?: string; last_name?: string} {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return compact({first_name: parts[0], last_name: parts.slice(1).join(' ')})
}

function fieldValues(schema: ApolloSchema, modality: FieldTarget, values: Record<string, unknown>) {
  const fields = schema.fields[modality] || {}
  return Object.fromEntries(
    Object.entries(compact(values)).flatMap(([slug, value]) => {
      const fieldId = fields[slug]
      if (!fieldId) return []
      const mapped = Array.isArray(value) ? value.join(', ') : value
      return [[apolloCustomFieldId(fieldId), mapped]]
    }),
  )
}

/** The Fields endpoint namespaces IDs; typed_custom_fields accepts the raw ID. */
export function apolloCustomFieldId(fieldId: string): string {
  return fieldId.replace(/^(?:contact|account|opportunity)\./, '')
}

/** Converts app-relative attribution into a durable production URL for Apollo. */
export function apolloSourceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  try {
    return new URL(value, origin).toString()
  } catch {
    return value
  }
}

async function remoteRecord(sourceType: SourceType, sourceId: string, remoteType: RemoteType): Promise<{id: string; url?: string} | null> {
  if (leadsDryRun()) return dryRunRemoteRecords.get(remoteKey(sourceType, sourceId, remoteType)) || null
  const result = await leadPool().query<{remote_id: string; remote_url: string | null}>(
    `SELECT remote_id, remote_url FROM crm_external_records
      WHERE source_type = $1 AND source_id = $2 AND remote_type = $3`,
    [sourceType, sourceId, remoteType],
  )
  const row = result.rows[0]
  return row ? {id: row.remote_id, url: row.remote_url || undefined} : null
}

async function forgetRemoteRecord(sourceType: SourceType, sourceId: string, remoteType: RemoteType, remoteId: string): Promise<void> {
  if (leadsDryRun()) {
    const key = remoteKey(sourceType, sourceId, remoteType)
    if (dryRunRemoteRecords.get(key)?.id === remoteId) dryRunRemoteRecords.delete(key)
    return
  }
  await leadPool().query(
    `DELETE FROM crm_external_records
      WHERE source_type = $1 AND source_id = $2 AND remote_type = $3 AND remote_id = $4`,
    [sourceType, sourceId, remoteType, remoteId],
  )
}

async function rememberRemoteRecord(sourceType: SourceType, sourceId: string, remoteType: RemoteType, record: ApolloRecord): Promise<string> {
  // Apollo wraps create/update responses by resource in some API versions:
  // {account:{id}}, {contact:{id}}, or {opportunity:{id}}.
  const nested = remoteType === 'account' ? record.account : remoteType === 'contact' ? record.contact : record.opportunity
  const id = record.id || record.data?.id || nested?.id || nested?.data?.id || record.deal?.id
  if (!id) throw new Error(`Apollo did not return a ${remoteType} id.`)
  const url = record.web_url || record.url || record.data?.web_url || record.data?.url || nested?.web_url || nested?.url
  if (leadsDryRun()) {
    dryRunRemoteRecords.set(remoteKey(sourceType, sourceId, remoteType), {id, url})
    return id
  }
  await leadPool().query(
    `INSERT INTO crm_external_records(source_type, source_id, remote_type, remote_id, remote_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(source_type, source_id, remote_type)
     DO UPDATE SET remote_id = EXCLUDED.remote_id, remote_url = EXCLUDED.remote_url, updated_at = now()`,
    [sourceType, sourceId, remoteType, id, url || null],
  )
  return id
}

function deletedContactIds(bodyJson: unknown): string[] {
  if (!bodyJson || typeof bodyJson !== 'object') return []
  const value = (bodyJson as {deleted_contact_ids?: unknown}).deleted_contact_ids
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function isDeletedApolloContactError(error: unknown, contactId: string): boolean {
  if (error instanceof ApolloRequestError) {
    const contactPatch = error.method === 'PATCH' && error.path.startsWith('/api/v1/contacts/')
    if (!contactPatch) return false
    if (error.status === 404 || error.status === 410) return true
    if (error.status !== 422) return false
    return (
      error.bodyText.includes('Cannot update contact as it is deleted') ||
      deletedContactIds(error.bodyJson).includes(contactId)
    )
  }
  if (!(error instanceof Error)) return false
  return (
    error.message.includes('Cannot update contact as it is deleted') ||
    error.message.includes(`"deleted_contact_ids":["${contactId}"]`)
  )
}

async function copyProfileAccountToCustomer(profileId: string, customerId: string): Promise<void> {
  const profileAccount = await remoteRecord('lead_profile', profileId, 'account')
  if (!profileAccount || await remoteRecord('customer_account', customerId, 'account')) return
  if (leadsDryRun()) {
    dryRunRemoteRecords.set(remoteKey('customer_account', customerId, 'account'), profileAccount)
    return
  }
  await leadPool().query(
    `INSERT INTO crm_external_records(source_type, source_id, remote_type, remote_id, remote_url)
     VALUES ('customer_account',$1,'account',$2,$3)
     ON CONFLICT(source_type, source_id, remote_type) DO NOTHING`,
    [customerId, profileAccount.id, profileAccount.url || null],
  )
}

async function recoverAccountMapping(name: string, domain?: string): Promise<{id: string} | null> {
  if (!domain) return null
  try {
    const payload = await apolloRequest<Record<string, unknown>>('/api/v1/accounts/search', 'POST', {
      q_organization_name: name,
      per_page: 100,
    })
    const candidates = collection<ApolloAccount>(payload, ['accounts', 'data'])
      .filter((candidate) => candidate.id)
      .filter((candidate) => candidate.domain === domain || candidate.primary_domain === domain)
    return candidates.length === 1 ? {id: candidates[0].id} : null
  } catch {
    // Mapping recovery is best-effort; the normal create/update error should
    // remain visible if Apollo search is unavailable.
    return null
  }
}

async function recoverContactMapping(email: string | undefined): Promise<{id: string; url?: string} | null> {
  if (!email) return null
  const normalized = normalizeEmail(email)
  try {
    const payload = await apolloRequest<Record<string, unknown>>('/api/v1/contacts/search', 'POST', {
      q_keywords: normalized,
      per_page: 10,
    })
    const candidates = collection<ApolloContact>(payload, ['contacts', 'data'])
      .filter((candidate) => candidate.id && candidate.email && normalizeEmail(candidate.email) === normalized)
    if (candidates.length > 1) {
      throw new Error(`Multiple Apollo contacts already use ${normalized}; reconcile manually before syncing.`)
    }
    const contact = candidates[0]
    return contact ? {id: contact.id, url: contact.web_url || contact.url} : null
  } catch (error) {
    if (error instanceof Error && error.message.includes('Multiple Apollo contacts')) throw error
    return null
  }
}

export function nextAutomatedLifecycle(existing: string | undefined, desired: string | undefined): string | undefined {
  if (!desired) return undefined
  if (!existing) return desired
  if (founderControlledLifecycle.has(existing)) return undefined
  const currentRank = automatedLifecycleRank[existing]
  const desiredRank = automatedLifecycleRank[desired]
  return currentRank !== undefined && desiredRank !== undefined && desiredRank > currentRank ? desired : undefined
}

export function qualificationState(submission: Pick<StoredSubmission, 'request' | 'tier'>): 'qualified' | 'not_qualified' {
  if (submission.request.submissionType === 'pilot_request') return 'qualified'
  return submission.tier === 'high' ? 'qualified' : 'not_qualified'
}

interface DealRoleContact {
  role: string
  name: string
  email: string
}

export function mapDealRoles(submission: StoredSubmission): DealRoleContact[] {
  const answers = submission.request.answers as Record<string, unknown>
  const identity = submission.identity
  const roles: DealRoleContact[] = []

  // Initial Contact
  if (identity.name && identity.email) {
    roles.push({
      role: 'Initial Contact',
      name: identity.name,
      email: identity.email,
    })
  }

  // Project Manager (Production Owner)
  if (answers.productionOwner && answers.productionOwnerEmail) {
    roles.push({
      role: 'Project Manager',
      name: String(answers.productionOwner),
      email: String(answers.productionOwnerEmail),
    })
  }

  // Buyer (Economic Buyer)
  if (answers.economicBuyer && answers.economicBuyerEmail) {
    roles.push({
      role: 'Buyer',
      name: String(answers.economicBuyer),
      email: String(answers.economicBuyerEmail),
    })
  }

  // Evaluator (Technical Evaluator)
  if (answers.technicalEvaluator && answers.technicalEvaluatorEmail) {
    roles.push({
      role: 'Evaluator',
      name: String(answers.technicalEvaluator),
      email: String(answers.technicalEvaluatorEmail),
    })
  }

  // Decision Maker (Approver)
  if (answers.approverName && answers.approverEmail) {
    roles.push({
      role: 'Decision Maker',
      name: String(answers.approverName),
      email: String(answers.approverEmail),
    })
  }

  // Contract Signer (Signer)
  if (answers.signerName && answers.signerEmail) {
    roles.push({
      role: 'Contract Signer',
      name: String(answers.signerName),
      email: String(answers.signerEmail),
    })
  }

  return roles
}

function contactStageId(schema: ApolloSchema, submission: StoredSubmission, existing: boolean): string | undefined {
  if (submission.request.submissionType === 'pilot_request') return schema.contactStages.pilot_requested || schema.contactStages.qualified
  if (qualificationState(submission) === 'qualified') return schema.contactStages.qualified
  return existing ? undefined : schema.contactStages.not_qualified
}

function accountStageId(schema: ApolloSchema, submission: StoredSubmission): string | undefined {
  if (submission.request.submissionType === 'pilot_request') return schema.accountStages.pilot_requested
  return undefined
}

function contactFields(submission: StoredSubmission): Record<string, unknown> {
  const answers = submission.request.answers as Record<string, unknown>
  const attribution = submission.request.attribution
  const scores = submission.scores
  return compact({
    lead_intent: attribution.intent || submission.request.submissionType,
    cta_label: attribution.ctaLabel,
    source_page: apolloSourceUrl(attribution.sourcePage),
    referrer: attribution.referrer,
    use_case_interest: attribution.useCase ? [attribution.useCase] : undefined,
    last_submission_id: submission.id,
    last_submission_type: submission.request.submissionType,
    qualification_state: qualificationState(submission),
    qualification_score: scores ? assessmentScore(scores) : undefined,
    qualification_tier: submission.tier,
    fit_score: scores?.fit.normalized,
    fit_coverage: scores?.fit.coverage,
    pain_score: scores?.pain.normalized,
    pain_coverage: scores?.pain.coverage,
    intent_score: scores?.intent.normalized,
    intent_coverage: scores?.intent.coverage,
    workflow_risk_score: scores?.workflowRiskScore,
    qualifying_submission_id: submission.tier === 'high' ? submission.id : undefined,
    production_role: submission.identity.role,
    company_type: answers.teamType,
    team_size: answers.teamSize,
    workflow_collaborators: answers.workflowCollaborators,
    tools_used: typeof answers.toolsUsed === 'string'
      ? answers.toolsUsed.trim() || undefined
      : undefined,
    approved_version_method: answers.approvedVersionMethod,
    production_context_method: answers.productionContextMethod,
    recreation_frequency: answers.recreationFrequency,
    incident_type: answers.incidentType,
    incident_description: answers.incidentDescription,
    people_affected: answers.peopleAffected,
    hours_lost: answers.hoursLost,
    delivery_impact: answers.deliveryImpact,
    recurring_workflow: answers.recurringWorkflow,
    asset_volume: answers.assetVolume,
    annual_affected_value: answers.annualAffectedValue,
    active_workflow: answers.activeWorkflow || answers.pilotWorkflow,
    timeline: answers.timeline || answers.targetStartPeriod,
    current_systems: answers.currentSystems,
    unresolved_question: answers.unresolvedQuestion,
    stakeholder_involved: answers.stakeholderInvolved,
    production_owner: answers.productionOwner,
    production_owner_email: answers.productionOwnerEmail,
    approval_path: answers.approvalPath,
    primary_objection: answers.primaryObjection,
    objection_detail: answers.objectionDetail,
    pilot_workflow: answers.pilotWorkflow,
    economic_buyer: answers.economicBuyer,
    technical_evaluator: answers.technicalEvaluator,
    required_integrations: answers.requiredIntegrations,
    success_criteria: answers.successCriteria || answers.successCriterionKeysJson,
    security_requirements: answers.securityRequirements,
    budget_readiness: answers.budgetReadiness,
    budget_owner: answers.budgetOwner,
    historical_project: answers.historicalProject,
    historical_project_name: answers.historicalProjectName,
    integration_method: answers.integrationMethod,
    integration_systems_json: answers.integrationSystemsJson,
    data_classification: answers.dataClassification,
    participants_range: answers.participantsRange,
    approver_name: answers.approverName,
    approver_role: answers.approverRole,
    approver_email: answers.approverEmail,
    economic_buyer_email: answers.economicBuyerEmail,
    technical_evaluator_email: answers.technicalEvaluatorEmail,
    procurement_po_required: answers.procurementPoRequired,
    procurement_review_time: answers.procurementReviewTime,
    annual_deployment_option: answers.annualDeploymentOption,
    annual_price_acknowledged: answers.annualPriceAcknowledged,
    signer_name: answers.signerName,
    signer_email: answers.signerEmail,
    exact_reproduction_required: answers.exactReproductionRequired,
    pilot_blocker: answers.pilotBlocker,
    message: answers.message || answers.question,
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    utm_content: attribution.utmContent,
    utm_term: attribution.utmTerm,
    operating_system: attribution.os,
    first_touch_page: apolloSourceUrl(submission.profile.firstTouch.sourcePage),
    last_touch_page: apolloSourceUrl(submission.profile.lastTouch.sourcePage),
    last_cta_clicked: attribution.ctaLabel,
    recommended_next_action: submission.response.nextAction,
    marketing_consent: submission.profile.marketingConsent && !submission.profile.marketingSuppressed,
    analytics_consent: submission.profile.analyticsConsent,
    what_brought_you_here: submission.request.whatBroughtYouHere,
    what_brought_you_here_other: submission.request.whatBroughtYouHereOther,
    how_did_you_hear_about_portals: submission.request.howDidYouHearAboutPortals,
  })
}

export function prospectAccount(submission: StoredSubmission): {name: string; domain: string} | null {
  const name = submission.identity.company?.trim()
  const domain = submission.profile.companyDomain
  if (!name || !domain || isPublicEmailDomain(domain)) return null
  return {name, domain}
}

async function accountValues(schema: ApolloSchema, submission: StoredSubmission): Promise<Record<string, unknown>> {
  const scores = await companyScoreContext(submission.profile.companyDomain)
  return {
    fit_score: scores.fit,
    pain_score: scores.pain,
    intent_score: scores.intent,
    qualification_state: qualificationState(submission),
    qualification_tier: submission.tier,
    qualifying_submission_id: submission.tier === 'high' ? submission.id : undefined,
    first_touch_page: apolloSourceUrl(submission.profile.firstTouch.sourcePage),
    last_touch_page: apolloSourceUrl(submission.profile.lastTouch.sourcePage),
    recommended_next_action: submission.response.nextAction,
    account_stage_id: accountStageId(schema, submission),
  }
}

export function desiredOperationalList(submission: StoredSubmission): ListKey | null {
  if (submission.request.submissionType === 'pilot_request') return 'pilotRequests'
  if (!['assessment', 'commercial_readiness', 'workflow_review'].includes(submission.request.submissionType)) return null
  return submission.tier === 'high' ? 'qualifiedOpportunities' : 'nurture'
}

export function finalOperationalList(existing: string[], desired: string, rank: Record<string, number>): string {
  return existing.reduce((current, candidate) => (rank[candidate] ?? -1) > (rank[current] ?? -1) ? candidate : current, desired)
}

async function addToLists(modality: 'contacts' | 'accounts', id: string, names: string[]): Promise<void> {
  if (names.length === 0) return
  await apolloRequest('/api/v1/labels/add_entity_ids_to_label_names', 'POST', {
    entity_ids: [id], label_names: names, modality,
  })
}

async function reconcileOperationalList(accountId: string, desired: ListKey | null): Promise<void> {
  if (!desired) return
  const lists = listConfig()
  const all = [lists.nurture, lists.qualifiedOpportunities, lists.pilotRequests, lists.paidPilots, lists.customers]
  await apolloRequest('/api/v1/labels/remove_entity_ids_from_label_names', 'POST', {
    entity_ids: [accountId], label_names: all.filter((item) => item !== lists[desired]), modality: 'accounts',
  })
  await addToLists('accounts', accountId, [lists[desired]])
}

async function upsertAccount(schema: ApolloSchema, input: {sourceType: SourceType; sourceId: string; name: string; domain?: string; values: Record<string, unknown>}): Promise<string> {
  const existing = await remoteRecord(input.sourceType, input.sourceId, 'account')
    || await recoverAccountMapping(input.name, input.domain)
  const body = compact({
    name: input.name,
    domain: input.domain,
    account_stage_id: input.values.account_stage_id,
    typed_custom_fields: fieldValues(schema, 'account', input.values),
  })
  const record = existing
    ? await apolloRequest<ApolloRecord>(`/api/v1/accounts/${encodeURIComponent(existing.id)}`, 'PATCH', body)
    : await apolloRequest<ApolloRecord>('/api/v1/accounts', 'POST', body)
  return rememberRemoteRecord(input.sourceType, input.sourceId, 'account', record)
}

async function upsertContact(schema: ApolloSchema, submission: StoredSubmission, accountId?: string): Promise<string> {
  const existing = await remoteRecord('lead_profile', submission.profile.id, 'contact')
    || await recoverContactMapping(submission.identity.email)
  const body = compact({
    ...splitName(submission.identity.name),
    email: submission.identity.email,
    organization_name: submission.identity.company,
    title: submission.identity.role,
    website_url: submission.identity.website,
    account_id: accountId,
    contact_stage_id: contactStageId(schema, submission, Boolean(existing)),
    typed_custom_fields: fieldValues(schema, 'contact', contactFields(submission)),
  })
  let record: ApolloRecord
  if (existing) {
    try {
      record = await apolloRequest<ApolloRecord>(`/api/v1/contacts/${encodeURIComponent(existing.id)}`, 'PATCH', body)
    } catch (error) {
      if (!isDeletedApolloContactError(error, existing.id)) throw error
      await forgetRemoteRecord('lead_profile', submission.profile.id, 'contact', existing.id)
      const recovered = await recoverContactMapping(submission.identity.email)
      record = recovered
        ? await apolloRequest<ApolloRecord>(`/api/v1/contacts/${encodeURIComponent(recovered.id)}`, 'PATCH', body)
        : await apolloRequest<ApolloRecord>('/api/v1/contacts', 'POST', body)
    }
  } else {
    record = await apolloRequest<ApolloRecord>('/api/v1/contacts', 'POST', body)
  }
  return rememberRemoteRecord('lead_profile', submission.profile.id, 'contact', record)
}

async function upsertPilotDeal(schema: ApolloSchema, submission: StoredSubmission, contactId: string, accountId: string): Promise<void> {
  const pilot = await getPilotBySubmissionId(submission.id)
  if (!pilot) return
  const existing = await remoteRecord('pilot', pilot.id, 'deal')
  const stageId = schema.dealStages['Pilot Requested']
  const dealRoles = mapDealRoles(submission)
  const body = compact({
    name: `paid pilot - ${submission.identity.company || submission.profile.companyDomain}`,
    account_id: accountId,
    contact_ids: [contactId],
    amount: String(pilot.proposal?.priceAmount || Number(process.env.PILOT_PRICE_AMOUNT || 5000)),
    opportunity_stage_id: stageId,
    typed_custom_fields: fieldValues(schema, 'deal', {
      portals_submission_id: submission.id,
      // Store deal roles as JSON in custom field until Apollo API endpoint for contact roles is identified
      deal_contact_roles: dealRoles.length > 0 ? JSON.stringify(dealRoles) : undefined,
    }),
  })
  const record = existing
    ? await apolloRequest<ApolloRecord>(`/api/v1/opportunities/${encodeURIComponent(existing.id)}`, 'PATCH', body)
    : await apolloRequest<ApolloRecord>('/api/v1/opportunities', 'POST', body)
  await rememberRemoteRecord('pilot', pilot.id, 'deal', record)
  
  // TODO: Once Apollo API endpoint for assigning contact roles to deals is identified,
  // implement the call to associate contacts with their specific roles using dealRoles array
}

/** Projects verified application data into Apollo. It never reads Apollo as source-of-truth. */
export async function syncSubmissionToApollo(submission: StoredSubmission): Promise<void> {
  if (leadsDryRun()) return
  const schema = await discoverApolloSchema()
  const pilot = await getPilotBySubmissionId(submission.id)
  let contactId = await upsertContact(schema, submission)
  const lists = listConfig()
  const contactLists = [lists.inboundLeads]
  if (['guide_download', 'security_download', 'pilot_brief_download'].includes(submission.request.submissionType)) contactLists.push(lists.guideDownloads)
  if (submission.request.submissionType === 'assessment') contactLists.push(lists.productionAssessments)
  await addToLists('contacts', contactId, contactLists)

  let accountId: string | undefined
  const prospect = prospectAccount(submission)
  if (prospect) {
    accountId = await upsertAccount(schema, {
      sourceType: 'lead_profile',
      sourceId: submission.profile.id,
      ...prospect,
      values: await accountValues(schema, submission),
    })
    contactId = await upsertContact(schema, submission, accountId)
    await reconcileOperationalList(accountId, desiredOperationalList(submission))
    
    // Create deal immediately for pilot requests using the prospect account
    if (submission.request.submissionType === 'pilot_request' && accountId) {
      await upsertPilotDeal(schema, submission, contactId, accountId)
    }
  }

  if (pilot?.customerAccountId) {
    if (!prospect) throw new Error('A non-free company domain and company name are required to sync a pilot account.')
    await copyProfileAccountToCustomer(submission.profile.id, pilot.customerAccountId)
    accountId = await upsertAccount(schema, {
      sourceType: 'customer_account',
      sourceId: pilot.customerAccountId,
      ...prospect,
      values: await accountValues(schema, submission),
    })
    contactId = await upsertContact(schema, submission, accountId)
    await reconcileOperationalList(accountId, desiredOperationalList(submission))
    // Deal was already created with prospect account, so we don't need to recreate it here
    // If needed, we could update the deal's account linkage in the future
  }
}

export async function advanceApolloPilotDeal(pilotId: string, stage: 'Paid Pilot' | 'Customer'): Promise<void> {
  const remote = await remoteRecord('pilot', pilotId, 'deal')
  if (!remote) throw new Error(`Apollo deal mapping is missing for pilot ${pilotId}.`)
  const stageId = (await discoverApolloSchema()).dealStages[stage]
  if (!stageId) throw new Error(`Apollo deal stage is missing: ${stage}. Run provision:apollo after creating it.`)
  await apolloRequest(`/api/v1/opportunities/${encodeURIComponent(remote.id)}`, 'PATCH', {opportunity_stage_id: stageId})
}

export async function stopApolloSequences(contactId: string, sequenceIds: string[]): Promise<void> {
  if (sequenceIds.length === 0) return
  await apolloRequest('/api/v1/emailer_campaigns/remove_or_stop_contact_ids', 'POST', {
    emailer_campaign_ids: sequenceIds,
    contact_ids: [contactId],
    mode: 'stop',
  })
}
