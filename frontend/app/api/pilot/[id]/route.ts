import {randomUUID} from 'node:crypto'
import {cookies} from 'next/headers'
import {NextResponse} from 'next/server'
import type {
  PilotAnswers,
  SuccessCriterion,
  SecurityDecision,
} from '@/lib/leads/contracts'
import {
  applyTransition,
  buildCommercialSnapshot,
  buildSecurityDecisions,
  buildSuccessCriteria,
  classifyPilot,
  computeUnresolved,
  reviewerTokenRole,
  type CommercialSnapshot,
  type PilotAction,
  type PilotState,
  type Reviewer,
  type ReviewerRole,
} from '@/lib/leads/pilot'
import {APP_SESSION_COOKIE, currentApplicationUser, invitePilotMember, pilotMembershipRole} from '@/lib/leads/application-auth'
import {sendApplicationAccessEmail} from '@/lib/leads/account-email'
import {
  getPilotById,
  enqueuePilotEmail,
  updatePilot,
  type StoredPilot,
} from '@/lib/leads/store'

type PatchAction =
  | 'update'
  | 'start_team_review'
  | 'invite_reviewer'
  | 'reviewer_decision'
  | 'reviewer_note'
  | 'remove_reviewer'
  | 'reviewer_role'
  | 'claim_role'
  | 'confirm_scope'
  | 'revise'
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

type PatchBody = {
  action: PatchAction
  note?: string
  by?: string
  answers?: Record<string, unknown>
  criteria?: SuccessCriterion[]
  security?: SecurityDecision[]
  startDate?: string | null
  valueConfirmed?: boolean
  signer?: {name: string; email: string}
  share?: {role: 'participant' | 'approver' | 'signer'; email: string}
  invite?: {role: ReviewerRole; email: string; name?: string; reviewerId?: string}
  reviewerId?: string
  decision?: 'confirm' | 'changes'
  role?: ReviewerRole
  payment?: Record<string, unknown>
  kickoff?: Record<string, unknown>
}

const TEAM_REVIEW_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']
const INVITATION_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']

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
  const stale = pilot.reviewers.filter(
    (reviewer) =>
      reviewer.status !== 'revoked' &&
      reviewer.status !== 'proposed' &&
      reviewer.versionSeen < pilot.version &&
      reviewer.email,
  )
  for (const reviewer of stale) {
    try {
      await enqueuePilotEmail(pilot.id, 'revised_ready', reviewer.email)
    } catch (cause) {
      console.error('revised_ready email failed', cause)
    }
  }
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
    return prior?.resolvedAt ? {...item, resolvedAt: prior.resolvedAt} : item
  })
  const startDate =
    body.startDate !== undefined ? body.startDate : pilot.resolvedStartDate
  const answersChanged = Boolean(body.answers)
  const criteria = answersChanged
    ? buildSuccessCriteria(answers as PilotAnswers)
    : body.criteria || pilot.successCriteria
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
  const proposal =
    body.valueConfirmed !== undefined && baseProposal?.valueModel
      ? {
          ...baseProposal,
          valueModel: {...baseProposal.valueModel, confirmed: body.valueConfirmed},
        }
      : baseProposal
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

