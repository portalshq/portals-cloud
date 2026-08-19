import type {PackageSpecification} from '../../types/resource'
import type {
  IntegrationRow,
  PilotAnswers,
  SuccessCriterion,
  SecurityDecision,
} from './contracts'
import {
  pilotControlledOptionLists as optionLists,
} from './contracts'
import {packagePriceLabel, packageTermDays} from '../package-specifications'

export type PilotRoute = 'zero-call' | 'one-call' | 'disqualified'

export type PilotState =
  | 'reviewing'
  | 'revision'
  | 'team_review'
  | 'exception_review'
  | 'scope_confirmed'
  | 'ready_sign'
  | 'signed'
  | 'paid'
  | 'kickoff'
  | 'active'
  | 'not_eligible'

export type PilotAction =
  | 'revise'
  | 'start_team_review'
  | 'confirm_scope'
  | 'request_exception'
  | 'resolve_exceptions'
  | 'qualify'
  | 'disqualify'
  | 'finalize'
  | 'sign'
  | 'pay'
  | 'kickoff'
  | 'activate'
  | 'share'

export type PilotHistoryEntry = {
  at: string
  action: PilotAction | 'created' | 'revised' | 'system'
  state: PilotState
  note?: string
  by?: string
}

export type UnresolvedItem = {
  key: string
  label: string
  resolution: string
  href: string
}

export type ExceptionItem = {
  kind: string
  summary: string
  amendment: string
  resolvedAt?: string
}

export type ValueModel = {
  frequency: {label: string; annualized: number}
  hoursLoss: {label: string; low: number; high: number}
  people: {label: string; low: number; high: number}
  low: number
  high: number
  midpoint: number
  formula: string
  confirmed: boolean
}

export type CommercialSnapshot = {
  priceLabel: string
  priceAmount: number
  currency: string
  paymentDue: 'on-signature'
  termDays: number
  termStart?: string
  termEnd?: string
  decisionDate?: string
  creditDeadline?: string
  participantsLabel: string
  annualOption?: {
    slug: string
    name: string
    priceLabel: string
    annualTotal: number | null
    creditNote: string
  }
  valueModel?: ValueModel
}

export type RoomToken = {
  pilotId: string
  role: 'submitter' | 'participant' | 'approver' | 'signer'
  email: string
}

export type ReviewerRole =
  | 'production_owner'
  | 'economic_buyer'
  | 'technical_evaluator'
  | 'security_reviewer'
  | 'procurement_reviewer'
  | 'approver'
  | 'signer'

export type ReviewerStatus =
  | 'proposed'
  | 'invited'
  | 'opened'
  | 'reviewed'
  | 'revoked'

export type Reviewer = {
  id: string
  role: ReviewerRole
  name: string
  email: string
  status: ReviewerStatus
  invitedAt?: string
  openedAt?: string
  reviewedAt?: string
  requestedChanges?: boolean
  versionSeen: number
  notes: string[]
}

export type RecommendedReviewer = {
  role: ReviewerRole
  name: string
  email: string
  required: boolean
}

export function recommendedReviewers(
  answers: PilotAnswers,
): RecommendedReviewer[] {
  const name = (field: string) => String(answers[field as keyof PilotAnswers] || '').trim()
  const email = (field: string) => String(answers[field as keyof PilotAnswers] || '').trim()
  const rows: RecommendedReviewer[] = [
    {
      role: 'production_owner',
      name: name('productionOwner'),
      email: email('productionOwnerEmail'),
      required: true,
    },
    {
      role: 'economic_buyer',
      name: name('economicBuyer'),
      email: email('economicBuyerEmail'),
      required: true,
    },
    {
      role: 'technical_evaluator',
      name: name('technicalEvaluator'),
      email: email('technicalEvaluatorEmail'),
      required: true,
    },
  ]
  if (answers.approvalPath === 'other' || answers.approvalPath === 'procurement') {
    rows.push({
      role: 'approver',
      name: name('approverName'),
      email: email('approverEmail'),
      required: false,
    })
  }
  if (answers.approvalPath === 'procurement') {
    rows.push({
      role: 'procurement_reviewer',
      name: '',
      email: '',
      required: false,
    })
  }
  const securityText = String(answers.securityRequirements || '').trim()
  const classification = String(answers.dataClassification || '').trim()
  if (securityText || REGULATED.has(classification)) {
    rows.push({
      role: 'security_reviewer',
      name: '',
      email: '',
      required: false,
    })
  }
  rows.push({
    role: 'signer',
    name: name('signerName'),
    email: email('signerEmail'),
    required: true,
  })
  return rows
}

