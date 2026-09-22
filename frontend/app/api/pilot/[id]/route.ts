import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { after, NextResponse } from 'next/server'
import type {
  PilotAnswers,
  SuccessCriterion,
  SecurityDecision,
} from '@/lib/leads/contracts'
import { pilotControlledOptionLists, pilotRequestAnswersSchema } from '@/lib/leads/contracts'
import {
  applyTransition,
  buildCommercialSnapshot,
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
  hasPendingMaterialException,
  computePilotProgressUnresolved,
  isReviewerRole,
  reviewerTokenRole,
  type CommercialSnapshot,
  type PilotAction,
  type PilotState,
  type Reviewer,
  type ReviewerRole,
} from '@/lib/leads/pilot'
import {
  APP_SESSION_COOKIE,
  ApplicationRole,
  countPilotParticipants,
  currentApplicationUser,
  invitePilotMember,
  pilotMembershipWithAccountRole,
  revokePilotMember,
} from '@/lib/leads/application-auth'
import { pilotRoomPathForPilotOrFallback } from '@/lib/leads/account-paths'
import { sendApplicationAccessEmail, sendPilotReviewInviteEmail } from '@/lib/leads/account-email'
import { enqueueExceptionReviewTask } from '@/lib/leads/crm-events'
import {
  getPilotById,
  enqueuePilotEmail,
  leadsDryRun,
  mutatePilot,
  updatePilot,
  createTermsAcceptance,
  getTermsAcceptanceByPilotAndEmail,
  type StoredPilot,
} from '@/lib/leads/store'
import { hashValue } from '@/lib/leads/crypto'
import {
  pilotTermsFromDraft,
  resolvePilotDraftCommit,
  updatePilotDraft,
  type ConflictResolution,
  type PilotDraftConflict,
  type PilotMutableTerms,
} from '@/lib/leads/pilot-collaboration'
import { notifyPilotRoomEvent, pilotRoomSectionsForChanges } from '@/lib/leads/pilot-room-notifications'
import { processLeadOutbox } from '@/lib/leads/processor'
import { commitPilotTermRevision, pilotMutableTermsFromState } from '@/lib/leads/pilot-room-revisions'
import {
  isPilotDirectAnswerField,
  PILOT_DIRECT_ANSWER_FIELDS,
  type PilotDirectAnswers,
} from '@/lib/leads/pilot-room-fields'
import { emailDomain, requiresCompanyEmailDomain, validatePilotRoleEmailDomains } from '@/lib/leads/identity'

type PatchAction =
  | 'update'
  | 'draft'
  | 'submit_draft'
  | 'commit_draft'
  | 'start_team_review'
  | 'invite_reviewer'
  | 'reviewer_decision'
  | 'reviewer_note'
  | 'remove_reviewer'
  | 'reviewer_role'
  | 'claim_role'
  | 'section_change_request'
  | 'confirm_scope'
  | 'revise'
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

type PatchBody = {
  action: PatchAction
  note?: string
  by?: string
  answers?: Record<string, unknown>
  draftAnswers?: PilotDirectAnswers
  criteria?: SuccessCriterion[]
  security?: SecurityDecision[]
  startDate?: string | null
  signer?: { name: string; email: string }
  share?: { role: 'participant' | 'approver' | 'signer'; email: string }
  invite?: { role: ReviewerRole; email: string; name?: string; reviewerId?: string }
  reviewerId?: string
  decision?: 'confirm' | 'changes'
  role?: ReviewerRole
  baseVersion?: number
  versionSeen?: number
  fieldPaths?: string[]
  resolutions?: Record<string, ConflictResolution>
  sectionChange?: { section: string; note: string }
  payment?: Record<string, unknown>
  launch?: Record<string, unknown>
}

export const runtime = 'nodejs'

const TEAM_REVIEW_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']
const INVITATION_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']
const EDITABLE_DRAFT_STATES: PilotState[] = [
  'reviewing',
  'revision',
  'team_review',
  'exception_review',
  'scope_confirmed',
  'ready_sign',
]
const MAX_DRAFT_PAYLOAD_BYTES = 64 * 1024
const MAX_DRAFT_FIELD_PATHS = 80

function validatePilotMemberEmail(email: string, label: string): string | null {
  if (requiresCompanyEmailDomain(emailDomain(email))) {
    return `a company email domain is required for the ${label}`
  }
  return null
}

class PilotDraftConflictError extends Error {
  constructor(readonly conflicts: PilotDraftConflict[]) {
    super('Pilot draft conflict')
  }
}

class StaleReviewError extends Error {
  constructor() {
    super('This pilot changed before the review could be confirmed.')
  }
}

function materialChange(pilot: StoredPilot, body: PatchBody): boolean {
  if (body.answers) return true
  if (body.criteria && JSON.stringify(body.criteria) !== JSON.stringify(pilot.successCriteria)) {
    return true
  }
  if (body.security && JSON.stringify(body.security) !== JSON.stringify(pilot.securityDecisions)) {
    return true
  }
  return false
}

async function notifyStaleReviewers(pilot: StoredPilot): Promise<void> {
  const staleEmails = new Set(pilot.reviewers
    .filter(
      (reviewer) =>
        reviewer.status !== 'revoked' &&
        reviewer.status !== 'proposed' &&
        reviewer.versionSeen < pilot.version &&
        reviewer.email,
    )
    .map((reviewer) => reviewer.email.trim().toLowerCase()))
  for (const email of staleEmails) {
    try {
      await enqueuePilotEmail(pilot.id, 'revised_ready', email, `revision:${pilot.version}`)
    } catch (cause) {
      console.error('revised_ready email failed', cause)
    }
  }
}

function reviewerMembershipIsStillRequired(
  pilot: StoredPilot,
  email: string,
  role: ReturnType<typeof reviewerTokenRole>,
): boolean {
  const normalized = email.trim().toLowerCase()
  if (String(pilot.answers.signerEmail || '').trim().toLowerCase() === normalized && role === 'signer') return true
  const portalsEmail = String(process.env.LEADS_NOTIFICATION_EMAIL || '').trim().toLowerCase()
  if (portalsEmail && portalsEmail === normalized && role === 'approver') return true
  return pilot.reviewers.some(
    (reviewer) =>
      reviewer.status !== 'revoked' &&
      reviewer.status !== 'proposed' &&
      reviewer.email.trim().toLowerCase() === normalized &&
      reviewerTokenRole(reviewer.role) === role,
  )
}

