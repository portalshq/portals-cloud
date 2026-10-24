'use client'

import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Info,
  LockKeyhole,
  Pencil,
  Save,
  Send,
  UserPlus,
  X,
} from 'lucide-react'
import { RoomCheckbox, RoomSelectField, RoomTextField, RoomTextareaField } from '@/components/mui/fields'
import { SmoothAnchor } from '@/components/SmoothAnchor'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PilotApprovalRoomTour } from './PilotApprovalRoomTour'
import type { SuccessCriterion } from '@/lib/leads/contracts'
import type { ConflictResolution, PilotDraftConflict } from '@/lib/leads/pilot-collaboration-types'
import {
  changedPilotTermPaths,
  normalizePilotStartDate,
  pilotDirectAnswersFrom,
  type PilotDirectAnswers,
} from '@/lib/leads/pilot-room-fields'
import {
  groupReviewersByEmail,
  highestPrivilegeReviewer,
  reviewerRoleLabel,
  hasPendingMaterialException,
  computePilotProgressUnresolved,
  stateLabel,
  type PilotState,
  type Reviewer,
  type ReviewerRole,
} from '@/lib/leads/pilot'
import type { StoredPilot } from '@/lib/leads/store'
import { trackEvent } from '@/lib/leads/analytics-client'
import { PORTALS_TEAM_REVIEWER_LABEL, PORTALS_TEAM_REVIEWER_ROLE } from '@/lib/leads/pilot-team-reviewer'
import { formatReadableDate } from '@/lib/utils'
import { CTAButton } from '../CTAButton'
import { Badge } from '../ui/badge'

const EDITABLE_STATES: PilotState[] = [
  'reviewing',
  'revision',
  'team_review',
  'exception_review',
  'scope_confirmed',
  'ready_sign',
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
  criteria: SuccessCriterion[]
  answers: PilotDirectAnswers
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
  if (reviewer.status === 'opened') return { label: 'Viewed room', tone: 'warn' }
  if (reviewer.status === 'invited') return { label: 'Invitation sent', tone: 'warn' }
  return { label: 'Not yet invited', tone: 'muted' }
}

function termsFromPilot(pilot: StoredPilot): RoomTerms {
  return {
    startDate: normalizePilotStartDate(pilot.resolvedStartDate),
    criteria: pilot.successCriteria.map((criterion) => ({ ...criterion })),
    answers: pilotDirectAnswersFrom(pilot.answers as Record<string, unknown>),
  }
}

function formatCommercialDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
  }
  return typeof value === 'string' ? formatReadableDate(value) : null
}

