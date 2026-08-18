'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import type {FormEvent} from 'react'
import {z} from 'zod'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {LeadCheckbox, LeadSelectField, LeadTextField, LeadTextareaField} from '@/components/mui/fields'
import {ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback} from '@/components/leads/LeadFields'
import {ProgressiveAssessmentFields} from '@/components/leads/ProgressiveAssessmentFields'
import {useFormDraft} from '@/components/leads/useFormDraft'
import {usePreservedSwap} from '@/components/leads/usePreservedSwap'
import {
  clearPilotConfirmation,
  readPilotConfirmation,
  writePilotConfirmation,
} from '@/lib/leads/pilot-confirmation'
import {analyticsConsent, buildAttribution, trackEvent} from '@/lib/leads/analytics-client'
import {newSubmissionId, publicEmailNeedsWebsite, submitLead} from '@/lib/leads/client'
import {
  DISCLOSURE_VERSION,
  pilotControlledOptionLists as optionLists,
  pilotRequestAnswersSchema,
  type KnownLeadContext,
  type LeadIdentity,
  type PilotAnswers,
} from '@/lib/leads/contracts'
import {classifyPilot} from '@/lib/leads/pilot'

const STAGES = [
  {key: 'eligibility', label: 'eligibility'},
  {key: 'scope', label: 'scope'},
  {key: 'success', label: 'success'},
  {key: 'purchase', label: 'approval'},
  {key: 'confirmation', label: 'confirmation'},
] as const

type SubmitState =
  | {status: 'idle'}
  | {status: 'submitting'}
  | {
      status: 'success'
      pilotUrl?: string
      calendarUrl?: string
      downloadUrl?: string
      pilotRoute?: string
      preview?: boolean
    }
  | {status: 'error'; message: string}

const SUCCESS_CRITERIA_OPTIONS = [
  {key: 'approved-retrieval', label: 'Approved asset retrieval'},
  {key: 'production-context', label: 'Production-context recovery'},
  {key: 'reproduction', label: 'Reproduction'},
  {key: 'meaningful-extension', label: 'Meaningful extension'},
  {key: 'knowledge-transfer', label: 'Knowledge transfer'},
  {key: 'variant-lineage', label: 'Variant-lineage control'},
  {key: 'continuity', label: 'Continuity preservation'},
  {key: 'other', label: 'Other (describe in the target outcome)'},
]