function recompute(
  pilot: StoredPilot,
  body: PatchBody,
): {
  answers: Record<string, unknown>
  route: ReturnType<typeof classifyPilot>['route']
  exceptions: ReturnType<typeof classifyPilot>['exceptions']
  criteria: SuccessCriterion[]
  security: SecurityDecision[]
  unresolved: ReturnType<typeof computeUnresolved>
  proposal: CommercialSnapshot | null
} {
  const answers = {
    ...(pilot.answers as Record<string, unknown>),
    ...(body.answers || {}),
  }
  const classification = classifyPilot(answers as PilotAnswers)
  const exceptions = classification.exceptions.map((item) => {
    const prior = pilot.exceptions.find((existing) => existing.kind === item.kind)
    return prior?.resolvedAt ? { ...item, resolvedAt: prior.resolvedAt } : item
  })
  const startDate =
    body.startDate !== undefined ? body.startDate : pilot.resolvedStartDate
  const answersChanged = Boolean(body.answers)
  const criteria = body.criteria || (answersChanged ? buildSuccessCriteria(answers as PilotAnswers) : pilot.successCriteria)
  const security = answersChanged
    ? buildSecurityDecisions(answers as PilotAnswers)
    : body.security || pilot.securityDecisions
  const unresolved = computeUnresolved(answers as PilotAnswers, {
    startDate: startDate || undefined,
    route: classification.route,
  })
  const baseProposal = answersChanged || body.startDate !== undefined
    ? buildCommercialSnapshot(answers as PilotAnswers, [], {
      startDate: startDate || undefined,
    })
    : pilot.proposal
  const proposalWithOffer = baseProposal && pilot.proposal
    ? {
      ...baseProposal,
      priceAmount: pilot.proposal.priceAmount,
      priceLabel: pilot.proposal.priceLabel,
      currency: pilot.proposal.currency,
      termDays: pilot.proposal.termDays,
      ...(pilot.proposal.offerVariantSlug
        ? {
          annualCreditAmount: pilot.proposal.annualCreditAmount,
          annualCreditLabel: pilot.proposal.annualCreditLabel,
          annualCreditRedemptionPolicy: pilot.proposal.annualCreditRedemptionPolicy,
          offerVariantSlug: pilot.proposal.offerVariantSlug,
          offerVariantRevision: pilot.proposal.offerVariantRevision,
          offerTermsVersion: pilot.proposal.offerTermsVersion,
          offerStartsAt: pilot.proposal.offerStartsAt,
          offerEndsAt: pilot.proposal.offerEndsAt,
          offerAcceptanceDeadlineLabel: pilot.proposal.offerAcceptanceDeadlineLabel,
          offerCopy: pilot.proposal.offerCopy,
          basePackageSlug: pilot.proposal.basePackageSlug,
          offerResolvedAt: pilot.proposal.offerResolvedAt,
          offerSnapshotHash: pilot.proposal.offerSnapshotHash,
        }
        : {}),
    }
    : baseProposal
  const proposal = proposalWithOffer
  return {
    answers,
    route: classification.route,
    exceptions,
    criteria,
    security,
    unresolved,
    proposal,
  }
}

function mutableTermsFromPilot(pilot: StoredPilot): PilotMutableTerms {
  return pilotMutableTermsFromState(pilot)
}

function mutableTermsFromBody(
  pilot: StoredPilot,
  body: PatchBody,
  fallback = mutableTermsFromPilot(pilot),
): PilotMutableTerms {
  const selected = body.fieldPaths ? new Set(body.fieldPaths) : null
  const includes = (field: string) => !selected || selected.has(field)
  const includesCriteria = !selected || [...selected].some((field) => field.startsWith('criteria.'))
  const answers = { ...fallback.answers }
  for (const field of PILOT_DIRECT_ANSWER_FIELDS) {
    if (includes(`answers.${field}`) && body.draftAnswers?.[field] !== undefined) answers[field] = String(body.draftAnswers[field] || '')
  }
  return {
    startDate:
      includes('startDate') && body.startDate !== undefined
        ? body.startDate
        : fallback.startDate,
    criteria: includesCriteria && body.criteria ? body.criteria : fallback.criteria,
    answers,
  }
}

function termsForRevision(
  pilot: StoredPilot,
  version: number,
): PilotMutableTerms | null {
  const terms = pilot.revisions.find((revision) => revision.version === version)?.terms
  return terms || null
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
}

function isAllowedDraftPath(path: string): boolean {
  if (path === 'startDate') return true
  const answer = path.match(/^answers\.([A-Za-z0-9_]+)$/)
  if (answer) return isPilotDirectAnswerField(answer[1])
  return /^criteria\.[A-Za-z0-9-]{1,120}\.(status|target|participant|evidence|__removed)$/.test(path)
}

function validateCriteria(criteria: SuccessCriterion[]): string | null {
  if (criteria.length > 12) return 'too many success criteria'
  const keys = new Set<string>()
  for (const criterion of criteria) {
    if (!/^[A-Za-z0-9-]{1,120}$/.test(criterion.key) || keys.has(criterion.key)) {
      return 'success criteria must have unique valid keys'
    }
    keys.add(criterion.key)
    if (!criterion.label.trim() || criterion.label.length > 300) return 'success criterion labels are invalid'
    if (!['accepted', 'modified', 'not-applicable'].includes(criterion.status)) {
      return 'success criterion status is invalid'
    }
    for (const value of [criterion.target, criterion.participant, criterion.evidence]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 2_000)) {
        return 'success criterion details are invalid'
      }
    }
  }
  return null
}