export function reviewerTokenRole(
  role: ReviewerRole,
): 'participant' | 'approver' | 'signer' {
  switch (role) {
    case 'economic_buyer':
    case 'approver':
    case 'procurement_reviewer':
    case 'security_reviewer':
      return 'approver'
    case 'signer':
      return 'signer'
    default:
      return 'participant'
  }
}

export function reviewerRoleLabel(role: ReviewerRole): string {
  const labels: Record<ReviewerRole, string> = {
    production_owner: 'Production owner',
    economic_buyer: 'Economic buyer',
    technical_evaluator: 'Technical evaluator',
    security_reviewer: 'Security reviewer',
    procurement_reviewer: 'Procurement reviewer',
    approver: 'Approver',
    signer: 'Authorized signer',
  }
  return labels[role]
}

const STATE_LABELS: Record<PilotState, string> = {
  reviewing: 'Scope draft — under review',
  revision: 'Revision requested',
  team_review: 'Ready for team review',
  exception_review: 'Qualification or exception review',
  scope_confirmed: 'Scope confirmed',
  ready_sign: 'Ready for signature',
  signed: 'Signed',
  paid: 'Paid',
  kickoff: 'Scheduled',
  active: 'Active pilot',
  not_eligible: 'Not eligible',
}

export function stateLabel(state: PilotState): string {
  return STATE_LABELS[state]
}

const TRANSITIONS: Record<PilotState, Partial<Record<PilotAction, PilotState>>> = {
  reviewing: {revise: 'revision', start_team_review: 'team_review', confirm_scope: 'scope_confirmed', request_exception: 'exception_review'},
  revision: {revise: 'reviewing', start_team_review: 'team_review', confirm_scope: 'scope_confirmed', request_exception: 'exception_review'},
  team_review: {revise: 'revision', confirm_scope: 'scope_confirmed', request_exception: 'exception_review'},
  exception_review: {
    resolve_exceptions: 'reviewing',
    qualify: 'reviewing',
    disqualify: 'not_eligible',
    revise: 'revision',
  },
  scope_confirmed: {finalize: 'ready_sign', request_exception: 'exception_review', revise: 'revision'},
  ready_sign: {sign: 'signed', revise: 'revision'},
  signed: {pay: 'paid'},
  paid: {kickoff: 'kickoff'},
  kickoff: {activate: 'active'},
  active: {},
  not_eligible: {},
}

export function applyTransition(
  state: PilotState,
  action: PilotAction,
): {state: PilotState; allowed: boolean} {
  const next = TRANSITIONS[state]?.[action]
  return next ? {state: next, allowed: true} : {state, allowed: false}
}

const REGULATED = new Set(['regulated', 'personal'])
const UNKNOWN_CLASSIFICATION = new Set(['not-sure', ''])
const SECURITY_KEYWORDS: Array<[RegExp, string]> = [
  [/sso|saml|sso\/saml|single sign/i, 'sso'],
  [/sla|service.?level/i, 'sla'],
  [/soc\s*2/i, 'soc2'],
  [/residen/i, 'residency'],
  [/dedicated|self.?host/i, 'dedicated'],
  [/gdpr|hipaa|sox|iso\s*27001|fips|ccpa|pci/i, 'regulated-security'],
]

export type ClassificationResult = {
  route: PilotRoute
  reasons: string[]
  exceptions: ExceptionItem[]
}

