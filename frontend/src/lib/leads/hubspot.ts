import {assessmentQuestions} from './assessment-definition'
import {stateSignals} from './assessment-diagnostic'
import {assessmentScore} from './scoring'
import {companyScoreContext, getPilotById, getPilotBySubmissionId, leadPool, leadsDryRun, type StoredSubmission} from './store'
import {isPublicEmailDomain, normalizeEmail} from './identity'
import schemaSource from '../../../config/hubspot-lead-operations.json'

type ListKey =
  | 'inboundLeads'
  | 'guideDownloads'
  | 'productionAssessments'
  | 'pilotRequests'
  | 'qualifiedOpportunities'
  | 'paidPilots'
  | 'customers'
  | 'nurture'

type HubSpotRecord = {
  id?: string
  properties?: Record<string, unknown>
  associations?: Record<string, Array<{id: string}>>
}

type RemoteType = 'contact' | 'company' | 'deal' | 'ticket'
type SourceType = 'lead_profile' | 'customer_account' | 'pilot'

type FieldModality = 'contact' | 'company' | 'deal' | 'ticket'
type FieldTarget = 'contact' | 'company' | 'deal' | 'ticket'

type HubSpotSchema = {
  fields: Record<FieldTarget, Record<string, string>>
  pipelines: Record<string, Record<string, string>>
}

type HubSpotField = {name: string; label: string; type: string; fieldType?: string}
type HubSpotPipeline = {pipelineId: string; stages: Array<{label: string}>}

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

const configuredFields = schemaSource.customFields as Record<
  FieldTarget,
  Array<{name: string; label: string; fieldType: string; options?: string[]}>
>
const configuredPipelines = schemaSource.pipelines as {
  contacts: {lifecycle: {stages: string[]; defaultStage: string}}
  companies: {lifecycle: {stages: string[]; defaultStage: string}}
  deals: {sales_pipeline: {stages: string[]; defaultStage: string}}
  tickets: {support_pipeline: {stages: string[]; defaultStage: string}}
}

const automatedLifecycleRank: Record<string, number> = {
  Cold: 0,
  Interested: 1,
  Replied: 2,
  'Pilot Requested': 3,
}

const founderControlledLifecycle = new Set([
  'Pilot Scoped',
  'Paid Pilot',
  'Annual Proposal',
  'Customer',
  'Nurture',
  'Disqualified',
])

const dryRunRemoteRecords = new Map<string, {id: string}>()
let cachedHubSpotSchema: {value: HubSpotSchema; expiresAt: number} | undefined

export class HubSpotRequestError extends Error {
  method: string
  path: string
  status: number
  bodyText: string
  bodyJson?: unknown

  constructor(input: {method: string; path: string; status: number; bodyText: string}) {
    super(`HubSpot ${input.method} ${input.path} failed (${input.status}): ${input.bodyText}`)
    this.name = 'HubSpotRequestError'
    this.method = input.method
    this.path = input.path
    this.status = input.status
    this.bodyText = input.bodyText
    try {
      this.bodyJson = this.bodyText ? JSON.parse(this.bodyText) : undefined
    } catch {
      this.bodyJson = undefined
    }
  }
}

function remoteKey(sourceType: SourceType, sourceId: string, remoteType: RemoteType): string {
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
  return {...defaultLists, ...jsonEnvironment<Partial<Record<ListKey, string>>>('HUBSPOT_LIST_MAP', {})}
}

async function hubspotRequest<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const apiKey = process.env.HUBSPOT_API_KEY
  if (!apiKey) throw new Error('HUBSPOT_API_KEY is required.')
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new HubSpotRequestError({method, path, status: response.status, bodyText: text})
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function optionalHubSpotRequest<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T | undefined> {
  try {
    return await hubspotRequest<T>(path, method, body)
  } catch (error) {
    console.warn(`Optional HubSpot ${method} ${path} unavailable:`, error)
    return undefined
  }
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0),
    ),
  )
}

function splitName(name: string | undefined): {firstname?: string; lastname?: string} {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return compact({firstname: parts[0], lastname: parts.slice(1).join(' ')})
}

function fieldValues(schema: HubSpotSchema, target: FieldTarget, values: Record<string, unknown>) {
  const fields = schema.fields[target] || {}
  return Object.fromEntries(
    Object.entries(compact(values)).flatMap(([slug, value]) => {
      const fieldName = fields[slug]
      if (!fieldName) return []
      const mapped = Array.isArray(value) ? value.join('; ') : value
      return [[fieldName, mapped]]
    }),
  )
}

