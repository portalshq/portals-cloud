import {assessmentScore} from './scoring'
import {companyScoreContext, type StoredSubmission} from './store'

type AttioRecordResponse = {
  data?: {
    id?: {record_id?: string}
    web_url?: string
    values?: Record<string, unknown>
  }
}

type AttioRecordEntriesResponse = {
  data?: Array<{
    list_id: string
    list_api_slug: string
    entry_id: string
  }>
}

type ListKey =
  | 'inboundLeads'
  | 'guideDownloads'
  | 'productionAssessments'
  | 'pilotRequests'
  | 'qualifiedOpportunities'
  | 'paidPilots'
  | 'customers'
  | 'nurture'

const defaultLists: Record<ListKey, string> = {
  inboundLeads: 'inbound-leads',
  guideDownloads: 'guide-downloads',
  productionAssessments: 'production-assessments',
  pilotRequests: 'pilot-requests',
  qualifiedOpportunities: 'qualified-opportunities',
  paidPilots: 'paid-pilots',
  customers: 'customers',
  nurture: 'nurture',
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

function listConfig(): Record<ListKey, string> {
  const configured = process.env.ATTIO_LIST_MAP
  if (!configured) return defaultLists
  return {...defaultLists, ...(JSON.parse(configured) as Partial<Record<ListKey, string>>)}
}

async function attioRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const apiKey = process.env.ATTIO_API_KEY
  if (!apiKey) throw new Error('ATTIO_API_KEY is required.')
  const response = await fetch(`https://api.attio.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Attio ${method} ${path} failed (${response.status}): ${detail}`)
  }
  if (response.status === 204) return {} as T
  const responseText = await response.text()
  return (responseText ? JSON.parse(responseText) : {}) as T
}

function compactValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false
      return !Array.isArray(value) || value.length > 0
    }),
  )
}

function attioSelectTitle(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const title = attioSelectTitle(item)
      if (title) return title
    }
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of ['title', 'option', 'status', 'value']) {
    const title = attioSelectTitle(record[key])
    if (title) return title
  }
  return undefined
}

export function nextAutomatedLifecycle(
  existing: string | undefined,
  desired: string | undefined,
): string | undefined {
  if (!desired) return undefined
  if (!existing) return desired
  if (founderControlledLifecycle.has(existing)) return undefined
  const currentRank = automatedLifecycleRank[existing]
  const desiredRank = automatedLifecycleRank[desired]
  if (currentRank === undefined || desiredRank === undefined) return undefined
  return desiredRank > currentRank ? desired : undefined
}

async function promoteLifecycle(
  object: 'people' | 'companies',
  record: AttioRecordResponse,
  desired: string | undefined,
): Promise<void> {
  const recordId = record.data?.id?.record_id
  if (!recordId || !desired) return
  const existing = attioSelectTitle(record.data?.values?.lifecycle_stage)
  const next = nextAutomatedLifecycle(existing, desired)
  if (!next) return
  await attioRequest(`/v2/objects/${object}/records/${recordId}`, 'PUT', {
    data: {values: {lifecycle_stage: next}},
  })
}

function personLifecycleTarget(submission: StoredSubmission): string {
  if (submission.request.submissionType === 'pilot_request') return 'Pilot Requested'
  if (submission.tier === 'high') return 'Qualified'
  if (
    submission.request.submissionType === 'assessment' ||
    submission.request.submissionType === 'commercial_readiness'
  ) return 'Assessed'
  return 'Captured Lead'
}

function companyLifecycleTarget(
  submission: StoredSubmission,
): string | undefined {
  if (submission.request.submissionType === 'pilot_request') return 'Pilot Requested'
  return submission.tier === 'high' ? 'Qualified' : undefined
}

