'use client'

import {useEffect, useMemo, useState} from 'react'
import {ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {RoomCheckbox, RoomSelectField, RoomTextField, RoomTextareaField} from '@/components/mui/fields'
import {
  reviewerRoleLabel,
  stateLabel,
  type PilotState,
  type Reviewer,
  type ReviewerRole,
} from '@/lib/leads/pilot'
import type {StoredPilot} from '@/lib/leads/store'
import {trackEvent} from '@/lib/leads/analytics-client'
import {formatReadableDate} from '@/lib/utils'
import {packageTermDays} from '@/lib/package-specifications'

const EDITABLE_STATES: PilotState[] = [
  'reviewing',
  'revision',
  'team_review',
  'exception_review',
  'scope_confirmed',
]

const INVITATION_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']

const CRITERION_STATUS_OPTIONS = [
  {value: 'accepted', label: 'Accept'},
  {value: 'modified', label: 'Modify'},
  {value: 'not-applicable', label: 'Not applicable'},
] as const

const REVIEWER_ROLES: ReviewerRole[] = [
  'production_owner',
  'economic_buyer',
  'technical_evaluator',
  'security_reviewer',
  'procurement_reviewer',
  'approver',
  'signer',
]

function FieldLabel({children}: {children: string}) {
  return (
    <p className="mt-16 mb-6 t-p-sm-sans text-[#52617D]">{children}</p>
  )
}

type ReviewerStatusView = {
  label: string
  tone: 'ok' | 'warn' | 'muted'
}

function reviewerStatusView(reviewer: Reviewer | undefined): ReviewerStatusView {
  if (!reviewer) return {label: '—', tone: 'muted'}
  if (reviewer.status === 'revoked') return {label: 'Removed', tone: 'muted'}
  if (reviewer.status === 'reviewed') {
    if (reviewer.requestedChanges) return {label: 'Changes requested', tone: 'warn'}
    if (reviewer.versionSeen < 1 || !reviewer.reviewedAt) return {label: 'Confirmed', tone: 'ok'}
    return {label: 'Confirmed', tone: 'ok'}
  }
  if (reviewer.status === 'opened') return {label: 'Review pending', tone: 'warn'}
  if (reviewer.status === 'invited') return {label: 'Invited', tone: 'warn'}
  return {label: 'Proposed', tone: 'muted'}
}

function combinedStatus(
  reviewers: Reviewer[],
  roles: ReviewerRole[],
): ReviewerStatusView {
  const owned = reviewers.filter(
    (reviewer) => roles.includes(reviewer.role) && reviewer.status !== 'revoked',
  )
  if (owned.some((reviewer) => reviewer.requestedChanges)) {
    return {label: 'Changes requested', tone: 'warn'}
  }
  if (owned.length > 0 && owned.every((reviewer) => reviewer.status === 'reviewed')) {
    return {label: 'Confirmed', tone: 'ok'}
  }
  if (owned.some((reviewer) => reviewer.status === 'invited' || reviewer.status === 'opened')) {
    return {label: 'Awaiting review', tone: 'warn'}
  }
  if (owned.length === 0) return {label: 'Proposed', tone: 'muted'}
  return {label: 'Proposed', tone: 'muted'}
}

function agreementStatus(state: PilotState): ReviewerStatusView {
  switch (state) {
    case 'ready_sign':
      return {label: 'Ready to sign', tone: 'ok'}
    case 'signed':
      return {label: 'Signed', tone: 'ok'}
    case 'paid':
      return {label: 'Paid', tone: 'ok'}
    case 'kickoff':
    case 'active':
      return {label: 'Live', tone: 'ok'}
    default:
      return {label: 'Not yet available', tone: 'muted'}
  }
}

export function PilotApprovalRoom({
  pilot: initial,
  accessRole,
  userEmail,
  sessionId,
  revisePath,
  founderAccess = false,
  qualificationCalendarUrl,
}: {
  pilot: StoredPilot
  accessRole: 'owner' | 'participant' | 'approver' | 'signer'
  userEmail: string
  sessionId?: string
  revisePath: string
  founderAccess?: boolean
  qualificationCalendarUrl?: string
}) {
  const [pilot, setPilot] = useState(initial)
  const [criteria, setCriteria] = useState(initial.successCriteria)
  const [startDate, setStartDate] = useState(initial.resolvedStartDate || '')
  const [valueConfirmed, setValueConfirmed] = useState(
    Boolean(initial.proposal?.valueModel?.confirmed),
  )
  const [signerName, setSignerName] = useState(
    String(initial.answers.signerName || ''),
  )
  const [signerEmail, setSignerEmail] = useState(
    String(initial.answers.signerEmail || ''),
  )
  const [signerConsent, setSignerConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draftRole, setDraftRole] = useState<ReviewerRole>('technical_evaluator')
  const [draftName, setDraftName] = useState('')
  const [draftEmail, setDraftEmail] = useState('')
  const [myNote, setMyNote] = useState('')

  const editable = EDITABLE_STATES.includes(pilot.state)
  const canEdit = accessRole === 'owner'
  const canSign = accessRole === 'owner' || accessRole === 'signer'
  const invitationsUnlocked = INVITATION_STATES.includes(pilot.state)
  const answers = pilot.answers as Record<string, string | boolean | undefined>
  const value = pilot.proposal?.valueModel
  const reviewers = pilot.reviewers
  const myReviewer = reviewers.find(
    (reviewer) =>
      reviewer.email.toLowerCase() === userEmail.toLowerCase() &&
      reviewer.status !== 'revoked',
  )
  const assessmentQualificationPending = pilot.exceptions.some(
    (item) => item.kind === 'assessment-qualification' && !item.resolvedAt,
  )

  useEffect(() => {
    void trackEvent('pilot_room_opened', {
      pilot_state: pilot.state,
      pilot_route: pilot.route,
      assessment_origin: answers.assessmentOrigin || 'standard',
    })
  }, [])

  useEffect(() => {
    if (!sessionId || pilot.state === 'paid') return
    const attemptsKey = `checkout-wait-${pilot.id}-${sessionId}`
    const attempts = Number(sessionStorage.getItem(attemptsKey) || 0)
    if (attempts >= 6) return
    const timer = setTimeout(() => {
      sessionStorage.setItem(attemptsKey, String(attempts + 1))
      window.location.reload()
    }, 3000)
    return () => clearTimeout(timer)
  }, [sessionId, pilot.state, pilot.id])

  useEffect(() => {
    if (accessRole === 'owner') return
    void fetch(`/api/pilot/${pilot.id}/presence`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({}),
    }).catch(() => {
      // presence recording is best-effort
    })
  }, [accessRole, pilot.id])

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/pilot/${pilot.id}`, {
        method: 'PATCH',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
      })
      const json = (await response.json()) as {
        ok: boolean
        message?: string
        pilot?: StoredPilot
        unresolved?: Array<{key: string; label: string; resolution: string}>
      }
      if (!response.ok || !json.ok) {
        const detail = json.unresolved?.map((item) => `- ${item.label}`).join('\n')
        throw new Error(detail ? `resolve the highlighted items first:\n${detail}` : (json.message || 'could not update the pilot room'))
      }
      if (json.pilot) setPilot(json.pilot)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not update the pilot room')
      return false
    } finally {
      setBusy(false)
    }
  }

  function saveFields() {
    return {
      criteria,
      startDate: startDate || null,
      valueConfirmed,
    }
  }

  async function onSave() {
    if (await patch({action: 'update', ...saveFields()})) {
      setNotice('changes saved')
    }
  }

  async function onConfirmScope() {
    if (await patch({action: 'confirm_scope', ...saveFields()})) {
      setNotice('scope confirmed — the agreement can now be finalized')
    }
  }

  async function onStartTeamReview() {
    if (await patch({action: 'start_team_review'})) {
      await onInviteAllRequired()
      setNotice('invitations are unlocked. reviewers see this exact version until a material change is submitted — any change after this point flags their confirmations for re-review.')
    }
  }

  async function onInvite(reviewer: Reviewer) {
    if (await patch({
      action: 'invite_reviewer',
      invite: {role: reviewer.role, email: reviewer.email, name: reviewer.name, reviewerId: reviewer.id},
    })) {
      setNotice(`invitation sent to ${reviewer.email}`)
    }
  }

  async function onInviteAllRequired() {
    const pending = reviewers.filter(
      (reviewer) =>
        reviewer.status === 'proposed' &&
        reviewer.email.trim() &&
        reviewer.role !== 'signer',
    )
    if (pending.length === 0) {
      setError('no proposed reviewers with an email to invite yet')
      return
    }
    for (const reviewer of pending) {
      const ok = await patch({
        action: 'invite_reviewer',
        invite: {role: reviewer.role, email: reviewer.email, name: reviewer.name},
      })
      if (!ok) return
    }
    setNotice(`invitations sent to ${pending.length} reviewer${pending.length === 1 ? '' : 's'}`)
  }

  async function onAddReviewer() {
    if (!draftEmail.trim()) {
      setError('enter an email for the reviewer')
      return
    }
    if (await patch({
      action: 'invite_reviewer',
      invite: {role: draftRole, email: draftEmail.trim(), name: draftName.trim() || undefined},
    })) {
      setNotice(`invitation sent to ${draftEmail.trim()}`)
      setDraftName('')
      setDraftEmail('')
    }
  }

  async function onRemove(reviewer: Reviewer) {
    if (await patch({action: 'remove_reviewer', reviewerId: reviewer.id})) {
      setNotice(`${reviewer.email} removed from the room`)
    }
  }

  async function onChangeRole(reviewer: Reviewer, role: ReviewerRole) {
    if (await patch({action: 'reviewer_role', reviewerId: reviewer.id, role})) {
      setNotice(`${reviewer.email} is now the ${reviewerRoleLabel(role).toLowerCase()}`)
    }
  }

  async function onClaim(reviewer: Reviewer) {
    if (await patch({action: 'claim_role', reviewerId: reviewer.id})) {
      setNotice(`you hold the ${reviewerRoleLabel(reviewer.role).toLowerCase()} role`)
    }
  }

  async function onReviewerDecision(decision: 'confirm' | 'changes') {
    if (!myReviewer) return
    if (await patch({
      action: 'reviewer_decision',
      reviewerId: myReviewer.id,
      decision,
      note: myNote.trim() || undefined,
    })) {
      setNotice(decision === 'confirm' ? 'your review is recorded' : 'your requested changes were recorded')
      setMyNote('')
    }
  }

  async function onAddNote() {
    if (!myReviewer) return
    if (!myNote.trim()) {
      setError('write a note before submitting')
      return
    }
    if (await patch({action: 'reviewer_note', reviewerId: myReviewer.id, note: myNote.trim()})) {
      setNotice('note added')
      setMyNote('')
    }
  }

  async function onFinalize() {
    if (await patch({action: 'finalize', note: 'agreement finalized for signature'})) {
      setNotice('the standard agreement is ready to sign')
    }
  }

  async function onSign() {
    if (!signerName.trim() || !signerEmail.trim()) {
      setError('enter the authorized signer\u2019s name and email')
      return
    }
    if (!signerConsent) {
      setError('check the agreement before signing')
      return
    }
    if (await patch({action: 'sign', signer: {name: signerName, email: signerEmail}})) {
      setNotice('signed — the pilot fee is due on signature')
    }
  }

  async function onPay() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/pilot/${pilot.id}/checkout`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      })
      const json = (await response.json()) as {
        ok: boolean
        message?: string
        url?: string | null
        pilot?: StoredPilot
      }
      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'could not start payment')
      }
      if (json.url) {
        window.location.href = json.url
        return
      }
      if (json.pilot) setPilot(json.pilot)
      setNotice('payment recorded — kickoff can be scheduled')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not start payment')
    } finally {
      setBusy(false)
    }
  }

  async function onKickoff() {
    if (await patch({action: 'kickoff'})) {
      setNotice('kickoff scheduled — the pilot can be activated')
    }
  }

  async function onActivate() {
    if (await patch({action: 'activate', note: 'pilot activated'})) {
      setNotice('the pilot is live')
    }
  }

  async function onQualificationDecision(action: 'qualify' | 'disqualify') {
    const accepted = await patch({
      action,
      note:
        action === 'qualify'
          ? 'assessment override qualified by founder'
          : 'assessment override declined by founder',
    })
    if (accepted) {
      void trackEvent('qualification_call_outcome', {
        pilot_id: pilot.id,
        outcome: action === 'qualify' ? 'qualified' : 'not_eligible',
      })
    }
  }

  const actionButtons = useMemo(() => {
    if (!canEdit) {
      if (founderAccess && assessmentQualificationPending && pilot.state === 'exception_review') {
        return (
          <>
            <button onClick={() => onQualificationDecision('qualify')} disabled={busy} className={accentButtonClasses}>
              qualify for pilot
            </button>
            <button onClick={() => onQualificationDecision('disqualify')} disabled={busy} className={plainButtonClasses}>
              mark not eligible
            </button>
          </>
        )
      }
      return null
    }
    const pendingExceptionReview =
      pilot.route === 'one-call' &&
      pilot.exceptions.some((item) => !item.resolvedAt)
    switch (pilot.state) {
      case 'reviewing':
      case 'revision':
        return (
          <>
            <button onClick={onSave} disabled={busy} className={primaryButtonClasses}>
              save changes
            </button>
            {!pendingExceptionReview ? (
              <button onClick={onConfirmScope} disabled={busy} className={accentButtonClasses}>
                confirm scope
              </button>
            ) : null}
            {pilot.exceptions.length > 0 ? (
              <button onClick={() => patch({action: 'request_exception', note: 'exception review requested'})} disabled={busy} className={plainButtonClasses}>
                request exception review
              </button>
            ) : null}
          </>
        )
      case 'team_review':
        return (
          <>
            <button onClick={onSave} disabled={busy} className={primaryButtonClasses}>
              save changes
            </button>
            {!pendingExceptionReview ? (
              <button onClick={onConfirmScope} disabled={busy} className={accentButtonClasses}>
                confirm scope
              </button>
            ) : null}
            {pilot.exceptions.length > 0 ? (
              <button onClick={() => patch({action: 'request_exception', note: 'exception review requested'})} disabled={busy} className={plainButtonClasses}>
                request exception review
              </button>
            ) : null}
          </>
        )
      case 'exception_review':
        if (assessmentQualificationPending) {
          return founderAccess ? (
            <>
              <button onClick={() => onQualificationDecision('qualify')} disabled={busy} className={accentButtonClasses}>
                qualify for pilot
              </button>
              <button onClick={() => onQualificationDecision('disqualify')} disabled={busy} className={plainButtonClasses}>
                mark not eligible
              </button>
            </>
          ) : null
        }
        return (
          <>
            <button onClick={() => patch({action: 'resolve_exceptions', note: 'exceptions resolved'})} disabled={busy} className={accentButtonClasses}>
              mark exceptions resolved
            </button>
          </>
        )
      case 'scope_confirmed':
        return (
          <>
            <button onClick={onSave} disabled={busy} className={primaryButtonClasses}>
              save changes
            </button>
            {!pendingExceptionReview ? (
              <button onClick={onFinalize} disabled={busy} className={accentButtonClasses}>
                finalize the agreement
              </button>
            ) : null}
            {pilot.exceptions.length > 0 ? (
              <button onClick={() => patch({action: 'request_exception', note: 'exception review requested'})} disabled={busy} className={plainButtonClasses}>
                request exception review
              </button>
            ) : null}
          </>
        )
      case 'ready_sign':
        return null
      case 'signed':
        return (
          <button onClick={onPay} disabled={busy} className={accentButtonClasses}>
            pay the ${pilot.proposal?.priceAmount || 5000} pilot fee
          </button>
        )
      case 'paid':
        return (
          <button onClick={onKickoff} disabled={busy} className={accentButtonClasses}>
            schedule the kickoff
          </button>
        )
      case 'kickoff':
        return (
          <button onClick={onActivate} disabled={busy} className={accentButtonClasses}>
            activate the pilot
          </button>
        )
      default:
        return null
    }
  }, [pilot.state, pilot.route, pilot.exceptions, pilot.proposal?.priceAmount, busy, assessmentQualificationPending, founderAccess, canEdit])

  const routeBadge =
    pilot.route === 'zero-call'
      ? 'no call required to proceed'
      : pilot.route === 'one-call'
        ? 'one pilot terms review required'
        : 'needs clarification'

  const consolidatedRows: Array<{section: string; view: ReviewerStatusView}> = [
    {
      section: 'Workflow scope',
      view: reviewerStatusView(
        reviewers.find((reviewer) => reviewer.role === 'production_owner'),
      ),
    },
    {
      section: 'Success criteria',
      view: combinedStatus(reviewers, ['production_owner', 'economic_buyer']),
    },
    {
      section: 'Technical compatibility',
      view: reviewerStatusView(
        reviewers.find((reviewer) => reviewer.role === 'technical_evaluator'),
      ),
    },
    {
      section: 'Security review',
      view: reviewers.some((reviewer) => reviewer.role === 'security_reviewer')
        ? reviewerStatusView(
            reviewers.find((reviewer) => reviewer.role === 'security_reviewer'),
          )
        : {label: 'Not required', tone: 'muted'},
    },
    {
      section: 'Commercial terms',
      view: (() => {
        const buyer = reviewers.find((reviewer) => reviewer.role === 'economic_buyer')
        if (buyer?.status === 'reviewed' && buyer.requestedChanges) {
          return {label: 'Changes requested', tone: 'warn' as const}
        }
        if (buyer?.status === 'reviewed') {
          return {label: 'Confirmed', tone: 'ok' as const}
        }
        return {label: 'Awaiting buyer', tone: 'warn' as const}
      })(),
    },
    {
      section: 'Agreement',
      view: agreementStatus(pilot.state),
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-16 gap-y-8">
        <div className='w-full md:w-auto'>
          <p className="t-p-sm-sans">pilot approval room {pilot.answers?.company ? `· ${pilot.answers.company}` : ''}</p>
          <h1 className="mt-8 t-h3-sans">{stateLabel(pilot.state)}</h1>
          <p className="t-p-sm-sans">{routeBadge}</p>
        </div>
        <div className="md:text-right w-full md:w-auto">
          <p className="mt-4 t-p-sm-sans text-[#52617D]">
            {accessRole} · {userEmail}
          </p>
          <p className="mt-16">
            <a
              className={primaryButtonClasses}
              href={`/api/leads/documents/pilot-packet?pilot=${encodeURIComponent(pilot.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              download a pdf copy
            </a>
          </p>
        </div>
      </div>

      {pilot.state === 'not_eligible' ? (
        <div className="mt-24 rounded border border-[#E5C7A8] bg-[#FBF3E9] px-20 py-16">
          <p className="t-p-sm-sans font-medium">the standard pilot cannot proceed as drafted.</p>
          <p className="mt-8 t-p-sm-sans text-[#52617D]">
            revise the plan to continue.
          </p>
          <CTAButton href={revisePath} className="mt-16 border-[#07112C]/20 !bg-[#07112C]">
            <span>revise the plan</span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </CTAButton>
        </div>
      ) : null}

      {(pilot.state === 'reviewing' || pilot.state === 'revision') &&
      accessRole === 'owner' ? (
        <div className="mt-24 rounded border border-[#C9D6EA] bg-[#F3F7FC] px-20 py-16">
          <p className="t-p-sm-sans font-medium">
            your pilot plan is ready. review it for accuracy before inviting your team for review.
          </p>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            workflows, people, integrations, security requirements,
            and annual terms are outlined below. 
          </p>
          <CTAButton
            appearance="plain"
            onClick={onStartTeamReview}
            disabled={busy}
            className={`${accentButtonClasses} mt-16`}
          >
            I have reviewed this draft and it is ready to share internally
          </CTAButton>
        </div>
      ) : null}

      {pilot.state === 'team_review' ? (
        <div className="mt-24 rounded border border-[#C9D6EA] bg-[#F3F7FC] px-20 py-16">
          <p className="t-p-sm-sans font-medium">ready for team review.</p>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            invitations are unlocked. reviewers see this exact version until a
            material change is submitted — any change after this point flags
            their confirmations for re-review.
          </p>
        </div>
      ) : null}

      {pilot.unresolved.length > 0 ? (
        <div className="mt-24 rounded border border-[#E5C7A8] bg-[#FBF3E9] px-20 py-16">
          <p className="t-p-sm-sans font-medium">
            {pilot.unresolved.length} item{pilot.unresolved.length === 1 ? '' : 's'} to resolve
          </p>
          <ul className="mt-12 grid gap-20">
            {pilot.unresolved.map((item) => (
              <li key={item.key} className="t-p-sm-sans text-[#52617D]">
                <a href={item.href} className="inline text-[#07112C]">{item.label}.</a>{' '}
                {item.resolution}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pilot.exceptions.length > 0 ? (
        <div className="mt-24 rounded border border-[#C9D6EA] bg-[#F3F7FC] px-20 py-16">
          <p className="t-p-sm-sans font-medium">terms outside the standard scope</p>
          <ul className="mt-12 grid gap-20">
            {pilot.exceptions.map((item, index) => (
              <li key={item.kind + index} className="t-p-sm-sans">
                <span className="text-[#07112C]">{item.summary}</span>{' '}
                <div className="flex items-center justify-between">
                  {item.amendment}
                  {item.resolvedAt ? <span className="text-[#2F66B5]"> resolved</span> : null}
                </div>
              </li>
            ))}
          </ul>
          {pilot.route === 'one-call' &&
          pilot.exceptions.some((item) => !item.resolvedAt) ? (
            <p className="mt-12 t-p-sm-sans text-[#52617D]">
              a single pilot terms review is required before this plan can be
              finalized and signed.
            </p>
          ) : null}
        </div>
      ) : null}

      {assessmentQualificationPending ? (
        <div className="mt-24 rounded border border-[#E5C7A8] bg-[#FBF3E9] px-20 py-16">
          <p className="t-p-sm-sans font-medium">qualification call required</p>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            This request came through the assessment self-selection path. The completed scope gives the founder enough context to definitively qualify or decline the pilot.
          </p>
          {!founderAccess && qualificationCalendarUrl ? (
            <a
              className="mt-12 inline-block t-p-sm-sans underline underline-offset-4"
              href={qualificationCalendarUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => void trackEvent('qualification_call_scheduled', {pilot_id: pilot.id})}
            >
              schedule the qualification call
            </a>
          ) : null}
        </div>
      ) : null}

      <section id="scope" className="mt-32 grid gap-20 md:grid-cols-2">
        <div className="rounded border border-[#D9E1EC] p-20">
          <h2 className="t-h3-sans">scope</h2>
          <dl className="mt-12 grid gap-20 t-p-sm-sans">
            <div><dt className="text-[#52617D]">pilot workflow</dt><dd className="mt-2">{String(answers.pilotWorkflow || answers.activeWorkflow || '—')}</dd></div>
            <div><dt className="text-[#52617D]">production owner</dt><dd className="mt-2">{String(answers.productionOwner || '—')}</dd></div>
            <div><dt className="text-[#52617D]">economic buyer</dt><dd className="mt-2">{String(answers.economicBuyer || '—')}</dd></div>
            <div><dt className="text-[#52617D]">technical evaluator</dt><dd className="mt-2">{String(answers.technicalEvaluator || '—')}</dd></div>
            <div><dt className="text-[#52617D]">historical projects</dt><dd className="mt-2">{String(answers.historicalProject || '—')}</dd></div>
            <div><dt className="text-[#52617D]">participants</dt><dd className="mt-2">{String(answers.participantsRange || '—')}</dd></div>
            <div><dt className="text-[#52617D]">integration method</dt><dd className="mt-2">{String(answers.integrationMethod || '—')}</dd></div>
            <div><dt className="text-[#52617D]">data classification</dt><dd className="mt-2">{String(answers.dataClassification || '—')}</dd></div>
            <div>
              <dt className="text-[#52617D]">pilot start date</dt>
              <dd className="mt-2">
                {editable && canEdit ? (
                  <RoomTextField
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                ) : (
                  formatReadableDate(pilot.resolvedStartDate) || 'not yet chosen'
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded border border-[#D9E1EC] p-20">
          <h2 className="t-h3-sans">commercial terms</h2>
          {pilot.proposal ? (
            <dl className="mt-12 grid gap-20 t-p-sm-sans">
              <div><dt className="text-[#52617D]">pilot fee</dt><dd className="mt-2">{pilot.proposal.priceLabel}, due on signature</dd></div>
              <div><dt className="text-[#52617D]">term</dt><dd className="mt-2">{pilot.proposal.termDays} days{pilot.proposal.termStart && pilot.proposal.termEnd ? ` · ${pilot.proposal.termStart} → ${pilot.proposal.termEnd}` : ''}</dd></div>
              {pilot.proposal.decisionDate ? <div><dt className="text-[#52617D]">final decision date</dt><dd className="mt-2">{pilot.proposal.decisionDate}</dd></div> : null}
              {pilot.proposal.creditDeadline ? <div><dt className="text-[#52617D]">annual credit window</dt><dd className="mt-2">signs by {pilot.proposal.creditDeadline}</dd></div> : null}
              {pilot.proposal.annualOption ? (
                <div>
                  <dt className="text-[#52617D]">proposed annual deployment</dt>
                  <dd className="mt-2">{pilot.proposal.annualOption.name} — {pilot.proposal.annualOption.priceLabel}</dd>
                  <dd className="mt-2 text-[#52617D]">{pilot.proposal.annualOption.creditNote}</dd>
                </div>
              ) : null}
              {value ? (
                <div>
                  <dt className="text-[#52617D]">auditable value estimate</dt>
                  <dd className="mt-2">{value.formula}</dd>
                  <dd className="mt-2">range ${value.low.toLocaleString()} – ${value.high.toLocaleString()} · midpoint ${value.midpoint.toLocaleString()}</dd>
                  <dd className="mt-2 text-[#52617D]">{value.frequency.label} · {value.hoursLoss.label} lost · {value.people.label} affected</dd>
                  {editable && canEdit ? (
                    <label className="mt-10 flex items-center gap-8">
                      <RoomCheckbox
                        checked={valueConfirmed}
                        onChange={(event) => setValueConfirmed(event.target.checked)}
                      />
                      <span className="t-p-sm-sans">confirm this estimate as reasonable</span>
                    </label>
                  ) : value.confirmed ? (
                    <p className="mt-10 t-p-sm-sans text-[#2F66B5]">estimate confirmed by the customer</p>
                  ) : null}
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-12 t-p-sm-sans text-[#52617D]">commercial terms are being prepared.</p>
          )}
        </div>
      </section>

      <section className="mt-24 rounded border border-[#D9E1EC] p-20">
        <h2 className="t-h3-sans">success criteria</h2>
        <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
          each criterion is judged by a named participant against a baseline and
          a measurable target, with evidence recorded in the final evaluation.
        </p>
        <div className="mt-16 grid gap-20">
          {criteria.map((criterion, index) => (
            <div key={criterion.key} className="grid gap-20 rounded border border-[#E5EBF4] p-14 md:grid-cols-[240px_1fr]">
              <div>
                <p className="t-p-sm-sans font-medium">{criterion.label}</p>
                {editable && canEdit ? (
                  <RoomSelectField
                    className="mt-8"
                    value={criterion.status}
                    onChange={(event) => {
                      const next = [...criteria]
                      next[index] = {
                        ...criterion,
                        status: event.target.value as typeof criterion.status,
                      }
                      setCriteria(next)
                    }}
                  >
                    {CRITERION_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </RoomSelectField>
                ) : (
                  <p className="mt-8 t-p-sm-sans text-[#52617D] capitalize">{criterion.status.replace('-', ' ')}</p>
                )}
              </div>
              <div className="grid gap-8">
                <label className="t-p-sm-sans text-[#52617D]">
                  measurable target
                  {editable && canEdit ? (
                    <RoomTextField
                      className="mt-4"
                      value={criterion.target || ''}
                      placeholder="e.g. under one minute to retrieve the approved asset"
                      onChange={(event) => {
                        const next = [...criteria]
                        next[index] = {...criterion, target: event.target.value}
                        setCriteria(next)
                      }}
                    />
                  ) : (
                    <span className="mt-4 block t-p-sm-sans text-[#07112C]">{criterion.target || '—'}</span>
                  )}
                </label>
                <label className="t-p-sm-sans text-[#52617D]">
                  participant
                  {editable && canEdit ? (
                    <RoomTextField
                      className="mt-4"
                      value={criterion.participant || ''}
                      onChange={(event) => {
                        const next = [...criteria]
                        next[index] = {...criterion, participant: event.target.value}
                        setCriteria(next)
                      }}
                    />
                  ) : (
                    <span className="mt-4 block t-p-sm-sans text-[#07112C]">{criterion.participant || '—'}</span>
                  )}
                </label>
                <label className="t-p-sm-sans text-[#52617D]">
                  evidence
                  {editable && canEdit ? (
                    <RoomTextField
                      className="mt-4"
                      value={criterion.evidence || ''}
                      onChange={(event) => {
                        const next = [...criteria]
                        next[index] = {...criterion, evidence: event.target.value}
                        setCriteria(next)
                      }}
                    />
                  ) : (
                    <span className="mt-4 block t-p-sm-sans text-[#07112C]">{criterion.evidence || '—'}</span>
                  )}
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-24 rounded border border-[#D9E1EC] p-20">
        <h2 className="t-h3-sans">security posture</h2>
        <div className="mt-16 grid gap-8">
          {pilot.securityDecisions.map((decision) => (
            <div key={decision.key} className="grid gap-4 border-b border-[#E5EBF4] pb-10 md:grid-cols-[220px_1fr_auto] md:items-baseline">
              <p className="t-p-sm-sans font-medium">{decision.label}</p>
              <p className="t-p-sm-sans text-[#52617D]">{decision.note || ''}</p>
              <p className="t-p-sm-sans capitalize text-[#2F66B5]">{decision.decision.replace('-', ' ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-24 rounded border border-[#D9E1EC] p-20">
        <h2 className="t-h3-sans">review status</h2>
        <dl className="mt-12 grid gap-20 t-p-sm-sans">
          {consolidatedRows.map((row) => (
            <div key={row.section} className="grid grid-cols-[1fr_auto] gap-12 items-baseline border-b border-[#E5EBF4] pb-10">
              <dt className="text-[#52617D]">{row.section}</dt>
              <dd
                className={
                  row.view.tone === 'ok'
                    ? 'text-[#2F66B5]'
                    : row.view.tone === 'warn'
                      ? 'text-[#B3261E]'
                      : 'text-[#AEB9CA]'
                }
              >
                {row.view.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {accessRole === 'owner' ? (
        <section className="mt-24 rounded border border-[#D9E1EC] p-20">
          <h2 className="t-h3-sans">reviewers</h2>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            who will review or approve this pilot? confirm the people
            and send invites here. 
            <br />
            each reviewer opens the plan through a
            personalized sign-in link and receives a scoped application account.
          </p>
          {!invitationsUnlocked ? (
            <p className="mt-12 t-p-sm-sans text-[#52617D]">
              invitations can be sent after confirming the draft is ready for review above.
            </p>
          ) : null}
          <div className="mt-16 grid gap-12">
            {reviewers.map((reviewer) => {
              const view = reviewerStatusView(reviewer)
              const stale =
                reviewer.status === 'reviewed' &&
                reviewer.versionSeen < pilot.version
              return (
                <div key={reviewer.id} className="grid gap-20 rounded border border-[#E5EBF4] p-14 md:grid-cols-[240px_1fr_auto] md:items-center">
                  <div>
                    <p className="t-p-sm-sans font-medium">{reviewerRoleLabel(reviewer.role)}</p>
                    <p className="t-p-sm-sans text-[#52617D]">
                      {reviewer.name || reviewer.email || 'no one named yet'}
                    </p>
                  </div>
                  <div className="grid gap-6">
                    <p className={`t-p-sm-sans capitalize ${view.tone === 'ok' ? 'text-[#2F66B5]' : view.tone === 'warn' ? 'text-[#B3261E]' : 'text-[#52617D]'}`}>
                      {view.label}
                      {stale ? <span className="text-[#B3261E]"> · reconfirmation needed</span> : null}
                    </p>
                    {reviewer.status === 'proposed' && !reviewer.email.trim() && invitationsUnlocked ? (
                      <div className="flex flex-wrap items-center gap-8">
                        <RoomTextField
                          className="max-w-56 border"
                          type="email"
                          placeholder="email address"
                          value={draftEmail}
                          onChange={(event) => setDraftEmail(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              if (draftEmail.trim()) void onInvite({...reviewer, email: draftEmail.trim()})
                            }
                          }}
                        />
                        <button
                          onClick={() => void onInvite({...reviewer, email: draftEmail.trim()})}
                          disabled={busy || !draftEmail.trim()}
                          className={primaryButtonClasses}
                        >
                          invite
                        </button>
                      </div>
                    ) : null}
                    {reviewer.status === 'proposed' && reviewer.email.trim() && invitationsUnlocked ? (
                      <button onClick={() => void onInvite(reviewer)} disabled={busy} className={primaryButtonClasses}>
                        invite
                      </button>
                    ) : null}
                    {(reviewer.status === 'invited' || reviewer.status === 'opened') && invitationsUnlocked ? (
                      <button onClick={() => void onInvite(reviewer)} disabled={busy} className={primaryButtonClasses}>
                        resend invitation
                      </button>
                    ) : null}
                    {reviewer.notes.length > 0 ? (
                      <ul className="grid gap-4">
                        {reviewer.notes.map((note, index) => (
                          <li key={index} className="t-p-sm-sans text-[#52617D]">
                            note: {note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {invitationsUnlocked ? (
                    <div className="grid gap-8 md:justify-items-end">
                      <RoomSelectField
                        className="max-w-52"
                        value={reviewer.role}
                        onChange={(event) =>
                          void onChangeRole(reviewer, event.target.value as ReviewerRole)
                        }
                      >
                        {REVIEWER_ROLES.map((role) => (
                          <option key={role} value={role}>{reviewerRoleLabel(role)}</option>
                        ))}
                      </RoomSelectField>
                      <div className="flex flex-wrap gap-8">
                        <button onClick={() => void onClaim(reviewer)} disabled={busy} className={plainButtonClasses}>
                          I hold this role
                        </button>
                        {reviewer.status !== 'revoked' ? (
                          <button onClick={() => void onRemove(reviewer)} disabled={busy} className={plainButtonClasses}>
                            remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {reviewers.length === 0 ? (
              <p className="t-p-sm-sans text-[#52617D]">
                no reviewers configured yet. add the first one below.
              </p>
            ) : null}
          </div>
          {invitationsUnlocked ? (
            <>
              <div className="mt-16 flex flex-wrap gap-20">
                <button
                  onClick={() => void onInviteAllRequired()}
                  disabled={busy}
                  className={accentButtonClasses}
                >
                  invite all required reviews
                </button>
              </div>
              <div className="mt-16 grid gap-20 border-t border-[#E5EBF4] pt-16 lg:grid-cols-[180px_1fr_2fr_auto] lg:items-end">
                <label className="t-p-sm-sans text-[#52617D]">
                  role
                  <RoomSelectField
                    className="mt-4"
                    value={draftRole}
                    onChange={(event) => setDraftRole(event.target.value as ReviewerRole)}
                  >
                    {REVIEWER_ROLES.map((role) => (
                      <option key={role} value={role}>{reviewerRoleLabel(role)}</option>
                    ))}
                  </RoomSelectField>
                </label>
                <label className="t-p-sm-sans text-[#52617D]">
                  name
                  <RoomTextField
                    className="mt-4"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="name and title"
                  />
                </label>
                <label className="t-p-sm-sans text-[#52617D]">
                  email
                  <RoomTextField
                    className="mt-4"
                    type="email"
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    placeholder="name@company.com"
                  />
                </label>
                <button onClick={() => void onAddReviewer()} disabled={busy} className={`${primaryButtonClasses} w-full lg:w-auto`}>
                  invite reviewer
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : myReviewer ? (
        <section className="mt-24 rounded border border-[#D9E1EC] p-20">
          <h2 className="t-h3-sans">your review</h2>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            you are the {reviewerRoleLabel(myReviewer.role).toLowerCase()} for
            this pilot. review the plan above, then record your decision.
            {pilot.version > 1 && myReviewer.versionSeen < pilot.version ? (
              <span className="text-[#B3261E]"> the plan changed after your last review — please re-review.</span>
            ) : null}
          </p>
          <div className="mt-16 grid gap-20">
            <label className="t-p-sm-sans text-[#52617D]">
              questions or requested changes
              <RoomTextareaField
                className="mt-4"
                value={myNote}
                onChange={(event) => setMyNote(event.target.value)}
                placeholder="e.g. please add the security addendum before I can confirm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-20">
              <button onClick={() => void onReviewerDecision('confirm')} disabled={busy} className={accentButtonClasses}>
                confirm my section
              </button>
              <button onClick={() => void onReviewerDecision('changes')} disabled={busy} className={primaryButtonClasses}>
                request changes
              </button>
              <button onClick={() => void onAddNote()} disabled={busy} className={plainButtonClasses}>
                add note only
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {pilot.state === 'ready_sign' && canSign ? (
        <section className="mt-24 rounded border-2 border-[#07112C] p-20">
          <h2 className="t-h3-sans">sign and fund the pilot</h2>
          <p className="mt-8 max-w-[46em] t-p-sm-sans text-[#52617D]">
            by signing, {String(answers.company || 'the customer')} agrees to
            the confirmed scope, the {pilot.proposal?.priceLabel} pilot
            fee due on signature, and the {pilot.proposal?.termDays}-day
            pilot term.
          </p>
          <FieldLabel>authorized signer name</FieldLabel>
          <RoomTextField
            value={signerName}
            onChange={(event) => setSignerName(event.target.value)}
          />
          <FieldLabel>signer email</FieldLabel>
          <RoomTextField
            type="email"
            value={signerEmail}
            onChange={(event) => setSignerEmail(event.target.value)}
          />
          <label className="mt-16 flex items-start gap-8">
            <RoomCheckbox
              checked={signerConsent}
              onChange={(event) => setSignerConsent(event.target.checked)}
            />
            <span className="t-p-sm-sans">
              I confirm the information in this plan is accurate, that I am
              authorized to bind the customer, and that I understand the pilot
              fee becomes due on signature.
            </span>
          </label>
          <button onClick={onSign} disabled={busy} className={`${accentButtonClasses} mt-20`}>
            sign the pilot agreement
          </button>
        </section>
      ) : null}

      {actionButtons ? (
        <div className="mt-24 flex flex-wrap items-center gap-12">
          {actionButtons}
          {pilot.state === 'reviewing' || pilot.state === 'revision' || pilot.state === 'team_review' || pilot.state === 'scope_confirmed' ? (
            <CTAButton href={revisePath} appearance="plain" className="text-[#07112C]">
              <span>request changes</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
            </CTAButton>
          ) : null}
        </div>
      ) : null}

      {pilot.state === 'active' ? (
        <div className="mt-24 rounded bg-[#07112C] px-20 py-16 text-white">
          <p className="t-p-sm-sans">the pilot is live. the final evaluation will be assessed against the agreed criteria.</p>
        </div>
      ) : null}

      {sessionId && pilot.state !== 'paid' ? (
        <div className="mt-24 rounded border border-[#C9D6EA] bg-[#F3F7FC] px-20 py-16">
          <p className="t-p-sm-sans font-medium">payment received — finalizing your pilot record.</p>
          <p className="mt-8 t-p-sm-sans text-[#52617D]">
            this page refreshes automatically when the confirmation lands.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-16 t-p-sm-sans text-[#B3261E]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-16 t-p-sm-sans text-[#2F66B5]" role="status">
          {notice}
        </p>
      ) : null}

      {pilot.history.length > 1 ? (
        <section className="mt-24 border-t border-[#D9E1EC] pt-16">
          <h2 className="t-h3-sans">activity</h2>
          <ul className="mt-12 grid gap-8">
            {[...pilot.history].reverse().map((entry, index) => (
              <li key={entry.at + index} className="t-p-sm-sans text-[#52617D]">
                <span className="capitalize">{entry.action.replaceAll('_', ' ')}</span>
                 {/* — {stateLabel(entry.state)} */}
                <span className="text-[#AEB9CA]"> {new Date(entry.at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})}</span>
                {entry.note ? <span> — {entry.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

const primaryButtonClasses =
  'inline-flex h-48 items-center justify-center rounded border border-[#07112C]/20 px-16 t-p-sm-sans text-[#07112C] transition-colors hover:bg-[#F3F7FC] disabled:opacity-40 cursor-pointer'
const accentButtonClasses =
  'inline-flex h-48 items-center justify-center rounded bg-[#07112C] px-16 t-p-sm-sans text-white transition-colors hover:bg-[#2F66B5] disabled:opacity-40 cursor-pointer'
const plainButtonClasses =
  'inline-flex h-48 items-center justify-center rounded px-16 t-p-sm-sans text-[#52617D] transition-colors hover:text-[#07112C] disabled:opacity-40 cursor-pointer'
