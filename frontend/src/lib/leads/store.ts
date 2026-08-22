import {randomUUID} from 'node:crypto'
import pg, {type Pool, type PoolClient} from 'pg'
import type {
  LeadAttribution,
  LeadIdentity,
  LeadRequest,
  LeadResponse,
  QualificationScores,
  QualificationTier,
  SecurityDecision,
  SuccessCriterion,
} from './contracts'
import {decryptJson, encryptJson, hashValue, randomToken} from './crypto'
import {companyDomain, normalizeEmail} from './identity'
import type {
  CommercialSnapshot,
  ExceptionItem,
  PilotAction,
  PilotHistoryEntry,
  PilotRoute,
  PilotState,
  Reviewer,
  UnresolvedItem,
} from './pilot'
import {recommendedReviewers} from './pilot'
import {createPilotDraft} from './pilot-collaboration'
import type {
  PilotCollaborativeDraft,
  PilotCommittedRevision,
  PilotMutableTerms,
} from './pilot-collaboration-types'
import {
  BillingCustomer,
  BillingSubscription,
  BillingInvoice,
  BillingPayment,
  BillingCheckoutSession,
  ProductType,
} from './billing-schema'
import {
  billingCustomerFromRow,
  billingSubscriptionFromRow,
  billingInvoiceFromRow,
  billingPaymentFromRow,
  billingCheckoutSessionFromRow,
} from './billing-schema'

export const PROFILE_COOKIE = 'portals_profile'
export const PROFILE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90

export type StoredQualification = {
  answers: Record<string, unknown>
  scores: QualificationScores
  tier: QualificationTier
  recommendedWorkflow: string
  updatedAt: string
}

export type StoredProfile = {
  id: string
  identity: LeadIdentity
  identityVerified: boolean
  analyticsPersonId: string
  companyDomain: string
  firstTouch: LeadAttribution
  lastTouch: LeadAttribution
  marketingConsent: boolean
  marketingSuppressed: boolean
  analyticsConsent: boolean
  qualification?: StoredQualification
}

export type StoredSubmission = {
  id: string
  request: LeadRequest
  identity: LeadIdentity
  profile: StoredProfile
  scores?: QualificationScores
  tier?: QualificationTier
  response: LeadResponse
  verified: boolean
}

type PersistInput = Omit<StoredSubmission, 'id' | 'profile'> & {
  currentProfileToken?: string
  qualificationAnswers?: Record<string, unknown>
}

type PersistResult = {
  submission: StoredSubmission
  profileToken?: string
  created: boolean
}

type OutboxRow = {
  id: string
  submission_id: string
  action_type: string
  action_key: string
  attempts: number
}

type MemoryOutboxRow = OutboxRow & {
  status: 'pending' | 'retry' | 'processing' | 'complete' | 'dead'
  last_error: string | null
  due_at: number
}

const globalForLeads = globalThis as typeof globalThis & {
  portalsLeadPool?: Pool
  portalsLeadMemory?: {
    profiles: Map<string, StoredProfile>
    tokens: Map<string, string>
    submissions: Map<string, StoredSubmission>
    pilots: Map<string, StoredPilot>
    submissionPilots: Map<string, string>
    outbox: Map<string, MemoryOutboxRow>
  }
}

export function leadsDryRun(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LEADS_DRY_RUN === 'true'
}

function pool(): Pool {
  if (globalForLeads.portalsLeadPool) return globalForLeads.portalsLeadPool
  const connectionString = process.env.LEADS_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'LEADS_DATABASE_URL is required. Set LEADS_DRY_RUN=true explicitly for local preview.',
    )
  }
  globalForLeads.portalsLeadPool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  return globalForLeads.portalsLeadPool
}

/** Shared database handle for app-owned identity and CRM projection tables. */
export function leadPool(): Pool {
  return pool()
}

function memory() {
  globalForLeads.portalsLeadMemory ||= {
    profiles: new Map(),
    tokens: new Map(),
    submissions: new Map(),
    pilots: new Map(),
    submissionPilots: new Map(),
    outbox: new Map(),
  }
  return globalForLeads.portalsLeadMemory
}

export type StoredPilot = {
  id: string
  profileId: string
  customerAccountId?: string
  initialSubmissionId: string
  state: PilotState
  route: PilotRoute
  answers: Record<string, unknown>
  exceptions: ExceptionItem[]
  unresolved: UnresolvedItem[]
  proposal: CommercialSnapshot | null
  successCriteria: SuccessCriterion[]
  securityDecisions: SecurityDecision[]
  reviewers: Reviewer[]
  version: number
  draft?: PilotCollaborativeDraft
  revisions: PilotCommittedRevision[]
  history: PilotHistoryEntry[]
  signing: Record<string, unknown>
  payment: Record<string, unknown>
  kickoff: Record<string, unknown>
  resolvedStartDate: string | null
  createdAt: string
  updatedAt: string
}

export type CreatePilotInput = {
  profileId: string
  initialSubmissionId: string
  answers: Record<string, unknown>
  route: PilotRoute
  state: PilotState
  exceptions: ExceptionItem[]
  unresolved: UnresolvedItem[]
  successCriteria: SuccessCriterion[]
  securityDecisions: SecurityDecision[]
}

export type PilotPatch = {
  state?: PilotState
  action?: PilotAction
  route?: PilotRoute
  answers?: Record<string, unknown>
  exceptions?: ExceptionItem[]
  unresolved?: UnresolvedItem[]
  proposal?: CommercialSnapshot | null
  successCriteria?: SuccessCriterion[]
  securityDecisions?: SecurityDecision[]
  reviewers?: Reviewer[]
  version?: number
  draft?: PilotCollaborativeDraft
  revisions?: PilotCommittedRevision[]
  signing?: Record<string, unknown>
  payment?: Record<string, unknown>
  kickoff?: Record<string, unknown>
  resolvedStartDate?: string | null
  historyNote?: string
  by?: string
}

type PilotRow = {
  id: string
  profile_id: string
  customer_account_id: string | null
  initial_submission_id: string | null
  state: PilotState
  route: PilotRoute
  answers_ciphertext: string
  exceptions: ExceptionItem[]
  unresolved: UnresolvedItem[]
  proposal: CommercialSnapshot | null
  success_criteria: SuccessCriterion[]
  security_decisions: SecurityDecision[]
  reviewers: Reviewer[]
  version: number
  draft: PilotCollaborativeDraft | null
  revisions: PilotCommittedRevision[] | null
  history: PilotHistoryEntry[]
  signing: Record<string, unknown>
  payment: Record<string, unknown>
  kickoff: Record<string, unknown>
  resolved_start_date: string | null
  created_at: Date | string
  updated_at: Date | string
}