function validateDraftPayload(body: PatchBody): string | null {
  const payloadSize = Buffer.byteLength(
    JSON.stringify({
      draftAnswers: body.draftAnswers,
      criteria: body.criteria,
      fieldPaths: body.fieldPaths,
      startDate: body.startDate,
    }),
  )
  if (payloadSize > MAX_DRAFT_PAYLOAD_BYTES) return 'draft payload is too large'
  if (body.fieldPaths !== undefined) {
    if (!Array.isArray(body.fieldPaths) || body.fieldPaths.length > MAX_DRAFT_FIELD_PATHS) {
      return 'draft field paths are invalid'
    }
    if (body.fieldPaths.some((path) => typeof path !== 'string' || !isAllowedDraftPath(path))) {
      return 'draft contains a field that cannot be edited in the room'
    }
  }
  if (body.draftAnswers) {
    if (typeof body.draftAnswers !== 'object' || Array.isArray(body.draftAnswers)) {
      return 'draft answers are invalid'
    }
    for (const [field, value] of Object.entries(body.draftAnswers)) {
      if (!isPilotDirectAnswerField(field) || typeof value !== 'string') {
        return 'draft answers are invalid'
      }
    }
    const parsed = pilotRequestAnswersSchema.partial().safeParse(body.draftAnswers)
    if (!parsed.success) return 'draft answers are invalid'
    for (const field of ['productionOwnerEmail', 'technicalEvaluatorEmail'] as const) {
      const value = body.draftAnswers[field]?.trim()
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${field} is invalid`
    }
    const historicalProject = body.draftAnswers.historicalProject
    if (historicalProject && !pilotControlledOptionLists.historicalProject.includes(historicalProject as never)) {
      return 'historical project is invalid'
    }
    const integrationMethod = body.draftAnswers.integrationMethod
    if (integrationMethod && !pilotControlledOptionLists.integrationMethod.includes(integrationMethod as never)) {
      return 'integration method is invalid'
    }
    const participantsRange = body.draftAnswers.participantsRange
    if (participantsRange && !pilotControlledOptionLists.participantsRange.includes(participantsRange as never)) {
      return 'participants are invalid'
    }
    for (const field of ['integrationSystemsJson', 'successCriterionKeysJson'] as const) {
      const value = body.draftAnswers[field]?.trim()
      if (!value) continue
      try {
        const parsedJson = JSON.parse(value)
        if (!Array.isArray(parsedJson)) return `${field} must be a JSON array`
        if (
          field === 'successCriterionKeysJson' &&
          parsedJson.some(
            (key) =>
              typeof key !== 'string' ||
              !pilotControlledOptionLists.successCriterionKeys.includes(key as never),
          )
        ) {
          return 'success criteria selection is invalid'
        }
      } catch {
        return `${field} must be valid JSON`
      }
    }
  }
  if (body.startDate !== undefined && body.startDate !== null && !isValidDate(body.startDate)) {
    return 'pilot start date is invalid'
  }
  if (body.criteria !== undefined && !Array.isArray(body.criteria)) return 'success criteria are invalid'
  return body.criteria ? validateCriteria(body.criteria) : null
}

function reconcileTermReviewers(
  reviewers: Reviewer[],
  answers: Record<string, unknown>,
  version: number,
): Reviewer[] {
  const next = reviewers.map((reviewer) => ({ ...reviewer, notes: [...reviewer.notes] }))
  const contacts: Array<{ role: ReviewerRole; name: string; email: string }> = [
    {
      role: 'production_owner',
      name: String(answers.productionOwner || '').trim(),
      email: String(answers.productionOwnerEmail || '').trim().toLowerCase(),
    },
    {
      role: 'technical_evaluator',
      name: String(answers.technicalEvaluator || '').trim(),
      email: String(answers.technicalEvaluatorEmail || '').trim().toLowerCase(),
    },
  ]
  for (const contact of contacts) {
    if (!contact.email) continue
    const index = next.findIndex(
      (reviewer) => reviewer.role === contact.role && reviewer.status !== 'revoked',
    )
    if (index < 0) {
      next.push({
        id: randomUUID(),
        role: contact.role,
        name: contact.name,
        email: contact.email,
        status: 'proposed',
        versionSeen: version,
        notes: [],
      })
      continue
    }
    const reviewer = next[index]
    if (reviewer.email.toLowerCase() !== contact.email) {
      next[index] = {
        ...reviewer,
        name: contact.name || reviewer.name,
        email: contact.email,
        status: 'proposed',
        invitedAt: undefined,
        openedAt: undefined,
        reviewedAt: undefined,
        requestedChanges: false,
        versionSeen: version,
      }
    } else if (contact.name && reviewer.name !== contact.name) {
      next[index] = { ...reviewer, name: contact.name }
    }
  }
  return next
}

function conflictResponse(conflicts: PilotDraftConflict[]): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'conflict',
      message: 'This pilot changed while you were reviewing it.',
      conflicts,
    },
    { status: 409 },
  )
}

function cookieFromRequest(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

async function currentPilotRequestUser(request: Request) {
  const session = cookieFromRequest(request, APP_SESSION_COOKIE)
    || (await cookies()).get(APP_SESSION_COOKIE)?.value
  return currentApplicationUser(session)
}

async function authenticatedPilot(requestedId: string, request: Request): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof currentApplicationUser>>>
  pilot: StoredPilot
  accessRole: NonNullable<Awaited<ReturnType<typeof pilotMembershipWithAccountRole>>>['pilotRole']
  accountRole: NonNullable<Awaited<ReturnType<typeof pilotMembershipWithAccountRole>>>['accountRole']
} | NextResponse> {
  const user = await currentPilotRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: false, message: 'sign in is required' }, { status: 401 })
  }
  const pilot = await getPilotById(requestedId)
  if (!pilot) {
    return NextResponse.json({ ok: false, message: 'pilot record not found' }, { status: 404 })
  }
  const membership = await pilotMembershipWithAccountRole(pilot.id, user.id)
  if (!membership || !membership.pilotRole) {
    return NextResponse.json({ ok: false, message: 'you do not have access to this pilot' }, { status: 403 })
  }
  if (!membership.accountRole) {
    return NextResponse.json({ ok: false, message: 'you do not have access to the customer account for this pilot' }, { status: 403 })
  }
  return { user, pilot, accessRole: membership.pilotRole, accountRole: membership.accountRole }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const result = await authenticatedPilot(id, request)
  if (result instanceof NextResponse) return result
  return NextResponse.json({
    ok: true,
    pilot: result.pilot,
    draftTerms: pilotTermsFromDraft(result.pilot.draft, mutableTermsFromPilot(result.pilot)),
    accessRole: result.accessRole,
    accountRole: result.accountRole,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ ok: false, message: 'invalid request body' }, { status: 400 })
  }
  if (!body.action) {
    return NextResponse.json({ ok: false, message: 'action is required' }, { status: 400 })
  }
  const authResult = await authenticatedPilot(id, request)
  if (authResult instanceof NextResponse) return authResult
  const { user, pilot, accessRole, accountRole } = authResult
  if (body.action === 'submit_draft') {
    return NextResponse.json(
      { ok: false, message: 'submit_draft is no longer supported; use commit_draft' },
      { status: 410 },
    )
  }
  if (['draft', 'commit_draft'].includes(body.action)) {
    if (!EDITABLE_DRAFT_STATES.includes(pilot.state)) {
      return NextResponse.json(
        { ok: false, message: 'pilot terms cannot be edited in the current state' },
        { status: 400 },
      )
    }
    const validationError = validateDraftPayload(body)
    if (validationError) {
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
    }
    const roleEmailError = validatePilotRoleEmailDomains(body.draftAnswers || {})
    if (roleEmailError) {
      return NextResponse.json({ ok: false, message: roleEmailError }, { status: 400 })
    }
  }
  const hasAssessmentQualification = pilot.exceptions.some(
    (item) => item.kind === 'assessment-qualification' && !item.resolvedAt,
  )
  const founderEmail = String(process.env.LEADS_NOTIFICATION_EMAIL || '').trim().toLowerCase()
  const founderAccess = Boolean(founderEmail) && user.email.toLowerCase() === founderEmail
  if (
    (body.action === 'qualify' ||
      body.action === 'disqualify' ||
      (body.action === 'resolve_exceptions' && hasAssessmentQualification)) &&
    !founderAccess
  ) {
    return NextResponse.json(
      { ok: false, message: 'only the founder can resolve this qualification exception' },
      { status: 403 },
    )
  }
  if (body.action === 'sign' && accessRole !== 'owner' && accessRole !== 'signer') {
    return NextResponse.json({ ok: false, message: 'only an assigned signer can sign the agreement' }, { status: 403 })
  }
  if (['confirm_scope', 'finalize', 'pay', 'launch', 'activate'].includes(body.action)) {
    if (accessRole !== 'owner') {
      return NextResponse.json({ ok: false, message: 'only the pilot owner can advance the pilot' }, { status: 403 })
    }
    if (!accountRole || accountRole !== 'owner') {
      return NextResponse.json({ ok: false, message: 'only the customer account owner can advance the pilot' }, { status: 403 })
    }
  }

  try {
    if (!leadsDryRun()) after(() => processLeadOutbox(10))
    if (body.action === 'share') {
      if (!accountRole || accountRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the customer account owner can invite members' }, { status: 403 })
      }
      const share = body.share
      if (!share || !share.email || !['participant', 'approver', 'signer'].includes(share.role)) {
        return NextResponse.json({ ok: false, message: 'share role and email are required' }, { status: 400 })
      }
      if (share.role === 'participant') {
        const limit = pilot.proposal?.participantLimit || 5
        const count = await countPilotParticipants(pilot.id)
        if (count >= limit) {
          return NextResponse.json({ ok: false, code: 'participant_limit', message: `This pilot includes up to ${limit} participants. Remove an existing participant or resolve an expanded-participant exception before inviting another.` }, { status: 422 })
        }
        const shareEmailError = validatePilotMemberEmail(share.email, 'shared member')
        if (shareEmailError) {
          return NextResponse.json({ ok: false, message: shareEmailError }, { status: 400 })
        }
        const invited = await invitePilotMember({ pilotId: pilot.id, email: share.email, role: share.role })
        await sendApplicationAccessEmail({
          user: invited.user,
          purpose: 'invite',
          customerAccountId: invited.customerAccountId,
          role: 'member',
          idempotencyKey: `pilot-member-invite:${pilot.id}:${invited.user.id}:${share.role}`,
          nextPath: pilotRoomPathForPilotOrFallback(pilot),
        })
      }
      let updated = pilot
      if (share.role === 'approver') {
        const answers = pilot.answers as Record<string, unknown>
        if (!String(answers.approverEmail || '').trim()) {
          const nextAnswers = { ...answers, approverEmail: share.email }
          const unresolved = computeUnresolved(nextAnswers as PilotAnswers, {
            startDate: pilot.resolvedStartDate || undefined,
            route: pilot.route,
          })
          updated = await updatePilot(id, {
            answers: nextAnswers,
            unresolved,
            historyNote: `approver ${share.email} added to the room`,
          })
        }
      }
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'draft') {
      const { pilot: updated, result } = await mutatePilot(id, (locked) => {
        if (!EDITABLE_DRAFT_STATES.includes(locked.state)) {
          throw new Error('pilot terms cannot be edited in the current state')
        }
        const currentTerms = mutableTermsFromPilot(locked)
        const baseVersion = locked.draft?.baseVersion || locked.version
        const baseTerms = termsForRevision(locked, baseVersion) || currentTerms
        const draft = updatePilotDraft({
          draft: locked.draft,
          baseTerms,
          baseVersion,
          nextTerms: mutableTermsFromBody(
            locked,
            body,
            pilotTermsFromDraft(locked.draft, currentTerms),
          ),
          fieldPaths: body.fieldPaths,
          actor: user.email,
        })
        return {
          patch: { draft },
          result: { draftTerms: pilotTermsFromDraft(draft, currentTerms) },
        }
      })
      return NextResponse.json({
        ok: true,
        pilot: updated,
        draftTerms: result.draftTerms,
      })
    }

    if (body.action === 'commit_draft') {
      const { pilot: updated, result } = await mutatePilot(id, (locked) => {
        if (!EDITABLE_DRAFT_STATES.includes(locked.state)) {
          throw new Error('pilot terms cannot be edited in the current state')
        }
        const currentTerms = mutableTermsFromPilot(locked)
        const baseVersion = locked.draft?.baseVersion || locked.version
        const baseTerms = termsForRevision(locked, baseVersion) || currentTerms
        const draft = updatePilotDraft({
          draft: locked.draft,
          baseTerms,
          baseVersion,
          nextTerms: mutableTermsFromBody(
            locked,
            body,
            pilotTermsFromDraft(locked.draft, currentTerms),
          ),
          fieldPaths: body.fieldPaths,
          actor: user.email,
        })
        const incomingTerms = pilotTermsFromDraft(draft, currentTerms)
        const resolved = resolvePilotDraftCommit({
          baseTerms,
          currentTerms,
          incomingTerms,
          resolutions: body.resolutions,
        })
        if (resolved.conflicts.length > 0) throw new PilotDraftConflictError(resolved.conflicts)
        const commitBody: PatchBody = {
          ...body,
          action: 'commit_draft',
          criteria: resolved.terms.criteria,
          startDate: resolved.terms.startDate,
          answers: resolved.terms.answers,
        }
        const next = recompute(locked, commitBody)
        const committed = commitPilotTermRevision({
          pilot: locked,
          nextTerms: resolved.terms,
          actor: user.email,
          submittedBy: user.email,
          baseVersion,
          contributors: draft.changes,
        })
        if (committed.changes.length === 0) {
          return { result: { committed, noOp: true } }
        }
        const reviewers = reconcileTermReviewers(locked.reviewers, next.answers, committed.version)
        return {
          patch: {
            route: next.route,
            answers: next.answers,
            exceptions: next.exceptions,
            unresolved: next.unresolved,
            proposal: next.proposal,
            successCriteria: next.criteria,
            securityDecisions: next.security,
            reviewers,
            version: committed.version,
            draft: committed.draft,
            revisions: committed.revisions,
            resolvedStartDate: resolved.terms.startDate,
            historyNote: 'pilot terms saved',
            by: user.email,
          },
          result: { committed, noOp: false },
        }
      })
      if (!result.noOp && result.committed.version > pilot.version) {
        await notifyStaleReviewers(updated)
        await notifyPilotRoomEvent({
          pilot: updated,
          event: 'terms_changed',
          sections: pilotRoomSectionsForChanges(result.committed.changes),
          eventKey: `commit:${updated.version}`,
        })
      }
      return NextResponse.json({ ok: true, pilot: updated, noOp: result.noOp })
    }

    if (body.action === 'section_change_request') {
      const section = String(body.sectionChange?.section || '').trim()
      const note = String(body.sectionChange?.note || body.note || '').trim()
      if (!section || !note) {
        return NextResponse.json({ ok: false, message: 'section and change request are required' }, { status: 400 })
      }
      const contextualNote = `${section}: ${note}`
      const { pilot: updated } = await mutatePilot(id, (locked) => {
        const reviewer = locked.reviewers.find(
          (candidate) =>
            candidate.status !== 'revoked' &&
            candidate.email.toLowerCase() === user.email.toLowerCase(),
        )
        const now = new Date().toISOString()
        return {
          patch: {
            reviewers: reviewer
              ? locked.reviewers.map((candidate) =>
                candidate.id === reviewer.id
                  ? {
                    ...candidate,
                    status: 'reviewed' as const,
                    reviewedAt: now,
                    requestedChanges: true,
                    versionSeen: locked.version,
                    notes: [...candidate.notes, contextualNote],
                  }
                  : candidate,
              )
              : locked.reviewers,
            historyNote: `${user.email} requested changes to ${section}`,
            by: user.email,
          },
          result: undefined,
        }
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: section.toLowerCase().includes('security')
          ? 'security_change_requested'
          : 'change_requested',
        sections: section.toLowerCase().includes('security') ? ['security'] : undefined,
        eventKey: `change-request:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'start_team_review') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the submitter can mark the draft ready for team review' }, { status: 403 })
      }
      const stateChange = applyTransition(pilot.state, 'start_team_review')
      if (!stateChange.allowed) {
        return NextResponse.json(
          { ok: false, message: 'the draft is not in a state that can be shared for team review' },
          { status: 400 },
        )
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        historyNote: 'submitter confirmed the draft is ready for team review',
        by: body.by,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'team_review_started',
        eventKey: `team-review:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'invite_reviewer') {
      const invite = body.invite
      if (
        !invite ||
        !isReviewerRole(invite.role) ||
        !String(invite.email || '').trim()
      ) {
        return NextResponse.json({ ok: false, message: 'a valid reviewer role and email are required' }, { status: 400 })
      }
      if (!INVITATION_STATES.includes(pilot.state)) {
        return NextResponse.json(
          { ok: false, message: 'invitations unlock once the draft is ready for team review' },
          { status: 400 },
        )
      }
      if (reviewerTokenRole(invite.role) === 'participant') {
        const limit = pilot.proposal?.participantLimit || 5
        const count = await countPilotParticipants(pilot.id)
        if (count >= limit) {
          return NextResponse.json({ ok: false, code: 'participant_limit', message: `This pilot includes up to ${limit} participants. Remove an existing participant or resolve an expanded-participant exception before inviting another.` }, { status: 422 })
        }
      }
      const email = String(invite.email).trim().toLowerCase()
      const inviteEmailError = validatePilotMemberEmail(email, 'reviewer')
      if (inviteEmailError) {
        return NextResponse.json({ ok: false, message: inviteEmailError }, { status: 400 })
      }
      // This is intentionally per person/version rather than per reviewer role:
      // a dual-role reviewer receives one secure room invitation.
      const inviteEventKey = `reviewer-invited:${pilot.version}:${email}`
      const { pilot: updated, result } = await mutatePilot(id, (locked) => {
        if (!INVITATION_STATES.includes(locked.state)) {
          throw new Error('invitations unlock once the draft is ready for team review')
        }
        const now = new Date().toISOString()
        const existingSameRole = locked.reviewers.find(
          (reviewer) =>
            reviewer.email.toLowerCase() === email &&
            reviewer.role === invite.role &&
            reviewer.status !== 'revoked',
        )
        const reviewers: Reviewer[] = existingSameRole
          ? locked.reviewers.map((reviewer) => {
            if (reviewer.id === existingSameRole.id) {
              return {
                ...reviewer,
                name: invite.name && invite.name.trim() ? invite.name.trim() : reviewer.name,
                status: reviewer.status === 'proposed' ? 'invited' : reviewer.status,
                invitedAt: reviewer.invitedAt || now,
                versionSeen: reviewer.status === 'proposed' ? locked.version : reviewer.versionSeen,
              }
            }
            // The first invitation for a person covers every review role
            // already assigned to that same address.
            if (
              reviewer.email.trim().toLowerCase() === email &&
              reviewer.status === 'proposed' &&
              reviewer.role !== 'signer'
            ) {
              return { ...reviewer, status: 'invited', invitedAt: now, versionSeen: locked.version }
            }
            return reviewer
          })
          : [
            ...locked.reviewers.map((reviewer) => (
              reviewer.email.trim().toLowerCase() === email &&
                reviewer.status === 'proposed' &&
                reviewer.role !== 'signer'
                ? { ...reviewer, status: 'invited' as const, invitedAt: now, versionSeen: locked.version }
                : reviewer
            )),
            {
              id: randomUUID(),
              role: invite.role,
              name: String(invite.name || '').trim(),
              email,
              status: 'invited' as const,
              invitedAt: now,
              versionSeen: locked.version,
              notes: [],
            },
          ]
        const invitedRoles = [...new Set(
          reviewers
            .filter(
              (reviewer) =>
                reviewer.status !== 'revoked' &&
                reviewer.status !== 'proposed' &&
                reviewer.email.trim().toLowerCase() === email &&
                (reviewer.role !== 'signer' || invite.role === 'signer'),
            )
            .map((reviewer) => reviewer.role),
        )]
        return {
          patch: {
            reviewers,
            historyNote: `${invite.role.replaceAll('_', ' ')} ${email} invited to the room`,
            by: body.by,
          },
          result: { invitedRoles },
        }
      })
      const memberRoles = [...new Set(result.invitedRoles.map(reviewerTokenRole))]
      let invited: Awaited<ReturnType<typeof invitePilotMember>> | null = null
      for (const role of memberRoles) {
        invited = await invitePilotMember({
          pilotId: pilot.id,
          email,
          displayName: invite.name,
          role,
        })
      }
      if (!invited) throw new Error('No reviewer roles were eligible for invitation.')
      await sendPilotReviewInviteEmail({
        user: invited.user,
        pilotId: pilot.id,
        customerAccountId: invited.customerAccountId,
        // nextPath: pilotRoomPathForPilotOrFallback(pilot),
        roles: result.invitedRoles,
        inviterName: String(pilot.answers.name || '').trim() || undefined,
        idempotencyKey: `pilot-reviewer-invite:${pilot.id}:${invited.user.id}:${inviteEventKey}`,
        eventKey: inviteEventKey,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'reviewer_invited',
        eventKey: inviteEventKey,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'reviewer_decision') {
      const reviewerId = body.reviewerId
      const decision = body.decision
      if (!reviewerId || !decision) {
        return NextResponse.json({ ok: false, message: 'reviewer and decision are required' }, { status: 400 })
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === reviewerId)
      if (!reviewer) {
        return NextResponse.json({ ok: false, message: 'reviewer not found' }, { status: 404 })
      }
      if (reviewer.status === 'revoked' || reviewer.status === 'proposed') {
        return NextResponse.json({ ok: false, message: 'reviewer is no longer active' }, { status: 403 })
      }
      if (
        accessRole !== 'owner' &&
        reviewer.email.toLowerCase() !== user.email.toLowerCase()
      ) {
        return NextResponse.json({ ok: false, message: 'you can only record decisions for your own review' }, { status: 403 })
      }
      if (decision === 'changes' && !String(body.note || '').trim()) return NextResponse.json({ ok: false, message: 'a requested change must include a note' }, { status: 400 })
      if (!Number.isInteger(body.versionSeen) || body.versionSeen !== pilot.version) {
        return NextResponse.json(
          { ok: false, code: 'stale_review', message: 'This pilot changed before the review could be confirmed.' },
          { status: 409 },
        )
      }
      const { pilot: updated, result } = await mutatePilot(id, (locked) => {
        if (body.versionSeen !== locked.version) throw new StaleReviewError()
        const lockedReviewer = locked.reviewers.find((candidate) => candidate.id === reviewerId)
        if (!lockedReviewer) throw new Error('reviewer not found')
        if (lockedReviewer.status === 'revoked' || lockedReviewer.status === 'proposed') {
          throw new Error('reviewer is no longer active')
        }
        if (
          accessRole !== 'owner' &&
          lockedReviewer.email.toLowerCase() !== user.email.toLowerCase()
        ) {
          throw new Error('you can only record decisions for your own review')
        }
        const now = new Date().toISOString()
        const relatedReviewerIds = new Set(
          decision === 'confirm'
            ? locked.reviewers
              .filter(
                (candidate) =>
                  candidate.status !== 'revoked' &&
                  candidate.email.trim().toLowerCase() === lockedReviewer.email.trim().toLowerCase(),
              )
              .map((candidate) => candidate.id)
            : [reviewerId],
        )
        const reviewers = locked.reviewers.map((candidate) =>
          relatedReviewerIds.has(candidate.id)
            ? {
              ...candidate,
              status: 'reviewed' as const,
              reviewedAt: now,
              requestedChanges: decision === 'changes',
              versionSeen: locked.version,
              notes: body.note ? [...candidate.notes, body.note.trim()] : candidate.notes,
            }
            : candidate,
        )
        return {
          patch: {
            reviewers,
            historyNote: `${lockedReviewer.email} ${decision === 'changes' ? 'requested changes' : 'confirmed'} (${decision === 'confirm' && relatedReviewerIds.size > 1 ? 'all assigned roles' : lockedReviewer.role.replaceAll('_', ' ')})`,
            by: body.by,
          },
          result: {
            reviewer: lockedReviewer,
            reviewers,
            confirmedRoles: decision === 'confirm'
              ? reviewers
                .filter((candidate) => relatedReviewerIds.has(candidate.id))
                .map((candidate) => candidate.role)
              : [],
          },
        }
      })
      const { reviewers } = result
      if (decision === 'changes') {
        await enqueuePilotEmail(id, 'change_requested', undefined, `revision:${updated.version}:change_requested`)
      } else if (result.confirmedRoles.includes('technical_evaluator')) {
        await enqueuePilotEmail(id, 'technical_confirmed', undefined, `revision:${updated.version}:technical_confirmed`)
      }
      if (decision === 'confirm' && result.confirmedRoles.includes('economic_buyer')) {
        await enqueuePilotEmail(id, 'terms_confirmed', undefined, `revision:${updated.version}:terms_confirmed`)
      }
      const buyer = reviewers.find(
        (candidate) => candidate.role === 'economic_buyer' && candidate.status !== 'revoked',
      )
      const otherReviewed = reviewers.some(
        (candidate) =>
          candidate.role !== 'economic_buyer' &&
          ['production_owner', 'technical_evaluator'].includes(candidate.role) &&
          candidate.status === 'reviewed',
      )
      if (buyer && buyer.status !== 'reviewed' && otherReviewed && decision === 'confirm' && buyer.email) {
        await enqueuePilotEmail(id, 'buyer_nudge', buyer.email, `revision:${updated.version}:buyer_nudge`)
      }
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'reviewer_note') {
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ ok: false, message: 'reviewer not found' }, { status: 404 })
      }
      if (accessRole !== 'owner' && reviewer.email.toLowerCase() !== user.email.toLowerCase()) {
        return NextResponse.json({ ok: false, message: 'you can only add notes to your own review' }, { status: 403 })
      }
      const note = String(body.note || '').trim()
      if (!note) {
        return NextResponse.json({ ok: false, message: 'note is required' }, { status: 400 })
      }
      const { pilot: updated } = await mutatePilot(id, (locked) => {
        const lockedReviewer = locked.reviewers.find((candidate) => candidate.id === reviewer.id)
        if (!lockedReviewer) throw new Error('reviewer not found')
        if (accessRole !== 'owner' && lockedReviewer.email.toLowerCase() !== user.email.toLowerCase()) {
          throw new Error('you can only add notes to your own review')
        }
        return {
          patch: {
            reviewers: locked.reviewers.map((candidate) =>
              candidate.id === lockedReviewer.id
                ? { ...candidate, notes: [...candidate.notes, note] }
                : candidate,
            ),
            historyNote: `${lockedReviewer.email} added a review note`,
            by: body.by,
          },
          result: undefined,
        }
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'remove_reviewer') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the submitter can remove reviewers' }, { status: 403 })
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ ok: false, message: 'reviewer not found' }, { status: 404 })
      }
      if (reviewer.status === 'revoked') {
        return NextResponse.json({ ok: false, message: 'reviewer is already removed' }, { status: 400 })
      }
      const { pilot: updated } = await mutatePilot(id, (locked) => {
        const lockedReviewer = locked.reviewers.find((candidate) => candidate.id === reviewer.id)
        if (!lockedReviewer) throw new Error('reviewer not found')
        return {
          patch: {
            reviewers: locked.reviewers.map((candidate) =>
              candidate.id === lockedReviewer.id ? { ...candidate, status: 'revoked' } : candidate,
            ),
            historyNote: `${lockedReviewer.email} removed from the room`,
            by: body.by,
          },
          result: undefined,
        }
      })
      const removedRole = reviewerTokenRole(reviewer.role)
      if (!reviewerMembershipIsStillRequired(updated, reviewer.email, removedRole)) {
        await revokePilotMember({ pilotId: id, email: reviewer.email, role: removedRole })
      }
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'reviewer_role') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the submitter can change reviewer roles' }, { status: 403 })
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ ok: false, message: 'reviewer not found' }, { status: 404 })
      }
      if (!isReviewerRole(body.role)) {
        return NextResponse.json({ ok: false, message: 'a valid reviewer role is required' }, { status: 400 })
      }
      const role = body.role
      const { pilot: updated } = await mutatePilot(id, (locked) => {
        const lockedReviewer = locked.reviewers.find((candidate) => candidate.id === reviewer.id)
        if (!lockedReviewer) throw new Error('reviewer not found')
        if (lockedReviewer.role === role) {
          return {
            patch: {
              historyNote: `${lockedReviewer.email} already holds the ${role.replaceAll('_', ' ')} role`,
              by: body.by,
            },
            result: undefined,
          }
        }
        const existingRole = locked.reviewers.find(
          (candidate) =>
            candidate.id !== lockedReviewer.id &&
            candidate.status !== 'revoked' &&
            candidate.role === role &&
            candidate.email.trim().toLowerCase() === lockedReviewer.email.trim().toLowerCase(),
        )
        if (existingRole) {
          return {
            patch: {
              historyNote: `${lockedReviewer.email} already holds the ${role.replaceAll('_', ' ')} role`,
              by: body.by,
            },
            result: undefined,
          }
        }
        return {
          patch: {
            reviewers: [
              ...locked.reviewers,
              {
                ...lockedReviewer,
                id: randomUUID(),
                role,
                // Adding a role is not an invitation. The owner can explicitly
                // invite it once the assignment is ready, avoiding a false
                // "invited" state and an unsolicited duplicate email.
                status: 'proposed',
                invitedAt: undefined,
                openedAt: undefined,
                reviewedAt: undefined,
                requestedChanges: false,
                versionSeen: locked.version,
                notes: [],
              },
            ],
            historyNote: `${lockedReviewer.email} added as ${role.replaceAll('_', ' ')}`,
            by: body.by,
          },
          result: undefined,
        }
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'claim_role') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the submitter can claim a proposed role' }, { status: 403 })
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ ok: false, message: 'reviewer not found' }, { status: 404 })
      }
      const { pilot: updated } = await mutatePilot(id, (locked) => {
        const lockedReviewer = locked.reviewers.find((candidate) => candidate.id === reviewer.id)
        if (!lockedReviewer) throw new Error('reviewer not found')
        const now = new Date().toISOString()
        return {
          patch: {
            reviewers: locked.reviewers.map((candidate) =>
              candidate.id === lockedReviewer.id
                ? {
                  ...candidate,
                  name:
                    String(locked.answers.productionOwner || '').split(',')[0].trim() ||
                    user.email,
                  email: user.email.toLowerCase(),
                  status: 'reviewed' as const,
                  reviewedAt: now,
                  requestedChanges: false,
                  versionSeen: locked.version,
                }
                : candidate,
            ),
            historyNote: `the submitter holds the ${lockedReviewer.role.replaceAll('_', ' ')} role`,
            by: body.by,
          },
          result: undefined,
        }
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'confirm_scope') {
      const stateChange = applyTransition(pilot.state, 'confirm_scope')
      if (!stateChange.allowed) {
        return NextResponse.json(
          { ok: false, message: 'scope cannot be confirmed in the current state' },
          { status: 400 },
        )
      }
      // Single rule: owner-only rooms may skip team_review; rooms with other
      // invited reviewers must confirm from team_review with all approvals.
      const invitedOthers = pilot.reviewers.some(
        (candidate) => candidate.role !== 'production_owner' && candidate.status !== 'revoked' && Boolean(candidate.email.trim()),
      )
      if (invitedOthers && pilot.state !== 'team_review') {
        return NextResponse.json(
          { ok: false, message: 'request team review and collect all approvals before confirming scope' },
          { status: 422 },
        )
      }
      const next = recompute(pilot, body)
      const unresolved = computePilotProgressUnresolved({
        state: pilot.state,
        version: pilot.version,
        unresolved: next.unresolved,
        exceptions: next.exceptions,
        reviewers: pilot.reviewers,
      })
      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: 'resolve the highlighted items before confirming scope',
            unresolved,
          },
          { status: 422 },
        )
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        route: next.route,
        answers: next.answers,
        exceptions: next.exceptions,
        unresolved: next.unresolved,
        proposal: next.proposal,
        successCriteria: next.criteria,
        securityDecisions: next.security,
        resolvedStartDate: body.startDate !== undefined ? body.startDate : undefined,
        historyNote: body.note,
        by: body.by,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'pilot_terms_confirmed',
        eventKey: `terms-confirmed:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    const emailVariant: Record<PatchAction, string | null> = {
      update: null,
      draft: null,
      submit_draft: null,
      commit_draft: null,
      start_team_review: null,
      invite_reviewer: null,
      reviewer_decision: null,
      reviewer_note: null,
      remove_reviewer: null,
      reviewer_role: null,
      claim_role: null,
      section_change_request: null,
      confirm_scope: null,
      revise: null,
      request_exception: null,
      resolve_exceptions: null,
      qualify: null,
      disqualify: null,
      finalize: null,
      sign: null,
      pay: null,
      launch: null,
      activate: null,
      share: null,
    }

    if (body.action === 'update') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ ok: false, message: 'only the submitter can edit the plan' }, { status: 403 })
      }
      const roleEmailError = validatePilotRoleEmailDomains(body.answers || {})
      if (roleEmailError) {
        return NextResponse.json({ ok: false, message: roleEmailError }, { status: 400 })
      }
      const next = recompute(pilot, body)
      const frozen = TEAM_REVIEW_STATES.includes(pilot.state)
      const version = frozen && materialChange(pilot, body) ? pilot.version + 1 : pilot.version
      const updated = await updatePilot(id, {
        route: next.route,
        answers: next.answers,
        exceptions: next.exceptions,
        unresolved: next.unresolved,
        proposal: next.proposal,
        successCriteria: next.criteria,
        securityDecisions: next.security,
        reviewers: pilot.reviewers,
        version,
        resolvedStartDate: body.startDate !== undefined ? body.startDate : undefined,
        historyNote: body.note,
        by: body.by,
      })
      if (version > pilot.version) {
        await notifyStaleReviewers(updated)
      }
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'sign') {
      if (hasPendingMaterialException(pilot.exceptions)) {
        return NextResponse.json({ ok: false, code: 'material_exception', message: 'resolve the flagged material exception before signing and paying this pilot' }, { status: 422 })
      }
      const stateChange = applyTransition(pilot.state, 'sign')
      if (!stateChange.allowed) {
        return NextResponse.json({ ok: false, message: 'the pilot is not ready for signature' }, { status: 400 })
      }
      const offerEndsAt = pilot.proposal?.offerEndsAt
      if (offerEndsAt && Date.now() >= new Date(offerEndsAt).getTime()) {
        return NextResponse.json({ ok: false, message: 'this pilot offer has expired' }, { status: 409 })
      }
      const answers = {
        ...(pilot.answers as Record<string, unknown>),
        ...(body.answers || {}),
      }
      const name = body.signer?.name || String(answers.signerName || '')
      const email = body.signer?.email || String(answers.signerEmail || '')
      if (!name.trim() || !email.trim()) {
        return NextResponse.json(
          { ok: false, message: 'signer name and email are required' },
          { status: 400 },
        )
      }
      const acceptanceText = 'By selecting Confirm pilot & purchase, you represent that you are authorized to accept these terms on behalf of this organization and agree to the Production Pilot Terms, Privacy Policy, and pilot scope shown above.'
      const acceptedAt = new Date().toISOString()
      const signerEmailError = validatePilotMemberEmail(email, 'signer')
      if (signerEmailError) {
        return NextResponse.json({ ok: false, message: signerEmailError }, { status: 400 })
      }
      const termsSnapshot = {
        proposal: pilot.proposal,
        scope: { answers, criteria: pilot.successCriteria, security: pilot.securityDecisions },
      }
      const scopeHash = hashValue(JSON.stringify(termsSnapshot))
      const termsVersion = String(process.env.PILOT_TERMS_VERSION || 'pilot-terms-v1')
      const termsHash = hashValue(`${termsVersion}:${acceptanceText}`)
      
      // Check for existing acceptance with this email to prevent duplicate inserts
      // (UNIQUE constraint is on pilot_id, terms_hash, pilot_scope_hash - not actor_email)
      const existingAcceptance = await getTermsAcceptanceByPilotAndEmail(id, email, termsHash, scopeHash)
      if (existingAcceptance) {
        return NextResponse.json(
          { ok: false, message: 'Terms already accepted by this signer' },
          { status: 409 },
        )
      }
      
      const acceptanceId = randomUUID()
      await createTermsAcceptance({
        id: acceptanceId,
        pilotId: id,
        actorUserId: user.id,
        actorEmail: email,
        actorName: name,
        customerAccountId: pilot.customerAccountId,
        companyLegalName: String(answers.company || ''),
        authorityRepresented: true,
        termsDocumentId: 'pilot-terms',
        termsVersion,
        termsEffectiveDate: new Date().toISOString().slice(0, 10),
        termsHash: hashValue(`${termsVersion}:${acceptanceText}`),
        termsSnapshot,
        acceptanceTextVersion: 'clickwrap-v1',
        acceptanceTextHash: hashValue(acceptanceText),
        acceptanceMethod: 'clickwrap_checkout',
        affirmativeAction: 'confirm_and_purchase',
        acceptedAt,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
        userAgent: request.headers.get('user-agent') || '',
        sessionId: cookieFromRequest(request, APP_SESSION_COOKIE) || '',
        pilotScopeVersion: String(pilot.version),
        pilotScopeHash: scopeHash,
        amount: pilot.proposal?.priceAmount || 0,
        currency: pilot.proposal?.currency || 'USD',
        paymentMethod: 'pending',
        annualCreditTermsVersion: pilot.proposal?.offerTermsVersion || termsVersion,
        materialExceptionsPending: hasPendingMaterialException(pilot.exceptions),
      })
      const updated = await updatePilot(id, {
        state: stateChange.state,
        signing: {
          ...(pilot.signing || {}),
          name,
          email,
          signedAt: new Date().toISOString(),
          ...(pilot.proposal?.offerVariantSlug ? { offerLockedAt: new Date().toISOString() } : {}),
          consented: true,
          termsAcceptanceId: acceptanceId,
          termsVersion,
          termsHash: hashValue(`${termsVersion}:${acceptanceText}`),
          scopeHash,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
        },
        historyNote: `signed by ${name} (${email})`,
        by: body.by,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'signed',
        eventKey: `signed:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'pay') {
      if (!leadsDryRun() && process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json(
          { ok: false, message: 'manual payment recording is disabled; complete Stripe Checkout to mark paid' },
          { status: 400 },
        )
      }
      const stateChange = applyTransition(pilot.state, 'pay')
      if (!stateChange.allowed) {
        return NextResponse.json({ ok: false, message: 'payment cannot be recorded in the current state' }, { status: 400 })
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        payment: {
          ...(pilot.payment || {}),
          ...(body.payment || {}),
          paidAt: new Date().toISOString(),
        },
        historyNote: body.note,
        by: body.by,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'paid',
        eventKey: `paid:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    if (body.action === 'launch') {
      const stateChange = applyTransition(pilot.state, 'launch')
      if (!stateChange.allowed) {
        return NextResponse.json({ ok: false, message: 'launch cannot be scheduled in the current state' }, { status: 400 })
      }
      // Require payment before launch
      if (!pilot.payment?.paidAt) {
        return NextResponse.json({ ok: false, message: 'Payment is required before scheduling launch' }, { status: 400 })
      }
      const launch = body.launch
      if (!launch || !String(launch.date || '').trim() || !String(launch.timezone || '').trim() || !String(launch.slotLabel || '').trim() || !String(launch.availabilityVersion || '').trim()) {
        return NextResponse.json({ ok: false, message: 'launch date, timezone, slot label, and availability version are required' }, { status: 400 })
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        launch: {
          ...(pilot.launch || {}),
          ...(body.launch || {}),
          scheduledAt: new Date().toISOString(),
        },
        historyNote: body.note,
        by: body.by,
      })
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'launch_scheduled',
        eventKey: `launch:${updated.version}:${Date.now()}`,
      })
      return NextResponse.json({ ok: true, pilot: updated })
    }

    const transition: PilotAction | null =
      body.action === 'revise'
        ? 'revise'
        : body.action === 'request_exception'
          ? 'request_exception'
          : body.action === 'resolve_exceptions'
            ? 'resolve_exceptions'
            : body.action === 'qualify'
              ? 'qualify'
              : body.action === 'disqualify'
                ? 'disqualify'
                : body.action === 'finalize'
                  ? 'finalize'
                  : body.action === 'activate'
                    ? 'activate'
                    : null

    if (!transition) {
      return NextResponse.json({ ok: false, message: 'unknown action' }, { status: 400 })
    }
    const stateChange = applyTransition(pilot.state, transition)
    if (!stateChange.allowed) {
      return NextResponse.json(
        { ok: false, message: `the action ${transition} is not allowed in the current state` },
        { status: 400 },
      )
    }
    if (transition === 'activate' && !pilot.payment?.paidAt) {
      return NextResponse.json({ ok: false, message: 'payment must clear before the pilot can be activated' }, { status: 422 })
    }
    const next = recompute(pilot, body)
    if (transition === 'resolve_exceptions') {
      next.exceptions = next.exceptions.map((item) => ({
        ...item,
        resolvedAt: new Date().toISOString(),
      }))
    }
    if (transition === 'qualify') {
      next.answers = { ...next.answers, assessmentOrigin: 'standard' }
      const qualified = classifyPilot(next.answers as PilotAnswers)
      next.route = qualified.route === 'disqualified' ? 'one-call' : qualified.route
      next.exceptions = qualified.exceptions
      next.unresolved = computeUnresolved(next.answers as PilotAnswers, {
        startDate: pilot.resolvedStartDate || undefined,
        route: next.route,
      })
    }
    if (transition === 'disqualify') {
      next.route = 'disqualified'
      next.exceptions = next.exceptions.map((item) => ({
        ...item,
        resolvedAt: item.resolvedAt || new Date().toISOString(),
      }))
    }
    if (
      transition === 'finalize' &&
      hasPendingMaterialException(next.exceptions)
    ) {
      return NextResponse.json(
        { ok: false, message: 'resolve the pilot terms review items before finalizing the agreement' },
        { status: 422 },
      )
    }
    const updated = await updatePilot(id, {
      state: stateChange.state,
      route: next.route,
      answers: next.answers,
      exceptions: next.exceptions,
      unresolved: next.unresolved,
      proposal: next.proposal,
      successCriteria: next.criteria,
      securityDecisions: next.security,
      resolvedStartDate: body.startDate !== undefined ? body.startDate : undefined,
      historyNote: body.note,
      by: body.by,
    })
    const variant = emailVariant[body.action]
    if (variant) await enqueuePilotEmail(id, variant, undefined, `revision:${updated.version}:${variant}`)
    if (transition === 'request_exception') {
      const eventKey = `exception-review:${updated.id}:${updated.updatedAt}`
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'exception_review_requested',
        eventKey,
      })
      await enqueueExceptionReviewTask(updated.id, eventKey)
    }
    if (transition === 'finalize') {
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'agreement_ready',
        eventKey: `agreement-ready:${updated.version}:${Date.now()}`,
      })
    }
    if (transition === 'activate') {
      await notifyPilotRoomEvent({
        pilot: updated,
        event: 'pilot_active',
        eventKey: `active:${updated.version}:${Date.now()}`,
      })
    }
    return NextResponse.json({ ok: true, pilot: updated })
  } catch (error) {
    if (error instanceof PilotDraftConflictError) return conflictResponse(error.conflicts)
    if (error instanceof StaleReviewError) {
      return NextResponse.json(
        { ok: false, code: 'stale_review', message: error.message },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'the pilot room could not be updated' },
      { status: 500 },
    )
  }
}