export function classifyPilot(
  answers: PilotAnswers,
): ClassificationResult {
  const exceptions: ExceptionItem[] = []
  const reasons: string[] = []

  const workflow = answers.pilotWorkflow || answers.activeWorkflow || ''
  const noWorkflow = !workflow.trim() || /^(no|none|n\/a|not\s+yet)$/i.test(workflow.trim())
  const noOwner = !(answers.productionOwner || '').trim()

  const integrationSystems = parseIntegrationSystems(answers.integrationSystemsJson)
  const customIntegration =
    answers.integrationMethod === 'custom-integration' ||
    integrationSystems.some((row) => row.portalsEngineering)

  if (noWorkflow) {
    reasons.push('No active production workflow described')
    return {route: 'disqualified', reasons, exceptions}
  }
  if (noOwner) {
    reasons.push('No production owner identified')
    return {route: 'disqualified', reasons, exceptions}
  }
  if (answers.approvalPath === 'no' || answers.approvalPath === 'not-established') {
    reasons.push('No credible $5,000 approval path')
    return {route: 'disqualified', reasons, exceptions}
  }
  if (answers.exactReproductionRequired) {
    reasons.push('Guaranteed exact reproduction is outside the standard pilot')
    return {route: 'disqualified', reasons, exceptions}
  }

  if (customIntegration) {
    exceptions.push({
      kind: 'custom-integration',
      summary: 'Custom integration or portals engineering work is outside the standard scope.',
      amendment: 'Separately priced amendment or technical review before scope confirmation.',
    })
  }
  if (answers.historicalProject === 'more-than-one') {
    exceptions.push({
      kind: 'extra-projects',
      summary: 'More than one historical project is outside the standard pilot.',
      amendment: 'Additional historical project allowance.',
    })
  }
  if (
    answers.participantsRange === '6-10' ||
    answers.participantsRange === '11-plus'
  ) {
    exceptions.push({
      kind: 'extra-participants',
      summary: `${answers.participantsRange} participants exceeds the standard five.`,
      amendment: 'Additional participant allowance.',
    })
  }
  const classification = answers.dataClassification || ''
  if (REGULATED.has(classification)) {
    exceptions.push({
      kind: 'regulated-data',
      summary: 'Regulated or personal data requires a legal and security posture review.',
      amendment: 'Legal review and security addendum before processing.',
    })
  } else if (UNKNOWN_CLASSIFICATION.has(classification)) {
    exceptions.push({
      kind: 'data-classification',
      summary: 'The data classification was not confirmed.',
      amendment: 'Confirm the data classification before scope confirmation.',
    })
  }
  const successKeys = parseSuccessKeys(answers.successCriterionKeysJson)
  if (successKeys.includes('other')) {
    exceptions.push({
      kind: 'custom-criteria',
      summary: 'Custom success criteria are outside the standard success plan.',
      amendment: 'Resolve the success plan in the Pilot Terms Review.',
    })
  }
  if (answers.approvalPath === 'procurement') {
    exceptions.push({
      kind: 'procurement',
      summary: 'Procurement review is required before the pilot can be funded.',
      amendment: 'Procurement process run in parallel; funding must precede launch.',
    })
  }
  const securityText = (answers.securityRequirements || '')
  for (const [pattern, kind] of SECURITY_KEYWORDS) {
    if (pattern.test(securityText) && !exceptions.some((item) => item.kind === kind)) {
      exceptions.push({
        kind,
        summary: `Security or operating requirement detected (${kind.replace('-', ' ')}).`,
        amendment: 'Resolve the security posture in the Pilot Terms Review.',
      })
    }
  }
  if (answers.annualDeploymentOption === 'not-known' || !answers.annualDeploymentOption) {
    exceptions.push({
      kind: 'annual-option',
      summary: 'The proposed annual deployment option is not determined.',
      amendment: 'Confirm the annual configuration in the Pilot Terms Review.',
    })
  }

  return {route: exceptions.length ? 'one-call' : 'zero-call', reasons, exceptions}
}