function customPersonValues(submission: StoredSubmission): Record<string, unknown> {
  const {request, scores, tier, response} = submission
  const answers = request.answers as Record<string, unknown>
  const qualificationScore = scores ? assessmentScore(scores) : undefined

  return compactValues({
    lead_intent: request.attribution.intent || request.submissionType,
    cta_label: request.attribution.ctaLabel,
    source_page: request.attribution.sourcePage,
    use_case_interest: request.attribution.useCase
      ? [request.attribution.useCase]
      : undefined,
    qualification_score: qualificationScore,
    qualification_tier: tier,
    production_role: submission.identity.role,
    company_type: answers.teamType,
    team_size: answers.teamSize,
    tools_used: answers.toolsUsed ? String(answers.toolsUsed) : undefined,
    approved_version_method: answers.approvedVersionMethod,
    production_context_method: answers.productionContextMethod,
    recreation_frequency: answers.recreationFrequency,
    active_workflow:
      answers.activeWorkflow || answers.pilotWorkflow
        ? String(answers.activeWorkflow || answers.pilotWorkflow)
        : undefined,
    timeline: answers.timeline || answers.targetStartPeriod,
    message: answers.message || answers.question,
    utm_source: request.attribution.utmSource,
    utm_campaign: request.attribution.utmCampaign,
    first_touch_page: submission.profile.firstTouch.sourcePage,
    last_touch_page: submission.profile.lastTouch.sourcePage,
    last_cta_clicked: request.attribution.ctaLabel,
    recommended_next_action: response.nextAction,
    marketing_consent: submission.profile.marketingConsent,
    analytics_consent: submission.profile.analyticsConsent,
  })
}

function submissionNote(submission: StoredSubmission): string {
  const answerLines = Object.entries(submission.request.answers)
    .filter(([, value]) => value !== '' && value !== undefined)
    .map(([key, value]) =>
      `- ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
    )
  return [
    `# ${submission.request.submissionType.replaceAll('_', ' ')}`,
    '',
    `- submission id: ${submission.id}`,
    `- source page: ${submission.request.attribution.sourcePage}`,
    `- cta: ${submission.request.attribution.ctaLabel || 'not recorded'}`,
    `- company domain: ${submission.profile.companyDomain}`,
    ...(submission.tier ? [`- qualification tier: ${submission.tier}`] : []),
    ...(submission.scores
      ? [
          `- fit: ${submission.scores.fit.normalized}% (${submission.scores.fit.coverage}% coverage)`,
          `- pain: ${submission.scores.pain.normalized}% (${submission.scores.pain.coverage}% coverage)`,
          `- intent: ${submission.scores.intent.normalized}% (${submission.scores.intent.coverage}% coverage)`,
        ]
      : []),
    '',
    '## answers',
    ...answerLines,
  ].join('\n')
}

async function addToList(
  list: string,
  parentObject: 'people' | 'companies',
  recordId: string,
  existingEntries: AttioRecordEntriesResponse['data'] = [],
): Promise<void> {
  if (existingEntries?.some((entry) => entry.list_api_slug === list)) return
  await attioRequest(`/v2/lists/${encodeURIComponent(list)}/entries`, 'POST', {
    data: {parent_object: parentObject, parent_record_id: recordId, entry_values: {}},
  })
}

export function desiredOperationalList(submission: StoredSubmission): ListKey | null {
  if (submission.request.submissionType === 'pilot_request') return 'pilotRequests'
  if (!['assessment', 'commercial_readiness', 'workflow_review'].includes(submission.request.submissionType)) {
    return null
  }
  return submission.tier === 'high' ? 'qualifiedOpportunities' : 'nurture'
}

export function finalOperationalList(
  existing: string[],
  desired: string,
  rank: Record<string, number>,
): string {
  return existing.reduce((current, candidate) => {
    return (rank[candidate] ?? -1) > (rank[current] ?? -1)
      ? candidate
      : current
  }, desired)
}

async function reconcileCompanyList(
  recordId: string,
  desired: ListKey | null,
): Promise<void> {
  if (!desired) return
  const lists = listConfig()
  const entries = await attioRequest<AttioRecordEntriesResponse>(
    `/v2/objects/companies/records/${recordId}/entries?limit=100`,
    'GET',
  )
  const operational = new Set([
    lists.nurture,
    lists.pilotRequests,
    lists.qualifiedOpportunities,
    lists.paidPilots,
    lists.customers,
  ])
  const rank: Record<string, number> = {
    [lists.nurture]: 0,
    [lists.qualifiedOpportunities]: 1,
    [lists.pilotRequests]: 2,
    [lists.paidPilots]: 3,
    [lists.customers]: 4,
  }
  const desiredSlug = lists[desired]
  const existingOperational = (entries.data || []).filter((entry) =>
    operational.has(entry.list_api_slug),
  )
  const finalSlug = finalOperationalList(
    existingOperational.map((entry) => entry.list_api_slug),
    desiredSlug,
    rank,
  )

  for (const entry of existingOperational) {
    if (entry.list_api_slug === finalSlug) continue
    await attioRequest(
      `/v2/lists/${entry.list_id}/entries/${entry.entry_id}`,
      'DELETE',
    )
  }
  await addToList(finalSlug, 'companies', recordId, existingOperational)
}