export function PilotScopeForm({
  specSummary,
  context,
  pilotId,
  initialAnswers,
  assessmentOrigin = 'standard',
}: {
  specSummary: string
  context: KnownLeadContext
  pilotId?: string
  initialAnswers?: Record<string, unknown>
  assessmentOrigin?: 'standard' | 'assessment_override'
}) {
  const carriedAnswers = {
    ...(context.answerValues || {}),
    ...(initialAnswers || {}),
  }
  const [stage, setStage] = useState(0)
  const [submitState, setSubmitState] = useState<SubmitState>({status: 'idle'})
  const [email, setEmail] = useState('')
  const [liveAnswers, setLiveAnswers] = useState<Record<string, string | boolean>>(
    () => Object.fromEntries(Object.entries(carriedAnswers)) as Record<string, string | boolean>,
  )
  const [stageError, setStageError] = useState('')
  const [submissionId, setSubmissionId] = useState(() =>
    newSubmissionId('pilot-request'),
  )
  const started = useRef(false)
  const stepNav = useRef<'forward' | 'back' | null>(null)
  const submittedByClickRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft('pilot_request')
  const knownAnswers = new Set(context.knownAnswerFields)
  const missing = (field: string) => !knownAnswers.has(field)
  const isRevision = Boolean(pilotId)
  const classification = useMemo(
    () => classifyPilot(liveAnswers as PilotAnswers),
    [liveAnswers],
  )

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
  }, [restored.email])

  useEffect(() => {
    if (pilotId) return
    const stored = readPilotConfirmation()
    if (!stored) return
    setSubmitState({
      status: 'success',
      pilotUrl: stored.pilotUrl,
      calendarUrl: stored.calendarUrl,
      downloadUrl: stored.downloadUrl,
      pilotRoute: stored.pilotRoute,
      preview: stored.preview,
    })
  }, [pilotId])

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
  }, [stage])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: 'pilot_request'})
  }

  function collectValues(): Record<string, string | boolean> {
    const form = formRef.current
    if (!form) return {}
    const data = new FormData(form)
    const values: Record<string, string | boolean> = {}
    for (const [name, value] of data.entries()) {
      values[name] = String(value)
    }
    for (const [name] of data.entries()) {
      const input = form.querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
      )
      if (input?.type === 'checkbox' && !input.checked && !values[name]) {
        values[name] = false
      }
    }
    return values
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
        'complete the highlighted fields before continuing',
      )
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
    if (stage === 3 && !valuesFrom(stage).annualPriceAcknowledged) {
      setStageError('acknowledge the proposed annual price to continue')
      return
    }
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
        if ('checked' in input && input.name) {
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
    clearPilotConfirmation()
    clear()
    setSubmissionId(newSubmissionId('pilot-request'))
    formRef.current?.reset()
    setLiveAnswers({})
    setEmail('')
    setStageError('')
    setStage(0)
    setSubmitState({status: 'idle'})
  }

  function pilotAnswersFrom(
    form: HTMLFormElement,
  ): z.infer<typeof pilotRequestAnswersSchema> {
    const data = new FormData(form)
    const string = (name: string) => {
      const formVal = String(data.get(name) || '').trim()
      if (formVal) return formVal
      const carriedVal = carriedAnswers[name]
      if (typeof carriedVal === 'string' && carriedVal.trim()) return carriedVal.trim()
      if (typeof carriedVal === 'number') return String(carriedVal)
      return ''
    }
    const checked = (name: string) => {
      if (data.has(name)) return Boolean(data.get(name))
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
      pilotWorkflow: string('pilotWorkflow') || string('activeWorkflow'),
      productionOwner: string('productionOwner'),
      productionOwnerEmail: string('productionOwnerEmail'),
      economicBuyer: string('economicBuyer'),
      economicBuyerEmail: string('economicBuyerEmail'),
      technicalEvaluator: string('technicalEvaluator'),
      technicalEvaluatorEmail: string('technicalEvaluatorEmail'),
      requiredIntegrations: string('requiredIntegrations'),
      targetStartPeriod: string('targetStartPeriod'),
      successCriteria: string('successCriteria'),
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
      successCriterionKeysJson: JSON.stringify(
        data.getAll('successCriterionKeysJson'),
      ),
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
      exactReproductionRequired: checked('exactReproductionRequired'),
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
    if (!stageFieldsValid(4)) return
    setSubmitState({status: 'submitting'})
    flush()

    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const answers = pilotAnswersFrom(form)

    const whatBroughtYouHere = (values.whatBroughtYouHere || context.answerValues?.whatBroughtYouHere) as 'workflow-problem' | 'assess-scaling' | 'evaluating-tools' | 'other' | undefined
    const whatBroughtYouHereOther = String(values.whatBroughtYouHereOther || context.answerValues?.whatBroughtYouHereOther || '')
    const howDidYouHearAboutPortals = (values.howDidYouHearAboutPortals || context.answerValues?.howDidYouHearAboutPortals) as 'google-search' | 'linkedin' | 'email' | 'someone-company' | 'friend-colleague' | 'article-newsletter-podcast' | 'partner-company' | 'social-media' | undefined

    try {
      const result = await submitLead({
        submissionType: 'pilot_request',
        idempotencyKey: submissionId,
        formVersion: isRevision ? 'paid-pilot-revision.v1' : 'paid-pilot.v2',
        provider: 'browser',
        pilotId: pilotId || '',
        identity: Object.fromEntries(
          Object.entries({
            email: String(values.email || context.identity?.email || carriedAnswers.email || ''),
            name: String(values.name || context.identity?.name || carriedAnswers.name || ''),
            company: String(values.company || context.identity?.company || carriedAnswers.company || ''),
            role: String(values.role || context.identity?.role || carriedAnswers.role || ''),
            website: String(values.website || context.identity?.website || carriedAnswers.website || ''),
          }).filter(([, value]) => value),
        ) as LeadIdentity,
        attribution: buildAttribution({
          sourcePage: isRevision ? `/paid-pilot/room/${pilotId}/revise` : '/paid-pilot',
          ctaLabel: isRevision ? 'Submit Revision' : 'Build my pilot plan',
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
        })
      }
      setSubmitState({
        status: 'success',
        pilotUrl: result.pilotUrl,
        calendarUrl: result.calendarUrl,
        downloadUrl: result.downloadUrl,
        pilotRoute: result.pilotRoute,
        preview: result.dryRun,
      })
      void trackEvent('pilot_requested', {
        assessment_origin: assessmentOrigin,
        pilot_route: result.pilotRoute || 'unknown',
      })
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
          review pilot terms, share, revise, and confirm.
        </p>
        {submitState.preview ? (
          <p className="mt-14 t-p-sans text-white">
            local preview mode was used, so no external systems were
            contacted.
          </p>
        ) : null}
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
        {!isRevision ? (
          <div className="mt-24">
            <CTAButton
              type="button"
              appearance="plain"
              className="!min-w-0 underline underline-offset-4"
              onClick={startNewPilotForm}
              analyticsLabel="Submit a New Pilot Form"
              analyticsIntent="pilot_scope"
            >
              <span>submit a new pilot form</span>
            </CTAButton>
          </div>
        ) : null}
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
      onSubmit={handleSubmit}
    >
      {!isRevision && Object.keys(carriedAnswers).length > 0 ? (
        <div className="sm:col-span-2 rounded-sm border border-white/25 px-16 py-14">
          <p className="t-p-sm-sans text-white/70">carried forward from your assessment</p>
          <p className="mt-8 t-p-sans text-white">
            Available workflow, timing, owner, approval, security, integration, and objection details are prefilled. Five short stages remain; fields already completed are omitted where possible.
          </p>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <ol className="flex flex-wrap items-center gap-x-16 gap-y-8 t-p-sm-sans text-white">
          {STAGES.map((item, index) => (
            <li
              key={item.key}
              className={`flex items-center gap-8 ${
                index === stage
                  ? 'text-white'
                  : index < stage
                    ? 'text-white/60'
                    : 'text-white/35'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-20 items-center justify-center rounded-full border text-[11px] ${
                  index < stage
                    ? 'border-[#9cdeee] bg-[#9cdeee]/20'
                    : index === stage
                      ? 'border-[#9cdeee]'
                      : 'border-white/30'
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
          <LeadField label="What brought you here?" name="whatBroughtYouHere">
            <LeadSelectField
              id="whatBroughtYouHere"
              name="whatBroughtYouHere"
              required
              defaultValue={String(initialAnswers?.whatBroughtYouHere || '')}
            >
              <option value="" disabled>select one</option>
              <option value="workflow-problem">I have a workflow problem I need to solve</option>
              <option value="assess-scaling">I want to assess whether our current process will scale</option>
              <option value="evaluating-tools">I'm evaluating production tools</option>
              <option value="other">Other</option>
            </LeadSelectField>
          </LeadField>
        </div>
        {initialAnswers?.whatBroughtYouHere === 'other' ? (
          <div className="sm:col-span-2">
            <LeadField label="Please describe" name="whatBroughtYouHereOther">
              <LeadTextareaField
                id="whatBroughtYouHereOther"
                name="whatBroughtYouHereOther"
                defaultValue={String(initialAnswers?.whatBroughtYouHereOther || '')}
                placeholder="Describe what brought you here"
              />
            </LeadField>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <LeadField label="How did you hear about portals?" name="howDidYouHearAboutPortals">
            <LeadSelectField
              id="howDidYouHearAboutPortals"
              name="howDidYouHearAboutPortals"
              required
              defaultValue={String(initialAnswers?.howDidYouHearAboutPortals || '')}
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
        <div className="sm:col-span-2">
          <IdentityFields
            context={context}
            email={email}
            onEmailChange={(event) => setEmail(event.target.value)}
            requireWebsite={publicEmailNeedsWebsite(email) || Boolean(context.requiresWebsite)}
            onStarted={onStarted}
          />
        </div>
        <div className="sm:col-span-2">
          <LeadField label="which production workflow would the pilot cover? *" name="pilotWorkflow">
            <LeadTextareaField
              id="pilotWorkflow"
              name="pilotWorkflow"
              required
              minRows={6}
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
        <LeadField label="target start period *" name="targetStartPeriod">
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
            <option value="later">later</option>
          </LeadSelectField>
        </LeadField>
        <LeadField label="can your organization approve the $5,000 pilot? *" name="approvalPath">
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
        <label className="flex items-start gap-10 t-p-sm-sans text-white sm:col-span-2">
          <LeadCheckbox
            name="exactReproductionRequired"
            defaultChecked={Boolean(initialAnswers?.exactReproductionRequired)}
          />
          <span>
            Do you require exact reproductions in your workflows? 
            <br/>
            (guaranteed reproduction is outside the standard pilot and requires a review)
          </span>
        </label>
      </div>

      <div data-pilot-stage={1} hidden={stage !== 1} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">who is involved and what does the work touch?</p>
        </div>
        {missing('productionOwner') ? (
          <LeadField label="production-team owner *" name="productionOwner">
            <LeadTextField
              id="productionOwner"
              name="productionOwner"
              required
              defaultValue={String(carriedAnswers.productionOwner || '')}
              placeholder="name and title"
            />
          </LeadField>
        ) : null}
        {missing('productionOwnerEmail') ? (
          <LeadField label="production-team owner email *" name="productionOwnerEmail">
            <LeadTextField
              id="productionOwnerEmail"
              name="productionOwnerEmail"
              required
              type="email"
              defaultValue={String(carriedAnswers.productionOwnerEmail || '')}
              placeholder="email"
            />
          </LeadField>
        ) : null}
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
              minRows={4}
              defaultValue={String(carriedAnswers.requiredIntegrations || '')}
              placeholder="systems, what is imported, what is exported"
            />
          </LeadField>
        </div>
        <div className="sm:col-span-2">
          <ProgressiveAssessmentFields
            context={context}
            onStarted={onStarted}
            draft={{...restored, ...(initialAnswers || {})} as Record<string, string>}
          />
        </div>
      </div>

      <div data-pilot-stage={2} hidden={stage !== 2} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">what would make the pilot commercially meaningful?</p>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="t-p-sm-sans text-white">success criteria *</legend>
          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            {SUCCESS_CRITERIA_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex items-start gap-10 t-p-sm-sans text-white"
              >
                <LeadCheckbox
                  name="successCriterionKeysJson"
                  value={option.key}
                  defaultChecked={
                    !initialAnswers?.successCriterionKeysJson ||
                    String(initialAnswers.successCriterionKeysJson).includes(option.key)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <LeadField label="measurable targets for the criteria above *" name="successCriteria">
            <LeadTextareaField
              id="successCriteria"
              name="successCriteria"
              required
              minRows={5}
              defaultValue={String(initialAnswers?.successCriteria || '')}
              placeholder="e.g. an approved asset is retrievable in under one minute; a variant can be reproduced or meaningfully extended from its stored context"
            />
          </LeadField>
        </div>
        <div className="sm:col-span-2">
          <LeadField label="security requirements *" name="securityRequirements">
            <LeadTextareaField
              id="securityRequirements"
              name="securityRequirements"
              required
              minRows={4}
              defaultValue={String(carriedAnswers.securityRequirements || '')}
              placeholder="e.g. SSO/SAML, SOC 2 report, data residency, dedicated infrastructure"
            />
          </LeadField>
        </div>
      </div>

      <div data-pilot-stage={3} hidden={stage !== 3} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">who is likely to review or approve this pilot? you can confirm and invite them for review after your pilot plan is generated.</p>
        </div>
        {missing('economicBuyer') ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <LeadField label="economic buyer *" name="economicBuyer">
              <LeadTextField id="economicBuyer" name="economicBuyer" required defaultValue={String(initialAnswers?.economicBuyer || '')} placeholder="name and title" />
            </LeadField>
            <LeadField label="economic buyer email *" name="economicBuyerEmail">
              <LeadTextField id="economicBuyerEmail" name="economicBuyerEmail" type="email" required defaultValue={String(initialAnswers?.economicBuyerEmail || '')} placeholder="name@company.com" />
            </LeadField>
          </div>
        ) : null}
        {missing('technicalEvaluator') ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <LeadField label="technical evaluator *" name="technicalEvaluator">
              <LeadTextField id="technicalEvaluator" name="technicalEvaluator" required defaultValue={String(initialAnswers?.technicalEvaluator || '')} placeholder="name and title" />
            </LeadField>
            <LeadField label="technical evaluator email *" name="technicalEvaluatorEmail">
              <LeadTextField id="technicalEvaluatorEmail" name="technicalEvaluatorEmail" type="email" required defaultValue={String(initialAnswers?.technicalEvaluatorEmail || '')} placeholder="name@company.com" />
            </LeadField>
          </div>
        ) : null}
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
            <option value="production-team">team - $9,000 annually</option>
            <option value="studio">studio - $30,000 annually</option>
            <option value="enterprise">enterprise</option>
            <option value="not-known">not yet known</option>
          </LeadSelectField>
        </LeadField>
        <label className="flex items-start gap-10 t-p-sm-sans text-white sm:col-span-2">
          <LeadCheckbox
            name="annualPriceAcknowledged"
            defaultChecked={Boolean(initialAnswers?.annualPriceAcknowledged)}
          />
          <span>
            {valuesFrom(3).annualDeploymentOption === 'production-team' ? 
            `I acknowledge the deployment is selected annual package at the displayed annual price, including
            the $2,500 onboarding fee.`: 
            `I acknowledge that the proposed post-pilot deployment is the
            selected annual package at the displayed annual price, and that
            the $5,000 pilot fee is credited if the annual order form is
            signed by the decision deadline.`}
          </span>
        </label>
        {liveAnswers.approvalPath === 'other' || liveAnswers.approvalPath === 'procurement' ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <LeadField label="approver name *" name="approverName">
              <LeadTextField id="approverName" name="approverName" required defaultValue={String(initialAnswers?.approverName || '')} />
            </LeadField>
            <LeadField label="approver email *" name="approverEmail">
              <LeadTextField id="approverEmail" name="approverEmail" type="email" required defaultValue={String(initialAnswers?.approverEmail || '')} />
            </LeadField>
          </div>
        ) : null}
        {liveAnswers.approvalPath === 'procurement' ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <label className="flex items-start gap-10 t-p-sm-sans text-white">
              <LeadCheckbox name="procurementPoRequired" defaultChecked={Boolean(initialAnswers?.procurementPoRequired)} />
              <span>purchase order required</span>
            </label>
            <LeadField label="expected review time" name="procurementReviewTime">
              <LeadTextField id="procurementReviewTime" name="procurementReviewTime" defaultValue={String(initialAnswers?.procurementReviewTime || '')} placeholder="e.g. 2-3 weeks" />
            </LeadField>
          </div>
        ) : null}
        <LeadField label="authorized signer *" name="signerName">
          <LeadTextField id="signerName" name="signerName" required defaultValue={String(initialAnswers?.signerName || '')} placeholder="full legal name" />
        </LeadField>
        <LeadField label="signer email *" name="signerEmail">
          <LeadTextField id="signerEmail" name="signerEmail" type="email" required defaultValue={String(initialAnswers?.signerEmail || '')} placeholder="name@company.com" />
        </LeadField>
        <div className="sm:col-span-2">
          <LeadField label="anything that would block the pilot, optional" name="pilotBlocker">
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
        <dl className="sm:col-span-2 grid gap-12 rounded-sm bg-white/8 px-14 py-16 t-p-sm-sans text-white">
          <SummaryRow label="workflow" value={summaryAnswer('pilotWorkflow') || '—'} />
          <SummaryRow label="start period" value={summaryAnswer('targetStartPeriod').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="participants" value={summaryAnswer('participantsRange') || '—'} />
          <SummaryRow label="integration" value={optionLists.integrationMethodLabel[summaryAnswer('integrationMethod') as keyof typeof optionLists.integrationMethodLabel] || '—'} />
          <SummaryRow label="data classification" value={optionLists.dataClassificationLabel[summaryAnswer('dataClassification') as keyof typeof optionLists.dataClassificationLabel] || '—'} />
          <SummaryRow label="approval path" value={summaryAnswer('approvalPath').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="production owner" value={[summaryAnswer('productionOwner'), summaryAnswer('productionOwnerEmail')].filter(Boolean).join(' · ') || '—'} />
          <SummaryRow label="economic buyer" value={[summaryAnswer('economicBuyer'), summaryAnswer('economicBuyerEmail')].filter(Boolean).join(' · ') || '—'} />
          <SummaryRow label="technical evaluator" value={[summaryAnswer('technicalEvaluator'), summaryAnswer('technicalEvaluatorEmail')].filter(Boolean).join(' · ') || '—'} />
          {summaryAnswer('approverName') ? <SummaryRow label="approver" value={[summaryAnswer('approverName'), summaryAnswer('approverEmail')].filter(Boolean).join(' · ')} /> : null}
          <SummaryRow label="annual option" value={summaryAnswer('annualDeploymentOption').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="budget-owning function" value={summaryAnswer('budgetOwner').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="budget readiness" value={summaryAnswer('budgetReadiness').replaceAll('-', ' ') || '—'} />
          <SummaryRow label="security requirements" value={summaryAnswer('securityRequirements') || '—'} />
          <SummaryRow label="authorized signer" value={summaryAnswer('signerName') || '—'} />
          <SummaryRow label="signer email" value={summaryAnswer('signerEmail') || '—'} />
        </dl>
        {classification.route === 'one-call' ? (
          <p className="t-p-sm-sans text-white/80 sm:col-span-2" role="note">
            This plan will require a single pilot terms review before signing.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
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
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-16 sm:col-span-2">
        {stage > 0 ? (
          <CTAButton
            type="button"
            onClick={onBack}
            className="!min-w-0"
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>back</span>
          </CTAButton>
        ) : <span />}
        {stage < STAGES.length - 1 ? (
          <CTAButton type="button" onClick={onContinue} className="js-lead-submit">
            <span>continue</span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
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
                ? 'submitting'
                : isRevision
                  ? 'submit the revised plan'
                  : 'Build my pilot plan'}
            </span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </CTAButton>
        )}
      </div>

      <div className='col-span-full relative h-40 mb-20'>
        {classification.route === 'disqualified' ? (
          <p className="t-p-sm-sans text-white/80 sm:col-span-2 absolute" role="note">
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

function SummaryRow({label, value}: {label: string; value: string}) {
  return (
    <div className="grid grid-cols-[10em_1fr] gap-12">
      <dt className="text-white/60">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}