export function parseIntegrationSystems(raw: string | undefined): IntegrationRow[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseSuccessKeys(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const STANDARD_SUCCESS_KEYS = [
  'approved-retrieval',
  'production-context',
  'reproduction',
  'knowledge-transfer',
  'variant-lineage',
]

export function buildSuccessCriteria(
  answers: PilotAnswers,
): SuccessCriterion[] {
  const selected = new Set(parseSuccessKeys(answers.successCriterionKeysJson))
  const label = (key: string) =>
    optionLists.successCriterionLabel[key as keyof typeof optionLists.successCriterionLabel] || key
  return [...new Set([...STANDARD_SUCCESS_KEYS, ...selected])].map((key) => ({
    key,
    label: label(key),
    status: selected.has(key) || STANDARD_SUCCESS_KEYS.includes(key) ? 'accepted' : 'not-applicable',
  }))
}

export function buildSecurityDecisions(
  answers: PilotAnswers,
): SecurityDecision[] {
  const securityText = (answers.securityRequirements || '').toLowerCase()
  const exceptionFor = (key: string) => {
    const [pattern] = SECURITY_KEYWORDS.find(([, kind]) => kind === key) || []
    return Boolean(pattern && pattern.test(securityText))
  }
  const regulated =
    REGULATED.has(answers.dataClassification || '')
  const rows: Array<{
    key: string
    label: string
    decision: SecurityDecision['decision']
    note?: string
  }> = [
    {
      key: 'training-data',
      label: 'No use of your data to train foundation models',
      decision: 'confirm',
      note: 'Never without written permission',
    },
    {key: 'tenant-isolation', label: 'Logical isolation of customer environments', decision: 'confirm'},
    {key: 'encryption-transit', label: 'Encryption in transit (TLS)', decision: 'confirm'},
    {key: 'encryption-rest', label: 'Encryption at rest', decision: 'confirm'},
    {key: 'export', label: 'Export your data and models on request', decision: 'confirm'},
    {key: 'deletion', label: 'Deletion of data and models on request', decision: 'confirm'},
    {
      key: 'sso',
      label: 'SSO/SAML integration',
      decision: exceptionFor('sso') ? 'exception' : 'confirm',
      note: exceptionFor('sso') ? 'SSO/SAML requires configuration review.' : 'Included when requested.',
    },
    {
      key: 'sla',
      label: 'Formal service-level agreement',
      decision: exceptionFor('sla') ? 'exception' : 'not-applicable',
      note: 'Outside the standard pilot; covered by the annual deployment.',
    },
    {
      key: 'soc2',
      label: 'SOC 2 report',
      decision: 'accept',
      note: 'Buyer accepts portals\u2019 standard security posture for the pilot.',
    },
    {
      key: 'residency',
      label: 'Data residency requirements',
      decision: exceptionFor('residency') ? 'exception' : 'not-applicable',
      note: 'Residency outside standard hosting requires review.',
    },
    {
      key: 'dedicated',
      label: 'Dedicated tenant or infrastructure',
      decision: exceptionFor('dedicated') ? 'exception' : 'not-applicable',
      note: 'Dedicated infrastructure is not included at the pilot price.',
    },
    {
      key: 'regulated',
      label: 'Regulated or personal data processing',
      decision: regulated ? 'exception' : 'not-applicable',
      note: 'Requires legal and security review before processing.',
    },
  ]
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    decision: row.decision,
    note: row.note,
  }))
}

const FREQUENCY_LABELS: Record<string, string> = {
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  weekly: 'Weekly',
  daily: 'Daily',
}

const HOURS_RANGES: Record<string, [number, number]> = {
  'under-1-hour': [0.5, 1],
  '1-4-hours': [1, 4],
  'one-day': [6, 10],
  '2-5-days': [16, 40],
  'week-plus': [40, 80],
}

const PEOPLE_RANGES: Record<string, [number, number]> = {
  '1-2-people': [1, 2],
  '2-5-people': [2, 5],
  '6-10-people': [6, 10],
  '11-plus-people': [10, 20],
}

const FREQUENCY_ANNUALIZED: Record<string, number> = {
  quarterly: 4,
  monthly: 12,
  weekly: 52,
  daily: 220,
}