async function upsertPilotDeal(
  submission: StoredSubmission,
  personId: string,
  companyId: string,
): Promise<void> {
  if (submission.request.submissionType !== 'pilot_request') return
  const matchingAttribute =
    process.env.ATTIO_DEAL_SUBMISSION_ATTRIBUTE || 'portals_submission_id'
  await attioRequest<AttioRecordResponse>(
    `/v2/objects/deals/records?matching_attribute=${encodeURIComponent(matchingAttribute)}`,
    'PUT',
    {
      data: {
        values: {
          name: `paid pilot - ${submission.identity.company}`,
          [matchingAttribute]: submission.id,
          stage: process.env.ATTIO_PILOT_STAGE || 'Pilot Requested',
          value: Number(process.env.PILOT_PRICE_AMOUNT || 5000),
          associated_people: [
            {target_object: 'people', target_record_id: personId},
          ],
          associated_company: {
            target_object: 'companies',
            target_record_id: companyId,
          },
        },
      },
    },
  )
}

export async function syncSubmissionToAttio(
  submission: StoredSubmission,
): Promise<void> {
  const domain = submission.profile.companyDomain
  if (!domain) throw new Error('A normalized company domain is required for Attio sync.')
  const customAttributesEnabled =
    process.env.ATTIO_CUSTOM_ATTRIBUTES_ENABLED === 'true'
  const companyScores = await companyScoreContext(domain)
  const companyValues = compactValues({
    domains: [domain],
    ...(customAttributesEnabled
      ? {
          fit_score: companyScores.fit,
          pain_score: companyScores.pain,
          intent_score: companyScores.intent,
          qualification_tier:
            submission.tier === 'high' ? submission.tier : undefined,
          qualifying_submission_id:
            submission.tier === 'high' ? submission.id : undefined,
          recommended_next_action: submission.response.nextAction,
          first_touch_page: submission.profile.firstTouch.sourcePage,
          last_touch_page: submission.profile.lastTouch.sourcePage,
        }
      : {}),
  })
  const company = await attioRequest<AttioRecordResponse>(
    '/v2/objects/companies/records?matching_attribute=domains',
    'PUT',
    {data: {values: companyValues}},
  )
  const companyId = company.data?.id?.record_id
  if (!companyId) throw new Error('Attio did not return a company record id.')
  if (customAttributesEnabled) {
    await promoteLifecycle('companies', company, companyLifecycleTarget(submission))
  }

  const personValues = compactValues({
    email_addresses: [submission.identity.email],
    company: [{target_object: 'companies', target_record_id: companyId}],
    ...(customAttributesEnabled
      ? customPersonValues(submission)
      : {}),
  })
  const person = await attioRequest<AttioRecordResponse>(
    '/v2/objects/people/records?matching_attribute=email_addresses',
    'PUT',
    {data: {values: personValues}},
  )
  const personId = person.data?.id?.record_id
  if (!personId) throw new Error('Attio did not return a person record id.')
  if (customAttributesEnabled) {
    await promoteLifecycle('people', person, personLifecycleTarget(submission))
  }

  const personEntries = await attioRequest<AttioRecordEntriesResponse>(
    `/v2/objects/people/records/${personId}/entries?limit=100`,
    'GET',
  )
  const lists = listConfig()
  await addToList(lists.inboundLeads, 'people', personId, personEntries.data)
  if (
    ['guide_download', 'security_download', 'pilot_brief_download'].includes(
      submission.request.submissionType,
    )
  ) {
    await addToList(lists.guideDownloads, 'people', personId, personEntries.data)
  }
  if (submission.request.submissionType === 'assessment') {
    await addToList(
      lists.productionAssessments,
      'people',
      personId,
      personEntries.data,
    )
  }

  await reconcileCompanyList(companyId, desiredOperationalList(submission))
  await upsertPilotDeal(submission, personId, companyId)
  await attioRequest('/v2/notes', 'POST', {
    data: {
      parent_object: 'people',
      parent_record_id: personId,
      title: `${submission.request.submissionType.replaceAll('_', ' ')} - ${submission.id}`,
      format: 'markdown',
      content: submissionNote(submission),
    },
  })
}