async function remoteRecord(sourceType: SourceType, sourceId: string, remoteType: RemoteType): Promise<{id: string} | null> {
  if (leadsDryRun()) return dryRunRemoteRecords.get(remoteKey(sourceType, sourceId, remoteType)) || null
  const result = await leadPool().query<{remote_id: string; remote_url: string | null}>(
    `SELECT remote_id, remote_url FROM crm_external_records
      WHERE source_type = $1 AND source_id = $2 AND remote_type = $3`,
    [sourceType, sourceId, remoteType],
  )
  const row = result.rows[0]
  return row ? {id: row.remote_id} : null
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

async function rememberRemoteRecord(sourceType: SourceType, sourceId: string, remoteType: RemoteType, record: HubSpotRecord): Promise<string> {
  const id = record.id
  if (!id) throw new Error(`HubSpot did not return a ${remoteType} id.`)
  if (leadsDryRun()) {
    dryRunRemoteRecords.set(remoteKey(sourceType, sourceId, remoteType), {id})
    return id
  }
  await leadPool().query(
    `INSERT INTO crm_external_records(source_type, source_id, remote_type, remote_id, remote_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(source_type, source_id, remote_type)
     DO UPDATE SET remote_id = EXCLUDED.remote_id, remote_url = EXCLUDED.remote_url, updated_at = now()`,
    [sourceType, sourceId, remoteType, id, null],
  )
  return id
}

async function recoverCompanyMapping(name: string, domain?: string): Promise<{id: string} | null> {
  if (!domain) return null
  try {
    const payload = await hubspotRequest<{results: Array<{id: string; domain?: string}>}>('/crm/v3/objects/companies/search', 'POST', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'domain',
              operator: 'EQ',
              value: domain,
            },
          ],
        },
      ],
      limit: 10,
    })
    const candidates = payload.results.filter((candidate) => candidate.id && candidate.domain === domain)
    return candidates.length === 1 ? {id: candidates[0].id} : null
  } catch {
    return null
  }
}

async function recoverContactMapping(email: string | undefined): Promise<{id: string} | null> {
  if (!email) return null
  const normalized = normalizeEmail(email)
  try {
    const payload = await hubspotRequest<{results: Array<{id: string; email?: string}>}>('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: normalized,
            },
          ],
        },
      ],
      limit: 10,
    })
    const candidates = payload.results.filter((candidate) => candidate.id && candidate.email && normalizeEmail(candidate.email) === normalized)
    if (candidates.length > 1) {
      throw new Error(`Multiple HubSpot contacts already use ${normalized}; reconcile manually before syncing.`)
    }
    const contact = candidates[0]
    return contact ? {id: contact.id} : null
  } catch (error) {
    if (error instanceof Error && error.message.includes('Multiple HubSpot contacts')) throw error
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

  if (identity.name && identity.email) {
    roles.push({
      role: 'Initial Contact',
      name: identity.name,
      email: identity.email,
    })
  }

  if (answers.productionOwner && answers.productionOwnerEmail) {
    roles.push({
      role: 'Project Manager',
      name: String(answers.productionOwner),
      email: String(answers.productionOwnerEmail),
    })
  }

  if (answers.economicBuyer && answers.economicBuyerEmail) {
    roles.push({
      role: 'Buyer',
      name: String(answers.economicBuyer),
      email: String(answers.economicBuyerEmail),
    })
  }

  if (answers.technicalEvaluator && answers.technicalEvaluatorEmail) {
    roles.push({
      role: 'Evaluator',
      name: String(answers.technicalEvaluator),
      email: String(answers.technicalEvaluatorEmail),
    })
  }

  if (answers.approverName && answers.approverEmail) {
    roles.push({
      role: 'Decision Maker',
      name: String(answers.approverName),
      email: String(answers.approverEmail),
    })
  }

  if (answers.signerName && answers.signerEmail) {
    roles.push({
      role: 'Contract Signer',
      name: String(answers.signerName),
      email: String(answers.signerEmail),
    })
  }

  return roles
}

function contactStageId(schema: HubSpotSchema, submission: StoredSubmission, existing: boolean): string | undefined {
  if (submission.request.submissionType === 'pilot_request') return schema.pipelines.contacts.lifecycle.stages[2] // "Interested"
  if (qualificationState(submission) === 'qualified') return schema.pipelines.contacts.lifecycle.stages[1] // "Interested"
  return existing ? undefined : schema.pipelines.contacts.lifecycle.stages[0] // "Cold"
}

function companyStageId(schema: HubSpotSchema, submission: StoredSubmission): string | undefined {
  if (submission.request.submissionType === 'pilot_request') return schema.pipelines.companies.lifecycle.stages[0] // "Pilot Requested"
  return undefined
}