export async function PATCH(
  request: Request,
  {params}: {params: Promise<{id: string}>},
): Promise<NextResponse> {
  const {id} = await params
  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ok: false, message: 'invalid request body'}, {status: 400})
  }
  if (!body.action) {
    return NextResponse.json({ok: false, message: 'action is required'}, {status: 400})
  }
  const user = await currentApplicationUser((await cookies()).get(APP_SESSION_COOKIE)?.value)
  if (!user) {
    return NextResponse.json({ok: false, message: 'sign in is required'}, {status: 401})
  }

  const pilot = await getPilotById(id)
  if (!pilot) {
    return NextResponse.json({ok: false, message: 'pilot record not found'}, {status: 404})
  }
  const accessRole = await pilotMembershipRole(pilot.id, user.id)
  if (!accessRole) {
    return NextResponse.json({ok: false, message: 'you do not have access to this pilot'}, {status: 403})
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
      {ok: false, message: 'only the founder can resolve this qualification exception'},
      {status: 403},
    )
  }
  if (body.action === 'sign' && accessRole !== 'owner' && accessRole !== 'signer') {
    return NextResponse.json({ok: false, message: 'only an assigned signer can sign the agreement'}, {status: 403})
  }

  try {
    if (body.action === 'share') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the account owner can invite members'}, {status: 403})
      }
      const share = body.share
      if (!share || !share.email || !['participant', 'approver', 'signer'].includes(share.role)) {
        return NextResponse.json({ok: false, message: 'share role and email are required'}, {status: 400})
      }
      const invited = await invitePilotMember({pilotId: pilot.id, email: share.email, role: share.role})
      await sendApplicationAccessEmail({
        user: invited.user,
        purpose: 'invite',
        customerAccountId: invited.customerAccountId,
        role: 'member',
        idempotencyKey: `pilot-member-invite:${pilot.id}:${invited.user.id}:${share.role}`,
        nextPath: `/paid-pilot/room/${pilot.id}`,
      })
      let updated = pilot
      if (share.role === 'approver') {
        const answers = pilot.answers as Record<string, unknown>
        if (!String(answers.approverEmail || '').trim()) {
          const nextAnswers = {...answers, approverEmail: share.email}
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
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'start_team_review') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can mark the draft ready for team review'}, {status: 403})
      }
      const stateChange = applyTransition(pilot.state, 'start_team_review')
      if (!stateChange.allowed) {
        return NextResponse.json(
          {ok: false, message: 'the draft is not in a state that can be shared for team review'},
          {status: 400},
        )
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        historyNote: 'submitter confirmed the draft is ready for team review',
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'invite_reviewer') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can invite reviewers'}, {status: 403})
      }
      const invite = body.invite
      if (
        !invite ||
        !invite.role ||
        !String(invite.email || '').trim()
      ) {
        return NextResponse.json({ok: false, message: 'reviewer role and email are required'}, {status: 400})
      }
      if (!INVITATION_STATES.includes(pilot.state)) {
        return NextResponse.json(
          {ok: false, message: 'invitations unlock once the draft is ready for team review'},
          {status: 400},
        )
      }
      const now = new Date().toISOString()
      const email = String(invite.email).trim().toLowerCase()
      const existing = pilot.reviewers.find(
        (reviewer) => reviewer.email.toLowerCase() === email && reviewer.status !== 'revoked',
      )
      const reviewers: Reviewer[] = existing
        ? pilot.reviewers.map((reviewer) =>
            reviewer.id === existing.id
              ? {
                  ...reviewer,
                  name: invite.name && invite.name.trim() ? invite.name.trim() : reviewer.name,
                  status: 'invited',
                  invitedAt: reviewer.invitedAt || now,
                  versionSeen: pilot.version,
                }
              : reviewer,
          )
        : [
            ...pilot.reviewers,
            {
              id: randomUUID(),
              role: invite.role,
              name: String(invite.name || '').trim(),
              email,
              status: 'invited' as const,
              invitedAt: now,
              versionSeen: pilot.version,
              notes: [],
            },
          ]
      const updated = await updatePilot(id, {
        reviewers,
        historyNote: `${invite.role.replaceAll('_', ' ')} ${email} invited to the room`,
        by: body.by,
      })
      const invited = await invitePilotMember({
        pilotId: pilot.id,
        email,
        displayName: invite.name,
        role: reviewerTokenRole(invite.role),
      })
      await sendApplicationAccessEmail({
        user: invited.user,
        purpose: 'invite',
        customerAccountId: invited.customerAccountId,
        role: 'member',
        idempotencyKey: `pilot-reviewer-invite:${pilot.id}:${invited.user.id}:${invite.role}`,
        nextPath: `/paid-pilot/room/${pilot.id}`,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'reviewer_decision') {
      const reviewerId = body.reviewerId
      const decision = body.decision
      if (!reviewerId || !decision) {
        return NextResponse.json({ok: false, message: 'reviewer and decision are required'}, {status: 400})
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === reviewerId)
      if (!reviewer) {
        return NextResponse.json({ok: false, message: 'reviewer not found'}, {status: 404})
      }
      if (
        accessRole !== 'owner' &&
        reviewer.email.toLowerCase() !== user.email.toLowerCase()
      ) {
        return NextResponse.json({ok: false, message: 'you can only record decisions for your own review'}, {status: 403})
      }
      const now = new Date().toISOString()
      const reviewers = pilot.reviewers.map((candidate) =>
        candidate.id === reviewerId
          ? {
              ...candidate,
              status: 'reviewed' as const,
              reviewedAt: now,
              requestedChanges: decision === 'changes',
              versionSeen: pilot.version,
              notes: body.note ? [...candidate.notes, body.note.trim()] : candidate.notes,
            }
          : candidate,
      )
      const updated = await updatePilot(id, {
        reviewers,
        historyNote: `${reviewer.email} ${decision === 'changes' ? 'requested changes' : 'confirmed'} (${reviewer.role.replaceAll('_', ' ')})`,
        by: body.by,
      })
      if (decision === 'changes') {
        await enqueuePilotEmail(id, 'change_requested')
      } else if (reviewer.role === 'technical_evaluator') {
        await enqueuePilotEmail(id, 'technical_confirmed')
      } else if (reviewer.role === 'economic_buyer') {
        await enqueuePilotEmail(id, 'terms_confirmed')
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
        await enqueuePilotEmail(id, 'buyer_nudge', buyer.email)
      }
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'reviewer_note') {
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ok: false, message: 'reviewer not found'}, {status: 404})
      }
      if (accessRole !== 'owner' && reviewer.email.toLowerCase() !== user.email.toLowerCase()) {
        return NextResponse.json({ok: false, message: 'you can only add notes to your own review'}, {status: 403})
      }
      const note = String(body.note || '').trim()
      if (!note) {
        return NextResponse.json({ok: false, message: 'note is required'}, {status: 400})
      }
      const updated = await updatePilot(id, {
        reviewers: pilot.reviewers.map((candidate) =>
          candidate.id === reviewer.id
            ? {...candidate, notes: [...candidate.notes, note]}
            : candidate,
        ),
        historyNote: `${reviewer.email} added a review note`,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'remove_reviewer') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can remove reviewers'}, {status: 403})
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ok: false, message: 'reviewer not found'}, {status: 404})
      }
      const updated = await updatePilot(id, {
        reviewers: pilot.reviewers.map((candidate) =>
          candidate.id === reviewer.id ? {...candidate, status: 'revoked'} : candidate,
        ),
        historyNote: `${reviewer.email} removed from the room`,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'reviewer_role') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can change reviewer roles'}, {status: 403})
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ok: false, message: 'reviewer not found'}, {status: 404})
      }
      if (!body.role) {
        return NextResponse.json({ok: false, message: 'role is required'}, {status: 400})
      }
      const role = body.role as ReviewerRole
      const updated = await updatePilot(id, {
        reviewers: pilot.reviewers.map((candidate) =>
          candidate.id === reviewer.id ? {...candidate, role} : candidate,
        ),
        historyNote: `${reviewer.email} moved to ${role.replaceAll('_', ' ')}`,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'claim_role') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can claim a proposed role'}, {status: 403})
      }
      const reviewer = pilot.reviewers.find((candidate) => candidate.id === body.reviewerId)
      if (!reviewer) {
        return NextResponse.json({ok: false, message: 'reviewer not found'}, {status: 404})
      }
      const now = new Date().toISOString()
      const updated = await updatePilot(id, {
        reviewers: pilot.reviewers.map((candidate) =>
          candidate.id === reviewer.id
            ? {
                ...candidate,
                name:
                  String(pilot.answers.productionOwner || '').split(',')[0].trim() ||
                  user.email,
                email: user.email.toLowerCase(),
                status: 'reviewed' as const,
                reviewedAt: now,
                requestedChanges: false,
                versionSeen: pilot.version,
              }
            : candidate,
        ),
        historyNote: `the submitter holds the ${reviewer.role.replaceAll('_', ' ')} role`,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'confirm_scope') {
      const stateChange = applyTransition(pilot.state, 'confirm_scope')
      if (!stateChange.allowed) {
        return NextResponse.json(
          {ok: false, message: 'scope cannot be confirmed in the current state'},
          {status: 400},
        )
      }
      const next = recompute(pilot, body)
      if (next.unresolved.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: 'resolve the highlighted items before confirming scope',
            unresolved: next.unresolved,
          },
          {status: 422},
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
      return NextResponse.json({ok: true, pilot: updated})
    }

    const emailVariant: Record<PatchAction, string | null> = {
      update: null,
      start_team_review: null,
      invite_reviewer: null,
      reviewer_decision: null,
      reviewer_note: null,
      remove_reviewer: null,
      reviewer_role: null,
      claim_role: null,
      confirm_scope: null,
      revise: null,
      request_exception: 'exception',
      resolve_exceptions: null,
      qualify: null,
      disqualify: null,
      finalize: 'ready_sign',
      sign: null,
      pay: 'paid',
      kickoff: null,
      activate: 'kickoff',
      share: null,
    }

    if (body.action === 'update') {
      if (accessRole !== 'owner') {
        return NextResponse.json({ok: false, message: 'only the submitter can edit the plan'}, {status: 403})
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
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'sign') {
      const stateChange = applyTransition(pilot.state, 'sign')
      if (!stateChange.allowed) {
        return NextResponse.json({ok: false, message: 'the pilot is not ready for signature'}, {status: 400})
      }
      const answers = {
        ...(pilot.answers as Record<string, unknown>),
        ...(body.answers || {}),
      }
      const name = body.signer?.name || String(answers.signerName || '')
      const email = body.signer?.email || String(answers.signerEmail || '')
      if (!name.trim() || !email.trim()) {
        return NextResponse.json(
          {ok: false, message: 'signer name and email are required'},
          {status: 400},
        )
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        signing: {
          ...(pilot.signing || {}),
          name,
          email,
          signedAt: new Date().toISOString(),
          consented: true,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
        },
        historyNote: `signed by ${name} (${email})`,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'pay') {
      const stateChange = applyTransition(pilot.state, 'pay')
      if (!stateChange.allowed) {
        return NextResponse.json({ok: false, message: 'payment cannot be recorded in the current state'}, {status: 400})
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
      const variant = emailVariant[body.action]
      if (variant) await enqueuePilotEmail(id, variant)
      return NextResponse.json({ok: true, pilot: updated})
    }

    if (body.action === 'kickoff') {
      const stateChange = applyTransition(pilot.state, 'kickoff')
      if (!stateChange.allowed) {
        return NextResponse.json({ok: false, message: 'kickoff cannot be scheduled in the current state'}, {status: 400})
      }
      const updated = await updatePilot(id, {
        state: stateChange.state,
        kickoff: {
          ...(pilot.kickoff || {}),
          ...(body.kickoff || {}),
          scheduledAt: new Date().toISOString(),
        },
        historyNote: body.note,
        by: body.by,
      })
      return NextResponse.json({ok: true, pilot: updated})
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
      return NextResponse.json({ok: false, message: 'unknown action'}, {status: 400})
    }
    const stateChange = applyTransition(pilot.state, transition)
    if (!stateChange.allowed) {
      return NextResponse.json(
        {ok: false, message: `the action ${transition} is not allowed in the current state`},
        {status: 400},
      )
    }
    const next = recompute(pilot, body)
    if (transition === 'resolve_exceptions') {
      next.exceptions = next.exceptions.map((item) => ({
        ...item,
        resolvedAt: new Date().toISOString(),
      }))
    }
    if (transition === 'qualify') {
      next.answers = {...next.answers, assessmentOrigin: 'standard'}
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
      next.route === 'one-call' &&
      next.exceptions.some((item) => !item.resolvedAt)
    ) {
      return NextResponse.json(
        {ok: false, message: 'resolve the pilot terms review items before finalizing the agreement'},
        {status: 422},
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
    if (variant) await enqueuePilotEmail(id, variant)
    return NextResponse.json({ok: true, pilot: updated})
  } catch (error) {
    return NextResponse.json(
      {ok: false, message: error instanceof Error ? error.message : 'the pilot room could not be updated'},
      {status: 500},
    )
  }
}
