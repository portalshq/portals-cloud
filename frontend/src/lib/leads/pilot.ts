import type { PackageSpecification } from '../../types/resource'
import type {
  IntegrationRow,
  PilotAnswers,
  SuccessCriterion,
  SecurityDecision,
} from './contracts'
import {
  pilotControlledOptionLists as optionLists,
} from './contracts'
import { packageLimitLabel, packageMilestoneLabel, packagePriceLabel, packageTermDays } from '../package-specifications'
import type {PilotOffer} from './pilot-offers'

export type PilotRoute = 'zero-call' | 'one-call' | 'disqualified'
export type PilotMode = 'standard' | 'assisted'

export type PilotState =
  | 'reviewing'
  | 'revision'
  | 'team_review'
  | 'exception_review'
  | 'scope_confirmed'
  | 'ready_sign'
  | 'signed'
  | 'paid'
  | 'launch'
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
  | 'launch'
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

export type PilotProgressInput = {
  state: PilotState
  version: number
  unresolved: UnresolvedItem[]
  exceptions: ExceptionItem[]
  reviewers: Reviewer[]
}

export type ExceptionItem = {
  kind: string
  summary: string
  amendment: string
  resolvedAt?: string
}

const MATERIAL_EXCEPTION_KINDS = new Set([
  'custom-integration',
  'extra-projects',
  'extra-participants',
  'regulated-data',
  'data-classification',
  'procurement',
  'sso',
  'sla',
  'soc2',
  'residency',
  'dedicated',
  'regulated-security',
  'assessment-qualification',
  'exact-reproduction',
  'approval-path',
])

export function isMaterialPilotException(item: ExceptionItem): boolean {
  return MATERIAL_EXCEPTION_KINDS.has(item.kind)
}

export function hasPendingMaterialException(exceptions: ExceptionItem[]): boolean {
  return exceptions.some((item) => !item.resolvedAt && isMaterialPilotException(item))
}