function formatCommercialAmount(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function annualSubscriptionRateLabel(annualOption: NonNullable<StoredPilot['proposal']>['annualOption']): string {
  return 'Monthly subscription rate'
}

function offerAcceptanceCopy(proposal: NonNullable<StoredPilot['proposal']>): string {
  const deadline = proposal.offerAcceptanceDeadlineLabel || formatCommercialDate(proposal.offerEndsAt)
  if (!deadline) return 'Not set'
  return deadline.replace(/^sign by\s*/i, '').replace(/\s+to accept this offer\.?$/i, '')
}

function changedCount(base: RoomTerms, current: RoomTerms): number {
  return changedPilotTermPaths(base, current).length
}

function termsWithConflictValue(terms: RoomTerms, field: string, value: unknown): RoomTerms {
  if (field === 'startDate') {
    return {...terms, startDate: normalizePilotStartDate(value ? String(value) : null)}
  }
  const answer = field.match(/^answers\.([A-Za-z0-9_]+)$/)
  if (answer) {
    return {
      ...terms,
      answers: {...terms.answers, [answer[1]]: String(value || '')},
    }
  }
  const removal = field.match(/^criteria\.([^.]+)\.__removed$/)
  if (removal && value) {
    return {...terms, criteria: terms.criteria.filter((criterion) => criterion.key !== removal[1])}
  }
  const match = field.match(/^criteria\.([^.]+)\.(status|target|participant|evidence)$/)
  if (!match) return terms
  const [, key, property] = match
  return {
    ...terms,
    criteria: terms.criteria.map((criterion) =>
      criterion.key === key
        ? {...criterion, [property]: property === 'status' ? value : String(value || '')}
        : criterion,
    ),
  }
}

function toneClasses(tone: ReviewerStatusView['tone']) {
  if (tone === 'ok') return 'text-white'
  if (tone === 'warn') return 'text-white'
  return 'text-white/80'
}

function hashSectionId(hash: string) {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
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
  scrollMarginTop = '140px',
}: {
  id: string
  title: string
  summary?: string
  mode: 'editable' | 'request' | 'readonly'
  children: ReactNode
  action?: ReactNode
  scrollMarginTop?: string
}) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const openLinkedSection = () => {
      const targetId = hashSectionId(window.location.hash)
      const target = document.getElementById(targetId)
      const targetSection = target?.closest<HTMLElement>('section[id]')
      if (targetId === id || targetSection?.id === id) {
        setOpen(true)
        const linkedElement = target || document.getElementById(id)
        if (linkedElement && !reducedMotion) {
          window.setTimeout(() => linkedElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 140)
        }
      }
    }

    openLinkedSection()
    window.addEventListener('hashchange', openLinkedSection)
    window.addEventListener('popstate', openLinkedSection)
    return () => {
      window.removeEventListener('hashchange', openLinkedSection)
      window.removeEventListener('popstate', openLinkedSection)
    }
  }, [id])

  const modeCopy = {
    editable: { label: 'Editable', icon: Pencil },
    request: { label: 'Request changes', icon: Send },
    readonly: { label: 'Read only', icon: LockKeyhole },
  }[mode]
  const Icon = modeCopy.icon
  const showBadge = mode !== 'request'
  return (
    <section id={id} className="border-t border-white/80 py-28" style={{ scrollMarginTop }}>
      <div className="flex items-start justify-between gap-16 lowercase">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-10">
            <h2 className="t-h3-sans">{title}</h2>
            {showBadge ? (
              <span className="inline-flex mt-8 items-center gap-6 t-p-sm-sans">
                ({modeCopy.label})
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
          textTransform: 'lowercase',
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
    <span className="cursor-default inline-flex w-fit h-fit items-center rounded border border-white/80 bg-white/10 px-12 py-4 t-p-sm-sans">
      {children}
    </span>
  )
}

export function PilotApprovalRoom({
  pilot: initial,
  draftTerms,
  accessRole,
  userEmail,
  memberEmails: initialMemberEmails,
  portalsTeamEmails = [],
  sessionId,
  revisePath,
  founderAccess = false,
  qualificationCalendarUrl,
  kickoffAvailability = [],
}: {
  pilot: StoredPilot
  draftTerms?: RoomTerms
  accessRole: 'owner' | 'participant' | 'approver' | 'signer'
  userEmail: string
  memberEmails: string[]
  portalsTeamEmails?: string[]
  sessionId?: string
  revisePath: string
  founderAccess?: boolean
  qualificationCalendarUrl?: string
  kickoffAvailability?: Array<{ date: string; label: string; timezone: string; version: string }>
}) {
  const committedTerms = termsFromPilot(initial)
  const initialDraftTerms = {
    ...(draftTerms || committedTerms),
    startDate: normalizePilotStartDate((draftTerms || committedTerms).startDate),
  }
  const [pilot, setPilot] = useState(initial)
  const [baseTerms, setBaseTerms] = useState<RoomTerms>(committedTerms)
  const [draftBaseTerms, setDraftBaseTerms] = useState<RoomTerms>(initialDraftTerms)
  const [baseVersion, setBaseVersion] = useState(initial.version)
  const [criteria, setCriteria] = useState(initialDraftTerms.criteria)
  const [startDate, setStartDate] = useState(normalizePilotStartDate(initialDraftTerms.startDate) || '')
  const [draftAnswers, setDraftAnswers] = useState<PilotDirectAnswers>(initialDraftTerms.answers)
  const [signerName, setSignerName] = useState(String(initial.answers.signerName || ''))
  const [signerEmail, setSignerEmail] = useState(String(initial.answers.signerEmail || ''))
  const [signerConsent, setSignerConsent] = useState(false)
  const [kickoffDate, setKickoffDate] = useState(String(initial.launch?.date || initial.resolvedStartDate || kickoffAvailability[0]?.date || ''))
  const [kickoffTimezone] = useState(String(initial.launch?.timezone || kickoffAvailability[0]?.timezone || 'America/New_York'))
  const [busy, setBusy] = useState(false)
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'failed'>('idle')
  const [draftRetry, setDraftRetry] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<PilotDraftConflict[]>([])
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({})
  const [draftRole, setDraftRole] = useState<ReviewerRole>('technical_evaluator')
  const [draftName, setDraftName] = useState('')
  const [draftReviewerEmail, setDraftReviewerEmail] = useState('')
  const [myNote, setMyNote] = useState('')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [requestText, setRequestText] = useState<Record<string, string>>({})
  const [reviewerToRemove, setReviewerToRemove] = useState<Reviewer | null>(null)
  const [memberEmails, setMemberEmails] = useState(initialMemberEmails.map((email) => email.trim().toLowerCase()))
  const [roleEditor, setRoleEditor] = useState<string | null>(null)
  const [roleToAdd, setRoleToAdd] = useState<ReviewerRole>('technical_evaluator')
  const pageContentRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  const editable = EDITABLE_STATES.includes(pilot.state)
  const canEditDraft = editable
  const canCommitDraft = editable
  const canSign = accessRole === 'owner' || accessRole === 'signer'
  const invitationsUnlocked = INVITATION_STATES.includes(pilot.state)
  const answers: Record<string, string | boolean | undefined> = { ...(pilot.answers as Record<string, string | boolean | undefined>), ...draftAnswers }
  const value = pilot.proposal?.valueModel
  const reviewers = pilot.reviewers
  const currentTerms: RoomTerms = useMemo(
    () => ({
      startDate: normalizePilotStartDate(startDate),
      criteria,
      answers: draftAnswers,
    }),
    [criteria, draftAnswers, startDate],
  )
  const unsavedChanges = changedCount(baseTerms, currentTerms)
  const hasUnsavedChanges = unsavedChanges > 0
  const hasLocalDraftChanges = changedCount(draftBaseTerms, currentTerms) > 0
  const currentTermsRef = useRef(currentTerms)
  const draftBaseTermsRef = useRef(initialDraftTerms)
  const baseVersionRef = useRef(initial.version)
  const hasLocalDraftChangesRef = useRef(hasLocalDraftChanges)
  const localDraftGenerationRef = useRef(0)
  const draftSaveInFlightRef = useRef(false)
  const draftFailureRetryableRef = useRef(true)
  const draftRetryTimerRef = useRef<number | null>(null)
  const unloadSavedGenerationRef = useRef(-1)
  const myReviewers = reviewers.filter(
    (reviewer) =>
      reviewer.email.toLowerCase() === userEmail.toLowerCase() &&
      reviewer.status !== 'revoked',
  )
  const pendingExceptionReview = hasPendingMaterialException(pilot.exceptions)
  const myReviewer = highestPrivilegeReviewer(myReviewers)
  const isMyReviewPending =
    !!myReviewer &&
    (myReviewer.status !== 'reviewed' || myReviewer.versionSeen < pilot.version)
  const myReviewerRoleLabels = myReviewers
    .map((reviewer) => reviewerRoleLabel(reviewer.role).toLowerCase())
    .join(' + ')
  const reviewerGroups = useMemo(() => groupReviewersByEmail(reviewers), [reviewers])
  const assessmentQualificationPending = pilot.exceptions.some(
    (item) => item.kind === 'assessment-qualification' && !item.resolvedAt,
  )
  const progressUnresolved = useMemo(
    () =>
      computePilotProgressUnresolved({
        state: pilot.state,
        version: pilot.version,
        unresolved: pilot.unresolved,
        exceptions: pilot.exceptions,
        reviewers: pilot.reviewers,
        approvalPath: String(pilot.answers.approvalPath || ''),
      }),
    [pilot],
  )

  useLayoutEffect(() => {
    const content = pageContentRef.current
    const actions = actionsRef.current
    if (!content || !actions) return

    const updateBottomPadding = () => {
      content.style.paddingBottom = `${actions.getBoundingClientRect().height + 16}px`
    }
    const observer = new ResizeObserver(updateBottomPadding)
    observer.observe(actions)
    updateBottomPadding()
    return () => observer.disconnect()
  }, [])

  function handlePilotAnchorClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    const anchor = event.currentTarget
    const targetId = hashSectionId(anchor.hash)
    if (!targetId) return
    const target = document.getElementById(targetId)
    if (!target) return

    if (anchor.hash !== window.location.hash) {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${anchor.hash}`)
    }

    const section = target.closest<HTMLElement>('section[id]')
    const toggle = section?.querySelector<HTMLButtonElement>(
      `button[aria-controls="${section.id}-content"]`,
    )
    const sectionWasClosed = toggle?.getAttribute('aria-expanded') === 'false'
    if (sectionWasClosed) toggle.click()

    // SmoothAnchor handles the normal case with the shared site behavior. A
    // collapsed section needs a second scroll after its content is mounted.
    if (sectionWasClosed) {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }, 140)
    }
  }

  useEffect(() => {
    void trackEvent('pilot_room_entered', {assessment_version: answers.assessment_version})
    void trackEvent('pilot_terms_viewed', {pilot_state: pilot.state})
    void trackEvent('pilot_room_opened', {
      pilot_state: pilot.state,
      pilot_route: pilot.route,
      assessment_origin: answers.assessmentOrigin || 'standard',
    })
  }, [])

  useEffect(() => {
    if (changedPilotTermPaths(currentTermsRef.current, currentTerms).length > 0) {
      localDraftGenerationRef.current += 1
    }
    currentTermsRef.current = currentTerms
    hasLocalDraftChangesRef.current = hasLocalDraftChanges
  }, [currentTerms, hasLocalDraftChanges])

  const pendingPaymentKey =
    sessionId ||
    (pilot.payment?.paymentStatus === 'processing'
      ? String(pilot.payment.invoiceId || pilot.payment.sessionId || '')
      : '')
  useEffect(() => {
    if (!pendingPaymentKey || pilot.state === 'paid') return
    const attemptsKey = `checkout-wait-${pilot.id}-${pendingPaymentKey}`
    const attempts = Number(sessionStorage.getItem(attemptsKey) || 0)
    if (attempts >= 6 && sessionId) {
      // Only surface the timeout on a real return-from-checkout; a pending
      // invoice or an abandoned session should not alarm on room open.
      setError('Payment is taking longer than expected. Please contact support if payment was completed.')
    }
    // Keep reconciling at a slower cadence after the initial attempts: the
    // endpoint is idempotent, and a payment that settles late must still
    // self-heal without requiring a reload.
    const timer = setTimeout(() => {
      sessionStorage.setItem(attemptsKey, String(attempts + 1))
      void reconcilePaymentAndRefresh()
    }, attempts >= 6 ? 15000 : 3000)
    return () => clearTimeout(timer)
  }, [pendingPaymentKey, pilot.state, pilot.id])

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
  }, [canEditDraft, hasLocalDraftChanges, currentTerms, baseVersion, draftRetry])

  useEffect(() => {
    if (!canEditDraft || hasLocalDraftChanges) return
    const timer = window.setInterval(() => {
      void refreshPilot()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [canEditDraft, hasLocalDraftChanges, pilot.id])

  useEffect(() => {
    const flushDraft = () => {
      if (!canEditDraft || !hasLocalDraftChangesRef.current) return
      const generation = localDraftGenerationRef.current
      if (unloadSavedGenerationRef.current === generation) return
      unloadSavedGenerationRef.current = generation
      const fields = saveFields(currentTermsRef.current)
      void fetch(`/api/pilot/${pilot.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'draft', ...fields }),
        keepalive: true,
      })
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }
    window.addEventListener('pagehide', flushDraft)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushDraft)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [canEditDraft, pilot.id])

  async function refreshPilot() {
    const generation = localDraftGenerationRef.current
    try {
      const response = await fetch(`/api/pilot/${pilot.id}`, { cache: 'no-store' })
      const json = (await response.json()) as {
        ok: boolean
        pilot?: StoredPilot
        draftTerms?: RoomTerms
        memberEmails?: string[]
      }
      if (response.ok && json.ok && json.pilot) {
        setPilot(json.pilot)
        if (json.memberEmails) setMemberEmails(json.memberEmails.map((email) => email.trim().toLowerCase()))
        if (
          generation === localDraftGenerationRef.current &&
          !hasLocalDraftChangesRef.current
        ) {
          syncFromPilot(json.pilot, json.draftTerms)
        }
      }
    } catch {
      // refresh is opportunistic
    }
  }

  async function reconcilePaymentAndRefresh() {
    try {
      // Verifies the stored Stripe session/invoice directly so the room can
      // advance even when webhook delivery is delayed or unavailable locally.
      // The webhook remains the authoritative paid signal.
      await fetch(`/api/pilot/${pilot.id}/checkout/reconcile`, {method: 'POST'})
    } catch {
      // reconcile is best effort; the poll below still picks up webhook updates
    }
    await refreshPilot()
  }

  function syncFromPilot(nextPilot: StoredPilot, nextDraftTerms?: RoomTerms) {
    const terms = termsFromPilot(nextPilot)
    const draft = nextDraftTerms || terms
    currentTermsRef.current = draft
    draftBaseTermsRef.current = draft
    baseVersionRef.current = nextPilot.version
    hasLocalDraftChangesRef.current = false
    setBaseTerms(terms)
    setDraftBaseTerms(draft)
    setBaseVersion(nextPilot.version)
    setCriteria(draft.criteria)
    setStartDate(normalizePilotStartDate(draft.startDate) || '')
    setDraftAnswers(draft.answers)
    setConflicts([])
    setResolutions({})
  }

  function saveFields(terms = currentTerms) {
    return {
      criteria: terms.criteria,
      startDate: terms.startDate,
      draftAnswers: terms.answers,
      baseVersion: baseVersionRef.current,
      fieldPaths: changedPilotTermPaths(draftBaseTermsRef.current, terms),
    }
  }

  async function patch(
    body: Record<string, unknown>,
    opts: { silent?: boolean; sync?: boolean; draftGeneration?: number } = {},
  ): Promise<boolean> {
    if (!opts.silent) {
      setBusy(true)
      setError('')
      setNotice('')
    }
    if (opts.silent && body.action === 'draft') draftFailureRetryableRef.current = true
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
        noOp?: boolean
        conflicts?: PilotDraftConflict[]
        unresolved?: Array<{ key: string; label: string; resolution: string }>
      }
      if (!response.ok || !json.ok) {
        if (opts.silent && body.action === 'draft') {
          draftFailureRetryableRef.current = response.status >= 500
        }
        if (json.code === 'conflict' && json.conflicts) {
          setConflicts(json.conflicts)
          throw new Error('Resolve the highlighted conflict before saving.')
        }
        const detail = json.unresolved?.map((item) => `- ${item.label}`).join('\n')
        const reviewerStateMessage = json.code === 'reviewer_revoked'
          ? 'This reviewer was removed from the pilot. Contact the pilot owner to be re-invited.'
          : null
        throw new Error(reviewerStateMessage || (detail ? `resolve the highlighted items first:\n${detail}` : (json.message || 'could not update the pilot room')))
      }
      if (json.pilot) {
        setPilot(json.pilot)
        if (
          body.action === 'draft' &&
          json.draftTerms &&
          opts.draftGeneration === localDraftGenerationRef.current
        ) {
          draftBaseTermsRef.current = json.draftTerms
          setDraftBaseTerms(json.draftTerms)
        }
        if (opts.sync) syncFromPilot(json.pilot)
      }
      if (body.action === 'confirm_scope') void trackEvent('pilot_scope_confirmed', {pilot_state: json.pilot?.state})
      if (body.action === 'commit_draft') {
        setNotice(json.noOp
          ? 'The current pilot values are already in effect. No new revision was needed.'
          : 'Your changes have been saved.')
      }
      if (body.action === 'sign' && json.pilot?.state === 'signed') void trackEvent('pilot_approved', {pilot_state: 'signed'})
      if (body.action === 'section_change_request' || (body.action === 'reviewer_decision' && body.decision === 'changes')) void trackEvent('pilot_terms_adjustment_requested', {pilot_state: json.pilot?.state})
      if (body.action === 'request_exception') void trackEvent('pilot_assisted_review_requested', {pilot_state: json.pilot?.state})
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
    if (draftSaveInFlightRef.current) return
    const terms = currentTermsRef.current
    const fields = saveFields(terms)
    if (fields.fieldPaths.length === 0) return
    const generation = localDraftGenerationRef.current
    draftSaveInFlightRef.current = true
    setDraftSaveState('saving')
    const saved = await patch(
      { action: 'draft', ...fields },
      { silent: true, draftGeneration: generation },
    )
    draftSaveInFlightRef.current = false
    if (saved && generation === localDraftGenerationRef.current) {
      setDraftSaveState('idle')
      return
    }
    setDraftSaveState('failed')
    if (draftFailureRetryableRef.current && hasLocalDraftChangesRef.current) {
      if (draftRetryTimerRef.current) window.clearTimeout(draftRetryTimerRef.current)
      draftRetryTimerRef.current = window.setTimeout(() => setDraftRetry((value) => value + 1), 2_000)
    }
  }

  async function onSave(extraResolutions = resolutions, terms = currentTerms, resolvedField?: string) {
    if (canCommitDraft) {
      const fields = saveFields(terms)
      if (resolvedField) fields.fieldPaths = [...new Set([...fields.fieldPaths, resolvedField])]
      await patch({ action: 'commit_draft', ...fields, resolutions: extraResolutions }, { sync: true })
      return
    }
  }

  async function onApprove() {
    if (hasUnsavedChanges) {
      setError('Please save your changes before approving this pilot.')
      return
    }
    if (pendingExceptionReview) {
      setError('Please submit the requested terms for Portals review before approving.')
      return
    }
    if (pilot.state === 'scope_confirmed') {
      if (await patch({ action: 'finalize', note: 'agreement finalized for signature' }, { sync: true })) {
        setNotice('The agreement is ready for signature. Payment is due after signing.')
      }
      return
    }
    if (await patch({ action: 'confirm_scope', ...saveFields() }, { sync: true })) {
      setNotice('Scope confirmed. The pilot terms are now ready for final agreement and signature. This is not yet a commercial commitment.')
    }
  }

  async function onStartTeamReview() {
    if (hasUnsavedChanges) {
      setError('Please save your changes before sharing the pilot for review.')
      return
    }
    if (await patch({ action: 'start_team_review' }, { sync: true })) {
      await onInviteAllRequired()
      setNotice('Review invitations have been sent.')
    }
  }

  async function onInvite(reviewer: Reviewer) {
    const email = reviewer.email.trim()
    if (!email) return
    if (await patch({
      action: 'invite_reviewer',
      invite: { role: reviewer.role, email, name: reviewer.name, reviewerId: reviewer.id },
    })) {
      setNotice(`Invitation sent to ${email}. They can access the room using the link in the email.`)
      setMemberEmails((current) => current.includes(email.trim().toLowerCase()) ? current : [...current, email.trim().toLowerCase()])
    }
  }

  async function onInviteAllRequired() {
    const pendingByEmail = new Map<string, Reviewer>()
    for (const reviewer of reviewers) {
      const email = reviewer.email.trim().toLowerCase()
      if (
        reviewer.status === 'proposed' &&
        email &&
        reviewer.role !== 'signer' &&
        !portalsTeamEmails.includes(email) &&
        !pendingByEmail.has(email)
      ) {
        pendingByEmail.set(email, reviewer)
      }
    }
    const invitations = [...pendingByEmail.values()]
    if (invitations.length === 0) {
      setError('No proposed reviewers with an email address to invite.')
      return
    }
    for (const reviewer of invitations) {
      const ok = await patch({
        action: 'invite_reviewer',
        invite: { role: reviewer.role, email: reviewer.email, name: reviewer.name },
      })
      if (!ok) return
    }
    setMemberEmails((current) => [...new Set([...current, ...invitations.map((reviewer) => reviewer.email.trim().toLowerCase())])])
    setNotice(`Invitations sent to ${invitations.length} reviewer${invitations.length === 1 ? '' : 's'}. They can access the room using the link in the email.`)
  }

  async function onAddReviewer() {
    if (!draftReviewerEmail.trim()) {
      setError('Please enter an email address for the reviewer.')
      return
    }
    if (await patch({
      action: 'invite_reviewer',
      invite: { role: draftRole, email: draftReviewerEmail.trim(), name: draftName.trim() || undefined },
    })) {
      setNotice(`Invitation sent to ${draftReviewerEmail.trim()}. They can access the room using the link in the email.`)
      setMemberEmails((current) => current.includes(draftReviewerEmail.trim().toLowerCase()) ? current : [...current, draftReviewerEmail.trim().toLowerCase()])
      setDraftName('')
      setDraftReviewerEmail('')
    }
  }

  async function onRemove(reviewer: Reviewer) {
    setReviewerToRemove(reviewer)
  }

  async function confirmRemoveReviewer() {
    if (!reviewerToRemove) return
    if (await patch({ action: 'remove_reviewer', reviewerId: reviewerToRemove.id })) {
      setNotice(`${reviewerToRemove.email} removed from the room.`)
      const hasAnotherActiveRole = reviewers.some(
        (reviewer) => reviewer.email.trim().toLowerCase() === reviewerToRemove.email.trim().toLowerCase() &&
          reviewer.id !== reviewerToRemove.id && reviewer.status !== 'revoked',
      )
      if (!hasAnotherActiveRole) {
        setMemberEmails((current) => current.filter((email) => email !== reviewerToRemove.email.trim().toLowerCase()))
      }
    }
    setReviewerToRemove(null)
  }

  async function onChangeRole(reviewer: Reviewer, role: ReviewerRole) {
    if (await patch({ action: 'reviewer_role', reviewerId: reviewer.id, role })) {
      setNotice(`${reviewer.email} has been added as ${reviewerRoleLabel(role).toLowerCase()}. Send an invitation when ready.`)
      setRoleEditor(null)
    }
  }

  async function onAddMemberRole(email: string, role: ReviewerRole) {
    if (await patch({ action: 'reviewer_role', email, role })) {
      setNotice(`${email} has been added as ${reviewerRoleLabel(role).toLowerCase()}. Send an invitation when ready.`)
      setRoleEditor(null)
    }
  }

  async function onClaim(reviewer: Reviewer) {
    if (await patch({ action: 'claim_role', reviewerId: reviewer.id })) {
      setNotice(`You now hold the ${reviewerRoleLabel(reviewer.role).toLowerCase()} role. Please review the terms and confirm.`)
    }
  }

  async function onReviewerDecision(decision: 'confirm' | 'changes') {
    if (!myReviewer) return
    if (decision === 'confirm' && hasUnsavedChanges) {
      setError('Please save your changes before confirming your review.')
      return
    }
    if (decision === 'changes' && !myNote.trim()) {
      setError('Please describe the requested change before submitting.')
      return
    }
    if (await patch({
      action: 'reviewer_decision',
      reviewerId: myReviewer.id,
      decision,
      note: myNote.trim() || undefined,
      versionSeen: pilot.version,
    })) {
      setNotice(decision === 'confirm' && myReviewers.length > 1 ? 'Your reviews have been recorded for every assigned role.' : decision === 'confirm' ? 'Your review has been recorded.' : 'Your requested changes have been recorded.')
      setMyNote('')
    }
  }

  async function onSectionRequest(section: string) {
    const note = String(requestText[section] || '').trim()
    if (!note) {
      setError('Please describe the requested change before submitting.')
      return
    }
    if (await patch({ action: 'section_change_request', sectionChange: { section, note } })) {
      setNotice(`Your requested changes for ${section} have been submitted.`)
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
      setError('Please save your changes before submitting these terms for Portals review.')
      return
    }
    if (await patch({ action: 'request_exception', note: 'Portals review requested' }, { sync: true })) {
      setNotice('Your request has been submitted for Portals review.')
    }
  }

  async function onSign() {
    if (hasUnsavedChanges) {
      setError('Please save your changes before signing this pilot.')
      return
    }
    if (!signerName.trim() || !signerEmail.trim()) {
      setError("Please enter the authorized signer's name and email address.")
      return
    }
    if (!signerConsent) {
      setError('Please confirm the agreement before signing.')
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

  async function onInvoice() {
    setBusy(true)
    setError('')
    setNotice('Payment processing. Keep this window open.')
    try {
      const response = await fetch(`/api/pilot/${pilot.id}/invoice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = (await response.json()) as {
        ok: boolean
        message?: string
        hostedInvoiceUrl?: string
        invoicePdf?: string
        pilot?: StoredPilot
      }
      if (!response.ok || !json.ok) throw new Error(json.message || 'could not issue invoice')
      if (json.pilot) {
        setPilot(json.pilot)
        syncFromPilot(json.pilot)
      }
      if (json.hostedInvoiceUrl) window.open(json.hostedInvoiceUrl, '_blank', 'noopener,noreferrer')
      setNotice('Invoice issued. A copy was sent to the billing contact.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not issue invoice')
    } finally {
      setBusy(false)
    }
  }

  async function onKickoff() {
    if (!kickoffDate) {
      setError('Please select a launch date before reserving the slot.')
      return
    }
    const slot = kickoffAvailability.find((item) => item.date === kickoffDate)
    if (await patch({ action: 'launch', launch: { date: kickoffDate, timezone: kickoffTimezone, slotLabel: slot?.label || kickoffDate, availabilityVersion: slot?.version || 'default' } }, { sync: true })) {
      setNotice('Launch scheduled. The pilot can now be activated.')
    }
  }

  async function onActivate() {
    if (await patch({ action: 'activate', note: 'pilot activated' }, { sync: true })) {
      setNotice('The pilot is now live.')
    }
  }

  async function resolveConflict(conflict: PilotDraftConflict, resolution: ConflictResolution) {
    const nextResolutions = { ...resolutions, [conflict.field]: resolution }
    setResolutions(nextResolutions)
    const terms = resolution === 'current'
      ? termsWithConflictValue(currentTermsRef.current, conflict.field, conflict.currentValue)
      : currentTermsRef.current
    await onSave(nextResolutions, terms, conflict.field)
  }

  function requestAction(section: string) {
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
        <label className="t-p-sm-sans text-white">
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

  const routeBadge = pendingExceptionReview
    ? 'Assisted review required'
    : 'Ready for self-service purchase'

  const canApprove =
    accessRole === 'owner' &&
    ['reviewing', 'revision', 'team_review', 'scope_confirmed'].includes(pilot.state) &&
    progressUnresolved.length === 0

  const approvalLabel =
    pilot.state === 'scope_confirmed' ? 'Approve for signature' : 'Confirm scope and invite reviewers'

  const globalWorkflowAction = (() => {
    // Founder and reviewer actions are role-gated individually below. All
    // remaining workflow actions (approve, pay, launch, activate) are
    // restricted to the pilot owner by the API, so the owner gate is applied
    // after them rather than blocking the bar for non-editable states.
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
    if (isMyReviewPending && !['signed', 'paid', 'launch', 'active'].includes(pilot.state)) {
      return (
        <button onClick={() => void onReviewerDecision('confirm')} disabled={busy || hasUnsavedChanges} className={accentButtonClasses}>
          <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
          Confirm terms
        </button>
      )
    }
    // Approving, paying, scheduling launch, and activating are owner-only.
    if (accessRole !== 'owner') return null
    if (canApprove && !pendingExceptionReview) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => void onApprove()} disabled={busy || hasUnsavedChanges} className={accentButtonClasses}>
              <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
              {approvalLabel}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Confirm the pilot scope and invite reviewers. This is not yet a commercial commitment.</p>
          </TooltipContent>
        </Tooltip>
      )
    }
    if (pilot.state === 'signed' || (pilot.state === 'launch' && !pilot.payment?.paidAt)) {

      return (
        <div className="grid gap-10">
          {pilot.state === 'signed' && kickoffAvailability.length > 0 ? (
            <label className="t-p-sm-sans text-white/70">
              Preferred launch slot
              <select className="mt-4 block w-full bg-white px-10 py-8 text-black" value={kickoffDate} onChange={(event) => setKickoffDate(event.target.value)}>
                {kickoffAvailability.map((slot) => <option key={slot.date} value={slot.date}>{slot.label} ({slot.timezone})</option>)}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-10">
            <button onClick={() => void onPay()} disabled={busy} className={accentButtonClasses}>Pay now {pilot.proposal?.priceLabel ? `(${pilot.proposal.priceLabel})` : ''}</button>
            <button onClick={() => void onInvoice()} disabled={busy} className={plainButtonClasses}>Pay by invoice</button>
          </div>
        </div>
      )
    }
    if (pilot.state === 'paid') {
      return (
        <button onClick={() => void onKickoff()} disabled={busy} className={accentButtonClasses}>
          Schedule launch
        </button>
      )
    }
    if (pilot.state === 'launch') {
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
        pilot.state === 'ready_sign' || pilot.state === 'signed' || pilot.state === 'paid' || pilot.state === 'launch' || pilot.state === 'active'
          ? { label: stateLabel(pilot.state), tone: 'ok' }
          : { label: 'Not yet available', tone: 'muted' },
    },
  ]

  return (
    <>
      <TooltipProvider>
        <div ref={pageContentRef} className="min-w-0 max-w-full [overflow-wrap:anywhere]">

      <div className="z-20 my-24">
        <div className="grid gap-8 lg:items-start mb-20">

            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-12 gap-y-4">
              <h1 className="mt-6 t-h3-sans lowercase">{stateLabel(pilot.state)}</h1>
              <p className="min-w-0 t-p-sm-sans">{accessRole} - {userEmail}</p>
            </div>
            <div className='flex justify-between gap-8'>
              <StatusPill>{pilot.mode === 'assisted' ? 'Assisted pilot' : 'Standard pilot'}</StatusPill>
              <a
                className={`${plainButtonClasses} hover:bg-white/10`}
                href={`/api/leads/documents/pilot-packet?pilot=${encodeURIComponent(pilot.id)}`}
                target="_blank"
                rel="noreferrer"
                >
                <Download aria-hidden="true" size={16} strokeWidth={1.8} />
                Download PDF
              </a>
            </div>
            <p className="max-w-[42rem] t-p-sm-sans">
              Review the pilot scope, success criteria, security posture, and commercial terms. Make changes, save them, then approve the pilot when everything is correct.
            </p>
        </div>

        {
        pilot.state === 'active' ? (
          <div className="mt-24 grid gap-16 rounded-sm bg-[#07112C]/30 px-18 py-16 text-white">
            <p className="t-p-sm-sans">The pilot is live. The final evaluation will be assessed against the agreed criteria.</p>
            {/* <CTAButton href="/account" analyticsLabel="pilot room return to account">
              Return to account
            </CTAButton> */}
          </div>
        ) : null
      }

      {
        sessionId && !pilot.payment?.paidAt ? (
          <div className="mt-24 rounded-sm border border-white/80 bg-white/10 px-18 py-16">
            <p className="t-p-sm-sans font-medium">Payment received. Finalizing your pilot record.</p>
            <p className="mt-8 t-p-sm-sans text-white/80">This page refreshes the pilot status without leaving the room.</p>
          </div>
        ) : null
      }

      {
        pilot.state === 'paid' || (pilot.state === 'launch' && pilot.payment?.paidAt) ? (
          <div className="mt-24 bg-white/10 rounded-sm px-18 py-16" role="status">
            <p className="t-p-sm-sans font-medium">Thank you — payment received.</p>
            <p className="mt-8 t-p-sm-sans text-white">Your pilot is confirmed. Schedule your launch below to keep production on track.</p>
          </div>
        ) : null
      }



      {
        pilot.state === 'not_eligible' ? (
          <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
            <p className="t-p-sm-sans">The standard pilot cannot proceed as drafted.</p>
            <p className="mt-8 t-p-sm-sans">Please revise the plan to continue.</p>
            <a href={revisePath} className={`${primaryButtonClasses} mt-14`}>
              <Pencil aria-hidden="true" size={16} strokeWidth={1.8} />
              Revise the plan
            </a>
          </div>
        ) : null
      }

      {
        (pilot.state === 'reviewing' || pilot.state === 'revision') && accessRole === 'owner' ? (
          <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
            <p className="t-p-sm-sans">Review the draft before inviting team members for review.</p>
            <button onClick={() => void onStartTeamReview()} disabled={busy || hasUnsavedChanges} className={`${accentButtonClasses} mt-14`}>
              Ready to share
              <UserPlus aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          </div>
        ) : null
      }

      {
        progressUnresolved.length > 0 ? (
          <div className="mt-24 rounded border border-white/80 bg-white/10 backdrop-blur-[20px] px-18 py-16">
            <p className="t-p-sm-sans font-medium">{progressUnresolved.length} item{progressUnresolved.length === 1 ? '' : 's'} to resolve</p>
            <ul className="mt-12 grid gap-10">
              {progressUnresolved.map((item) => (
                <li key={item.key} className="t-p-sm-sans">
                  <SmoothAnchor
                    href={item.href}
                    className="inline underline decoration-2 underline-offset-4"
                    onClick={handlePilotAnchorClick}
                  >
                    {item.label}
                  </SmoothAnchor>
                  <span className="mt-4 block">{item.resolution}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }

      {
        pilot.exceptions.some((item) => !item.resolvedAt) ? (
          <div id="exceptions" className="mt-24 bg-white/10 rounded-sm px-18 py-16" style={{ scrollMarginTop: '140px' }}>
            <p className="t-p-sm-sans font-medium">These terms need review before the pilot can be approved.</p>
            <ul className="mt-12 grid gap-24">
              {pilot.exceptions.map((item, index) => (
                <li key={item.kind + index} className="grid gap-4 t-p-sm-sans">
                  <span className='text-white'>{item.amendment}</span>
                  <span>{item.summary}</span>
                  {item.resolvedAt ? <span>Review complete</span> : null}
                </li>
              ))}
            </ul>
            {canCommitDraft && pendingExceptionReview && pilot.state !== 'exception_review' ? (
              <button onClick={() => void onSubmitForPortalsReview()} disabled={busy || hasUnsavedChanges} className={`${accentButtonClasses} mt-14`}>
                Submit for Portals review
                <Send aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            ) : null}
            {pendingExceptionReview && pilot.state === 'exception_review' ? (
              <p className="mt-12 t-p-sm-sans">Portals is reviewing these terms. The pilot owner can continue after the review is resolved.</p>
            ) : null}
            {pendingExceptionReview && hasUnsavedChanges ? (
              <p className="mt-12 t-p-sm-sans">Save your changes before submitting these terms for Portals review.</p>
            ) : null}
          </div>
        ) : null
      }

      {
        assessmentQualificationPending ? (
          <div className="mt-24 bg-white/10 rounded-sm px-18 py-16">
            <p className="t-p-sm-sans">Qualification call required</p>
            <p className="mt-8 max-w-[54rem] t-p-sm-sans">
              This request came through the assessment self-selection path. The completed scope provides Portals with enough context to qualify or decline the pilot.
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
        ) : null
      }

      {
        conflicts.length > 0 ? (
          <div className="mt-24 bg-white/10 rounded-sm px-18 py-16" role="alert">
            <div className="flex items-start gap-10">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} className="mt-2 text-white" />
              <div>
                <p className="t-p-sm-sans">This field changed while you were reviewing the pilot.</p>
                <p className="mt-6 t-p-sm-sans">Please choose which value to keep, then save again if needed.</p>
              </div>
            </div>
            <div className="mt-14 grid gap-12">
              {conflicts.map((conflict) => (
                <div key={conflict.field} className="grid gap-10 bg-white/10 rounded-sm pt-12">
                  <div>
                    <p className="t-p-sm-sans">{conflict.label}</p>
                    <p className="mt-4 t-p-sm-sans">Current version: {String(conflict.currentValue || '-')}</p>
                    <p className="mt-4 t-p-sm-sans">Your change: {String(conflict.mineValue || '-')}</p>
                  </div>
                  <div className="flex flex-wrap gap-8 md:justify-end">
                    <button type="button" className={plainButtonClasses} disabled={busy} onClick={() => void resolveConflict(conflict, 'current')}>
                      Use current
                    </button>
                    <button type="button" className={primaryButtonClasses} disabled={busy} onClick={() => void resolveConflict(conflict, 'mine')}>
                      Use mine
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      }
      </div>


      <SectionShell
        id="scope"
        title="Scope"
        mode={canEditDraft ? 'editable' : 'request'}
        summary="The operational scope of the pilot: workflow, participants, integrations, data classification, and target start date."
        action={!canEditDraft ? requestAction('Scope') : null}
      >
        <dl className="grid gap-14 t-p-sm-sans">
          {answers.productionStateBottleneck ? <div><dt className="text-white/80">Production-state bottleneck</dt><dd className="mt-2">{String(answers.productionStateBottleneck)}</dd></div> : null}
          {answers.productionBaseline ? <div><dt className="text-white/80">Assessment baseline to validate</dt><dd className="mt-2">{String(answers.productionBaseline)}</dd></div> : null}
          <div><dt className="text-white/80">Pilot workflow</dt><dd className="mt-2">{canEditDraft ? <RoomTextareaField minRows={3} value={String(answers.pilotWorkflow || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, pilotWorkflow: event.target.value }))} /> : String(answers.pilotWorkflow || answers.activeWorkflow || '-')}</dd></div>
          <div><dt className="text-white/80">Production owner</dt><dd className="mt-2">{canEditDraft ? <RoomTextField value={String(answers.productionOwner || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, productionOwner: event.target.value }))} /> : String(answers.productionOwner || '-')}</dd></div>
          <div><dt className="text-white/80">Economic buyer</dt><dd className="mt-2">{String(answers.economicBuyer || '-')}</dd></div>
          <div><dt className="text-white/80">Technical evaluator</dt><dd className="mt-2">{canEditDraft ? <RoomTextField value={String(answers.technicalEvaluator || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, technicalEvaluator: event.target.value }))} /> : String(answers.technicalEvaluator || '-')}</dd></div>
          <div><dt className="text-white/80">Historical projects</dt><dd className="mt-2">{canEditDraft ? <RoomTextField value={String(answers.historicalProject || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, historicalProject: event.target.value }))} /> : String(answers.historicalProject || '-')}</dd></div>
          <div><dt className="text-white/80">Participants</dt><dd className="mt-2">{canEditDraft ? <RoomTextField value={String(answers.participantsRange || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, participantsRange: event.target.value }))} /> : String(answers.participantsRange || '-')}</dd></div>
          <div id="integration-method" className="scroll-mt-36"><dt className="text-white/80">Integration method</dt><dd className="mt-2">{canEditDraft ? <RoomTextField value={String(answers.integrationMethod || '')} onChange={(event) => setDraftAnswers((current) => ({ ...current, integrationMethod: event.target.value }))} /> : String(answers.integrationMethod || '-')}</dd></div>
          <div id="data-classification" className="scroll-mt-36"><dt className="text-white/80">Data classification</dt><dd className="mt-2">{String(answers.dataClassification || '-')}</dd></div>
          <div id="approval-path" className="scroll-mt-36"><dt className="text-white/80">Approval path</dt><dd className="mt-2">{String(answers.approvalPath || '-')}</dd></div>
          <div id="pilot-start-date" className="scroll-mt-36">
            <dt className="text-white/80">Pilot start date</dt>
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
        summary="Pilot fee, term, acceptance deadline, annual deployment decision deadline, and annual plan pricing."
        action={!canEditDraft ? requestAction('Commercial terms') : null}
      >
        {pilot.proposal ? (
          <dl className="grid gap-14 t-p-sm-sans">
            <div><dt className="text-white/80">One-time pilot fee</dt><dd className="mt-2">{pilot.proposal.priceLabel}, due on signature.</dd></div>
            <div><dt className="text-white/80">Pilot term</dt><dd className="mt-2">{pilot.proposal.termDays} days{pilot.proposal.termStart && pilot.proposal.termEnd ? `, ${formatCommercialDate(pilot.proposal.termStart)} to ${formatCommercialDate(pilot.proposal.termEnd)}` : ''}</dd></div>
            {pilot.proposal.offerVariantSlug ? (
              <div><dt className="text-white/80">Pilot offer acceptance deadline</dt><dd className="mt-2">{offerAcceptanceCopy(pilot.proposal)}</dd></div>
            ) : null}
            {formatCommercialDate(pilot.proposal.decisionDate) ? <div><dt className="text-white/80">Annual deployment decision deadline</dt><dd className="mt-2">{formatCommercialDate(pilot.proposal.decisionDate)}</dd></div> : null}
            {pilot.proposal.creditDeadline ? <div><dt className="text-white/80">Annual plan credit deadline</dt><dd className="mt-2">{formatCommercialDate(pilot.proposal.creditDeadline)}. To receive the pilot fee as a credit toward your annual subscription, sign the annual order form by this date.</dd></div> : null}
            {(pilot.proposal.annualCreditLabel || pilot.proposal.annualOption) ? (
              <div><dt className="text-white/80">Pilot fee credited toward annual plan</dt><dd className="mt-2">{formatCommercialAmount(pilot.proposal.annualCreditAmount ?? pilot.proposal.priceAmount, pilot.proposal.currency)}{pilot.proposal.creditDeadline ? ` when the annual order form is signed by ${formatCommercialDate(pilot.proposal.creditDeadline)}` : ''}.</dd></div>
            ) : null}
            {pilot.proposal.annualOption ? (
              <div id="annual-deployment-option" className="scroll-mt-36">
                <dt className="text-white/80">Annual plan</dt>
                <dd className="mt-2">{pilot.proposal.annualOption.name}</dd>
                <dl className="mt-12 grid gap-10 border-l border-white/30 pl-14">
                  <div id="annual-price-acknowledgement" className="scroll-mt-36"><dt className="text-white/80">Monthly subscription rate</dt><dd className="mt-2">{pilot.proposal.annualOption.priceLabel} per month (billed annually)</dd></div>
                  <div>
                    <dt className="text-white/80">Annual contract total</dt>
                    <dd className="mt-2">{pilot.proposal.annualOption.annualTotal === null
                      ? 'Custom annual total, to be stated in the order form'
                      : `${formatCommercialAmount(pilot.proposal.annualOption.annualTotal, pilot.proposal.annualOption.currency)}`}</dd>
                  </div>
                  <div><dt className="text-white/80">Annual plan setup fee</dt><dd className="mt-2">{pilot.proposal.annualOption.onboardingFee ? `${formatCommercialAmount(pilot.proposal.annualOption.onboardingFee, pilot.proposal.annualOption.currency)}, due at account creation.` : 'None.'}</dd></div>
                </dl>
              </div>
            ) : <div id="annual-deployment-option" className="scroll-mt-36"><dt className="text-white/80">Annual plan</dt><dd className="mt-2">Not selected.</dd></div>}
            {!pilot.proposal.annualOption ? <div id="annual-price-acknowledgement" className="scroll-mt-36"><dt className="text-white/80">Annual price acknowledgement</dt><dd className="mt-2">{answers.annualPriceAcknowledged ? 'Acknowledged' : 'Not yet acknowledged'}</dd></div> : null}
            {pilot.payment?.invoiceId ? <div><dt className="text-white/80">Invoice</dt><dd className="mt-2"><a className="underline" href={String(pilot.payment.hostedInvoiceUrl || '#')} target="_blank" rel="noreferrer">{String(pilot.payment.invoiceId)}</a> · {String(pilot.payment.invoiceStatus || 'open')}</dd></div> : null}
            {pilot.payment?.paymentStatus ? <div><dt className="text-white/80">Payment status</dt><dd className="mt-2 capitalize">{String(pilot.payment.paymentStatus)}</dd></div> : null}
            {value ? (
              <div className="md:col-span-2">
                <dt className="text-white/80">Auditable value estimate</dt>
                <dd className="mt-2">{value.formula}</dd>
                <dd className="mt-2">Range ${value.low.toLocaleString()} to ${value.high.toLocaleString()}, midpoint ${value.midpoint.toLocaleString()}</dd>
                <dd className="mt-2 text-white">{value.frequency.label}, {value.hoursLoss.label} lost, {value.people.label} affected</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="t-p-sm-sans text-white">
            Commercial terms are being prepared.{' '}
            <span id="annual-deployment-option" className="scroll-mt-36">Annual deployment option pending.</span>{' '}
            <span id="annual-price-acknowledgement" className="scroll-mt-36">Annual price acknowledgement pending.</span>
          </p>
        )}
        {requestPanel('Commercial terms')}
      </SectionShell>

      <SectionShell
        id="success-criteria"
        title="Success Criteria"
        mode={canEditDraft ? 'editable' : 'request'}
        summary="Define how pilot success will be measured. Accept each criterion as written, modify it for this pilot, or mark it as not applicable."
        action={!canEditDraft ? requestAction('Success criteria') : null}
      >
        <div className="grid gap-[2px]">
          {criteria.map((criterion, index) => (
            <div key={criterion.key} className="grid gap-14 bg-white/10 rounded-sm px-18 py-16">
              <div className="flex flex-wrap items-baseline justify-between gap-12">
                <p className="t-p-sm-sans font-medium">{criterion.label}</p>
                {canEditDraft ? (
                  <div className="inline-grid grid-cols-3 border rounded" role="group" aria-label={`${criterion.label} decision`}>
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
                  <p className="t-p-sm-sans">{criterion.status.replace('-', ' ')}</p>
                )}
              </div>
              <div className="grid gap-10">
                {(['target', 'participant', 'evidence'] as const).map((field) => (
                  <label key={field} className="t-p-sm-sans">
                    {field === 'target' ? 'Measurable target' : field === 'participant' ? 'Participant' : 'Evidence'}
                    {canEditDraft && criterion.status === 'modified' ? (
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
                      <span className="mt-12 block t-p-sm-sans">
                        {criterion.status === 'not-applicable' ? '' : (criterion[field] || '-')}
                      </span>
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
        summary="Portals' current security posture. These terms cannot be edited directly. Submit additional requirements for review if needed."
        action={requestAction('Security posture')}
      >
        <div className="grid gap-10">
          {pilot.securityDecisions.map((decision) => (
            <div key={decision.key} className="flex justify-between gap-6 border-t border-white/80 pt-10 t-p-sm-sans">
              <div className='flex flex-col gap-8'>
                <p>{decision.label}</p>
                {decision.note && <p className='text-white/80'>{decision.note || ''}</p>}
              </div>
              <p className="capitalize self-end shrink-0">{decision.decision.replace('-', ' ')}</p>
            </div>
          ))}
        </div>
        {requestPanel('Security posture')}
      </SectionShell>

      <SectionShell
        id="review-status"
        title="Review Status"
        mode="readonly"
        summary="Review progress for each section: workflow scope, success criteria, technical scope, security posture, and agreement."
      >
        <dl className="grid gap-10 t-p-sm-sans">
          {reviewRows.map((row, index) => (
            <div key={row.section} className={`grid gap-4 ${index === reviewRows.length - 1 ? '' : 'border-b border-white/80 pb-10'}`}>
              <dt className="text-white/80">{row.section}</dt>
              <dd className={toneClasses(row.view.tone)}>{row.view.label}</dd>
            </div>  
          ))}
        </dl>
      </SectionShell>

      <SectionShell
        id="reviewers"
        title="Reviewers"
        mode={invitationsUnlocked ? 'editable' : 'readonly'}
        summary="Confirm who needs access to this room. Reviewers may hold more than one role. One reviewer per role is required for a review task."
      >
        {!invitationsUnlocked ? (
          <p className="mb-14 t-p-sm-sans">Reviewer invitations unlock after the draft is ready for team review.</p>
        ) : null}
        <div className="grid gap-12">
          {portalsTeamEmails.map((email) => (
            <div key={`portals:${email}`} data-reviewer-role={PORTALS_TEAM_REVIEWER_ROLE} className="grid gap-6 rounded-sm border border-white/80 px-18 py-16">
              <p className="t-p-sm-sans font-medium">{email}</p>
              <Badge className="w-fit border border-white/10 px-8 py-2 t-p-sm-sans">{PORTALS_TEAM_REVIEWER_LABEL}</Badge>
              <p className="t-p-sm-sans">Managed by Portals</p>
            </div>
          ))}
          {reviewerGroups.filter((group) =>
            !portalsTeamEmails.includes(group.email) && memberEmails.includes(group.email) && group.reviewers.some((reviewer) => reviewer.status !== 'revoked'),
          ).map((group) => {
            const primary = group.primary
            const activeReviewers = [...new Map(
              group.reviewers.filter((reviewer) => reviewer.status !== 'revoked').map((reviewer) => [reviewer.role, reviewer]),
            ).values()]
            const pendingReviewers = activeReviewers.filter(
              (reviewer) => reviewer.role !== 'signer' &&
                !(reviewer.status === 'reviewed' && reviewer.versionSeen >= pilot.version),
            )
            const groupStatus = activeReviewers.some((reviewer) => reviewer.requestedChanges)
              ? 'Changes requested'
              : pendingReviewers.length > 0
                ? 'Awaiting review'
                : 'Confirmed'
            const inviteTarget = activeReviewers.find(
              (reviewer) => reviewer.status === 'proposed' && reviewer.email.trim(),
            )
            const resendTarget = activeReviewers.find(
              (reviewer) => (reviewer.status === 'invited' || reviewer.status === 'opened') && reviewer.email.trim(),
            )
            return (
              <div key={primary.id} className="grid gap-12 rounded-sm border border-white/80 px-18 py-16">
                <div className="grid gap-6">
                  <div>
                    <p className="t-p-sm-sans font-medium">{primary.name || primary.email || 'No one named yet'}</p>
                    <p className="t-p-sm-sans text-white">{primary.email || 'Assign an email to invite this reviewer'}</p>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <Badge className="border border-white/10 px-8 py-2 t-p-sm-sans">{reviewerRoleLabel(primary.role)}</Badge>
                    {[...new Set(group.additional.map((reviewer) => reviewer.role))].filter((role) => role !== primary.role).map((role) => (
                      <Badge key={role} className="border border-white/10 px-8 py-2 t-p-sm-sans">{reviewerRoleLabel(role)}</Badge>
                    ))}
                  </div>
                  <p className={`t-p-sm-sans`}>status: <span className={`t-p-sm-sans ${groupStatus === 'Confirmed' ? 'text-white/80' : 'text-white'}`}>{groupStatus}</span></p>
                  {invitationsUnlocked && inviteTarget ? (
                    <button onClick={() => void onInvite(inviteTarget)} disabled={busy} className={primaryButtonClasses}>Invite</button>
                  ) : invitationsUnlocked && resendTarget ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => void onInvite(resendTarget)} disabled={busy} className={primaryButtonClasses}>Resend invitation</button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send one room invitation for this person's assigned roles.</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                <div className="grid gap-10 border-t border-white/20 pt-10">
                  {activeReviewers.map((reviewer) => {
                    const view = reviewerStatusView(reviewer)
                    const stale = reviewer.status === 'reviewed' && reviewer.versionSeen < pilot.version
                    return (
                      <div key={reviewer.id} className="grid gap-8">
                        <p className="t-p-sm-sans text-white/80">{reviewerRoleLabel(reviewer.role)}</p>
                        <div className="grid gap-8">
                          <p className={`t-p-sm-sans ${toneClasses(view.tone)}`}>
                            {view.label}
                            {stale ? <span className="text-white">, reconfirmation needed</span> : null}
                          </p>
                          {reviewer.notes.length > 0 ? (
                            <ul className="grid gap-4">
                              {reviewer.notes.map((note, noteIndex) => (
                                <li key={noteIndex} className="t-p-sm-sans text-white">Note: {note}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        {accessRole === 'owner' && invitationsUnlocked && reviewer.id === primary.id ? (
                          <div className="grid content-between gap-8 md:justify-items-end">
                            {roleEditor === primary.id ? (
                              <div className="flex flex-wrap items-end gap-8">
                                <label className="t-p-sm-sans">
                                  Additional role
                                  <RoomSelectField className="mt-4" aria-label={`Additional role for ${primary.email || primary.name || 'reviewer'}`} value={roleToAdd} onChange={(event) => setRoleToAdd(event.target.value as ReviewerRole)}>
                                    {REVIEWER_ROLES.map((role) => (
                                      <option key={role} value={role} disabled={group.reviewers.some((assigned) => assigned.status !== 'revoked' && assigned.role === role)}>
                                        {reviewerRoleLabel(role)}{group.reviewers.some((assigned) => assigned.status !== 'revoked' && assigned.role === role) ? ' (already assigned)' : ''}
                                      </option>
                                    ))}
                                  </RoomSelectField>
                                </label>
                                <button onClick={() => void onChangeRole(primary, roleToAdd)} disabled={busy || group.reviewers.some((assigned) => assigned.status !== 'revoked' && assigned.role === roleToAdd)} className={primaryButtonClasses}>Apply role</button>
                                <button onClick={() => setRoleEditor(null)} disabled={busy} className={plainButtonClasses}>Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setRoleEditor(primary.id)} disabled={busy} className={plainButtonClasses}>Add role</button>
                            )}
                            <div className="flex flex-wrap gap-8">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => void onClaim(reviewer)} disabled={busy} className={plainButtonClasses}>I hold this role</button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Assign this role to yourself so you can review and confirm the terms.</p>
                                </TooltipContent>
                              </Tooltip>
                              {reviewer.status !== 'revoked' ? <button onClick={() => void onRemove(reviewer)} disabled={busy} className={plainButtonClasses}>Remove</button> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {memberEmails.filter((email) => !portalsTeamEmails.includes(email) && !reviewerGroups.some(
            (group) => group.email === email && group.reviewers.some((reviewer) => reviewer.status !== 'revoked'),
          )).map((email) => (
            <div key={email} className="grid gap-6 rounded-sm border border-white/80 px-18 py-16">
              <div className="flex flex-wrap items-center justify-between gap-8">
                <div>
                  <p className="t-p-sm-sans font-medium">{email}</p>
                  <p className="t-p-sm-sans">No review role assigned</p>
                </div>
                {accessRole === 'owner' && invitationsUnlocked ? (
                  roleEditor === `member:${email}` ? (
                    <div className="flex flex-wrap items-end gap-8">
                      <label className="t-p-sm-sans">
                        Role
                        <RoomSelectField className="mt-4" aria-label={`Role for ${email}`} value={roleToAdd} onChange={(event) => setRoleToAdd(event.target.value as ReviewerRole)}>
                          {REVIEWER_ROLES.map((role) => <option key={role} value={role}>{reviewerRoleLabel(role)}</option>)}
                        </RoomSelectField>
                      </label>
                      <button onClick={() => void onAddMemberRole(email, roleToAdd)} disabled={busy} className={primaryButtonClasses}>Apply role</button>
                      <button onClick={() => setRoleEditor(null)} disabled={busy} className={plainButtonClasses}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setRoleEditor(`member:${email}`)} disabled={busy} className={plainButtonClasses}>Add role</button>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {invitationsUnlocked ? (
          <>
            <div className="mt-16 flex gap-10 justify-end">
              <button onClick={() => void onInviteAllRequired()} disabled={busy} className={accentButtonClasses}>
                <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                Invite all reviewers
              </button>
            </div>
            <div className="mt-16 border-t border-white/80">
              <h2 className="t-h3-sans pt-28">Add Reviewer</h2>
              <div className="mt-8 grid gap-14 lg:grid-cols-[2fr_auto] lg:items-end">
                <label className="t-p-sm-sans text-white/80">
                  Email
                  <RoomTextField className="mt-4" type="email" value={draftReviewerEmail} onChange={(event) => setDraftReviewerEmail(event.target.value)} placeholder="name@company.com" />
                </label>
                <label className="t-p-sm-sans text-white/80">
                  Role
                  <RoomSelectField className="mt-4" value={draftRole} onChange={(event) => setDraftRole(event.target.value as ReviewerRole)}>
                    {REVIEWER_ROLES.map((role) => (
                      <option key={role} value={role}>{reviewerRoleLabel(role)}</option>
                    ))}
                  </RoomSelectField>
                </label>
                <label className="t-p-sm-sans text-white/80">
                  Name
                  <RoomTextField className="mt-4" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="name and title" />
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

      {
        myReviewer ? (
          <SectionShell
            id="your-review"
            title="Your review"
            mode="request"
            summary={`You are assigned as ${myReviewerRoleLabels} for this pilot. Review the current terms revision, then confirm or request a specific change.`}
          >
            {pilot.version > 1 && myReviewer.versionSeen < pilot.version ? (
              <p className="mb-12 t-p-sm-sans text-white">The plan changed after your last review. Please re-review.</p>
            ) : null}
            <div className="grid gap-14">
              <label className="t-p-sm-sans text-white/80">
                Notes or requested changes
                <RoomTextareaField
                  className="mt-4"
                  value={myNote}
                  onChange={(event) => setMyNote(event.target.value)}
                  placeholder="e.g. please add the security revision before I can confirm"
                />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-10">
                <button onClick={() => void onReviewerDecision('changes')} disabled={busy} className={primaryButtonClasses}>
                  <Send aria-hidden="true" size={16} strokeWidth={1.8} />
                  Request changes
                </button>
                <button onClick={() => void onReviewerDecision('confirm')} disabled={busy || hasUnsavedChanges} className={accentButtonClasses}>
                  <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
                  Confirm terms
                </button>
              </div>
            </div>
          </SectionShell>
        ) : null
      }

      {
        pilot.state === 'ready_sign' || pilot.signing?.signedAt || pilot.unresolved.some((item) => item.key === 'signer') ? (
          <SectionShell
            id="signature"
            title={pilot.state === 'ready_sign' && canSign ? 'Sign and Pay' : 'Authorized signer'}
            mode={pilot.state === 'ready_sign' && canSign ? 'editable' : 'readonly'}
            summary={`By signing, ${String(answers.company || 'the customer')} agrees to the confirmed scope, the ${pilot.proposal?.priceLabel} pilot fee due on signature, and the ${pilot.proposal?.termDays}-day pilot term.`}
          >
            {pilot.state === 'ready_sign' && canSign ? (
              <>
            <div className="grid gap-14">
              <label className="t-p-sm-sans text-white/80">
                Authorized signer name
                <RoomTextField className="mt-4" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
              </label>
              <label className="t-p-sm-sans text-white/80">
                Signer email
                <RoomTextField className="mt-4" type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} />
              </label>
            </div>
            <label className="mt-16 flex items-start gap-8">
              <RoomCheckbox checked={signerConsent} onChange={(event) => setSignerConsent(event.target.checked)} />
              <span className="t-p-sm-sans">
                By selecting Confirm pilot &amp; purchase, I represent that I am authorized to accept these terms on behalf of this organization and agree to the Production Pilot Terms, Privacy Policy, and pilot scope shown above.
              </span>
            </label>
            <p className="mt-12 t-p-sm-sans text-white/80">
              Review the canonical <a className="underline" href="/terms-of-service" target="_blank" rel="noreferrer">Terms of Service</a>, <a className="underline" href="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>, and <a className="underline" href="/security-and-architecture" target="_blank" rel="noreferrer">Security &amp; Architecture</a> documents before accepting.
            </p>
            <button onClick={() => void onSign()} disabled={busy || hasUnsavedChanges} className={`${accentButtonClasses} mt-18`}>
              Confirm pilot &amp; purchase
            </button>
              </>
            ) : pilot.signing?.signedAt ? (
              <p className="t-p-sm-sans">
                Signed by {String(pilot.signing.name || 'the authorized signer')}
                {pilot.signing.email ? ` (${String(pilot.signing.email)})` : ''}
                {formatReadableDate(String(pilot.signing.signedAt || '')) ? ` on ${formatReadableDate(String(pilot.signing.signedAt || ''))}` : ''}.
              </p>
            ) : (
              <p className="t-p-sm-sans">Authorized signer details can be entered once the agreement is ready for signature.</p>
            )}
          </SectionShell>
        ) : null
      }

      {
        pilot.history.length > 1 ? (
          <section className="mt-24 border-t border-white/80 pt-18 lowercase">
            <h2 className="t-h3-sans">Activity</h2>
            <ul className="mt-12 grid gap-8">
              {[...pilot.history].reverse().slice(0, 8).map((entry, index) => (
                <li key={entry.at + index} className="t-p-sm-sans text-white/80">
                  <span className="capitalize">{entry.action.replaceAll('_', ' ')}</span>
                  <span className="text-white"> {new Date(entry.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {entry.note ? <span> - {entry.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
      <div className="flex justify-end">
        <PilotApprovalRoomTour />
      </div>
      </div>
      <div
        ref={actionsRef}
        id="pilot-actions"
        className="fixed bottom-0 -mx-24 mr-48 w-3xl z-20 space-y-12 rounded-t-[2em] border-t bg-[#07112C] px-24 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-16 lowercase md:rounded"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), linear-gradient(180deg, rgba(1, 5, 40, 0.12) 0%, rgba(1, 5, 40, 0.74) 100%), linear-gradient(135deg, #010528 0%, #142E78 38%, #2F66B5 68%, #79C7DA 100%)',
          backgroundAttachment: 'fixed',
        }}
      >

        {
          error ? (
            <p className="t-p-sm-sans text-white" role="alert">{error}</p>
          ) : null
        }
        {
          notice ? (
            <p className="t-p-sm-sans text-white" role="status">{notice}</p>
          ) : null
        }
        {
          draftSaveState === 'failed' ? (
            <p className="t-p-sm-sans text-white" role="status">Save failed.</p>
          ) : null
        }

        {
          reviewerToRemove ? (
            <div className="bg-white/10 rounded-sm px-18 py-16" role="alertdialog" aria-modal="true" aria-labelledby="remove-reviewer-title">
              <p id="remove-reviewer-title" className="t-p-sm-sans font-medium">Remove reviewer</p>
              <p className="mt-8 t-p-sm-sans">
                Are you sure you want to remove {reviewerToRemove.name || reviewerToRemove.email} from the room? This action cannot be undone.
              </p>
              <div className="mt-14 flex flex-wrap gap-8">
                <button onClick={() => void confirmRemoveReviewer()} disabled={busy} className={primaryButtonClasses}>
                  Yes, remove
                </button>
                <button onClick={() => setReviewerToRemove(null)} disabled={busy} className={plainButtonClasses}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null
        }

        <div className="flex flex-wrap items-center gap-8">
          {editable ? <StatusPill>{routeBadge}</StatusPill> : null}
          <StatusPill>
            {hasUnsavedChanges ? `${unsavedChanges} unsaved change${unsavedChanges === 1 ? '' : 's'}` : 'All changes saved'}
          </StatusPill>
        </div>
        <div className="flex items-center gap-8">
          {canEditDraft ? (
            <button onClick={() => void onSave()} disabled={busy || !hasUnsavedChanges} className={`${primaryButtonClasses} w-full sm:w-auto`}>
              <Save aria-hidden="true" size={16} strokeWidth={1.8} />
              Submit changes
            </button>
          ) : null}
          {globalWorkflowAction ? (
            <div className="flex flex-wrap gap-8 lg:justify-items-end">{globalWorkflowAction}</div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  </>
)}

const primaryButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const accentButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 bg-white/20 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white hover:bg-white/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const plainButtonClasses =
  'inline-flex min-h-44 items-center justify-center gap-8 rounded border border-white/80 px-18 t-p-sm-sans transition-colors duration-100 hover:border-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