export function buildValueModel(
  recreationFrequency: string,
  hoursLost: string,
  peopleAffected: string,
): ValueModel | undefined {
  if (
    !FREQUENCY_ANNUALIZED[recreationFrequency] ||
    !HOURS_RANGES[hoursLost] ||
    !PEOPLE_RANGES[peopleAffected]
  ) {
    return undefined
  }
  const frequency = {
    label: FREQUENCY_LABELS[recreationFrequency],
    annualized: FREQUENCY_ANNUALIZED[recreationFrequency],
  }
  const hoursLoss = {label: hoursLost.replace(/-/g, ' '), low: HOURS_RANGES[hoursLost][0], high: HOURS_RANGES[hoursLost][1]}
  const people = {label: peopleAffected.replace(/-/g, ' '), low: PEOPLE_RANGES[peopleAffected][0], high: PEOPLE_RANGES[peopleAffected][1]}
  const low = Math.round(frequency.annualized * hoursLoss.low * people.low)
  const high = Math.round(frequency.annualized * hoursLoss.high * people.high)
  return {
    frequency,
    hoursLoss,
    people,
    low,
    high,
    midpoint: Math.round((low + high) / 2),
    formula: `Annualized recreation frequency \u00d7 hours lost per incident \u00d7 affected contributors`,
    confirmed: false,
  }
}

function annualTotalFrom(spec: PackageSpecification | undefined): number | null {
  const amount = spec?.price?.amount
  if (!amount) return null
  const note = `${spec.price?.periodLabel || ''} ${spec.price?.billingNote || ''}`.toLowerCase()
  return note.includes('month') ? amount * 12 : amount
}

export function buildCommercialSnapshot(
  answers: PilotAnswers,
  specs: PackageSpecification[],
  opts: {startDate?: string; termDays?: number; currency?: string},
): CommercialSnapshot {
  const pilotSpec = specs.find((spec) => spec.packageKind === 'paidPilot')
  const priceAmount =
    Number(process.env.PILOT_PRICE_AMOUNT) ||
    pilotSpec?.price?.amount ||
    5000
  const priceLabel = packagePriceLabel(pilotSpec) || `$${priceAmount.toLocaleString()}`
  const currency = opts.currency || pilotSpec?.price?.currency || 'USD'
  const termDays = opts.termDays || packageTermDays(pilotSpec)
  const start = opts.startDate
  const end = start ? new Date(new Date(start).getTime() + (termDays - 1) * 86_400_000) : undefined
  const decisionDate = start
    ? new Date(new Date(start).getTime() + termDays * 86_400_000)
    : undefined
  const creditDeadline = decisionDate
    ? new Date(decisionDate.getTime() + 6 * 86_400_000)
    : undefined
  const iso = (date?: Date) => date?.toISOString().slice(0, 10)

  const annualSlug = answers.annualDeploymentOption || ''
  const annualSpec =
    annualSlug === 'not-known' || !annualSlug
      ? undefined
      : specs.find((spec) => spec.slug === annualSlug)
  const annualTotal = annualTotalFrom(annualSpec)
  const annualCredit = `The $${priceAmount.toLocaleString()} pilot fee will be credited if the annual order form is signed by ${iso(creditDeadline) || 'the stated deadline'}.`
  const annualOption =
    annualSlug === 'studio' && !annualSpec
      ? {
          slug: 'studio',
          name: 'portals Studio',
          priceLabel: '$30,000 annually',
          annualTotal: 30000,
          creditNote: annualCredit,
        }
      : annualSpec
        ? {
            slug: annualSpec.slug,
            name: annualSpec.name,
            priceLabel: annualSpec.price?.displayValue || annualSpec.name,
            annualTotal,
            creditNote: annualCredit,
          }
        : undefined

  return {
    priceLabel,
    priceAmount,
    currency,
    paymentDue: 'on-signature',
    termDays,
    termStart: start ? iso(new Date(start)) : undefined,
    termEnd: end ? iso(end) : undefined,
    decisionDate: iso(decisionDate),
    creditDeadline: iso(creditDeadline),
    participantsLabel: answers.participantsRange || 'up to five',
    annualOption,
    valueModel: buildValueModel(
      answers.recreationFrequency || '',
      answers.hoursLost || '',
      answers.peopleAffected || '',
    ),
  }
}

