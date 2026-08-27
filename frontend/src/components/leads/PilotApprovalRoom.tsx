'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  LockKeyhole,
  Pencil,
  Save,
  Send,
  UserPlus,
  X,
} from 'lucide-react'
import { RoomCheckbox, RoomSelectField, RoomTextField, RoomTextareaField } from '@/components/mui/fields'
import type { SuccessCriterion } from '@/lib/leads/contracts'
import type { ConflictResolution, PilotDraftConflict } from '@/lib/leads/pilot-collaboration-types'
import {
  reviewerRoleLabel,
  stateLabel,
  type PilotState,
  type Reviewer,
  type ReviewerRole,
} from '@/lib/leads/pilot'
import type { StoredPilot } from '@/lib/leads/store'
import { trackEvent } from '@/lib/leads/analytics-client'
import { formatReadableDate } from '@/lib/utils'
import { CTAButton } from '../CTAButton'

const EDITABLE_STATES: PilotState[] = [
  'reviewing',
  'revision',
  'team_review',
  'exception_review',
  'scope_confirmed',
]

const INVITATION_STATES: PilotState[] = ['team_review', 'scope_confirmed', 'exception_review']

const REVIEWER_ROLES: ReviewerRole[] = [
  'production_owner',
  'economic_buyer',
  'technical_evaluator',
  'security_reviewer',
  'procurement_reviewer',
  'approver',
  'signer',
]

const CRITERION_STATUS_OPTIONS = [
  { value: 'accepted', label: 'Accept' },
  { value: 'modified', label: 'Modify' },
  { value: 'not-applicable', label: 'Not applicable' },
] as const

type RoomTerms = {
  startDate: string | null
  valueConfirmed: boolean
  criteria: SuccessCriterion[]
}

type ReviewerStatusView = {
  label: string
  tone: 'ok' | 'warn' | 'muted'
}

function reviewerStatusView(reviewer: Reviewer | undefined): ReviewerStatusView {
  if (!reviewer) return { label: '-', tone: 'muted' }
  if (reviewer.status === 'revoked') return { label: 'Removed', tone: 'muted' }
  if (reviewer.status === 'reviewed') {
    return reviewer.requestedChanges
      ? { label: 'Changes requested', tone: 'warn' }
      : { label: 'Confirmed', tone: 'ok' }
  }
  if (reviewer.status === 'opened') return { label: 'Review pending', tone: 'warn' }
  if (reviewer.status === 'invited') return { label: 'Invited', tone: 'warn' }
  return { label: 'Proposed', tone: 'muted' }
}

function termsFromPilot(pilot: StoredPilot): RoomTerms {
  return {
    startDate: pilot.resolvedStartDate || null,
    valueConfirmed: Boolean(pilot.proposal?.valueModel?.confirmed),
    criteria: pilot.successCriteria.map((criterion) => ({ ...criterion })),
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function changedCount(base: RoomTerms, current: RoomTerms): number {
  let count = 0
  if (!sameValue(base.startDate, current.startDate)) count += 1
  if (!sameValue(base.valueConfirmed, current.valueConfirmed)) count += 1
  const criteria = new Map(base.criteria.map((criterion) => [criterion.key, criterion]))
  for (const criterion of current.criteria) {
    const prior = criteria.get(criterion.key)
    if (!prior) {
      count += 1
      continue
    }
    if (!sameValue(prior.status, criterion.status)) count += 1
    if (!sameValue(prior.target || '', criterion.target || '')) count += 1
    if (!sameValue(prior.participant || '', criterion.participant || '')) count += 1
    if (!sameValue(prior.evidence || '', criterion.evidence || '')) count += 1
  }
  return count
}

function toneClasses(tone: ReviewerStatusView['tone']) {
  if (tone === 'ok') return 'text-white'
  if (tone === 'warn') return 'text-white'
  return 'text-white/60'
}

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function SectionShell({
  id,
  title,
  summary,
  mode,
  children,
  action,
}: {
  id: string
  title: string
  summary?: string
  mode: 'editable' | 'request' | 'readonly'
  children: ReactNode
  action?: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const modeCopy = {
    editable: { label: 'Editable', icon: Pencil },
    request: { label: 'Request changes', icon: Send },
    readonly: { label: 'Read-only', icon: LockKeyhole },
  }[mode]
  const Icon = modeCopy.icon
  const showBadge = mode !== 'request'
  return (
    <section id={id} className="border-t border-white/80 py-28 lowercase">
      <div className="flex items-start justify-between gap-16">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-10">
            <h2 className="t-h3-sans">{title}</h2>
            {showBadge ? (
              <span className="inline-flex items-center gap-6 t-p-sm-sans">
                {modeCopy.label}
                <Icon aria-hidden="true" size={14} strokeWidth={1.8} />
              </span>
            ) : action ? (
              <div className="hidden sm:block">{action}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={`${id}-content`}
          className="inline-flex size-36 shrink-0 cursor-pointer items-center justify-center rounded transition-colors duration-100 hover:bg-white/10"
        >
          <ChevronRight
            aria-hidden="true"
            size={16}
            strokeWidth={1.8}
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: reducedMotion ? undefined : 'transform 100ms ease-out',
            }}
          />
        </button>
      </div>
      {!showBadge && action ? (
        <div className="mt-10 sm:hidden [&_button]:w-full">{action}</div>
      ) : null}
      <div
        id={`${id}-content`}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition: reducedMotion
            ? undefined
            : 'grid-template-rows 120ms ease-out, opacity 120ms ease-out, visibility 120ms',
        }}
      >
        <div className="overflow-hidden">
          {summary ? (
            <p className="mt-8 max-w-[54rem] t-p-sm-sans">{summary}</p>
          ) : null}
          <div className="mt-18">{children}</div>
        </div>
      </div>
    </section>
  )
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="cursor-default inline-flex items-center rounded border border-white/80 bg-white/10 px-12 py-4 t-p-sm-sans">
      {children}
    </span>
  )
}