export function contactFields(submission: StoredSubmission): Record<string, unknown> {
  const answers = submission.request.answers as Record<string, unknown>
  const attribution = submission.request.attribution
  const scores = submission.scores
  return compact({
    ...Object.fromEntries(assessmentQuestions.filter((q) => q.id.includes('_')).map((q) => [q.id, answers[q.id]])),
    assessment_version: answers.assessment_version,
    operational_fit_score: scores?.diagnostic?.operationalFitScore,
    commercial_readiness_score: scores?.diagnostic?.commercialReadinessScore,
    ...Object.fromEntries(stateSignals.flatMap((key) => [[key.toLowerCase(), scores?.diagnostic?.signals[key].active], [`${key.toLowerCase()}_evidence`, scores?.diagnostic?.signals[key].evidence.join(', ')]])),
    production_state_bottleneck: answers.productionStateBottleneck,
    production_baseline: answers.productionBaseline,
    lead_intent: attribution.intent || submission.request.submissionType,
    cta_label: attribution.ctaLabel,
    source_page: attribution.sourcePage,
    referrer: attribution.referrer,
    use_case_interest: attribution.useCase ? [attribution.useCase] : undefined,
    last_submission_id: submission.id,
    last_submission_type: submission.request.submissionType,
    what_brought_you_here: answers.whatBroughtYouHere,
    what_brought_you_here_other: answers.whatBroughtYouHereOther,
    how_did_you_hear_about_portals: answers.howDidYouHearAboutPortals,
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    utm_content: attribution.utmContent,
    utm_term: attribution.utmTerm,
    marketing_consent: submission.request.consent.marketing,
    analytics_consent: submission.request.consent.analytics,
  })
}

export function companyFields(submission: StoredSubmission): Record<string, unknown> {
  const scores = submission.scores
  return compact({
    fit_score: scores?.fit?.normalized,
    fit_coverage: scores?.fit?.coverage,
    pain_score: scores?.pain?.normalized,
    pain_coverage: scores?.pain?.coverage,
    intent_score: scores?.intent?.normalized,
    intent_coverage: scores?.intent?.coverage,
    qualification_state: qualificationState(submission),
    qualification_tier: submission.tier,
  })
}

export function dealFields(submission: StoredSubmission): Record<string, unknown> {
  const answers = submission.request.answers as Record<string, unknown>
  return compact({
    portals_submission_id: submission.id,
    deal_contact_roles: JSON.stringify(mapDealRoles(submission)),
    asset_type_requested: answers.assetTypeRequested,
    number_of_assets_required: answers.numberOfAssetsRequired,
    asset_reuse_percentage_target: answers.assetReusePercentageTarget,
    deadline_for_delivery: answers.deadlineForDelivery,
  })
}

export async function syncContact(submission: StoredSubmission): Promise<string> {
  const existing = await remoteRecord('lead_profile', submission.profileId, 'contact')
  const nameParts = splitName(submission.identity.name)
  const properties = compact({
    email: submission.identity.email,
    firstname: nameParts.firstname,
    lastname: nameParts.lastname,
    ...contactFields(submission),
  })

  let record: HubSpotRecord
  if (existing) {
    record = await hubspotRequest<HubSpotRecord>(`/crm/v3/objects/contacts/${existing.id}`, 'PATCH', {properties})
  } else {
    record = await hubspotRequest<HubSpotRecord>('/crm/v3/objects/contacts', 'POST', {properties})
  }

  return await rememberRemoteRecord('lead_profile', submission.profileId, 'contact', record)
}

export async function syncCompany(submission: StoredSubmission, contactId: string): Promise<string | null> {
  const domain = submission.identity.website?.replace(/^https?:\/\//, '').replace(/^www\./, '')
  if (!domain || isPublicEmailDomain(domain)) return null

  const existing = await remoteRecord('lead_profile', submission.profileId, 'company')
  const properties = compact({
    name: submission.identity.company,
    domain,
    ...companyFields(submission),
  })

  let record: HubSpotRecord
  if (existing) {
    record = await hubspotRequest<HubSpotRecord>(`/crm/v3/objects/companies/${existing.id}`, 'PATCH', {properties})
  } else {
    record = await hubspotRequest<HubSpotRecord>('/crm/v3/objects/companies', 'POST', {properties})
  }

  const companyId = await rememberRemoteRecord('lead_profile', submission.profileId, 'company', record)

  // Associate contact with company
  await hubspotRequest(`/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/company_to_contact`, 'PUT', {})

  return companyId
}

export async function syncDeal(submission: StoredSubmission, contactId: string, companyId: string | null): Promise<string> {
  const existing = await remoteRecord('lead_profile', submission.profileId, 'deal')
  const properties = compact({
    dealname: `${submission.identity.company} - Pilot Request`,
    ...dealFields(submission),
  })

  let record: HubSpotRecord
  if (existing) {
    record = await hubspotRequest<HubSpotRecord>(`/crm/v3/objects/deals/${existing.id}`, 'PATCH', {properties})
  } else {
    record = await hubspotRequest<HubSpotRecord>('/crm/v3/objects/deals', 'POST', {properties})
  }

  const dealId = await rememberRemoteRecord('lead_profile', submission.profileId, 'deal', record)

  // Associate deal with contact
  await hubspotRequest(`/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, 'PUT', {})

  // Associate deal with company if available
  if (companyId) {
    await hubspotRequest(`/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, 'PUT', {})
  }

  return dealId
}

export async function syncToHubSpot(submission: StoredSubmission): Promise<void> {
  const contactId = await syncContact(submission)
  const companyId = await syncCompany(submission, contactId)
  if (submission.request.submissionType === 'pilot_request') {
    await syncDeal(submission, contactId, companyId)
  }
}