export function computeUnresolved(
  answers: PilotAnswers,
  opts: {startDate?: string; route?: PilotRoute},
): UnresolvedItem[] {
  const unresolved: UnresolvedItem[] = []
  if (!opts.startDate) {
    unresolved.push({
      key: 'start-date',
      label: 'Choose the pilot start date',
      resolution: 'Pick a start date in the approval room.',
      href: '#scope'
    })
  }
  if (
    !answers.integrationMethod ||
    answers.integrationMethod === 'not-yet-known'
  ) {
    unresolved.push({
      key: 'integration',
      label: 'Choose the import or integration method',
      resolution: 'Select one of the standard integration paths.',
      href: '#scope',
    })
  }
  if (UNKNOWN_CLASSIFICATION.has(answers.dataClassification || '')) {
    unresolved.push({
      key: 'classification',
      label: 'Confirm how your production data should be classified',
      resolution: 'Select the data classification that applies.',
      href: '#scope',
    })
  }
  if (!answers.approvalPath || answers.approvalPath === 'not-established') {
    unresolved.push({
      key: 'approval',
      label: 'Confirm the $5,000 approval path',
      resolution: 'Confirm who can approve and fund the pilot.',
      href: '#scope',
    })
  }
  if (
    (answers.approvalPath === 'other' || answers.approvalPath === 'procurement') &&
    !(answers.approverEmail || '').trim()
  ) {
    unresolved.push({
      key: 'approver',
      label: 'Add the approver\u2019s email so the plan can be shared',
      resolution: 'Share the room with the approver using the share box, or revise the plan to add their email.',
      href: '#scope',
      })
  }
  if (!answers.annualDeploymentOption || answers.annualDeploymentOption === 'not-known') {
    unresolved.push({
      key: 'annual',
      label: 'Choose the proposed annual deployment option',
      resolution: 'Select the annual deployment you are evaluating.',
      href: '#scope',
    })
  }
  if (!answers.annualPriceAcknowledged) {
    unresolved.push({
      key: 'annual-ack',
      label: 'Acknowledge the proposed annual price',
      resolution: 'Acknowledge the annual price shown in the commercial terms.',
      href: '#scope',
    })
  }
  if (!(answers.signerName || '').trim() || !(answers.signerEmail || '').trim()) {
    unresolved.push({
      key: 'signer',
      label: 'Identify the authorized signer',
      resolution: 'Enter the signer\u2019s name and email in the approval room.',
      href: '#scope',
    })
  }
  if (opts.route === 'zero-call') {
    const criteria = buildSuccessCriteria(answers)
    for (const criterion of criteria) {
      if (criterion.status === 'modified' && !(criterion.target || '').trim()) {
        unresolved.push({
          key: `criterion-${criterion.key}`,
          label: `Set a measurable target for: ${criterion.label}`,
          resolution: 'Edit the success criterion and add a target.',
          href: '#scope',
        })
      }
    }
  }
  return unresolved
}


export function summarizeProposal(snapshot: CommercialSnapshot | null | undefined): string {
  if (!snapshot) return 'Commercial terms are being prepared.'
  const parts = [
    `${snapshot.priceLabel} pilot, due on signature, covering a ${snapshot.termDays}-day production pilot`,
  ]
  if (snapshot.termStart && snapshot.termEnd) {
    parts.push(`planned for ${snapshot.termStart} through ${snapshot.termEnd}`)
  }
  if (snapshot.annualOption) {
    parts.push(
      `with the proposed annual deployment of ${snapshot.annualOption.name}${
        snapshot.annualOption.annualTotal
          ? ` at $${snapshot.annualOption.annualTotal.toLocaleString()} annually`
          : ''
      }`,
    )
  }
  if (snapshot.valueModel) {
    parts.push(
      `and an estimated ${snapshot.valueModel.midpoint} hours of annual disruption (${snapshot.valueModel.low}\u2013${snapshot.valueModel.high})`,
    )
  }
  return parts.join(', ')
}