export function PilotApprovalRoom({
  pilot: initial,
  draftTerms,
  accessRole,
  userEmail,
  sessionId,
  revisePath,
  founderAccess = false,
  qualificationCalendarUrl,
}: {
  pilot: StoredPilot
  draftTerms?: RoomTerms
  accessRole: 'owner' | 'participant' | 'approver' | 'signer'
  userEmail: string
  sessionId?: string
  revisePath: string
  founderAccess?: boolean
  qualificationCalendarUrl?: string
}) {
  const committedTerms = termsFromPilot(initial)
  const initialDraftTerms = draftTerms || committedTerms
  const [pilot, setPilot] = useState(initial)
  const [baseTerms, setBaseTerms] = useState<RoomTerms>(committedTerms)
  const [draftBaseTerms, setDraftBaseTerms] = useState<RoomTerms>(initialDraftTerms)
  const [baseVersion, setBaseVersion] = useState(initial.version)
  const [criteria, setCriteria] = useState(initialDraftTerms.criteria)
  const [startDate, setStartDate] = useState(initialDraftTerms.startDate || '')
  const [valueConfirmed, setValueConfirmed] = useState(initialDraftTerms.valueConfirmed)
  const [signerName, setSignerName] = useState(String(initial.answers.signerName || ''))
  const [signerEmail, setSignerEmail] = useState(String(initial.answers.signerEmail || ''))
  const [signerConsent, setSignerConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<PilotDraftConflict[]>([])
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({})
  const [draftRole, setDraftRole] = useState<ReviewerRole>('technical_evaluator')
  const [draftName, setDraftName] = useState('')
  const [draftReviewerEmail, setDraftReviewerEmail] = useState('')
  const [reviewerEmailDrafts, setReviewerEmailDrafts] = useState<Record<string, string>>({})
  const [myNote, setMyNote] = useState('')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [requestText, setRequestText] = useState<Record<string, string>>({})

  const editable = EDITABLE_STATES.includes(pilot.state)
  const canEditDraft = editable
  const canCommitDraft = accessRole === 'owner'
  const canSign = accessRole === 'owner' || accessRole === 'signer'
  const invitationsUnlocked = INVITATION_STATES.includes(pilot.state)
  const answers = pilot.answers as Record<string, string | boolean | undefined>
  const value = pilot.proposal?.valueModel
  const reviewers = pilot.reviewers
  const currentTerms: RoomTerms = useMemo(
    () => ({
      startDate: startDate || null,
      valueConfirmed,
      criteria,
    }),
    [criteria, startDate, valueConfirmed],
  )
  const unsavedChanges = changedCount(baseTerms, currentTerms)
  const hasUnsavedChanges = unsavedChanges > 0
  const hasLocalDraftChanges = changedCount(draftBaseTerms, currentTerms) > 0
  const myReviewer = reviewers.find(
    (reviewer) =>
      reviewer.email.toLowerCase() === userEmail.toLowerCase() &&
      reviewer.status !== 'revoked',
  )
  const pendingExceptionReview =
    pilot.route === 'one-call' && pilot.exceptions.some((item) => !item.resolvedAt)
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
      void refreshPilot()
    }, 3000)
    return () => clearTimeout(timer)
  }, [sessionId, pilot.state, pilot.id])

  useEffect(() => {
    if (accessRole === 'owner') return
    void fetch(`/api/pilot/${pilot.id}/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {
      // presence recording is best-effort
    })
  }, [accessRole, pilot.id])

  useEffect(() => {
    if (!canEditDraft || !hasLocalDraftChanges) return
    const timer = setTimeout(() => {
      void saveDraft()
    }, 700)
    return () => clearTimeout(timer)
  }, [canEditDraft, hasLocalDraftChanges, currentTerms, baseVersion])

  useEffect(() => {
    if (!canEditDraft || hasLocalDraftChanges) return
    const timer = window.setInterval(() => {
      void refreshPilot()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [canEditDraft, hasLocalDraftChanges, pilot.id])

  async function refreshPilot() {
    try {
      const response = await fetch(`/api/pilot/${pilot.id}`, { cache: 'no-store' })
      const json = (await response.json()) as {
        ok: boolean
        pilot?: StoredPilot
        draftTerms?: RoomTerms
      }
      if (response.ok && json.ok && json.pilot) {
        setPilot(json.pilot)
        if (!hasLocalDraftChanges) syncFromPilot(json.pilot, json.draftTerms)
      }
    } catch {
      // refresh is opportunistic
    }
  }

  function syncFromPilot(nextPilot: StoredPilot, nextDraftTerms?: RoomTerms) {
    const terms = termsFromPilot(nextPilot)
    const draft = nextDraftTerms || terms
    setBaseTerms(terms)
    setDraftBaseTerms(draft)
    setBaseVersion(nextPilot.version)
    setCriteria(draft.criteria)
    setStartDate(draft.startDate || '')
    setValueConfirmed(draft.valueConfirmed)
    setConflicts([])
    setResolutions({})
  }

  function saveFields() {
    return {
      criteria,
      startDate: startDate || null,
      valueConfirmed,
      baseVersion,
    }
  }

  async function patch(
    body: Record<string, unknown>,
    opts: { silent?: boolean; sync?: boolean } = {},
  ): Promise<boolean> {
    if (!opts.silent) {
      setBusy(true)
      setError('')
      setNotice('')
    }
    try {
      const response = await fetch(`/api/pilot/${pilot.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await response.json()) as {
        ok: boolean
        code?: string
        message?: string
        pilot?: StoredPilot
        draftTerms?: RoomTerms
        conflicts?: PilotDraftConflict[]
        unresolved?: Array<{ key: string; label: string; resolution: string }>
      }
      if (!response.ok || !json.ok) {
        if (json.code === 'conflict' && json.conflicts) {
          setConflicts(json.conflicts)
          throw new Error('Resolve the highlighted conflict before saving.')
        }
        const detail = json.unresolved?.map((item) => `- ${item.label}`).join('\n')
        throw new Error(detail ? `resolve the highlighted items first:\n${detail}` : (json.message || 'could not update the pilot room'))
      }
      if (json.pilot) {
        setPilot(json.pilot)
        if (body.action === 'draft' && json.draftTerms) {
          setDraftBaseTerms(json.draftTerms)
        }
        if (opts.sync) syncFromPilot(json.pilot)
      }
      return true
    } catch (cause) {
      if (!opts.silent) {
        setError(cause instanceof Error ? cause.message : 'could not update the pilot room')
      }
      return false
    } finally {
      if (!opts.silent) setBusy(false)
    }
  }

  async function saveDraft() {
    setDraftBusy(true)
    await patch({ action: 'draft', ...saveFields() }, { silent: true })
    setDraftBusy(false)
  }

  async function onSave(extraResolutions = resolutions) {
    if (canCommitDraft) {
      if (await patch({ action: 'commit_draft', ...saveFields(), resolutions: extraResolutions }, { sync: true })) {
        setNotice('Changes saved as the latest pilot revision.')
      }
      return
    }
    if (await patch({ action: 'submit_draft' })) {
      setNotice('Changes submitted for owner review.')
    }
  }

  async function onApprove() {
    if (hasUnsavedChanges) {
      setError('Save changes before approving this pilot.')
      return
    }
    if (pendingExceptionReview) {
      setError('Submit the requested terms for Portals review before approving.')
      return
    }
    if (pilot.state === 'scope_confirmed') {
      if (await patch({ action: 'finalize', note: 'agreement finalized for signature' }, { sync: true })) {
        setNotice('The agreement is ready for signature.')
      }
      return
    }
    if (await patch({ action: 'confirm_scope', ...saveFields() }, { sync: true })) {
      setNotice('Pilot terms approved. The agreement can now be finalized.')
    }
  }

  async function onStartTeamReview() {
    if (hasUnsavedChanges) {
      setError('Save changes before sharing the pilot for review.')
      return
    }
    if (await patch({ action: 'start_team_review' }, { sync: true })) {
      await onInviteAllRequired()
      setNotice('Review invitations are ready.')
    }
  }

  async function onInvite(reviewer: Reviewer, email = reviewer.email) {
    if (await patch({
      action: 'invite_reviewer',
      invite: { role: reviewer.role, email, name: reviewer.name, reviewerId: reviewer.id },
    })) {
      setNotice(`Invitation sent to ${email}.`)
      setReviewerEmailDrafts((current) => {
        const next = { ...current }
        delete next[reviewer.id]
        return next
      })
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
      setError('No proposed reviewers with an email to invite yet.')
      return
    }
    for (const reviewer of pending) {
      const ok = await patch({
        action: 'invite_reviewer',
        invite: { role: reviewer.role, email: reviewer.email, name: reviewer.name },
      })
      if (!ok) return
    }
    setNotice(`Invitations sent to ${pending.length} reviewer${pending.length === 1 ? '' : 's'}.`)
  }

  async function onAddReviewer() {
    if (!draftReviewerEmail.trim()) {
      setError('Enter an email for the reviewer.')
      return
    }
    if (await patch({
      action: 'invite_reviewer',
      invite: { role: draftRole, email: draftReviewerEmail.trim(), name: draftName.trim() || undefined },
    })) {
      setNotice(`Invitation sent to ${draftReviewerEmail.trim()}.`)
      setDraftName('')
      setDraftReviewerEmail('')
    }
  }

  async function onRemove(reviewer: Reviewer) {
    if (await patch({ action: 'remove_reviewer', reviewerId: reviewer.id })) {
      setNotice(`${reviewer.email} removed from the room.`)
    }
  }

  async function onChangeRole(reviewer: Reviewer, role: ReviewerRole) {
    if (await patch({ action: 'reviewer_role', reviewerId: reviewer.id, role })) {
      setNotice(`${reviewer.email} is now the ${reviewerRoleLabel(role).toLowerCase()}.`)
    }
  }

  async function onClaim(reviewer: Reviewer) {
    if (await patch({ action: 'claim_role', reviewerId: reviewer.id })) {
      setNotice(`You hold the ${reviewerRoleLabel(reviewer.role).toLowerCase()} role.`)
    }
  }

  async function onReviewerDecision(decision: 'confirm' | 'changes') {
    if (!myReviewer) return
    if (decision === 'confirm' && hasUnsavedChanges) {
      setError('Save changes before confirming your review.')
      return
    }
    if (await patch({
      action: 'reviewer_decision',
      reviewerId: myReviewer.id,
      decision,
      note: myNote.trim() || undefined,
    })) {
      setNotice(decision === 'confirm' ? 'Your review is recorded.' : 'Your requested changes were recorded.')
      setMyNote('')
    }
  }

  async function onSectionRequest(section: string) {
    const note = String(requestText[section] || '').trim()
    if (!note) {
      setError('Write the requested change before submitting.')
      return
    }
    if (await patch({ action: 'section_change_request', sectionChange: { section, note } })) {
      setNotice(`Requested changes for ${section}.`)
      setOpenRequest(null)
      setRequestText((current) => ({ ...current, [section]: '' }))
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

  async function onResolveExceptions() {
    if (await patch({ action: 'resolve_exceptions', note: 'exceptions resolved' }, { sync: true })) {
      setNotice('Review items were resolved.')
    }
  }

  async function onSubmitForPortalsReview() {
    if (hasUnsavedChanges) {
      setError('Save changes before submitting these terms for Portals review.')
      return
    }
    if (await patch({ action: 'request_exception', note: 'Portals review requested' }, { sync: true })) {
      setNotice('Submitted for Portals review.')
    }
  }

  async function onSign() {
    if (hasUnsavedChanges) {
      setError('Save changes before signing this pilot.')
      return
    }
    if (!signerName.trim() || !signerEmail.trim()) {
      setError("Enter the authorized signer's name and email.")
      return
    }
    if (!signerConsent) {
      setError('Check the agreement confirmation before signing.')
      return
    }
    if (await patch({ action: 'sign', signer: { name: signerName, email: signerEmail } }, { sync: true })) {
      setNotice('Signed. The pilot fee is due on signature.')
    }
  }

  async function onPay() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/pilot/${pilot.id}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      if (json.pilot) {
        setPilot(json.pilot)
        syncFromPilot(json.pilot)
      }
      setNotice('Payment recorded. Kickoff can be scheduled.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not start payment')
    } finally {
      setBusy(false)
    }
  }

  async function onKickoff() {
    if (await patch({ action: 'kickoff' }, { sync: true })) {
      setNotice('Kickoff scheduled. The pilot can be activated.')
    }
  }

  async function onActivate() {
    if (await patch({ action: 'activate', note: 'pilot activated' }, { sync: true })) {
      setNotice('The pilot is live.')
    }
  }

  function setConflictField(field: string, value: unknown) {
    if (field === 'startDate') setStartDate(value ? String(value) : '')
    if (field === 'valueConfirmed') setValueConfirmed(Boolean(value))
    const match = field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
    if (!match) return
    const [, key, property] = match
    setCriteria((current) =>
      current.map((criterion) =>
        criterion.key === key
          ? { ...criterion, [property]: property === 'status' ? value : String(value || '') }
          : criterion,
      ),
    )
  }

  async function resolveConflict(conflict: PilotDraftConflict, resolution: ConflictResolution) {
    const nextResolutions = { ...resolutions, [conflict.field]: resolution }
    setResolutions(nextResolutions)
    setConflicts((current) => current.filter((item) => item.field !== conflict.field))
    if (resolution === 'current') {
      setConflictField(conflict.field, conflict.currentValue)
      return
    }
    await onSave(nextResolutions)
  }

  function requestAction(section: string) {
    if (!myReviewer && accessRole !== 'owner') return null
    return (
      <button
        type="button"
        onClick={() => setOpenRequest(openRequest === section ? null : section)}
        className={primaryButtonClasses}
      >
        <Send aria-hidden="true" size={16} strokeWidth={1.8} />
        Request a change
      </button>
    )
  }

  function requestPanel(section: string) {
    if (openRequest !== section) return null
    return (
      <div className="mt-14 grid gap-10 border border-white/80 bg-white/10 p-14">
        <label className="t-p-sm-sans text-white/60">
          Requested change for {section}
          <RoomTextareaField
            className="mt-6"
            minRows={3}
            value={requestText[section] || ''}
            onChange={(event) =>
              setRequestText((current) => ({ ...current, [section]: event.target.value }))
            }
            placeholder="Describe the exact change needed in this section."
          />
        </label>
        <div className="flex flex-wrap gap-8">
          <button type="button" onClick={() => void onSectionRequest(section)} disabled={busy} className={primaryButtonClasses}>
            <Send aria-hidden="true" size={16} strokeWidth={1.8} />
            Submit request
          </button>
          <button type="button" onClick={() => setOpenRequest(null)} className={plainButtonClasses}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const routeBadge =
    pilot.route === 'zero-call'
      ? 'No call required'
      : pilot.route === 'one-call'
        ? 'Portals review required'
        : 'Needs clarification'

  const canApprove =
    canCommitDraft &&
    ['reviewing', 'revision', 'team_review', 'scope_confirmed'].includes(pilot.state) &&
    pilot.unresolved.length === 0

  const approvalLabel =
    pilot.state === 'scope_confirmed' ? 'Approve for signature' : 'Approve pilot terms'

  const globalWorkflowAction = (() => {
    if (!canCommitDraft) return null
    if (founderAccess && assessmentQualificationPending && pilot.state === 'exception_review') {
      return (
        <>
          <button onClick={() => void onQualificationDecision('qualify')} disabled={busy} className={accentButtonClasses}>
            <Check aria-hidden="true" size={16} strokeWidth={1.8} />
            Qualify
          </button>
          <button onClick={() => void onQualificationDecision('disqualify')} disabled={busy} className={plainButtonClasses}>
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
            Not eligible
          </button>
        </>
      )
    }
    if (founderAccess && pilot.state === 'exception_review') {
      return (
        <button onClick={() => void onResolveExceptions()} disabled={busy} className={accentButtonClasses}>
          <Check aria-hidden="true" size={16} strokeWidth={1.8} />
          Resolve review
        </button>
      )
    }
    if (canApprove && !pendingExceptionReview) {
      return (
        <button onClick={() => void onApprove()} disabled={busy || hasUnsavedChanges} className={accentButtonClasses}>
          <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
          {approvalLabel}
        </button>
      )
    }
    if (pilot.state === 'signed') {
      return (
        <button onClick={() => void onPay()} disabled={busy} className={accentButtonClasses}>
          Pay the ${pilot.proposal?.priceAmount || 5000} pilot fee
        </button>
      )
    }
    if (pilot.state === 'paid') {
      return (
        <button onClick={() => void onKickoff()} disabled={busy} className={accentButtonClasses}>
          Schedule kickoff
        </button>
      )
    }
    if (pilot.state === 'kickoff') {
      return (
        <button onClick={() => void onActivate()} disabled={busy} className={accentButtonClasses}>
          Activate pilot
        </button>
      )
    }
    return null
  })()

  const reviewRows: Array<{ section: string; view: ReviewerStatusView }> = [
    { section: 'Workflow scope', view: reviewerStatusView(reviewers.find((reviewer) => reviewer.role === 'production_owner')) },
    { section: 'Success criteria', view: reviewerStatusView(reviewers.find((reviewer) => reviewer.role === 'economic_buyer')) },
    { section: 'Technical scope', view: reviewerStatusView(reviewers.find((reviewer) => reviewer.role === 'technical_evaluator')) },
    {
      section: 'Security posture',
      view: reviewers.some((reviewer) => reviewer.role === 'security_reviewer')
        ? reviewerStatusView(reviewers.find((reviewer) => reviewer.role === 'security_reviewer'))
        : { label: 'Not required', tone: 'muted' },
    },
    {
      section: 'Agreement',
      view:
        pilot.state === 'ready_sign' || pilot.state === 'signed' || pilot.state === 'paid' || pilot.state === 'kickoff' || pilot.state === 'active'
          ? { label: stateLabel(pilot.state), tone: 'ok' }
          : { label: 'Not yet available', tone: 'muted' },
    },
  ]

  return (
    <div className="pb-32">
      <div className="grid gap-20 pb-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <div className="flex items-baseline justify-between gap-12">
            <p className="t-p-sm-sans">{answers.company ? String(`${answers.company} & portals: pilot approval`) : 'pilot approval'}</p>
            <p className="t-p-sm-sans whitespace-nowrap lg:hidden">{accessRole} - {userEmail}</p>
          </div>
          <h1 className="mt-6 t-h3-sans lowercase">{stateLabel(pilot.state)}</h1>
          <p className="mt-10 max-w-[42rem] t-p-sm-sans">
            Review the scope, success criteria, security requirements, and commercial terms. Make any necessary changes, save them, then approve the pilot when everything is correct.
          </p>
          <div className="mt-16 flex flex-wrap items-center gap-8 lowercase">
            <StatusPill>{routeBadge}</StatusPill>
            <StatusPill>
              {hasUnsavedChanges ? `${unsavedChanges} unsaved change${unsavedChanges === 1 ? '' : 's'}` : 'All changes saved'}
            </StatusPill>
            {canEditDraft ? (
              <button onClick={() => void onSave()} disabled={busy || !hasUnsavedChanges} className={`${primaryButtonClasses} w-full sm:w-auto`}>
                <Save aria-hidden="true" size={16} strokeWidth={1.8} />
                Save Changes
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-8 lg:justify-items-end">
          <p className="t-p-sm-sans hidden lg:block">{accessRole} - {userEmail}</p>
          <a
            className={`${plainButtonClasses} hover:bg-white/10`}
            href={`/api/leads/documents/pilot-packet?pilot=${encodeURIComponent(pilot.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Download aria-hidden="true" size={16} strokeWidth={1.8} />
            Download PDF
          </a>
          {globalWorkflowAction ? (
            <div className="flex flex-wrap gap-8 lg:justify-items-end">{globalWorkflowAction}</div>
          ) : null}
        </div>
      </div>

      {pilot.state === 'not_eligible' ? (
        <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
          <p className="t-p-sm-sans">The standard pilot cannot proceed as drafted.</p>
          <p className="mt-8 t-p-sm-sans">Revise the plan to continue.</p>
          <a href={revisePath} className={`${primaryButtonClasses} mt-14`}>
            <Pencil aria-hidden="true" size={16} strokeWidth={1.8} />
            Revise the plan
          </a>
        </div>
      ) : null}

      {(pilot.state === 'reviewing' || pilot.state === 'revision') && canCommitDraft ? (
        <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
          <p className="t-p-sm-sans">Review the draft before inviting members for review.</p>
          {/* <p className="mt-8 max-w-[54rem] t-p-sm-sans">
            Once the terms are saved, share this room with reviewers so everyone sees the same terms revision.
          </p> */}
          <button onClick={() => void onStartTeamReview()} disabled={busy || hasUnsavedChanges} className={`${accentButtonClasses} mt-14`}>
            Ready to share
            <UserPlus aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      {pilot.unresolved.length > 0 ? (
        <div className="mt-24 rounded border border-white/80 bg-white/10 backdrop-blur-[20px] px-18 py-16">
          <p className="t-p-sm-sans font-medium">{pilot.unresolved.length} item{pilot.unresolved.length === 1 ? '' : 's'} to resolve</p>
          <ul className="mt-12 grid gap-10">
            {pilot.unresolved.map((item) => (
              <li key={item.key} className="t-p-sm-sans">
                <a href={item.href} className="inline underline decoration-2 underline-offset-4">{item.label}</a>
                {/* {item.resolution} */}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pilot.exceptions.length > 0 ? (
        <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
          <p className="t-p-sm-sans">In order for us to serve you best, these terms require our review before the pilot can be approved:</p>
          <ul className="mt-12 grid gap-24">
            {pilot.exceptions.map((item, index) => (
              <li key={item.kind + index} className="grid gap-4 t-p-sm-sans">
                <span className='text-white/60'>{item.amendment}</span>
                <span>{item.summary}</span>
                {item.resolvedAt ? <span>Resolved</span> : null}
              </li>
            ))}
          </ul>
          {canCommitDraft && pendingExceptionReview && pilot.state !== 'exception_review' ? (
            <button onClick={() => void onSubmitForPortalsReview()} disabled={busy || hasUnsavedChanges} className={`${primaryButtonClasses} mt-14`}>
              Submit for Portals review
              <Send aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      ) : null}

      {assessmentQualificationPending ? (
        <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
          <p className="t-p-sm-sans">Qualification call required</p>
          <p className="mt-8 max-w-[54rem] t-p-sm-sans">
            This request came through the assessment self-selection path. The completed scope gives Portals enough context to qualify or decline the pilot.
          </p>
          {!founderAccess && qualificationCalendarUrl ? (
            <a
              className="mt-12 inline-block t-p-sm-sans underline decoration-2 underline-offset-4"
              href={qualificationCalendarUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => void trackEvent('qualification_call_scheduled', { pilot_id: pilot.id })}
            >
              Schedule the qualification call
            </a>
          ) : null}
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="mt-24 bg-white/10 rounded-sm px-18 py-16" role="alert">
          <div className="flex items-start gap-10">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} className="mt-2 text-white" />
            <div>
              <p className="t-p-sm-sans">This field changed while you were reviewing the pilot.</p>
              <p className="mt-6 t-p-sm-sans">Choose which value to keep, then save again if needed.</p>
            </div>
          </div>
          <div className="mt-14 grid gap-12">
            {conflicts.map((conflict) => (
              <div key={conflict.field} className="grid gap-10 bg-white/10 rounded-sm pt-12 md:grid-cols-[1fr_1fr_auto] md:items-start">
                <div>
                  <p className="t-p-sm-sans">{conflict.label}</p>
                  <p className="mt-4 t-p-sm-sans">Current version: {String(conflict.currentValue || '-')}</p>
                  <p className="mt-4 t-p-sm-sans">Your change: {String(conflict.mineValue || '-')}</p>
                </div>
                <div className="flex flex-wrap gap-8 md:justify-end">
                  <button type="button" className={plainButtonClasses} onClick={() => void resolveConflict(conflict, 'current')}>
                    Use current
                  </button>
                  <button type="button" className={primaryButtonClasses} onClick={() => void resolveConflict(conflict, 'mine')}>
                    Use mine
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <SectionShell
        id="scope"
        title="Scope"
        mode={canEditDraft ? 'editable' : 'request'}
        summary="The operational shape of the pilot: workflow, people, integrations, data, participants, and target start."
        action={!canEditDraft ? requestAction('Scope') : null}
      >
        <dl className="grid gap-14 t-p-sm-sans md:grid-cols-2">
          <div><dt className="text-white/60">Pilot workflow</dt><dd className="mt-2">{String(answers.pilotWorkflow || answers.activeWorkflow || '-')}</dd></div>
          <div><dt className="text-white/60">Production owner</dt><dd className="mt-2">{String(answers.productionOwner || '-')}</dd></div>
          <div><dt className="text-white/60">Economic buyer</dt><dd className="mt-2">{String(answers.economicBuyer || '-')}</dd></div>
          <div><dt className="text-white/60">Technical evaluator</dt><dd className="mt-2">{String(answers.technicalEvaluator || '-')}</dd></div>
          <div><dt className="text-white/60">Historical projects</dt><dd className="mt-2">{String(answers.historicalProject || '-')}</dd></div>
          <div><dt className="text-white/60">Participants</dt><dd className="mt-2">{String(answers.participantsRange || '-')}</dd></div>
          <div><dt className="text-white/60">Integration method</dt><dd className="mt-2">{String(answers.integrationMethod || '-')}</dd></div>
          <div><dt className="text-white/60">Data classification</dt><dd className="mt-2">{String(answers.dataClassification || '-')}</dd></div>
          <div>
            <dt className="text-white/60">Pilot start date</dt>
            <dd className="mt-2">
              {canEditDraft ? (
                <RoomTextField
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="Pilot start date"
                />
              ) : (
                formatReadableDate(pilot.resolvedStartDate) || 'Not yet chosen'
              )}
            </dd>
          </div>
        </dl>
        {requestPanel('Scope')}
      </SectionShell>

      <SectionShell
        id="commercial"
        title="Commercial Terms"
        mode={canEditDraft ? 'editable' : 'request'}
        summary="Terms, fees, annual option, and value estimate attached to this pilot."
        action={!canEditDraft ? requestAction('Commercial terms') : null}
      >
        {pilot.proposal ? (
          <dl className="grid gap-14 t-p-sm-sans md:grid-cols-2">
            <div><dt className="text-white/60">Pilot fee</dt><dd className="mt-2">{pilot.proposal.priceLabel}, due on signature</dd></div>
            <div><dt className="text-white/60">Term</dt><dd className="mt-2">{pilot.proposal.termDays} days{pilot.proposal.termStart && pilot.proposal.termEnd ? `, ${pilot.proposal.termStart} to ${pilot.proposal.termEnd}` : ''}</dd></div>
            {pilot.proposal.decisionDate ? <div><dt className="text-white/60">Final decision date</dt><dd className="mt-2">{pilot.proposal.decisionDate}</dd></div> : null}
            {pilot.proposal.creditDeadline ? <div><dt className="text-white/60">Annual credit window</dt><dd className="mt-2">Signs by {pilot.proposal.creditDeadline}</dd></div> : null}
            {pilot.proposal.annualOption ? (
              <div>
                <dt className="text-white/60">Proposed annual deployment</dt>
                <dd className="mt-2">{pilot.proposal.annualOption.name} - {pilot.proposal.annualOption.priceLabel}</dd>
                <dd className="mt-2">{pilot.proposal.annualOption.creditNote}</dd>
              </div>
            ) : null}
            {value ? (
              <div className="md:col-span-2">
                <dt className="text-white/60">Auditable value estimate</dt>
                <dd className="mt-2">{value.formula}</dd>
                <dd className="mt-2">Range ${value.low.toLocaleString()} to ${value.high.toLocaleString()}, midpoint ${value.midpoint.toLocaleString()}</dd>
                <dd className="mt-2 text-white">{value.frequency.label}, {value.hoursLoss.label} lost, {value.people.label} affected</dd>
                {canEditDraft ? (
                  <label className="mt-12 flex items-center gap-8">
                    <RoomCheckbox
                      checked={valueConfirmed}
                      onChange={(event) => setValueConfirmed(event.target.checked)}
                    />
                    <span className="t-p-sm-sans">Confirm this estimate as reasonable</span>
                  </label>
                ) : value.confirmed ? (
                  <p className="mt-10 t-p-sm-sans text-white/60">Estimate confirmed by the customer</p>
                ) : null}
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="t-p-sm-sans text-white">Commercial terms are being prepared.</p>
        )}
        {requestPanel('Commercial terms')}
      </SectionShell>

      <SectionShell
        id="success-criteria"
        title="Success Criteria"
        mode={canEditDraft ? 'editable' : 'request'}
        summary="Define how this pilot will be judged. Accept each criterion as written, modify it for this pilot, or mark it as not applicable."
        action={!canEditDraft ? requestAction('Success criteria') : null}
      >
        <div className="grid gap-[2px]">
          {criteria.map((criterion, index) => (
            <div key={criterion.key} className="grid gap-14 bg-white/10 rounded-sm px-18 py-16 md:grid-cols-[minmax(13rem,16rem)_1fr]">
              <div>
                <p className="t-p-sm-sans font-medium">{criterion.label}</p>
                {canEditDraft ? (
                  <div className="mt-10 inline-grid grid-cols-3 border rounded" role="group" aria-label={`${criterion.label} decision`}>
                    {CRITERION_STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          const next = [...criteria]
                          next[index] = {
                            ...criterion,
                            status: option.value as typeof criterion.status,
                          }
                          setCriteria(next)
                        }}
                        className={`min-h-40 border border-white/80 px-10 t-p-sm-sans cursor-pointer transition-colors active:bg-white/20 ${criterion.status === option.value
                          ? 'bg-white/20'
                          : 'hover:bg-white/10'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-8 t-p-sm-sans">{criterion.status.replace('-', ' ')}</p>
                )}
              </div>
              <div className="grid gap-10">
                {(['target', 'participant', 'evidence'] as const).map((field) => (
                  <label key={field} className="t-p-sm-sans">
                    {field === 'target' ? 'Measurable target' : field === 'participant' ? 'Participant' : 'Evidence'}
                    {canEditDraft && criterion.status !== 'not-applicable' ? (
                      <RoomTextField
                        className="!mt-12"
                        value={String(criterion[field] || '')}
                        placeholder={field === 'target' ? 'e.g. under one minute to retrieve the approved asset' : undefined}
                        onChange={(event) => {
                          const next = [...criteria]
                          next[index] = { ...criterion, [field]: event.target.value }
                          setCriteria(next)
                        }}
                      />
                    ) : (
                      <span className="mt-12 block t-p-sm-sans">{criterion[field] || '-'}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {requestPanel('Success criteria')}
      </SectionShell>

      <SectionShell
        id="security"
        title="Security Posture"
        mode="request"
        summary="These terms describe Portals' current security posture and cannot be edited directly. If your organization has additional requirements, submit them for review."
        action={requestAction('Security posture')}
      >
        <div className="grid gap-10">
          {pilot.securityDecisions.map((decision) => (
            <div key={decision.key} className="grid gap-6 border-t border-white/80 pt-10 t-p-sm-sans md:grid-cols-[1fr_auto] md:items-baseline">
              <div className='flex flex-col gap-8'>
                <p className="text-white/60">{decision.label}</p>
                <p>{decision.note || ''}</p>
              </div>
              <p className="capitalize self-end">{decision.decision.replace('-', ' ')}</p>
            </div>
          ))}
        </div>
        {requestPanel('Security posture')}
      </SectionShell>

      <SectionShell
        id="review-status"
        title="Review Status"
        mode="readonly"
        summary="A compact view of who has confirmed the current terms revision and who still needs to review."
      >
        <dl className="grid gap-10 t-p-sm-sans md:grid-cols-2">
          {reviewRows.map((row) => (
            <div key={row.section} className="grid grid-cols-[1fr_auto] items-baseline gap-12 border-b border-white/80 pb-10">
              <dt>{row.section}</dt>
              <dd className={toneClasses(row.view.tone)}>{row.view.label}</dd>
            </div>
          ))}
        </dl>
      </SectionShell>

      <SectionShell
        id="reviewers"
        title="Reviewers"
        mode={invitationsUnlocked ? 'editable' : 'readonly'}
        summary="Confirm who needs access to this room. Each reviewer receives one secure link that opens this pilot directly."
      >
        {!invitationsUnlocked ? (
          <p className="mb-14 t-p-sm-sans text-white/60">Invitations unlock after the draft is ready for team review.</p>
        ) : null}
        <div className="grid gap-12">
          {reviewers.map((reviewer) => {
            const view = reviewerStatusView(reviewer)
            const stale = reviewer.status === 'reviewed' && reviewer.versionSeen < pilot.version
            return (
              <div key={reviewer.id} className="grid gap-12 border border-white/80 px-18 py-16 md:grid-cols-[minmax(13rem,16rem)_1fr_auto]">
                <div className="grid content-between gap-4">
                  <p className="t-p-sm-sans font-medium">{reviewerRoleLabel(reviewer.role)}</p>
                  <p className="t-p-sm-sans text-white/60">{reviewer.name || reviewer.email || 'No one named yet'}</p>
                </div>
                <div className="grid content-between gap-8">
                  <p className={`t-p-sm-sans ${toneClasses(view.tone)}`}>
                    {view.label}
                    {stale ? <span className="text-white">, reconfirmation needed</span> : null}
                  </p>
                  {reviewer.notes.length > 0 ? (
                    <ul className="grid gap-4">
                      {reviewer.notes.map((note, noteIndex) => (
                        <li key={noteIndex} className="t-p-sm-sans text-white/60">Note: {note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {reviewer.status === 'proposed' && !reviewer.email.trim() && invitationsUnlocked ? (
                    <div className="flex items-center gap-8">
                      <RoomTextField
                        type="email"
                        placeholder="email address"
                        value={reviewerEmailDrafts[reviewer.id] || ''}
                        onChange={(event) =>
                          setReviewerEmailDrafts((current) => ({
                            ...current,
                            [reviewer.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        onClick={() =>
                          void onInvite({
                            ...reviewer,
                            email: reviewerEmailDrafts[reviewer.id]?.trim() || '',
                          })
                        }
                        disabled={busy || !reviewerEmailDrafts[reviewer.id]?.trim()}
                        className={primaryButtonClasses}
                      >
                        Invite
                      </button>
                    </div>
                  ) : null}
                  {reviewer.status === 'proposed' && reviewer.email.trim() && invitationsUnlocked ? (
                    <button onClick={() => void onInvite(reviewer)} disabled={busy} className={primaryButtonClasses}>
                      Invite
                    </button>
                  ) : null}
                  {(reviewer.status === 'invited' || reviewer.status === 'opened') && invitationsUnlocked ? (
                    <button onClick={() => void onInvite(reviewer)} disabled={busy} className={primaryButtonClasses}>
                      Resend invitation
                    </button>
                  ) : null}
                </div>
                {accessRole === 'owner' && invitationsUnlocked ? (
                  <div className="grid content-between gap-8 md:justify-items-end">
                    <RoomSelectField
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
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {invitationsUnlocked ? (
          <>
            <div className="mt-16 flex gap-10 justify-end">
              <button onClick={() => void onInviteAllRequired()} disabled={busy} className={accentButtonClasses}>
                <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                Invite required reviewers
              </button>
            </div>
            <div className="mt-16 border-t border-white/80">
              <h2 className="t-h3-sans pt-28">Add Reviewer</h2>
              <div className="mt-8 grid gap-14 lg:grid-cols-[180px_1fr_2fr_auto] lg:items-end">
                <label className="t-p-sm-sans text-white/60">
                  Role
                  <RoomSelectField className="mt-4" value={draftRole} onChange={(event) => setDraftRole(event.target.value as ReviewerRole)}>
                    {REVIEWER_ROLES.map((role) => (
                      <option key={role} value={role}>{reviewerRoleLabel(role)}</option>
                    ))}
                  </RoomSelectField>
                </label>
                <label className="t-p-sm-sans text-white/60">
                  Name
                  <RoomTextField className="mt-4" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="name and title" />
                </label>
                <label className="t-p-sm-sans text-white/60">
                  Email
                  <RoomTextField className="mt-4" type="email" value={draftReviewerEmail} onChange={(event) => setDraftReviewerEmail(event.target.value)} placeholder="name@company.com" />
                </label>
                <button onClick={() => void onAddReviewer()} disabled={busy} className={`${primaryButtonClasses} w-full lg:w-auto`}>
                  <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                  Invite new reviewer
                </button>
              </div>
            </div>
          </>
        ) : null}
      </SectionShell>

      {myReviewer ? (
        <SectionShell
          id="your-review"
          title="Your Review"
          mode="request"
          summary={`You are the ${reviewerRoleLabel(myReviewer.role).toLowerCase()} for this pilot. Review the current terms revision, then confirm or request a specific change.`}
        >
          {pilot.version > 1 && myReviewer.versionSeen < pilot.version ? (
            <p className="mb-12 t-p-sm-sans text-white">The plan changed after your last review. Please re-review.</p>
          ) : null}
          <div className="grid gap-14">
            <label className="t-p-sm-sans text-white/60">
              Notes or requested changes
              <RoomTextareaField
                className="mt-4"
                value={myNote}
                onChange={(event) => setMyNote(event.target.value)}
                placeholder="e.g. please add the security addendum before I can confirm"
              />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-10">
              <button onClick={() => void onReviewerDecision('confirm')} disabled={busy || hasUnsavedChanges} className={accentButtonClasses}>
                <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
                Confirm my review
              </button>
              <button onClick={() => void onReviewerDecision('changes')} disabled={busy} className={primaryButtonClasses}>
                <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                Request changes
              </button>
            </div>
          </div>
        </SectionShell>
      ) : null}

      {pilot.state === 'ready_sign' && canSign ? (
        <SectionShell
          id="signature"
          title="Sign And Fund"
          mode="editable"
          summary={`By signing, ${String(answers.company || 'the customer')} agrees to the confirmed scope, the ${pilot.proposal?.priceLabel} pilot fee due on signature, and the ${pilot.proposal?.termDays}-day pilot term.`}
        >
          <div className="grid gap-14 md:grid-cols-2">
            <label className="t-p-sm-sans text-white/60">
              Authorized signer name
              <RoomTextField className="mt-4" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
            </label>
            <label className="t-p-sm-sans text-white/60">
              Signer email
              <RoomTextField className="mt-4" type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} />
            </label>
          </div>
          <label className="mt-16 flex items-start gap-8">
            <RoomCheckbox checked={signerConsent} onChange={(event) => setSignerConsent(event.target.checked)} />
            <span className="t-p-sm-sans">
              I confirm the information in this plan is accurate, that I am authorized to bind the customer, and that I understand the pilot fee becomes due on signature.
            </span>
          </label>
          <button onClick={() => void onSign()} disabled={busy || hasUnsavedChanges} className={`${accentButtonClasses} mt-18`}>
            Sign the pilot agreement
          </button>
        </SectionShell>
      ) : null}

      {pilot.state === 'active' ? (
        <div className="mt-24 bg-[#07112C] px-18 py-16 text-white">
          <p className="t-p-sm-sans">The pilot is live. The final evaluation will be assessed against the agreed criteria.</p>
        </div>
      ) : null}

      {sessionId && pilot.state !== 'paid' ? (
        <div className="mt-24 border border-white/80 bg-white/10 px-18 py-16">
          <p className="t-p-sm-sans font-medium">Payment received. Finalizing your pilot record.</p>
          <p className="mt-8 t-p-sm-sans text-white/60">This page refreshes the pilot status without leaving the room.</p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-16 t-p-sm-sans text-white" role="alert">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-16 t-p-sm-sans text-white" role="status">{notice}</p>
      ) : null}

      {pilot.history.length > 1 ? (
        <section className="mt-24 border-t border-white/80 pt-18 lowercase">
          <h2 className="t-h3-sans">Activity</h2>
          <ul className="mt-12 grid gap-8">
            {[...pilot.history].reverse().slice(0, 8).map((entry, index) => (
              <li key={entry.at + index} className="t-p-sm-sans text-white/60">
                <span className="capitalize">{entry.action.replaceAll('_', ' ')}</span>
                <span className="text-white/60"> {new Date(entry.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {entry.note ? <span> - {entry.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

const primaryButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const accentButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 bg-white/20 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white hover:bg-white/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const plainButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
