'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react'
import { CTAButton } from '@/components/CTAButton'
import { SmoothAnchor } from '@/components/SmoothAnchor'
import { LeadCheckbox, LeadSelectField, LeadTextField, LeadTextareaField } from '@/components/mui/fields'
import { ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback } from '@/components/leads/LeadFields'
import { ProgressiveAssessmentFields } from '@/components/leads/ProgressiveAssessmentFields'
import { useFormDraft } from '@/components/leads/useFormDraft'
import { formDraftKey, migrateMatchingFormDraft } from '@/lib/leads/form-draft'
import { usePreservedSwap } from '@/components/leads/usePreservedSwap'
import {
  clearPilotConfirmation,
  readPilotConfirmation,
  writePilotConfirmation,
} from '@/lib/leads/pilot-confirmation'
import { analyticsConsent, buildAttribution, retrieveFormParams, trackEvent } from '@/lib/leads/analytics-client'
import { newSubmissionId, publicEmailNeedsWebsite, submitLead } from '@/lib/leads/client'
import { emailDomain, requiresCompanyEmailDomain } from '@/lib/leads/identity'
import {
  DISCLOSURE_VERSION,
  pilotControlledOptionLists as optionLists,
  pilotRequestAnswersSchema,
  type KnownLeadContext,
  type LeadIdentity,
  type PilotAnswers,
} from '@/lib/leads/contracts'
import { classifyPilot, STANDARD_SUCCESS_KEYS } from '@/lib/leads/pilot'
import { PRIMARY_PILOT_SUCCESS_TEST } from '@/lib/leads/pilot-success'
import {
  normalizeUrlParams,
  parseUrlParams,
  shouldHideField,
  validateUrlParamEmail,
  type UrlParams,
} from '@/lib/leads/url-params'

const STAGES = [
  { key: 'eligibility', label: 'eligibility' },
  { key: 'scope', label: 'scope' },
  { key: 'success', label: 'success' },
  { key: 'purchase', label: 'approval' },
  { key: 'confirmation', label: 'confirmation' },
] as const

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | {
    status: 'success'
    pilotUrl?: string
    pilotAuthToken?: string
    calendarUrl?: string
    downloadUrl?: string
    pilotRoute?: string
    preview?: boolean
  }
  | { status: 'error'; message: string }