export type ValueModel = {
  frequency: { label: string; annualized: number }
  hoursLoss: { label: string; low: number; high: number }
  people: { label: string; low: number; high: number }
  low: number
  high: number
  midpoint: number
  formula: string
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
  annualCreditAmount?: number
  annualCreditLabel?: string
  annualCreditRedemptionPolicy?: string
  offerVariantSlug?: string
  offerVariantRevision?: string
  offerTermsVersion?: string
  offerStartsAt?: string
  offerEndsAt?: string
  offerAcceptanceDeadlineLabel?: string
  offerCopy?: string
  basePackageSlug?: string
  offerResolvedAt?: string
  offerSnapshotHash?: string
  participantLimit?: number
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

export const REVIEWER_ROLES = [
  'production_owner',
  'economic_buyer',
  'technical_evaluator',
  'security_reviewer',
  'procurement_reviewer',
  'approver',
  'signer',
] as const satisfies readonly ReviewerRole[]

export function isReviewerRole(value: unknown): value is ReviewerRole {
  return typeof value === 'string' && (REVIEWER_ROLES as readonly string[]).includes(value)
}

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

const REVIEWER_ROLE_PRIVILEGE: Record<ReviewerRole, number> = {
  signer: 3,
  economic_buyer: 2,
  approver: 2,
  procurement_reviewer: 2,
  security_reviewer: 2,
  production_owner: 1,
  technical_evaluator: 1,
}

export function reviewerRolePrivilege(role: ReviewerRole): number {
  return REVIEWER_ROLE_PRIVILEGE[role]
}

export function highestPrivilegeReviewer(reviewers: Reviewer[]): Reviewer | null {
  return reviewers.reduce<Reviewer | null>(
    (highest, reviewer) =>
      !highest || reviewerRolePrivilege(reviewer.role) > reviewerRolePrivilege(highest.role)
        ? reviewer
        : highest,
    null,
  )
}

export type ReviewerGroup = {
  email: string
  reviewers: Reviewer[]
  primary: Reviewer
  additional: Reviewer[]
}

/** Groups role entries by person while preserving separate role records. */
export function groupReviewersByEmail(reviewers: Reviewer[]): ReviewerGroup[] {
  const grouped = new Map<string, Reviewer[]>()
  for (const reviewer of reviewers) {
    const email = reviewer.email.trim().toLowerCase()
    // Empty addresses are unassigned roles, not a shared person.
    const key = email || `unassigned:${reviewer.id}`
    const entries = grouped.get(key) || []
    entries.push(reviewer)
    grouped.set(key, entries)
  }
  return [...grouped.entries()].map(([key, entries]) => {
    const active = entries.filter((reviewer) => reviewer.status !== 'revoked')
    const primary = highestPrivilegeReviewer(active.length ? active : entries)
    if (!primary) throw new Error('Reviewer groups must contain a reviewer.')
    return {
      email: key.startsWith('unassigned:') ? '' : key,
      reviewers: entries,
      primary,
      additional: (active.length ? active : entries).filter((reviewer) => reviewer.id !== primary.id),
    }
  })
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
  reviewing: 'Scope draft - under review',
  revision: 'Revision requested',
  team_review: 'Ready for review',
  exception_review: 'Exception review',
  scope_confirmed: 'Scope confirmed',
  ready_sign: 'Ready for signature',
  signed: 'Purchased - payment due',
  paid: 'Paid',
  launch: 'Launch scheduled',
  active: 'Active',
  not_eligible: 'Not eligible',
}

export function stateLabel(state: PilotState): string {
  return STATE_LABELS[state]
}

const TRANSITIONS: Record<PilotState, Partial<Record<PilotAction, PilotState>>> = {
  reviewing: { revise: 'revision', start_team_review: 'team_review', confirm_scope: 'scope_confirmed', request_exception: 'exception_review' },
  revision: { revise: 'reviewing', start_team_review: 'team_review', confirm_scope: 'scope_confirmed', request_exception: 'exception_review' },
  team_review: { revise: 'revision', confirm_scope: 'scope_confirmed', request_exception: 'exception_review' },
  exception_review: {
    resolve_exceptions: 'reviewing',
    qualify: 'reviewing',
    disqualify: 'not_eligible',
    revise: 'revision',
  },
  scope_confirmed: { finalize: 'ready_sign', request_exception: 'exception_review', revise: 'revision' },
  ready_sign: { sign: 'signed', revise: 'revision' },
  signed: { pay: 'paid' },
  paid: { launch: 'launch' },
  launch: { activate: 'active' },
  active: {},
  not_eligible: {},
}

export function applyTransition(
  state: PilotState,
  action: PilotAction,
): { state: PilotState; allowed: boolean } {
  const next = TRANSITIONS[state]?.[action]
  return next ? { state: next, allowed: true } : { state, allowed: false }
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
    return { route: 'disqualified', reasons, exceptions }
  }
  if (noOwner) {
    reasons.push('No production owner identified')
    return { route: 'disqualified', reasons, exceptions }
  }
  if (answers.approvalPath === 'no' || answers.approvalPath === 'not-established') {
    exceptions.push({
      kind: 'approval-path',
      summary: 'The approval path is not established for the pilot purchase.',
      amendment: 'Confirm the authorized buyer, procurement path, or exception terms before funding.',
    })
  }
  if (answers.exactReproductionRequired) {
    exceptions.push({
      kind: 'exact-reproduction',
      summary: 'A guaranteed exact reproduction outcome is outside the standard pilot.',
      amendment: 'Align on a measurable reproduction objective and permitted variance before funding.',
    })
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

  return { route: exceptions.length ? 'one-call' : 'zero-call', reasons, exceptions }
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
  const raw = answers.successCriterionKeysJson
  const hasExplicitSelection = typeof raw === 'string' && raw.trim() !== ''
  const selected = new Set(parseSuccessKeys(raw))
  const label = (key: string) =>
    optionLists.successCriterionLabel[key as keyof typeof optionLists.successCriterionLabel] || key
  // If no explicit selection, use standard keys as defaults. Otherwise, use only selected keys.
  const keysToUse = hasExplicitSelection ? selected : new Set(STANDARD_SUCCESS_KEYS)
  return [...keysToUse].map((key) => ({
    key,
    label: label(key),
    status: hasExplicitSelection ? (selected.has(key) ? 'accepted' : 'not-applicable') : 'accepted',
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
      { key: 'tenant-isolation', 
        label: 'Logical isolation of customer environments', 
        decision: 'confirm' },
      { key: 'encryption-transit', label: 'Encryption in transit (TLS)', decision: 'confirm' },
      { key: 'encryption-rest', label: 'Encryption at rest', decision: 'confirm' },
      { key: 'export', label: 'Export your data and models on request', 
        note: 'Customer data can be exported on request', 
        decision: 'confirm' },
      { key: 'deletion', label: 'Deletion of data and models on request', decision: 'confirm' },
      {
        key: 'sso',
        label: 'SSO/SAML integration',
        decision: exceptionFor('sso') ? 'exception' : 'confirm',
        note: exceptionFor('sso') ? 'Requested SSO/SAML requires exception review.' : 'SSO/SAML integration is included when requested.',
      },
      {
        key: 'sla',
        label: 'Formal service-level agreement',
        decision: exceptionFor('sla') ? 'exception' : 'not-applicable',
        note: exceptionFor('sla')
          ? 'A pilot-specific SLA requires review.'
          : 'SLA is outside the standard pilot and can be addressed for annual deployment.',
      },
      {
        key: 'soc2',
        label: 'SOC 2 report',
        decision: 'confirm',
        note: 'Buyer accepts portals\u2019 standard security posture for the pilot duration without a SOC 2 report.',
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
        note: 'Dedicated infrastructure is not included in this pilot package.',
      },
      // {
      //   key: 'regulated',
      //   label: 'Regulated or personal data processing',
      //   decision: regulated ? 'exception' : 'not-applicable',
      //   note: 'Requires legal and security review before processing.',
      // },
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
  '1': [1, 1],
  '2-4': [2, 4],
  '5-9': [5, 9],
  '10-24': [10, 24],
  '25-plus': [25, 40],
  // Preserve value estimates for assessments completed before the option labels
  // were aligned with the live assessment form.
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
  const hoursLoss = { label: hoursLost.replace(/-/g, ' '), low: HOURS_RANGES[hoursLost][0], high: HOURS_RANGES[hoursLost][1] }
  const people = { label: peopleAffected.replace(/-/g, ' '), low: PEOPLE_RANGES[peopleAffected][0], high: PEOPLE_RANGES[peopleAffected][1] }
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
  opts: { startDate?: string; termDays?: number; currency?: string; offer?: PilotOffer | null },
): CommercialSnapshot {
  const pilotSpec = specs.find((spec) => spec.packageKind === 'paidPilot')
  const priceAmount =
    opts.offer?.pilotPriceAmount ||
    Number(process.env.PILOT_PRICE_AMOUNT) ||
    pilotSpec?.price?.amount ||
    5000
  const priceLabel = opts.offer?.pilotPriceLabel || packagePriceLabel(pilotSpec) || `$${priceAmount.toLocaleString()}`
  const currency = opts.currency || pilotSpec?.price?.currency || 'USD'
  const termDays = opts.termDays || opts.offer?.pilotDurationDays || packageTermDays(pilotSpec)
  const start = opts.startDate
  const end = start ? new Date(new Date(start).getTime() + (termDays - 1) * 86_400_000) : undefined
  const decisionDate = start
    ? new Date(new Date(start).getTime() + termDays * 86_400_000)
    : undefined
  // Offer policy decides the credit window; Sanity milestone is the fallback.
  // No hard-coded day counts here.
  const windowLabel = packageMilestoneLabel(pilotSpec, 'annual-credit decision window')
  const windowDays = Number.parseInt(String(windowLabel), 10)
  const creditWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 14
  const creditDeadline = decisionDate
    ? new Date(decisionDate.getTime() + creditWindowDays * 86_400_000)
    : undefined
  const iso = (date?: Date) => date?.toISOString().slice(0, 10)

  const annualSlug = answers.annualDeploymentOption || ''
  const annualSpec =
    annualSlug === 'not-known' || !annualSlug
      ? undefined
      : specs.find((spec) => spec.slug === annualSlug)
  const annualTotal = annualTotalFrom(annualSpec)
  const annualCredit = opts.offer
    ? `${opts.offer.annualCreditLabel} annual deployment credit under the ${opts.offer.annualCreditRedemptionPolicy}.`
    : `The $${priceAmount.toLocaleString()} pilot fee will be credited if the annual order form is signed by ${iso(creditDeadline) || 'the stated deadline'}.`
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
    ...(opts.offer ? {
      annualCreditAmount: opts.offer.annualCreditAmount,
      annualCreditLabel: opts.offer.annualCreditLabel,
      annualCreditRedemptionPolicy: opts.offer.annualCreditRedemptionPolicy,
      offerVariantSlug: opts.offer.slug,
      offerVariantRevision: opts.offer._rev,
      offerTermsVersion: opts.offer.termsVersion,
      offerStartsAt: opts.offer.startsAt,
      offerEndsAt: opts.offer.endsAt,
      offerAcceptanceDeadlineLabel: opts.offer.acceptanceDeadlineLabel,
      offerCopy: opts.offer.offerCopy,
    } : {}),
    participantsLabel: answers.participantsRange || 'up to five',
    participantLimit: Number(packageLimitLabel(pilotSpec, 'participants').match(/\d+/)?.[0] || 5),
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
  opts: { startDate?: string; route?: PilotRoute },
): UnresolvedItem[] {
  const unresolved: UnresolvedItem[] = []
  if (!opts.startDate) {
    unresolved.push({
      key: 'start-date',
      label: 'Select the start date',
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
      label: 'Select the import or integration method',
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

const REQUIRED_REVIEWER_ROLES = new Set<ReviewerRole>([
  'production_owner',
  'economic_buyer',
  'technical_evaluator',
])

function reviewerProgressItem(reviewer: Reviewer, version: number): UnresolvedItem | null {
  if (reviewer.role === 'signer' || reviewer.status === 'revoked') return null
  const role = reviewerRoleLabel(reviewer.role).toLowerCase()
  const required = REQUIRED_REVIEWER_ROLES.has(reviewer.role)
  const email = reviewer.email.trim()

  if (!email) {
    return required
      ? {
          key: `reviewer-${reviewer.role}-assignment`,
          label: `Assign the ${role} reviewer`,
          resolution: `Add an email for the ${role} in the reviewers section.`,
          href: '#reviewers',
        }
      : null
  }
  if (reviewer.requestedChanges) {
    return {
      key: `reviewer-${reviewer.id}-changes`,
      label: `${reviewerRoleLabel(reviewer.role)} requested changes`,
      resolution: 'Revise the shared terms and submit the next revision for review.',
      href: '#reviewers',
    }
  }
  if (reviewer.status === 'reviewed' && reviewer.versionSeen >= version) return null
  if (reviewer.status === 'proposed') {
    return {
      key: `reviewer-${reviewer.id}-invite`,
      label: `Invite the ${role} reviewer`,
      resolution: 'Send the reviewer an invitation to the pilot room.',
      href: '#reviewers',
    }
  }
  return {
    key: `reviewer-${reviewer.id}-approval`,
    label:
      reviewer.status === 'reviewed'
        ? `Await renewed confirmation from the ${role}`
        : `Await confirmation from the ${role}`,
    resolution: 'The reviewer needs to confirm the current terms revision.',
    href: '#reviewers',
  }
}

function reviewerGroupProgressItem(reviewers: Reviewer[], version: number): UnresolvedItem | null {
  const reviewRoles = reviewers.filter(
    (reviewer) => reviewer.role !== 'signer' && reviewer.status !== 'revoked',
  )
  if (reviewRoles.length === 0) return null
  if (reviewRoles.length === 1) return reviewerProgressItem(reviewRoles[0], version)

  const primary = highestPrivilegeReviewer(reviewRoles)
  if (!primary) return null
  const name = primary.name || primary.email
  const roles = reviewRoles.map((reviewer) => reviewerRoleLabel(reviewer.role).toLowerCase()).join(' + ')
  if (reviewRoles.some((reviewer) => reviewer.requestedChanges)) {
    return {
      key: `reviewer-${primary.id}-changes`,
      label: `${name} (${roles}) requested changes`,
      resolution: 'Revise the shared terms and submit the next revision for review.',
      href: '#reviewers',
    }
  }
  if (reviewRoles.every((reviewer) => reviewer.status === 'reviewed' && reviewer.versionSeen >= version)) {
    return null
  }
  if (reviewRoles.every((reviewer) => reviewer.status === 'proposed')) {
    return {
      key: `reviewer-${primary.id}-invite`,
      label: `Invite ${name} (${roles})`,
      resolution: 'Send the reviewer one secure room invitation for their assigned roles.',
      href: '#reviewers',
    }
  }
  return {
    key: `reviewer-${primary.id}-approval`,
    label: `Await confirmation from ${name} (${roles})`,
    resolution: 'The reviewer needs to confirm the current terms revision for each assigned role.',
    href: '#reviewers',
  }
}

/** Includes current state gates without persisting transient reviewer or workflow status. */
export function computePilotProgressUnresolved(input: PilotProgressInput): UnresolvedItem[] {
  const unresolved = [...input.unresolved]
  const add = (item: UnresolvedItem) => {
    if (!unresolved.some((existing) => existing.key === item.key)) unresolved.push(item)
  }
  const pendingException = input.exceptions.some((item) => !item.resolvedAt)

  if (pendingException) {
    add({
      key: 'portals-review',
      label:
        input.state === 'exception_review'
          ? 'Portals review is in progress'
          : 'Submit the outstanding terms for Portals review',
      resolution: 'Resolve the required security, legal, or commercial review before approval.',
      href: '#exceptions',
    })
  }

  if (input.state === 'team_review') {
    const reviewersByRole = new Map<ReviewerRole, Reviewer[]>()
    for (const reviewer of input.reviewers) {
      const rows = reviewersByRole.get(reviewer.role) || []
      rows.push(reviewer)
      reviewersByRole.set(reviewer.role, rows)
    }
    for (const role of REQUIRED_REVIEWER_ROLES) {
      const reviewers = reviewersByRole.get(role) || []
      if (reviewers.length === 0 || reviewers.every((reviewer) => reviewer.status === 'revoked')) {
        add({
          key: `reviewer-${role}-assignment`,
          label: `Assign the ${reviewerRoleLabel(role).toLowerCase()} reviewer`,
          resolution: `Add an email for the ${reviewerRoleLabel(role).toLowerCase()} in the reviewers section.`,
          href: '#reviewers',
        })
      }
    }
    for (const group of groupReviewersByEmail(input.reviewers)) {
      const item = reviewerGroupProgressItem(group.reviewers, input.version)
      if (item) add(item)
    }
  }

  if (input.state === 'ready_sign') {
    add({
      key: 'signature',
      label: 'Sign the pilot agreement',
      resolution: 'The authorized signer must confirm the agreement in the signature section.',
      href: '#signature',
    })
  }
  if (input.state === 'signed') {
    add({
      key: 'payment',
      label: 'Record the pilot fee payment',
      resolution: 'Pay the pilot fee to schedule kickoff.',
      href: '#pilot-actions',
    })
  }
  if (input.state === 'paid') {
    add({
      key: 'kickoff',
      label: 'Schedule launch',
      resolution: 'Schedule launch before activating the pilot.',
      href: '#pilot-actions',
    })
  }
  if (input.state === 'launch') {
    add({
      key: 'activation',
      label: 'Activate the pilot',
      resolution: 'Activate the pilot once launch is scheduled.',
      href: '#pilot-actions',
    })
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
      `with the proposed annual deployment of ${snapshot.annualOption.name}${snapshot.annualOption.annualTotal
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