function pilotFromRow(row: PilotRow): StoredPilot {
  const currentTerms: PilotMutableTerms = {
    startDate: row.resolved_start_date,
    valueConfirmed: Boolean(row.proposal?.valueModel?.confirmed),
    criteria: row.success_criteria,
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    customerAccountId: row.customer_account_id || undefined,
    initialSubmissionId: row.initial_submission_id || '',
    state: row.state,
    route: row.route,
    answers: decryptJson<Record<string, unknown>>(row.answers_ciphertext),
    exceptions: row.exceptions,
    unresolved: row.unresolved,
    proposal: row.proposal,
    successCriteria: row.success_criteria,
    securityDecisions: row.security_decisions,
    reviewers: row.reviewers,
    version: row.version,
    draft: row.draft || createPilotDraft({
      terms: currentTerms,
      baseVersion: row.version,
    }),
    revisions: row.revisions || [
      {
        pilotId: row.id,
        version: row.version,
        baseVersion: Math.max(0, row.version - 1),
        committedAt: new Date(row.updated_at).toISOString(),
        terms: currentTerms,
        changes: [],
      },
    ],
    history: row.history,
    signing: row.signing,
    payment: row.payment,
    kickoff: row.kickoff,
    resolvedStartDate: row.resolved_start_date,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function createPilotRecord(input: CreatePilotInput): Promise<StoredPilot> {
  const now = new Date().toISOString()
  const reviewers: Reviewer[] = recommendedReviewers(
    input.answers as Parameters<typeof recommendedReviewers>[0],
  ).map((row) => ({
    id: randomUUID(),
    role: row.role,
    name: row.name,
    email: row.email,
    status: 'proposed',
    versionSeen: 1,
    notes: [],
  }))
  const pilot: StoredPilot = {
    id: randomUUID(),
    profileId: input.profileId,
    initialSubmissionId: input.initialSubmissionId,
    state: input.state,
    route: input.route,
    answers: input.answers,
    exceptions: input.exceptions,
    unresolved: input.unresolved,
    proposal: null,
    successCriteria: input.successCriteria,
    securityDecisions: input.securityDecisions,
    reviewers,
    version: 1,
    draft: createPilotDraft({
      terms: {
        startDate: null,
        valueConfirmed: false,
        criteria: input.successCriteria,
      },
      baseVersion: 1,
    }),
    revisions: [
      {
        pilotId: '',
        version: 1,
        baseVersion: 0,
        committedAt: now,
        terms: {
          startDate: null,
          valueConfirmed: false,
          criteria: input.successCriteria,
        },
        changes: [],
      },
    ],
    history: [{at: now, action: 'created', state: input.state}],
    signing: {},
    payment: {},
    kickoff: {},
    resolvedStartDate: null,
    createdAt: now,
    updatedAt: now,
  }
  pilot.revisions = pilot.revisions.map((revision) => ({
    ...revision,
    pilotId: pilot.id,
  }))
  if (leadsDryRun()) {
    memory().pilots.set(pilot.id, pilot)
    memory().submissionPilots.set(input.initialSubmissionId, pilot.id)
    return pilot
  }
  await pool().query(
    `INSERT INTO lead_pilots(
      id, profile_id, initial_submission_id, state, route, answers_ciphertext,
      exceptions, unresolved, success_criteria, security_decisions, reviewers,
      version, draft, revisions, history
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      pilot.id,
      pilot.profileId,
      pilot.initialSubmissionId,
      pilot.state,
      pilot.route,
      encryptJson(pilot.answers),
      JSON.stringify(pilot.exceptions),
      JSON.stringify(pilot.unresolved),
      JSON.stringify(pilot.successCriteria),
      JSON.stringify(pilot.securityDecisions),
      JSON.stringify(pilot.reviewers),
      pilot.version,
      JSON.stringify(pilot.draft),
      JSON.stringify(pilot.revisions),
      JSON.stringify(pilot.history),
    ],
  )
  return pilot
}

export async function attachSubmissionToPilot(
  submissionId: string,
  pilotId: string,
): Promise<void> {
  if (leadsDryRun()) {
    memory().submissionPilots.set(submissionId, pilotId)
    return
  }
  await pool().query(
    'UPDATE lead_submissions SET pilot_id = $2 WHERE id = $1',
    [submissionId, pilotId],
  )
}

export async function getPilotById(id: string): Promise<StoredPilot | null> {
  if (leadsDryRun()) return memory().pilots.get(id) || null
  const result = await pool().query<PilotRow>('SELECT * FROM lead_pilots WHERE id = $1', [id])
  return result.rows[0] ? pilotFromRow(result.rows[0]) : null
}

export async function getPilotBySubmissionId(
  submissionId: string,
): Promise<StoredPilot | null> {
  if (leadsDryRun()) {
    const pilotId = memory().submissionPilots.get(submissionId)
    return pilotId ? memory().pilots.get(pilotId) || null : null
  }
  const result = await pool().query<{pilot_id: string | null}>(
    'SELECT pilot_id FROM lead_submissions WHERE id = $1',
    [submissionId],
  )
  return result.rows[0]?.pilot_id ? getPilotById(result.rows[0].pilot_id) : null
}

export async function latestPilotByProfile(profileId: string): Promise<StoredPilot | null> {
  if (leadsDryRun()) {
    const pilots = [...memory().pilots.values()]
      .filter((pilot) => pilot.profileId === profileId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return pilots[0] || null
  }
  const result = await pool().query<PilotRow>(
    `SELECT * FROM lead_pilots WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [profileId],
  )
  return result.rows[0] ? pilotFromRow(result.rows[0]) : null
}

export async function getPilotByPaymentSession(
  sessionId: string,
): Promise<StoredPilot | null> {
  if (leadsDryRun()) {
    const pilot = [...memory().pilots.values()].find(
      (candidate) => candidate.payment?.sessionId === sessionId,
    )
    return pilot || null
  }
  const result = await pool().query<PilotRow>(
    `SELECT * FROM lead_pilots WHERE payment ->> 'sessionId' = $1 LIMIT 1`,
    [sessionId],
  )
  return result.rows[0] ? pilotFromRow(result.rows[0]) : null
}

export async function updatePilot(id: string, patch: PilotPatch): Promise<StoredPilot> {
  const existing = await getPilotById(id)
  if (!existing) throw new Error('Pilot record not found.')
  const state = patch.state || existing.state
  const history = [...existing.history]
  if (patch.state || patch.historyNote) {
    history.push({
      at: new Date().toISOString(),
      action: patch.action || (patch.state ? 'system' : 'revised'),
      state,
      note: patch.historyNote,
      by: patch.by,
    })
  }
  const updated: StoredPilot = {
    ...existing,
    state,
    route: patch.route || existing.route,
    answers: patch.answers || existing.answers,
    exceptions: patch.exceptions || existing.exceptions,
    unresolved: patch.unresolved || existing.unresolved,
    proposal: patch.proposal !== undefined ? patch.proposal : existing.proposal,
    successCriteria: patch.successCriteria || existing.successCriteria,
    securityDecisions: patch.securityDecisions || existing.securityDecisions,
    reviewers: patch.reviewers || existing.reviewers,
    version: patch.version !== undefined ? patch.version : existing.version,
    draft: patch.draft !== undefined ? patch.draft : existing.draft,
    revisions: patch.revisions || existing.revisions,
    signing: patch.signing || existing.signing,
    payment: patch.payment || existing.payment,
    kickoff: patch.kickoff || existing.kickoff,
    resolvedStartDate:
      patch.resolvedStartDate !== undefined
        ? patch.resolvedStartDate
        : existing.resolvedStartDate,
    history,
    updatedAt: new Date().toISOString(),
  }
  if (leadsDryRun()) {
    memory().pilots.set(updated.id, updated)
    return updated
  }
  await pool().query(
    `UPDATE lead_pilots
        SET state = $2, route = $3, answers_ciphertext = $4, exceptions = $5,
            unresolved = $6, proposal = $7, success_criteria = $8,
            security_decisions = $9, reviewers = $10, version = $11,
            draft = $12, revisions = $13, signing = $14, payment = $15,
            kickoff = $16, resolved_start_date = $17, history = $18,
            updated_at = now()
      WHERE id = $1`,
    [
      updated.id,
      updated.state,
      updated.route,
      encryptJson(updated.answers),
      JSON.stringify(updated.exceptions),
      JSON.stringify(updated.unresolved),
      JSON.stringify(updated.proposal),
      JSON.stringify(updated.successCriteria),
      JSON.stringify(updated.securityDecisions),
      JSON.stringify(updated.reviewers),
      updated.version,
      JSON.stringify(updated.draft || null),
      JSON.stringify(updated.revisions),
      JSON.stringify(updated.signing),
      JSON.stringify(updated.payment),
      JSON.stringify(updated.kickoff),
      updated.resolvedStartDate,
      JSON.stringify(updated.history),
    ],
  )
  return updated
}

export async function latestSubmissionIdForPilot(pilotId: string): Promise<string | null> {
  if (leadsDryRun()) {
    const entries = [...memory().submissionPilots.entries()].filter(
      ([, candidate]) => candidate === pilotId,
    )
    return entries.length ? entries[entries.length - 1][0] : null
  }
  const result = await pool().query<{id: string}>(
    `SELECT id FROM lead_submissions WHERE pilot_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [pilotId],
  )
  return result.rows[0]?.id || null
}

export async function enqueuePilotEmail(
  pilotId: string,
  variant: string,
  recipient?: string,
  eventKey?: string,
): Promise<void> {
  const submissionId = await latestSubmissionIdForPilot(pilotId)
  if (!submissionId) throw new Error('Pilot has no submission to attach the email to.')
  const eventSuffix = eventKey ? `:event:${eventKey}` : ''
  const actionKey = `${pilotId}:pilot_email:${variant}:${(recipient || '').toLowerCase()}${eventSuffix}`
  if (leadsDryRun()) {
    if (memory().outbox.has(actionKey)) return
    memory().outbox.set(actionKey, {
      id: actionKey,
      submission_id: submissionId,
      action_type: 'pilot_email',
      action_key: actionKey,
      attempts: 0,
      status: 'pending',
      last_error: null,
      due_at: Date.now(),
    })
    return
  }
  await pool().query(
    `INSERT INTO lead_outbox(submission_id, action_type, action_key)
     VALUES ($1,'pilot_email',$2) ON CONFLICT(action_key) DO NOTHING`,
    [submissionId, actionKey],
  )
}

type QualificationColumns = {
  qualification_ciphertext: string | null
  qualification_scores: QualificationScores | null
  qualification_tier: QualificationTier | null
  qualification_workflow: string | null
  qualification_updated_at: Date | string | null
}

function qualificationFromColumns(
  row: QualificationColumns,
): StoredQualification | undefined {
  if (
    !row.qualification_ciphertext ||
    !row.qualification_scores ||
    !row.qualification_tier
  ) {
    return undefined
  }
  return {
    answers: decryptJson<Record<string, unknown>>(row.qualification_ciphertext),
    scores: row.qualification_scores,
    tier: row.qualification_tier,
    recommendedWorkflow: row.qualification_workflow || 'asset-reproduction',
    updatedAt: row.qualification_updated_at
      ? new Date(row.qualification_updated_at).toISOString()
      : new Date(0).toISOString(),
  }
}

function mergeIdentity(
  current: LeadIdentity,
  incoming?: LeadIdentity,
): LeadIdentity {
  if (!incoming) return current
  return {
    name: incoming.name || current.name,
    email: incoming.email || current.email,
    company: incoming.company || current.company,
    role: incoming.role || current.role,
    website: incoming.website || current.website || '',
  }
}

function identitiesCanShareProfile(
  current: LeadIdentity | undefined,
  incoming: LeadIdentity | undefined,
): boolean {
  if (!current?.email || !incoming?.email) return true
  return normalizeEmail(current.email) === normalizeEmail(incoming.email)
}

function nonDirectAttribution(
  current: LeadAttribution,
  incoming: LeadAttribution,
): LeadAttribution {
  if (incoming.utmSource || incoming.utmCampaign) return incoming
  return {
    ...current,
    sourcePage: incoming.sourcePage,
    ctaLabel: incoming.ctaLabel,
    intent: incoming.intent,
    useCase: incoming.useCase || current.useCase,
    referrer: incoming.referrer || current.referrer,
  }
}

async function profileFromToken(
  token: string | undefined,
  client?: PoolClient,
): Promise<StoredProfile | null> {
  if (!token) return null
  if (leadsDryRun()) {
    const id = memory().tokens.get(hashValue(token))
    return id ? memory().profiles.get(id) || null : null
  }

  const executor = client || pool()
  const result = await executor.query<{
    id: string
    identity_ciphertext: string
    identity_verified: boolean
    analytics_person_id: string
    company_domain: string | null
    first_touch: LeadAttribution
    last_touch: LeadAttribution
    marketing_consent: boolean
    marketing_suppressed: boolean
    analytics_consent: boolean
  } & QualificationColumns>(
    `SELECT p.id, p.identity_ciphertext, p.identity_verified,
            p.analytics_person_id, p.company_domain, p.first_touch,
            p.last_touch, p.marketing_consent, p.analytics_consent,
            p.marketing_suppressed, p.qualification_ciphertext,
            p.qualification_scores, p.qualification_tier,
            p.qualification_workflow, p.qualification_updated_at
       FROM lead_profile_tokens t
       JOIN lead_profiles p ON p.id = t.profile_id
      WHERE t.token_hash = $1 AND t.expires_at > now()`,
    [hashValue(token)],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    identity: decryptJson<LeadIdentity>(row.identity_ciphertext),
    identityVerified: row.identity_verified,
    analyticsPersonId: row.analytics_person_id,
    companyDomain: row.company_domain || '',
    firstTouch: row.first_touch,
    lastTouch: row.last_touch,
    marketingConsent: row.marketing_consent,
    marketingSuppressed: row.marketing_suppressed,
    analyticsConsent: row.analytics_consent,
    qualification: qualificationFromColumns(row),
  }
}

export async function getProfileByToken(
  token: string | undefined,
): Promise<StoredProfile | null> {
  return profileFromToken(token)
}

export async function getProfileByEmail(
  email: string | undefined,
): Promise<StoredProfile | null> {
  if (!email) return null
  if (leadsDryRun()) {
    const normalized = normalizeEmail(email)
    return (
      [...memory().profiles.values()].find(
        (profile) =>
          profile.identity.email &&
          normalizeEmail(profile.identity.email) === normalized,
      ) || null
    )
  }
  const result = await pool().query<{id: string}>(
    'SELECT id FROM lead_profiles WHERE email_hash = $1',
    [hashValue(normalizeEmail(email))],
  )
  return result.rows[0]?.id ? getProfileById(result.rows[0].id) : null
}

async function issueProfileToken(
  profileId: string,
  client?: PoolClient,
): Promise<string> {
  const token = randomToken()
  const tokenHash = hashValue(token)
  if (leadsDryRun()) {
    memory().tokens.set(tokenHash, profileId)
    return token
  }
  const executor = client || pool()
  await executor.query(
    `INSERT INTO lead_profile_tokens(token_hash, profile_id, expires_at)
     VALUES ($1, $2, now() + interval '90 days')`,
    [tokenHash, profileId],
  )
  return token
}

async function findProfileByEmail(
  identity: LeadIdentity | undefined,
  client: PoolClient,
): Promise<StoredProfile | null> {
  if (!identity?.email) return null
  const result = await client.query<{id: string}>(
    'SELECT id FROM lead_profiles WHERE email_hash = $1',
    [hashValue(normalizeEmail(identity.email))],
  )
  const id = result.rows[0]?.id
  if (!id) return null
  const tokenResult = await client.query<{
    identity_ciphertext: string
    identity_verified: boolean
    analytics_person_id: string
    company_domain: string | null
    first_touch: LeadAttribution
    last_touch: LeadAttribution
    marketing_consent: boolean
    marketing_suppressed: boolean
    analytics_consent: boolean
  } & QualificationColumns>(
    `SELECT identity_ciphertext, identity_verified, analytics_person_id,
            company_domain, first_touch, last_touch, marketing_consent,
            marketing_suppressed, analytics_consent,
            qualification_ciphertext, qualification_scores,
            qualification_tier, qualification_workflow,
            qualification_updated_at
       FROM lead_profiles WHERE id = $1`,
    [id],
  )
  const row = tokenResult.rows[0]
  return {
    id,
    identity: decryptJson<LeadIdentity>(row.identity_ciphertext),
    identityVerified: row.identity_verified,
    analyticsPersonId: row.analytics_person_id,
    companyDomain: row.company_domain || '',
    firstTouch: row.first_touch,
    lastTouch: row.last_touch,
    marketingConsent: row.marketing_consent,
    marketingSuppressed: row.marketing_suppressed,
    analyticsConsent: row.analytics_consent,
    qualification: qualificationFromColumns(row),
  }
}

async function upsertProfile(
  input: PersistInput,
  client?: PoolClient,
): Promise<{profile: StoredProfile; token?: string}> {
  if (leadsDryRun()) {
    const tokenProfile = input.currentProfileToken
      ? await profileFromToken(input.currentProfileToken)
      : null
    let profile = identitiesCanShareProfile(tokenProfile?.identity, input.identity)
      ? tokenProfile
      : null
    if (!profile && input.identity.email) {
      const emailHash = hashValue(normalizeEmail(input.identity.email))
      profile = [...memory().profiles.values()].find(
        (candidate) =>
          candidate.identity.email &&
          hashValue(normalizeEmail(candidate.identity.email)) === emailHash,
      ) || null
    }
    const tokenNeeded =
      !profile || !input.currentProfileToken || tokenProfile?.id !== profile.id
    profile ||= {
      id: randomUUID(),
      identity: input.identity,
      identityVerified: input.verified,
      analyticsPersonId: randomUUID(),
      companyDomain: companyDomain(input.identity),
      firstTouch: input.request.attribution,
      lastTouch: input.request.attribution,
      marketingConsent: input.request.consent.marketing,
      marketingSuppressed: false,
      analyticsConsent: input.request.consent.analytics,
    }
    profile.identity = mergeIdentity(profile.identity, input.identity)
    profile.identityVerified ||= input.verified
    profile.companyDomain ||= companyDomain(profile.identity)
    profile.lastTouch = nonDirectAttribution(
      profile.lastTouch,
      input.request.attribution,
    )
    profile.marketingConsent =
      !profile.marketingSuppressed &&
      (profile.marketingConsent || input.request.consent.marketing)
    profile.analyticsConsent = input.request.consent.analytics
    memory().profiles.set(profile.id, profile)
    return {
      profile,
      token: tokenNeeded ? await issueProfileToken(profile.id) : undefined,
    }
  }

  if (!client) throw new Error('A database transaction is required.')
  const tokenProfile = await profileFromToken(input.currentProfileToken, client)
  let profile = identitiesCanShareProfile(tokenProfile?.identity, input.identity)
    ? tokenProfile
    : null
  profile ||= await findProfileByEmail(input.identity, client)
  const tokenNeeded =
    !profile || !input.currentProfileToken || tokenProfile?.id !== profile.id

  if (!profile) {
    profile = {
      id: randomUUID(),
      identity: input.identity,
      identityVerified: input.verified,
      analyticsPersonId: randomUUID(),
      companyDomain: companyDomain(input.identity),
      firstTouch: input.request.attribution,
      lastTouch: input.request.attribution,
      marketingConsent: input.request.consent.marketing,
      marketingSuppressed: false,
      analyticsConsent: input.request.consent.analytics,
    }
    await client.query(
      `INSERT INTO lead_profiles(
        id, email_hash, identity_ciphertext, identity_verified,
        analytics_person_id, company_domain, first_touch, last_touch,
        marketing_consent, marketing_suppressed, analytics_consent,
        consent_version, consent_source, consent_recorded_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,now())`,
      [
        profile.id,
        profile.identity.email
          ? hashValue(normalizeEmail(profile.identity.email))
          : null,
        encryptJson(profile.identity),
        profile.identityVerified,
        profile.analyticsPersonId,
        profile.companyDomain || null,
        JSON.stringify(profile.firstTouch),
        JSON.stringify(profile.lastTouch),
        profile.marketingConsent,
        profile.analyticsConsent,
        input.request.consent.disclosureVersion,
        input.request.attribution.sourcePage,
      ],
    )
  } else {
    profile.identity = mergeIdentity(profile.identity, input.identity)
    profile.identityVerified ||= input.verified
    profile.companyDomain ||= companyDomain(profile.identity)
    profile.lastTouch = nonDirectAttribution(
      profile.lastTouch,
      input.request.attribution,
    )
    profile.marketingConsent =
      !profile.marketingSuppressed &&
      (profile.marketingConsent || input.request.consent.marketing)
    profile.analyticsConsent = input.request.consent.analytics
    await client.query(
      `UPDATE lead_profiles
          SET email_hash = COALESCE(email_hash, $2),
              identity_ciphertext = $3,
              identity_verified = $4,
              company_domain = COALESCE(company_domain, $5),
              last_touch = $6,
              marketing_consent = CASE WHEN marketing_suppressed THEN false ELSE $7 END,
              analytics_consent = $8,
              consent_version = $9,
              consent_source = $10,
              consent_recorded_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [
        profile.id,
        profile.identity.email
          ? hashValue(normalizeEmail(profile.identity.email))
          : null,
        encryptJson(profile.identity),
        profile.identityVerified,
        profile.companyDomain || null,
        JSON.stringify(profile.lastTouch),
        profile.marketingConsent,
        profile.analyticsConsent,
        input.request.consent.disclosureVersion,
        input.request.attribution.sourcePage,
      ],
    )
  }

  return {
    profile,
    token: tokenNeeded ? await issueProfileToken(profile.id, client) : undefined,
  }
}

async function persistQualification(
  profile: StoredProfile,
  input: PersistInput,
  client?: PoolClient,
): Promise<void> {
  if (!input.verified || !input.qualificationAnswers || !input.scores || !input.tier) {
    return
  }
  const qualification: StoredQualification = {
    answers: input.qualificationAnswers,
    scores: input.scores,
    tier: input.tier,
    recommendedWorkflow:
      input.response.recommendedWorkflow || 'asset-reproduction',
    updatedAt: new Date().toISOString(),
  }
  profile.qualification = qualification
  if (leadsDryRun()) {
    memory().profiles.set(profile.id, profile)
    return
  }
  if (!client) throw new Error('A database transaction is required.')
  await client.query(
    `UPDATE lead_profiles
        SET qualification_ciphertext = $2,
            qualification_scores = $3,
            qualification_tier = $4,
            qualification_workflow = $5,
            qualification_updated_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [
      profile.id,
      encryptJson(input.qualificationAnswers),
      input.scores,
      input.tier,
      qualification.recommendedWorkflow,
    ],
  )
}

export function outboxActions(
  request: LeadRequest,
  tier?: QualificationTier,
): string[] {
  if (request.submissionType === 'commercial_event') {
    return request.consent.analytics ? ['analytics'] : []
  }
  const actions = ['apollo_sync']
  if (request.submissionType === 'pilot_request') actions.push('account_invitation')
  if (request.consent.analytics) actions.push('analytics')
  if (!['assessment', 'pilot_request'].includes(request.submissionType)) {
    actions.push('confirmation_email')
  }
  if (
    [
      'pilot_request',
      'pilot_brief_download',
      'workflow_review',
      'contact',
      'security_download',
    ].includes(request.submissionType)
    || (
      ['assessment', 'commercial_readiness'].includes(request.submissionType) &&
      (tier === 'medium' || tier === 'high')
    )
  ) {
    actions.push('founder_notification')
  }
  return actions
}

export async function persistSubmission(input: PersistInput): Promise<PersistResult> {
  if (leadsDryRun()) {
    const existing = memory().submissions.get(input.request.idempotencyKey)
    if (existing) {
      return {
        submission: existing,
        profileToken: undefined,
        created: false,
      }
    }
    const {profile, token} = await upsertProfile(input)
    await persistQualification(profile, input)
    const submission: StoredSubmission = {
      id: randomUUID(),
      request: input.request,
      identity: profile.identity,
      profile,
      scores: input.scores,
      tier: input.tier,
      response: input.response,
      verified: input.verified,
    }
    memory().submissions.set(input.request.idempotencyKey, submission)
    return {submission, profileToken: token, created: true}
  }

  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query<{
      id: string
      verified: boolean
      result: LeadResponse
      payload_ciphertext: string
      profile_id: string
      scores: QualificationScores | null
      qualification_tier: QualificationTier | null
    }>(
      'SELECT * FROM lead_submissions WHERE idempotency_key = $1 FOR UPDATE',
      [input.request.idempotencyKey],
    )

    if (existing.rows[0]) {
      const row = existing.rows[0]
      const stored = decryptJson<{request: LeadRequest; identity: LeadIdentity}>(
        row.payload_ciphertext,
      )
      const profile = await getProfileById(row.profile_id)
      await client.query('COMMIT')
      return {
        submission: {
          id: row.id,
          request: stored.request,
          identity: stored.identity,
          profile,
          scores: row.scores || undefined,
          tier: row.qualification_tier || undefined,
          response: row.result,
          verified: row.verified,
        },
        created: false,
      }
    }

    const {profile, token} = await upsertProfile(input, client)
    await persistQualification(profile, input, client)
    const id = randomUUID()
    await client.query(
      `INSERT INTO lead_submissions(
        id, idempotency_key, submission_type, provider, form_version,
        profile_id, company_domain, payload_ciphertext, scores,
        qualification_tier, recommended_workflow, qualifying_submission_id,
        verified, process_status, result, verified_at, payload_delete_after,
        what_brought_you_here, what_brought_you_here_other, how_did_you_hear_about_portals
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                CASE WHEN $13 THEN now() ELSE NULL END,
                now() + interval '30 days', $16, $17, $18)`,
      [
        id,
        input.request.idempotencyKey,
        input.request.submissionType,
        input.request.provider,
        input.request.formVersion,
        profile.id,
        profile.companyDomain || null,
        encryptJson({request: input.request, identity: profile.identity}),
        input.scores ? JSON.stringify(input.scores) : null,
        input.tier || null,
        input.response.recommendedWorkflow || null,
        input.tier === 'high' ? id : null,
        input.verified,
        input.verified ? 'pending' : 'unverified',
        JSON.stringify(input.response),
        input.request.whatBroughtYouHere || null,
        input.request.whatBroughtYouHereOther || null,
        input.request.howDidYouHearAboutPortals || null,
      ],
    )

    if (input.verified) {
      const actions = outboxActions(input.request, input.tier)
      for (const action of actions) {
        const actionKey =
          action === 'founder_notification' &&
          ['assessment', 'commercial_readiness'].includes(input.request.submissionType) &&
          input.tier &&
          input.scores
            ? `${profile.id}:${input.scores.version}:${input.tier}:${action}`
            : `${input.request.idempotencyKey}:${action}`
        await client.query(
          `INSERT INTO lead_outbox(submission_id, action_type, action_key)
           VALUES ($1,$2,$3) ON CONFLICT(action_key) DO NOTHING`,
          [id, action, actionKey],
        )
      }
      if (actions.length === 0) {
        await client.query(
          `UPDATE lead_submissions SET process_status = 'complete',
            synced_at = now(), updated_at = now() WHERE id = $1`,
          [id],
        )
      }
    }
    await client.query('COMMIT')
    return {
      submission: {
        id,
        request: input.request,
        identity: profile.identity,
        profile,
        scores: input.scores,
        tier: input.tier,
        response: input.response,
        verified: input.verified,
      },
      profileToken: token,
      created: true,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getProfileById(id: string): Promise<StoredProfile> {
  if (leadsDryRun()) {
    const profile = memory().profiles.get(id)
    if (!profile) throw new Error('Lead profile is missing.')
    return profile
  }
  const result = await pool().query<{
    identity_ciphertext: string
    identity_verified: boolean
    analytics_person_id: string
    company_domain: string | null
    first_touch: LeadAttribution
    last_touch: LeadAttribution
    marketing_consent: boolean
    marketing_suppressed: boolean
    analytics_consent: boolean
  } & QualificationColumns>('SELECT * FROM lead_profiles WHERE id = $1', [id])
  const row = result.rows[0]
  if (!row) throw new Error('Lead profile is missing.')
  return {
    id,
    identity: decryptJson<LeadIdentity>(row.identity_ciphertext),
    identityVerified: row.identity_verified,
    analyticsPersonId: row.analytics_person_id,
    companyDomain: row.company_domain || '',
    firstTouch: row.first_touch,
    lastTouch: row.last_touch,
    marketingConsent: row.marketing_consent,
    marketingSuppressed: row.marketing_suppressed,
    analyticsConsent: row.analytics_consent,
    qualification: qualificationFromColumns(row),
  }
}

export async function latestQualificationAnswers(
  profileId: string,
): Promise<Record<string, unknown>> {
  const profile = await getProfileById(profileId)
  if (profile.qualification) return profile.qualification.answers
  if (leadsDryRun()) {
    return [...memory().submissions.values()]
      .filter(
        (submission) =>
          submission.profile.id === profileId &&
          submission.verified &&
          ['assessment', 'workflow_review'].includes(
            submission.request.submissionType,
          ),
      )
      .reduce((answers, submission) => {
        const merged = {...answers, ...submission.request.answers} as Record<string, unknown>
        if (submission.request.whatBroughtYouHere) {
          merged.whatBroughtYouHere = submission.request.whatBroughtYouHere
        }
        if (submission.request.whatBroughtYouHereOther) {
          merged.whatBroughtYouHereOther = submission.request.whatBroughtYouHereOther
        }
        if (submission.request.howDidYouHearAboutPortals) {
          merged.howDidYouHearAboutPortals = submission.request.howDidYouHearAboutPortals
        }
        return merged
      }, {} as Record<string, unknown>)
  }
  const result = await pool().query<{
    payload_ciphertext: string
    what_brought_you_here: string | null
    what_brought_you_here_other: string | null
    how_did_you_hear_about_portals: string | null
  }>(
    `SELECT payload_ciphertext, what_brought_you_here, what_brought_you_here_other, how_did_you_hear_about_portals
      FROM lead_submissions
      WHERE profile_id = $1 AND verified = true
        AND submission_type IN ('assessment', 'workflow_review')
        AND (payload_delete_after >= now() OR synced_at IS NULL)
      ORDER BY created_at ASC`,
    [profileId],
  )
  return result.rows.reduce<Record<string, unknown>>((answers, row) => {
    const payload = decryptJson<{request: LeadRequest}>(row.payload_ciphertext)
    const merged = {...answers, ...payload.request.answers} as Record<string, unknown>
    if (row.what_brought_you_here) {
      merged.whatBroughtYouHere = row.what_brought_you_here
    }
    if (row.what_brought_you_here_other) {
      merged.whatBroughtYouHereOther = row.what_brought_you_here_other
    }
    if (row.how_did_you_hear_about_portals) {
      merged.howDidYouHearAboutPortals = row.how_did_you_hear_about_portals
    }
    return merged
  }, {} as Record<string, unknown>)
}

export async function getQualificationSnapshot(
  profileId: string,
): Promise<StoredQualification | null> {
  const profile = await getProfileById(profileId)
  return profile.qualification || null
}

export async function takeDueOutbox(limit = 20): Promise<OutboxRow[]> {
  if (leadsDryRun()) {
    const now = Date.now()
    return [...memory().outbox.values()]
      .filter(
        (row) =>
          row.status === 'pending' ||
          (row.status === 'retry' && row.due_at <= now),
      )
      .slice(0, limit)
      .map(({id, submission_id, action_type, action_key, attempts}) => ({
        id,
        submission_id,
        action_type,
        action_key,
        attempts,
      }))
  }
  const result = await pool().query<OutboxRow>(
    `UPDATE lead_outbox
        SET status = 'processing', updated_at = now()
      WHERE id IN (
        SELECT id FROM lead_outbox
         WHERE (
           status IN ('pending', 'retry') AND next_attempt_at <= now()
         ) OR (
           status = 'processing' AND updated_at <= now() - interval '10 minutes'
         )
         ORDER BY
           CASE WHEN action_type IN ('confirmation_email', 'pilot_email', 'founder_notification') THEN 0 ELSE 1 END,
           created_at ASC
         FOR UPDATE SKIP LOCKED LIMIT $1
      )
      RETURNING id::text, submission_id, action_type, action_key, attempts`,
    [limit],
  )
  return result.rows
}

export async function getSubmission(id: string): Promise<StoredSubmission> {
  if (leadsDryRun()) {
    const submission = [...memory().submissions.values()].find((item) => item.id === id)
    if (!submission) throw new Error('Submission not found.')
    return submission
  }
  const result = await pool().query<{
    payload_ciphertext: string
    profile_id: string
    scores: QualificationScores | null
    qualification_tier: QualificationTier | null
    result: LeadResponse
    verified: boolean
  }>('SELECT * FROM lead_submissions WHERE id = $1', [id])
  const row = result.rows[0]
  if (!row) throw new Error('Submission not found.')
  const payload = decryptJson<{request: LeadRequest; identity: LeadIdentity}>(
    row.payload_ciphertext,
  )
  return {
    id,
    request: payload.request,
    identity: payload.identity,
    profile: await getProfileById(row.profile_id),
    scores: row.scores || undefined,
    tier: row.qualification_tier || undefined,
    response: row.result,
    verified: row.verified,
  }
}

export async function companyScoreContext(domain: string): Promise<{
  fit?: number
  pain?: number
  intent?: number
}> {
  if (!domain) return {}
  if (leadsDryRun()) {
    const now = Date.now()
    const submissions = [...memory().submissions.values()].filter(
      (submission) =>
        submission.verified &&
        submission.profile.companyDomain === domain &&
        submission.scores,
    )
    const maximum = (
      dimension: 'fit' | 'pain' | 'intent',
      ageDays: number,
    ) =>
      submissions
        .filter(() => now - now <= ageDays * 86_400_000)
        .reduce<number | undefined>((current, submission) => {
          const value = submission.scores?.[dimension].normalized
          return value === undefined ? current : Math.max(current ?? 0, value)
        }, undefined)
    return {fit: maximum('fit', 365), pain: maximum('pain', 180), intent: maximum('intent', 90)}
  }

  const result = await pool().query<{
    fit: number | null
    pain: number | null
    intent: number | null
  }>(
    `SELECT
       MAX((scores->'fit'->>'normalized')::int)
         FILTER (WHERE created_at >= now() - interval '12 months') AS fit,
       MAX((scores->'pain'->>'normalized')::int)
         FILTER (WHERE created_at >= now() - interval '180 days') AS pain,
       MAX((scores->'intent'->>'normalized')::int)
         FILTER (WHERE created_at >= now() - interval '90 days') AS intent
     FROM lead_submissions
     WHERE company_domain = $1 AND verified = true AND scores IS NOT NULL`,
    [domain],
  )
  const row = result.rows[0]
  return {
    fit: row?.fit ?? undefined,
    pain: row?.pain ?? undefined,
    intent: row?.intent ?? undefined,
  }
}

export async function markSubmissionSynced(id: string): Promise<void> {
  if (leadsDryRun()) return
  const pending = await pool().query<{count: string}>(
    `SELECT count(*)::text AS count FROM lead_outbox
      WHERE submission_id = $1 AND status <> 'complete'`,
    [id],
  )
  if (Number(pending.rows[0]?.count || 0) === 0) {
    await pool().query(
      `UPDATE lead_submissions SET process_status = 'complete', synced_at = now(),
        updated_at = now() WHERE id = $1`,
      [id],
    )
  }
}

export async function completeOutbox(id: string): Promise<void> {
  if (leadsDryRun()) {
    const row = memory().outbox.get(id)
    if (row) row.status = 'complete'
    return
  }
  await pool().query(
    `UPDATE lead_outbox SET status = 'complete', completed_at = now(),
      updated_at = now() WHERE id = $1`,
    [id],
  )
}

export async function retryOutbox(
  id: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  if (leadsDryRun()) {
    const row = memory().outbox.get(id)
    if (!row) return
    const nextAttempts = attempts + 1
    row.attempts = nextAttempts
    row.last_error = String(error).slice(0, 2000)
    row.status = nextAttempts >= 6 ? 'dead' : 'retry'
    const delayMinutes = Math.min(24 * 60, 5 * 6 ** Math.max(0, attempts))
    row.due_at = Date.now() + delayMinutes * 60_000
    return
  }
  const nextAttempts = attempts + 1
  const dead = nextAttempts >= 6
  const delayMinutes = Math.min(24 * 60, 5 * 6 ** Math.max(0, attempts))
  await pool().query(
    `UPDATE lead_outbox
        SET status = $2, attempts = $3, last_error = $4,
            next_attempt_at = now() + ($5 || ' minutes')::interval,
            updated_at = now()
      WHERE id = $1`,
    [
      id,
      dead ? 'dead' : 'retry',
      nextAttempts,
      String(error).slice(0, 2000),
      String(delayMinutes),
    ],
  )
}

export async function cleanupLeadStore(): Promise<void> {
  if (leadsDryRun()) return
  await pool().query(
    `UPDATE lead_submissions
        SET payload_ciphertext = $1
      WHERE payload_delete_after < now() AND synced_at IS NOT NULL
        AND payload_ciphertext <> $1`,
    [encryptJson({redacted: true})],
  )
  await pool().query('DELETE FROM lead_profile_tokens WHERE expires_at < now()')
  await pool().query('DELETE FROM lead_rate_limits WHERE expires_at < now()')
  await pool().query(
    `DELETE FROM lead_submissions
      WHERE verified = false AND created_at < now() - interval '24 hours'`,
  )
}

export async function consumeRateLimit(key: string, limit = 12): Promise<boolean> {
  if (leadsDryRun()) return true
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / 60_000) * 60_000)
  const result = await pool().query<{request_count: number}>(
    `INSERT INTO lead_rate_limits(rate_key, window_start, expires_at)
     VALUES ($1,$2,$3)
     ON CONFLICT(rate_key, window_start)
     DO UPDATE SET request_count = lead_rate_limits.request_count + 1
     RETURNING request_count`,
    [key, windowStart, new Date(windowStart.getTime() + 10 * 60_000)],
  )
  return (result.rows[0]?.request_count || limit + 1) <= limit
}

// ============================================================================
// BILLING FUNCTIONS (Stripe Integration)
// ============================================================================

export async function createBillingCustomer(
  customer: Omit<BillingCustomer, 'createdAt' | 'updatedAt'>,
): Promise<BillingCustomer> {
  if (leadsDryRun()) {
    return {
      ...customer,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  const result = await pool().query(
    `INSERT INTO billing_customers(id, email, name, metadata, created_at, updated_at)
     VALUES ($1,$2,$3,$4,now(),now())
     ON CONFLICT(id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [customer.id, customer.email || null, customer.name || null, customer.metadata],
  )
  return billingCustomerFromRow(result.rows[0])
}

export async function getBillingCustomer(id: string): Promise<BillingCustomer | null> {
  if (leadsDryRun()) return null
  const result = await pool().query(
    'SELECT * FROM billing_customers WHERE id = $1',
    [id],
  )
  return result.rows.length > 0 ? billingCustomerFromRow(result.rows[0]) : null
}

export async function createBillingSubscription(
  subscription: Omit<BillingSubscription, 'createdAt' | 'updatedAt'>,
): Promise<BillingSubscription> {
  if (leadsDryRun()) {
    return {
      ...subscription,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  const result = await pool().query(
    `INSERT INTO billing_subscriptions(
       id, customer_id, product_type, status, current_period_start,
       current_period_end, cancel_at_period_end, metadata, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      subscription.id,
      subscription.customerId,
      subscription.productType,
      subscription.status,
      subscription.currentPeriodStart || null,
      subscription.currentPeriodEnd || null,
      subscription.cancelAtPeriodEnd,
      subscription.metadata,
    ],
  )
  return billingSubscriptionFromRow(result.rows[0])
}

export async function getBillingSubscription(
  id: string,
): Promise<BillingSubscription | null> {
  if (leadsDryRun()) return null
  const result = await pool().query(
    'SELECT * FROM billing_subscriptions WHERE id = $1',
    [id],
  )
  return result.rows.length > 0 ? billingSubscriptionFromRow(result.rows[0]) : null
}

export async function getBillingSubscriptionsByCustomer(
  customerId: string,
): Promise<BillingSubscription[]> {
  if (leadsDryRun()) return []
  const result = await pool().query(
    'SELECT * FROM billing_subscriptions WHERE customer_id = $1 ORDER BY created_at DESC',
    [customerId],
  )
  return result.rows.map(billingSubscriptionFromRow)
}

export async function createBillingInvoice(
  invoice: Omit<BillingInvoice, 'createdAt' | 'updatedAt'>,
): Promise<BillingInvoice> {
  if (leadsDryRun()) {
    return {
      ...invoice,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  const result = await pool().query(
    `INSERT INTO billing_invoices(
       id, subscription_id, customer_id, status, amount, currency,
       due_date, paid_at, metadata, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       due_date = EXCLUDED.due_date,
       paid_at = EXCLUDED.paid_at,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      invoice.id,
      invoice.subscriptionId || null,
      invoice.customerId,
      invoice.status,
      invoice.amount,
      invoice.currency,
      invoice.dueDate || null,
      invoice.paidAt || null,
      invoice.metadata,
    ],
  )
  return billingInvoiceFromRow(result.rows[0])
}

export async function getBillingInvoice(id: string): Promise<BillingInvoice | null> {
  if (leadsDryRun()) return null
  const result = await pool().query(
    'SELECT * FROM billing_invoices WHERE id = $1',
    [id],
  )
  return result.rows.length > 0 ? billingInvoiceFromRow(result.rows[0]) : null
}

export async function createBillingPayment(
  payment: Omit<BillingPayment, 'createdAt' | 'updatedAt'>,
): Promise<BillingPayment> {
  if (leadsDryRun()) {
    return {
      ...payment,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  const result = await pool().query(
    `INSERT INTO billing_payments(
       id, invoice_id, customer_id, amount, currency, status,
       product_type, metadata, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      payment.id,
      payment.invoiceId || null,
      payment.customerId,
      payment.amount,
      payment.currency,
      payment.status,
      payment.productType || null,
      payment.metadata,
    ],
  )
  return billingPaymentFromRow(result.rows[0])
}

export async function getBillingPayment(id: string): Promise<BillingPayment | null> {
  if (leadsDryRun()) return null
  const result = await pool().query(
    'SELECT * FROM billing_payments WHERE id = $1',
    [id],
  )
  return result.rows.length > 0 ? billingPaymentFromRow(result.rows[0]) : null
}

export async function createBillingCheckoutSession(
  session: Omit<BillingCheckoutSession, 'createdAt' | 'updatedAt'>,
): Promise<BillingCheckoutSession> {
  if (leadsDryRun()) {
    return {
      ...session,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  const result = await pool().query(
    `INSERT INTO billing_checkout_sessions(
       id, customer_id, payment_intent_id, product_type, status,
       metadata, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,now(),now())
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING *`,
    [
      session.id,
      session.customerId || null,
      session.paymentIntentId || null,
      session.productType,
      session.status,
      session.metadata,
    ],
  )
  return billingCheckoutSessionFromRow(result.rows[0])
}

export async function getBillingCheckoutSession(
  id: string,
): Promise<BillingCheckoutSession | null> {
  if (leadsDryRun()) return null
  const result = await pool().query(
    'SELECT * FROM billing_checkout_sessions WHERE id = $1',
    [id],
  )
  return result.rows.length > 0 ? billingCheckoutSessionFromRow(result.rows[0]) : null
}

export async function updateBillingCheckoutSession(
  id: string,
  updates: Partial<Omit<BillingCheckoutSession, 'id'>>,
): Promise<BillingCheckoutSession | null> {
  if (leadsDryRun()) return null
  const existing = await getBillingCheckoutSession(id)
  if (!existing) return null

  const result = await pool().query(
    `UPDATE billing_checkout_sessions
     SET customer_id = COALESCE($2, customer_id),
         payment_intent_id = COALESCE($3, payment_intent_id),
         status = COALESCE($4, status),
         metadata = COALESCE($5, metadata),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      updates.customerId || null,
      updates.paymentIntentId || null,
      updates.status || null,
      updates.metadata || null,
    ],
  )
  return billingCheckoutSessionFromRow(result.rows[0])
}