export function PilotScopeForm({
  specSummary,
  context,
  pilotId,
  offer,
  offerTerms,
  pilotMode = 'standard',
  initialAnswers,
  assessmentOrigin = 'standard',
  annualOptions = [],
}: {
  specSummary: string
  context: KnownLeadContext
  pilotId?: string
  offer?: string
  offerTerms?: {
    pilotPriceLabel: string
    annualCreditLabel: string
    pilotDurationDays: number
    acceptanceDeadlineLabel?: string
    offerCopy?: string
  }
  pilotMode?: 'standard' | 'assisted'
  initialAnswers?: Record<string, unknown>
  assessmentOrigin?: 'standard' | 'assessment_override'
  annualOptions?: Array<{ slug: string; name: string; priceLabel: string }>
}) {
  const carriedAnswers = {
    ...(context.answerValues || {}),
    ...(initialAnswers || {}),
  }
  const [stage, setStage] = useState(0)
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' })
  const [email, setEmail] = useState('')
  const [liveAnswers, setLiveAnswers] = useState<Record<string, string | boolean>>(
    () => Object.fromEntries(Object.entries(carriedAnswers)) as Record<string, string | boolean>,
  )
  const [stageError, setStageError] = useState('')
  const [submissionId, setSubmissionId] = useState(() =>
    newSubmissionId('pilot-request'),
  )
  const [urlParams, setUrlParams] = useState<UrlParams>({})
  const [showField, setShowField] = useState<Record<string, boolean>>({})
  const started = useRef(false)
  const currentStageRef = useRef(stage)
  currentStageRef.current = stage
  const stepNav = useRef<'forward' | 'back' | null>(null)
  const submittedByClickRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const stageHeadingRef = useRef<HTMLHeadingElement>(null)
  const { ref: swapRef, reservedHeight, reserve } = usePreservedSwap()
  const draftScope = pilotId || context.profileId || context.draftScopeHint || 'direct'
  useEffect(() => {
    if (pilotId) return
    const expectedEmail = context.identity?.email || new URL(window.location.href).searchParams.get('email') || undefined
    migrateMatchingFormDraft(formDraftKey('pilot_request'), formDraftKey(`pilot_request:${draftScope}`), expectedEmail)
  }, [draftScope, pilotId, context.identity?.email])
  const { ref: draftRef, restored, flush, clear } = useFormDraft(`pilot_request:${draftScope}`, carriedAnswers)
  const knownAnswers = new Set(context.knownAnswerFields)
  const missing = (field: string) => !knownAnswers.has(field) && !carriedAnswers[field]
  const isRevision = Boolean(pilotId)
  const classification = useMemo(
    () => classifyPilot(liveAnswers as PilotAnswers),
    [liveAnswers],
  )

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
    if (formRef.current) setLiveAnswers(collectValues())
  }, [restored.email])

  // Parse URL parameters and integrate with form
  useEffect(() => {
    const rawUrlParams = parseUrlParams()
    const storedParams = retrieveFormParams()

    // Merge URL params with stored params (URL params take priority)
    const mergedParams = { ...storedParams, ...rawUrlParams }
    const normalizedParams = normalizeUrlParams(mergedParams)
    const paramsWithDefaults = normalizedParams

    setUrlParams(paramsWithDefaults)

    // Determine which fields to hide based on pre-filled values
    const fieldVisibility: Record<string, boolean> = {}
    fieldVisibility.howDidYouHearAboutPortals = !context.assessmentCompleted && missing('howDidYouHearAboutPortals') && !shouldHideField('howDidYouHearAboutPortals', paramsWithDefaults.how_did_you_hear)
    fieldVisibility.whatBroughtYouHere = !context.assessmentCompleted && missing('whatBroughtYouHere') && !shouldHideField('whatBroughtYouHere', paramsWithDefaults.what_brought_you)

    setShowField(fieldVisibility)

    // Track URL parameter usage for analytics
    if (Object.keys(paramsWithDefaults).length > 0) {
      void trackEvent('form_url_params_used', {
        form_name: 'pilot_request',
        param_count: Object.keys(paramsWithDefaults).length,
        params: Object.keys(paramsWithDefaults),
      })
    }
  }, [])

  useEffect(() => {
    const onExit = () => {
      if (started.current) void trackEvent('pilot_application_abandoned', { stage: STAGES[currentStageRef.current].key })
    }
    window.addEventListener('pagehide', onExit)
    return () => window.removeEventListener('pagehide', onExit)
  }, [])

  useEffect(() => {
    if (pilotId) return
    const stored = readPilotConfirmation(draftScope)
    if (!stored) {
      setSubmitState({ status: 'idle' })
      return
    }
    setSubmitState({
      status: 'success',
      pilotUrl: stored.pilotUrl,
      calendarUrl: stored.calendarUrl,
      downloadUrl: stored.downloadUrl,
      pilotRoute: stored.pilotRoute,
      preview: stored.preview,
    })
  }, [pilotId, draftScope])

  useEffect(() => {
    void trackEvent('pilot_scope_viewed', {
      assessment_origin: assessmentOrigin,
      carried_fields: Object.keys(carriedAnswers).length,
    })
  }, [])

  useEffect(() => {
    const direction = stepNav.current
    if (!direction) return
    stepNav.current = null
    const el = formRef.current
    if (!el) return
    el.scrollIntoView({
      behavior:
        typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      block: direction === 'forward' ? 'start' : 'end',
    })
    stageHeadingRef.current?.focus({ preventScroll: true })
  }, [stage])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', { form_name: 'pilot_request' })
    void trackEvent('pilot_application_started', { assessment_version: carriedAnswers.assessment_version, qualification_tier: context.qualificationTier })
  }

  function collectValues(): Record<string, string | boolean> {
    const form = formRef.current
    if (!form) return {}
    const data = new FormData(form)
    const values: Record<string, string | boolean> = {}
    for (const [name, value] of data.entries()) {
      values[name] = String(value)
    }
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]').forEach((input) => {
      values[input.name] = input.checked
    })
    return { ...carriedAnswers, ...values } as Record<string, string | boolean>
  }

  function stageFieldsValid(index: number): boolean {
    const form = formRef.current
    if (!form) return false
    const container = form.querySelector<HTMLElement>(
      `[data-pilot-stage="${index}"]`,
    )
    if (!container) return false
    const invalid = container.querySelector<HTMLElement>(
      'input:invalid, select:invalid, textarea:invalid',
    )
    if (invalid) {
      setStageError(
        'Complete the highlighted field to continue.',
      )
      void trackEvent('pilot_validation_error', { stage: STAGES[index].key, field: invalid.getAttribute('name') })
      invalid.focus()
      return false
    }
    return true
  }

  function goTo(next: number, direction: 'forward' | 'back') {
    setLiveAnswers(collectValues())
    setStageError('')
    stepNav.current = direction
    setStage(next)
  }

  function onContinue() {
    if (!stageFieldsValid(stage)) return

    // Validate email domain on stage 0 (eligibility) progression
    if (stage === 0) {
      const currentEmail = email || (typeof context.identity?.email === 'string' ? context.identity.email : '') || (typeof carriedAnswers.email === 'string' ? carriedAnswers.email : '') || urlParams.email || ''
      if (currentEmail) {
        const domain = emailDomain(currentEmail)
        if (requiresCompanyEmailDomain(domain)) {
          setStageError('a company email domain is required (personal email domains like gmail.com are not accepted)')
          return
        }
      }
    }

    // Validate team member email domains on stage 1 progression
    if (stage === 1) {
      const stageValues = valuesFrom(stage)
      const teamEmails: unknown[] = []

      for (const teamEmail of teamEmails) {
        const domain = emailDomain(String(teamEmail))
        if (requiresCompanyEmailDomain(domain)) {
          setStageError('company email domains are required for team members (personal email domains like gmail.com are not accepted)')
          return
        }
      }
    }

    // Validate stakeholder email domains on stage 3 progression
    if (stage === 3) {
      const stageValues = valuesFrom(stage)
      const stakeholderEmails: unknown[] = []

      for (const stakeholderEmail of stakeholderEmails) {
        const domain = emailDomain(String(stakeholderEmail))
        if (requiresCompanyEmailDomain(domain)) {
          setStageError('company email domains are required for stakeholders (personal email domains like gmail.com are not accepted)')
          return
        }
      }

      if (!stageValues.annualPriceAcknowledged) {
        setStageError('acknowledge the proposed annual price to continue')
        return
      }
    }

    void trackEvent('pilot_application_stage_completed', { stage: STAGES[stage].key })
    goTo(stage + 1, 'forward')
  }

  function onBack() {
    setStageError('')
    goTo(stage - 1, 'back')
  }

  function valuesFrom(index: number): Record<string, string | boolean> {
    const form = formRef.current
    if (!form) return {}
    const container = form.querySelector<HTMLElement>(
      `[data-pilot-stage="${index}"]`,
    )
    if (!container) return {}
    const values: Record<string, string | boolean> = {}
    container
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea',
      )
      .forEach((input) => {
        if (input instanceof HTMLInputElement && input.type === 'checkbox' && input.name) {
          values[input.name] = input.checked
        } else if (input.name) {
          values[input.name] = input.value
        }
      })
    return values
  }

  function refreshLive() {
    setLiveAnswers(collectValues())
  }

  const knownAnswerValues = carriedAnswers

  function summaryAnswer(name: string): string {
    const live = String(liveAnswers[name] ?? '')
    if (live.trim()) return live
    const known = knownAnswerValues[name]
    if (typeof known === 'string') return known
    if (typeof known === 'number' || typeof known === 'boolean') {
      return String(known)
    }
    return ''
  }

  function startNewPilotForm() {
    clearPilotConfirmation(draftScope)
    clear()
    setSubmissionId(newSubmissionId('pilot-request'))
    formRef.current?.reset()
    setLiveAnswers({})
    setEmail('')
    setStageError('')
    setStage(0)
    setSubmitState({ status: 'idle' })
  }

  function pilotAnswersFrom(
    form: HTMLFormElement,
  ): z.infer<typeof pilotRequestAnswersSchema> {
    const data = new FormData(form)
    const string = (name: string) => {
      const formVal = String(data.get(name) || '').trim()
      if (data.has(name)) return formVal
      const carriedVal = carriedAnswers[name]
      if (typeof carriedVal === 'string' && carriedVal.trim()) return carriedVal.trim()
      if (typeof carriedVal === 'number') return String(carriedVal)
      return ''
    }
    const checked = (name: string) => {
      const control = form.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)
      if (control) return control.checked
      return Boolean(carriedAnswers[name])
    }
    const choice = <T extends readonly string[]>(
      name: string,
      options: T,
    ): T[number] => {
      const value = string(name)
      return (value || '') as T[number]
    }
    return {
      ...pilotRequestAnswersSchema.parse(carriedAnswers),
      assessmentOrigin,
      teamType: string('teamType'),
      teamSize: string('teamSize'),
      workflowCollaborators: string('workflowCollaborators'),
      toolsUsed: string('toolsUsed'),
      approvedVersionMethod: string('approvedVersionMethod'),
      productionContextMethod: string('productionContextMethod'),
      recreationFrequency: string('recreationFrequency'),
      incidentType: string('incidentType'),
      incidentDescription: string('incidentDescription'),
      peopleAffected: string('peopleAffected'),
      hoursLost: string('hoursLost'),
      deliveryImpact: string('deliveryImpact'),
      recurringWorkflow: string('recurringWorkflow'),
      assetVolume: string('assetVolume'),
      annualAffectedValue: string('annualAffectedValue'),
      activeWorkflow: string('activeWorkflow'),
      primaryObjection: string('primaryObjection'),
      objectionDetail: string('objectionDetail'),
      pilotWorkflow: string('pilotWorkflow') || string('activeWorkflow'),
      productionOwner: string('productionOwner'),
      productionOwnerEmail: string('productionOwnerEmail'),
      economicBuyer: string('economicBuyer'),
      economicBuyerEmail: string('economicBuyerEmail'),
      technicalEvaluator: string('technicalEvaluator'),
      technicalEvaluatorEmail: string('technicalEvaluatorEmail'),
      requiredIntegrations: string('requiredIntegrations'),
      targetStartPeriod: string('targetStartPeriod'),
      successCriteria: string('successCriteria') || PRIMARY_PILOT_SUCCESS_TEST,
      securityRequirements: string('securityRequirements'),
      budgetReadiness: string('budgetReadiness'),
      budgetOwner: string('budgetOwner'),
      message: string('message'),
      historicalProject: choice(
        'historicalProject',
        optionLists.historicalProject,
      ),
      historicalProjectName: string('historicalProjectName'),
      integrationMethod: choice(
        'integrationMethod',
        optionLists.integrationMethod,
      ),
      integrationSystemsJson: string('integrationSystemsJson'),
      dataClassification: choice(
        'dataClassification',
        optionLists.dataClassification,
      ),
      successCriterionKeysJson: string('successCriterionKeysJson') || JSON.stringify(STANDARD_SUCCESS_KEYS),
      participantsRange: choice(
        'participantsRange',
        optionLists.participantsRange,
      ),
      approvalPath: choice('approvalPath', optionLists.approvalPath),
      approverName: string('approverName'),
      approverRole: string('approverRole'),
      approverEmail: string('approverEmail'),
      procurementPoRequired: checked('procurementPoRequired'),
      procurementReviewTime: string('procurementReviewTime'),
      annualDeploymentOption: choice(
        'annualDeploymentOption',
        optionLists.annualDeploymentOption,
      ),
      annualPriceAcknowledged: checked('annualPriceAcknowledged'),
      signerName: string('signerName'),
      signerEmail: string('signerEmail'),
      pilotBlocker: string('pilotBlocker'),
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stage < STAGES.length - 1) {
      onContinue()
      return
    }
    if (!submittedByClickRef.current) return
    submittedByClickRef.current = false
    if (submitState.status === 'submitting') return
    if (!stageFieldsValid(4)) return
    setSubmitState({ status: 'submitting' })
    flush()

    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    let answers: z.infer<typeof pilotRequestAnswersSchema>
    try { answers = pilotAnswersFrom(form) } catch {
      setSubmitState({ status: 'error', message: 'Some saved details need updating. Review the form and try again.' })
      return
    }
    const applicantEmail = String(values.email || context.identity?.email || carriedAnswers.email || urlParams.email || '').trim()
    const applicantName = String(values.name || context.identity?.name || carriedAnswers.name || urlParams.name || '').trim()
    if (!answers.productionOwnerEmail && applicantEmail && (!answers.productionOwner || answers.productionOwner === applicantName)) answers.productionOwnerEmail = applicantEmail
    if (!String(answers.productionOwner || '').trim() && applicantName) answers.productionOwner = applicantName

    const whatBroughtYouHere = (values.whatBroughtYouHere || context.answerValues?.whatBroughtYouHere || urlParams.what_brought_you) as 'workflow-problem' | 'assess-scaling' | 'evaluating-tools' | 'other' | undefined
    const whatBroughtYouHereOther = String(values.whatBroughtYouHereOther || context.answerValues?.whatBroughtYouHereOther || urlParams.what_brought_you_other || '')
    const howDidYouHearAboutPortals = (values.howDidYouHearAboutPortals || context.answerValues?.howDidYouHearAboutPortals || urlParams.how_did_you_hear) as 'google-search' | 'linkedin' | 'email' | 'someone-company' | 'friend-colleague' | 'article-newsletter-podcast' | 'partner-company' | 'social-media' | undefined

    // Validate email domain if provided via URL params
    if (urlParams.email && !values.email) {
      const emailValidation = validateUrlParamEmail(urlParams.email)
      if (!emailValidation.valid) {
        setStageError(emailValidation.error || 'invalid email')
        setSubmitState({ status: 'error', message: emailValidation.error || 'invalid email' })
        return
      }
    }

    try {
      const result = await submitLead({
        submissionType: 'pilot_request',
        idempotencyKey: submissionId,
        formVersion: isRevision ? 'paid-pilot-revision.v1' : 'paid-pilot.v2',
        provider: 'browser',
        pilotId: pilotId || '',
        pilotMode,
        ...(offer ? { offer } : {}),
        identity: Object.fromEntries(
          Object.entries({
            email: String(values.email || context.identity?.email || carriedAnswers.email || urlParams.email || ''),
            name: String(values.name || context.identity?.name || carriedAnswers.name || urlParams.name || ''),
            company: String(values.company || context.identity?.company || carriedAnswers.company || urlParams.company || ''),
            role: String(values.role || context.identity?.role || carriedAnswers.role || urlParams.role || ''),
            website: String(values.website || context.identity?.website || carriedAnswers.website || urlParams.website || ''),
          }).filter(([, value]) => value),
        ) as LeadIdentity,
        attribution: buildAttribution({
          sourcePage: isRevision ? '/account' : '/pilot',
          ctaLabel: isRevision ? 'Submit revised plan' : 'Create my pilot plan',
          intent: isRevision
            ? 'pilot_revision'
            : assessmentOrigin === 'assessment_override'
              ? 'assessment_override'
              : 'pilot_scope',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        whatBroughtYouHere,
        whatBroughtYouHereOther,
        howDidYouHearAboutPortals,
        answers,
      })

      reserve()
      clear()
      if (!isRevision) {
        writePilotConfirmation({
          pilotUrl: result.pilotUrl,
          calendarUrl: result.calendarUrl,
          downloadUrl: result.downloadUrl,
          pilotRoute: result.pilotRoute,
          preview: result.dryRun,
        }, result.profileId || draftScope)
      }
      setSubmitState({
        status: 'success',
        pilotUrl: result.pilotAuthToken && result.pilotUrl
          ? `/auth/verify?token=${encodeURIComponent(result.pilotAuthToken)}&next=${encodeURIComponent(result.pilotUrl)}`
          : result.pilotUrl,
        calendarUrl: result.calendarUrl,
        downloadUrl: result.downloadUrl,
        pilotRoute: result.pilotRoute,
        preview: result.dryRun,
      })
      started.current = false
      form.reset()
    } catch (error) {
      setSubmitState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'we could not submit the request',
      })
    }
  }

  if (submitState.status === 'success') {
    return (
      <div className='max-w-[42em]'>
        <div role="status" className="py-24 ml-52">
          <div className='inline-flex items-baseline gap-10'>
            <Check
              aria-hidden="true"
              className="text-white -ml-48 shrink-0"
              size={32}
              strokeWidth={1.6}
            />
            <h3 className="t-h1-sans">
              {/* {submitState.pilotRoute === 'disqualified'
              ? 'we need a few clarifications.'
              : submitState.pilotRoute === 'one-call'
              ? 'your pilot approval room is ready.'
              : 'your pilot approval room is ready.'} */}
              your pilot approval room is ready.
            </h3>
          </div>
          <p className="mt-16 t-p-lg-sans text-white">
            {/* {submitState.pilotRoute === 'disqualified'
            ? 'Your request cannot proceed as a standard pilot yet. Review the notes in your room, revise the scope, and resubmit.'
            : submitState.pilotRoute === 'one-call'
              ? 'The plan is assembled and ready for review. A single pilot terms review is required before signing.'
              : 'The plan is assembled — no call required. Review the scope, confirm it as drafted, and sign when ready.'} */}
            {submitState.pilotRoute === 'disqualified'
              ? 'Review the flagged scope details and update your plan before proceeding.'
              : submitState.pilotRoute === 'one-call'
                ? 'Review your plan and resolve the flagged requirements before accepting the agreement.'
                : 'Review your plan, request any adjustments, and accept the agreement when ready. Payment is due on signature; kickoff follows payment.'}
          </p>
          {submitState.preview ? (
            <p className="mt-14 t-p-sans text-white">
              local preview mode was used, so no external systems were
              contacted.
            </p>
          ) : null}
          {!submitState.preview ? <p className="mt-14 t-p-sm-sans text-white/80">Your room is protected. Use the secure link in your work email, or sign in when you open it.</p> : null}
          <div className="mt-24 flex flex-col gap-12 sm:flex-row">
            {submitState.pilotUrl ? (
              <CTAButton
                href={submitState.pilotUrl}
                analyticsLabel="Review My Pilot Plan"
                analyticsIntent="pilot_room_open"
              >
                <span>
                  {submitState.pilotRoute === 'one-call'
                    ? 'review my pilot plan'
                    : 'review my pilot plan'}
                </span>
                <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
              </CTAButton>
            ) : null}
            {/* {submitState.downloadUrl ? (
            <CTAButton
              href={submitState.downloadUrl}
              target="_blank"
              rel="noreferrer"
              analyticsLabel="Download My Pilot Packet"
              analyticsIntent="pilot_packet_download"
            >
              <ArrowDownToLine aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>download pdf</span>
            </CTAButton>
          ) : null} */}
          </div>
          {/* {!isRevision ? (
          <div className="mt-24">
            <CTAButton
              type="button"
              appearance="plain"
              className="!min-w-0 underline underline-offset-4"
              onClick={startNewPilotForm}
              analyticsLabel="Submit a New Pilot Form"
              analyticsIntent="pilot_scope"
            >
              <span>submit a new pilot request</span>
            </CTAButton>
          </div>
        ) : null} */}
          {/* {submitState.calendarUrl ? (
          <p className="mt-16 t-p-sans text-white">
            need a pilot terms review?{' '}
            <a
              className="underline underline-offset-4"
              href={submitState.calendarUrl}
              target="_blank"
              rel="noreferrer"
            >
              choose a time
            </a>.
          </p>
        ) : null} */}
        </div>
      </div>
    )
  }

  return (
    <form
      ref={(node) => {
        formRef.current = node
        draftRef(node)
      }}
      className="grid scroll-mt-Header-h gap-20 sm:grid-cols-2"
      onFocus={onStarted}
      noValidate
      onSubmit={handleSubmit}
    >
      {/* {!isRevision && context.assessmentCompleted ? (
        <div className="sm:col-span-2 rounded-sm border border-white/25 px-16 py-14">
          <p className="t-p-sm-sans text-white">
            We've carried your production details forward from the assessment. Update anything that has changed.
          </p>
        </div>
      ) : null} */}
      <div className="sm:col-span-2">
        {/* <h3 ref={stageHeadingRef} tabIndex={-1} className="mb-14 t-h3-sans">{STAGES[stage].label}</h3> */}
        <ol aria-label="Pilot application progress" className="flex flex-wrap items-center gap-x-16 gap-y-8 t-p-sm-sans text-white">
          {STAGES.map((item, index) => (
            <li
              key={item.key}
              aria-current={index === stage ? 'step' : undefined}
              className={`flex items-center gap-8 ${index === stage
                ? 'text-white'
                : index < stage
                  ? 'text-white'
                  : 'text-white/35'
                }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-20 items-center justify-center rounded-full border text-[11px] ${index < stage
                  ? 'border-white'
                  : index === stage
                    ? 'border-white'
                    : 'border-white/80'
                  }`}
              >
                {index < stage ? '✓' : index + 1}
              </span>
              <span className="hidden sm:inline">{item.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div data-pilot-stage={0} hidden={stage !== 0} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <IdentityFields
            context={context}
            email={email}
            onEmailChange={(event) => setEmail(event.target.value)}
            requireWebsite={publicEmailNeedsWebsite(email) || Boolean(context.requiresWebsite)}
            onStarted={onStarted}
            urlParams={urlParams}
          />
        </div>
        {/* What brought you here - with URL param support and field hiding */}
        {showField.whatBroughtYouHere ? (
          <div className="sm:col-span-2">
            <LeadField label="what brought you here?" name="whatBroughtYouHere">
              <LeadSelectField
                id="whatBroughtYouHere"
                name="whatBroughtYouHere"
                defaultValue={String(initialAnswers?.whatBroughtYouHere || urlParams.what_brought_you || '')}
              >
                <option value="" disabled>select one</option>
                <option value="workflow-problem">I have a workflow problem I need to solve</option>
                <option value="assess-scaling">I want to assess whether our current process will scale</option>
                <option value="evaluating-tools">I'm evaluating production tools</option>
                <option value="other">Other</option>
              </LeadSelectField>
            </LeadField>
          </div>
        ) : null}
        {showField.whatBroughtYouHere && (initialAnswers?.whatBroughtYouHere === 'other' || urlParams.what_brought_you === 'other') ? (
          <div className="sm:col-span-2">
            <LeadField label="Please describe" name="whatBroughtYouHereOther">
              <LeadTextareaField
                id="whatBroughtYouHereOther"
                name="whatBroughtYouHereOther"
                defaultValue={String(initialAnswers?.whatBroughtYouHereOther || urlParams.what_brought_you_other || '')}
                placeholder="Describe what brought you here"
              />
            </LeadField>
          </div>
        ) : null}
        {/* How did you hear about portals - with URL param support and field hiding */}
        {showField.howDidYouHearAboutPortals ? (
          <div className="sm:col-span-2">
            <LeadField label="how did you hear about portals?" name="howDidYouHearAboutPortals">
              <LeadSelectField
                id="howDidYouHearAboutPortals"
                name="howDidYouHearAboutPortals"
                defaultValue={String(initialAnswers?.howDidYouHearAboutPortals || urlParams.how_did_you_hear || '')}
              >
                <option value="" disabled>select one</option>
                <option value="google-search">Google / search</option>
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
                <option value="someone-company">Someone at my company</option>
                <option value="friend-colleague">Friend or colleague</option>
                <option value="article-newsletter-podcast">Article / newsletter / podcast</option>
                <option value="partner-company">Partner / another company</option>
                <option value="social-media">Social media</option>
              </LeadSelectField>
            </LeadField>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <LeadField label="production and workflow to test *" name="pilotWorkflow">
            <LeadTextareaField
              id="pilotWorkflow"
              name="pilotWorkflow"
              required
              minRows={3}
              defaultValue={String(carriedAnswers.pilotWorkflow || carriedAnswers.activeWorkflow || '')}
              placeholder="one active workflow with current production behavior, e.g. approved campaign variants for the flagship account"
            />
          </LeadField>
        </div>
        <LeadField label="historical project *" name="historicalProject">
          <LeadSelectField
            id="historicalProject"
            name="historicalProject"
            required
            defaultValue={String(initialAnswers?.historicalProject || '')}
          >
            <option value="" disabled>select one</option>
            <option value="one-completed">one completed project</option>
            <option value="none">none yet</option>
            <option value="more-than-one">more than one project</option>
          </LeadSelectField>
        </LeadField>
        <LeadField label="when can the production team start? *" name="targetStartPeriod">
          <LeadSelectField
            id="targetStartPeriod"
            name="targetStartPeriod"
            required
            defaultValue={String(carriedAnswers.targetStartPeriod || '')}
          >
            <option value="" disabled>select one</option>
            <option value="within-30-days">within 30 days</option>
            <option value="within-60-days">within 60 days</option>
            <option value="this-quarter">this quarter</option>
            <option value="later">later — needs planning</option>
          </LeadSelectField>
        </LeadField>
        <LeadField label="can your organization approve the pilot fee? *" name="approvalPath">
          <LeadSelectField
            id="approvalPath"
            name="approvalPath"
            required
            defaultValue={String(carriedAnswers.approvalPath || '')}
          >
            <option value="" disabled>select one</option>
            <option value="self">I can approve it</option>
            <option value="other">a colleague approves it</option>
            <option value="procurement">procurement review is required</option>
            <option value="not-established">approval path is not established</option>
            <option value="no">it cannot be approved</option>
          </LeadSelectField>
        </LeadField>
        <LeadField label="how should your production data be classified? *" name="dataClassification">
          <LeadSelectField
            id="dataClassification"
            name="dataClassification"
            required
            defaultValue={String(initialAnswers?.dataClassification || '')}
          >
            <option value="" disabled>select one</option>
            <option value="public">public</option>
            <option value="confidential">confidential commercial</option>
            <option value="unreleased-client">unreleased client work</option>
            <option value="personal">personal data</option>
            <option value="regulated">regulated data</option>
            <option value="not-sure">not sure</option>
          </LeadSelectField>
        </LeadField>
        {offerTerms ? (
          <p className="sm:col-span-2 t-p-sm-sans" role="note">
            You've been offered a {offerTerms.pilotPriceLabel} pilot fee, {offerTerms.pilotDurationDays}-day pilot, and {offerTerms.annualCreditLabel} first-year deployment credit{offerTerms.acceptanceDeadlineLabel ? ` when the agreement is signed by ${offerTerms.acceptanceDeadlineLabel}` : ''}.
          </p>
        ) : null}
      </div>

      <div data-pilot-stage={1} hidden={stage !== 1} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white">who is involved and what does the work touch?</p>
        </div>
        {
          <LeadField label="production owner *" name="productionOwner">
            <LeadTextField
              id="productionOwner"
              name="productionOwner"
              required
              defaultValue={String(carriedAnswers.productionOwner || '')}
              placeholder="name and title"
            />
          </LeadField>
        }
        <LeadField label="pilot participants *" name="participantsRange">
          <LeadSelectField
            id="participantsRange"
            name="participantsRange"
            required
            defaultValue={String(initialAnswers?.participantsRange || '')}
          >
            <option value="" disabled>select one</option>
            <option value="1">1</option>
            <option value="2-4">2-4</option>
            <option value="5">5</option>
            <option value="6-10">6-10</option>
            <option value="11-plus">11+</option>
          </LeadSelectField>
        </LeadField>
        <LeadField label="import or integration method *" name="integrationMethod">
          <LeadSelectField
            id="integrationMethod"
            name="integrationMethod"
            required
            defaultValue={String(initialAnswers?.integrationMethod || '')}
          >
            <option value="" disabled>select one</option>
            <option value="manual-upload">manual structured upload</option>
            <option value="cloud-storage-import">supported cloud-storage import</option>
            <option value="api-based">API-based import</option>
            <option value="custom-integration">custom integration required</option>
            <option value="not-yet-known">not yet known</option>
          </LeadSelectField>
        </LeadField>
        <div className="sm:col-span-2">
          <LeadField label="required integrations or export paths *" name="requiredIntegrations">
            <LeadTextareaField
              id="requiredIntegrations"
              name="requiredIntegrations"
              required
              minRows={2}
              defaultValue={String(carriedAnswers.requiredIntegrations || '')}
              placeholder="systems, what is imported, what is exported"
            />
          </LeadField>
        </div>
        <div className="sm:col-span-2">
          <ProgressiveAssessmentFields
            context={context}
            onStarted={onStarted}
            draft={{ ...restored, ...(initialAnswers || {}) } as Record<string, string>}
          />
        </div>
      </div>

      <div data-pilot-stage={2} hidden={stage !== 2} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="t-h3-sans">Primary success test</h3>
          <p className="mt-12 t-p-sans">{PRIMARY_PILOT_SUCCESS_TEST}</p>
          {carriedAnswers.productionStateBottleneck ? <p className="mt-12 t-p-sm-sans text-white/80">Your assessment priority: {String(carriedAnswers.productionStateBottleneck)}</p> : null}
          {carriedAnswers.productionBaseline ? <p className="mt-12 t-p-sm-sans text-white/80">{String(carriedAnswers.productionBaseline)}</p> : null}
          <p className="mt-12 t-p-sm-sans text-white/80">We agree the applicable measurements in your pilot room. Stored prompts and sources can be retrieved exactly; generated outputs are evaluated within agreed tolerances.</p>
          <input type="hidden" name="successCriterionKeysJson" defaultValue={String(initialAnswers?.successCriterionKeysJson || JSON.stringify(STANDARD_SUCCESS_KEYS))} />
        </div>
        <details className="sm:col-span-2">
          <summary className="cursor-pointer t-p-sm-sans underline underline-offset-4">Adjust success criteria (optional)</summary>
          <LeadField label="success test or scope adjustment" name="successCriteria">
            <LeadTextareaField id="successCriteria" name="successCriteria" minRows={3} defaultValue={String(initialAnswers?.successCriteria || PRIMARY_PILOT_SUCCESS_TEST)} />
          </LeadField>
        </details>
        <div className="sm:col-span-2">
          <LeadField label="security requirements (optional)" name="securityRequirements">
            <LeadTextareaField
              id="securityRequirements"
              name="securityRequirements"
              minRows={4}
              defaultValue={String(carriedAnswers.securityRequirements || '')}
              placeholder="what would your IT, legal, or procurement team need before adoption? e.g. SSO/SAML, SOC 2 report, data residency"
            />
          </LeadField>
        </div>
      </div>

      <div data-pilot-stage={3} hidden={stage !== 3} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white">you can invite participants, reviewers, approvers, and the signer after your pilot room is created.</p>
        </div>
        {missing('budgetOwner') ? (
          <LeadField label="budget-owning function *" name="budgetOwner">
            <LeadSelectField id="budgetOwner" name="budgetOwner" required defaultValue={String(initialAnswers?.budgetOwner || '')}>
              <option value="" disabled>select one</option>
              <option value="executive">executive leadership</option>
              <option value="creative">creative leadership</option>
              <option value="production">production or operations</option>
              <option value="technology">technology</option>
              <option value="procurement">procurement</option>
              <option value="unknown">not yet known</option>
            </LeadSelectField>
          </LeadField>
        ) : null}
        {missing('budgetReadiness') ? (
          <LeadField label="budget readiness *" name="budgetReadiness">
            <LeadSelectField
              id="budgetReadiness"
              name="budgetReadiness"
              required
              defaultValue={String(initialAnswers?.budgetReadiness || '')}
            >
              <option value="" disabled>select one</option>
              <option value="pre-approved">pre-approved</option>
              <option value="current-cycle">in the current purchasing cycle</option>
              <option value="next-cycle">planned for the next purchasing cycle</option>
              <option value="proposal-required">needs a proposal or amendment</option>
              <option value="not-budgeted">not yet budgeted</option>
            </LeadSelectField>
          </LeadField>
        ) : null}
        <LeadField label="annual deployment you are evaluating *" name="annualDeploymentOption">
          <LeadSelectField
            id="annualDeploymentOption"
            name="annualDeploymentOption"
            required
            defaultValue={String(initialAnswers?.annualDeploymentOption || '')}
          >
            <option value="" disabled>select one</option>
            {annualOptions.map((option) => <option key={option.slug} value={option.slug}>{option.name}{option.priceLabel ? ` — ${option.priceLabel}` : ''}</option>)}
            <option value="not-known">not yet known</option>
          </LeadSelectField>
        </LeadField>
        <label className="flex items-start gap-10 t-p-sm-sans text-white sm:col-span-2">
          <LeadCheckbox
            name="annualPriceAcknowledged"
            defaultChecked={Boolean(initialAnswers?.annualPriceAcknowledged)}
          />
          <span>
            I have reviewed the proposed annual deployment and the pilot fee{offerTerms ? ` of ${offerTerms.pilotPriceLabel}` : ''}. Any credit follows the written terms. Creating this plan does not accept an agreement or authorize payment.
          </span>
        </label>
        {liveAnswers.approvalPath === 'procurement' ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <label className="flex items-start gap-10 t-p-sm-sans text-white">
              <LeadCheckbox name="procurementPoRequired" defaultChecked={Boolean(initialAnswers?.procurementPoRequired)} />
              <span>purchase order required</span>
            </label>
            <LeadField label="expected review time" name="procurementReviewTime">
              <LeadTextField id="procurementReviewTime" name="procurementReviewTime" defaultValue={String(initialAnswers?.procurementReviewTime || '')} placeholder="e.g. 2 weeks" />
            </LeadField>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <LeadField label="anything that would block the pilot (optional)" name="pilotBlocker">
            <LeadTextareaField
              id="pilotBlocker"
              name="pilotBlocker"
              minRows={2}
              defaultValue={String(carriedAnswers.pilotBlocker || carriedAnswers.objectionDetail || '')}
            />
          </LeadField>
        </div>
      </div>

      <div data-pilot-stage={4} hidden={stage !== 4} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">review the summary before submitting.</p>
        </div>
        <dl className="sm:col-span-2 grid gap-12 rounded-sm bg-white/10 px-14 py-16 t-p-sm-sans text-white">
          <SummaryRow label="workflow" value={summaryAnswer('pilotWorkflow') || '—'} />
          <SummaryRow label="start period" value={summaryAnswer('targetStartPeriod').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="participants" value={summaryAnswer('participantsRange') || '—'} />
          <SummaryRow label="integration" value={optionLists.integrationMethodLabel[summaryAnswer('integrationMethod') as keyof typeof optionLists.integrationMethodLabel] || '—'} />
          <SummaryRow label="data classification" value={optionLists.dataClassificationLabel[summaryAnswer('dataClassification') as keyof typeof optionLists.dataClassificationLabel] || '—'} />
          <SummaryRow label="approval path" value={summaryAnswer('approvalPath').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="production owner" value={[summaryAnswer('productionOwner'), summaryAnswer('productionOwnerEmail')].filter(Boolean).join(' · ') || '—'} />
          <SummaryRow label="annual option" value={summaryAnswer('annualDeploymentOption').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="budget-owning function" value={summaryAnswer('budgetOwner').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="budget readiness" value={summaryAnswer('budgetReadiness').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="security requirements" value={summaryAnswer('securityRequirements') || '—'} />
        </dl>
        {classification.route === 'one-call' ? (
          <p className="t-p-sm-sans text-white/80 sm:col-span-2" role="note">
            This plan will require a single pilot terms review before signing.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <ConsentFields
            onStarted={onStarted}
            showMarketing={!context.known}
            marketingDefaultChecked
          />
          <NoScriptLeadFallback />
        </div>
      </div>

      <div className="sm:col-span-2">
        {/* {specSummary ? (
          <p className="block t-p-sm-sans text-white">{specSummary}</p>
        ) : null} */}
        {stageError ? (
          <p className="mt-12 t-p-sans text-white" role="alert">
            {stageError}
          </p>
        ) : null}
        {submitState.status === 'error' ? (
          <p className="mt-12 t-p-sans text-white" role="alert">
            {submitState.message}
            {submitState.message.includes('Sign in') ? <a className="ml-8 underline" href="/auth/sign-in?next=%2Fpilot%23scope">Sign in to resume</a> : null}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-16 sm:col-span-2">
        {stage > 0 ? (
          <CTAButton
            type="button"
            appearance="plain"
            onClick={onBack}
            className="!min-w-0"
          >
            <span>Back</span>
          </CTAButton>
        ) : <span />}
        {stage < STAGES.length - 1 ? (
          <CTAButton type="button"
            onClick={onContinue} className="js-lead-submit">
            <span>Continue</span>
          </CTAButton>
        ) : (
          <CTAButton
            type="submit"
            className="js-lead-submit"
            onClick={() => {
              submittedByClickRef.current = true
            }}
            disabled={submitState.status === 'submitting'}
          >
            <span>
              {submitState.status === 'submitting'
                ? 'Creating your plan…'
                : isRevision
                  ? 'submit the revised plan'
                  : 'Create my pilot plan'}
            </span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </CTAButton>
        )}
      </div>

      <div className='col-span-full'>
        {stage === 4 && classification.route === 'disqualified' ? (
          <p className="t-p-sm-sans text-white/80" role="note">
            Your answers include items outside the standard pilot scope —{' '}
            {classification.reasons.join('; ')}. We will still review your pilot submission and advise on the best path.
          </p>
        ) :
          // classification.route === 'one-call' ? (
          //   <p className="t-p-sm-sans text-white/80 sm:col-span-2" role="note">
          //     Your answers include items outside the standard scope — the plan
          //     will proceed as a one-call pilot with a single pilot terms review.
          //   </p>
          // ) : 
          null}
      </div>
    </form>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10em_1fr] gap-12">
      <dt className="text-white/60">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}
