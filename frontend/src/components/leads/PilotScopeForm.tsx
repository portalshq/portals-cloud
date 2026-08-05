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
import {ConsentFields, IdentityFields, LeadField, leadInputClasses, NoScriptLeadFallback} from '@/components/leads/LeadFields'
import {ProgressiveAssessmentFields} from '@/components/leads/ProgressiveAssessmentFields'
import {useFormDraft} from '@/components/leads/useFormDraft'
import {usePreservedSwap} from '@/components/leads/usePreservedSwap'
import {analyticsConsent, buildAttribution, trackEvent} from '@/lib/leads/analytics-client'
import {newSubmissionId, submitLead} from '@/lib/leads/client'
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
  {key: 'purchase', label: 'purchase'},
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
}: {
  specSummary: string
  context: KnownLeadContext
  pilotId?: string
  initialAnswers?: Record<string, unknown>
}) {
  const [stage, setStage] = useState(0)
  const [submitState, setSubmitState] = useState<SubmitState>({status: 'idle'})
  const [email, setEmail] = useState('')
  const [liveAnswers, setLiveAnswers] = useState<Record<string, string | boolean>>(
    () => Object.fromEntries(Object.entries(initialAnswers || {})) as Record<string, string | boolean>,
  )
  const [stageError, setStageError] = useState('')
  const submissionId = useMemo(() => newSubmissionId('pilot-request'), [])
  const started = useRef(false)
  const stepNav = useRef<'forward' | 'back' | null>(null)
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

  function pilotAnswersFrom(
    form: HTMLFormElement,
  ): z.infer<typeof pilotRequestAnswersSchema> {
    const data = new FormData(form)
    const string = (name: string) => String(data.get(name) || '')
    const checked = (name: string) => Boolean(data.get(name))
    const choice = <T extends readonly string[]>(
      name: string,
      options: T,
    ): T[number] => {
      const value = string(name)
      return (value || '') as T[number]
    }
    return {
      teamType: string('teamType'),
      teamSize: string('teamSize'),
      workflowCollaborators: string('workflowCollaborators'),
      toolsUsed: string('toolsUsed'),
      approvedVersionMethod: string('approvedVersionMethod'),
      productionContextMethod: string('productionContextMethod'),
      recreationFrequency: string('recreationFrequency'),
      incidentType: string('incidentType'),
      peopleAffected: string('peopleAffected'),
      hoursLost: string('hoursLost'),
      deliveryImpact: string('deliveryImpact'),
      recurringWorkflow: string('recurringWorkflow'),
      assetVolume: string('assetVolume'),
      annualAffectedValue: string('annualAffectedValue'),
      activeWorkflow: string('activeWorkflow'),
      pilotWorkflow: string('pilotWorkflow'),
      productionOwner: string('productionOwner'),
      economicBuyer: string('economicBuyer'),
      technicalEvaluator: string('technicalEvaluator'),
      requiredIntegrations: string('requiredIntegrations'),
      targetStartPeriod: string('targetStartPeriod'),
      successCriteria: string('successCriteria'),
      securityRequirements: string('securityRequirements'),
      annualExpectations: string('annualExpectations'),
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
      procurementVendorSetup: checked('procurementVendorSetup'),
      procurementReviewTime: string('procurementReviewTime'),
      procurementDocuments: string('procurementDocuments'),
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
    if (!stageFieldsValid(4)) return
    setSubmitState({status: 'submitting'})
    flush()

    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const answers = pilotAnswersFrom(form)

    try {
      const result = await submitLead({
        submissionType: 'pilot_request',
        idempotencyKey: submissionId,
        formVersion: isRevision ? 'paid-pilot-revision.v1' : 'paid-pilot.v2',
        provider: 'browser',
        pilotId: pilotId || '',
        identity: Object.fromEntries(
          Object.entries({
            email: String(values.email || ''),
            company: String(values.company || ''),
            role: String(values.role || ''),
            website: String(values.website || ''),
          }).filter(([, value]) => value),
        ) as LeadIdentity,
        attribution: buildAttribution({
          sourcePage: isRevision ? `/pilot/${pilotId}/revise` : '/paid-pilot',
          ctaLabel: isRevision ? 'Submit Revision' : 'Build my pilot plan',
          intent: isRevision ? 'pilot_revision' : 'pilot_scope',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        answers,
      })

      reserve()
      clear()
      setSubmitState({
        status: 'success',
        pilotUrl: result.pilotUrl,
        calendarUrl: result.calendarUrl,
        downloadUrl: result.downloadUrl,
        pilotRoute: result.pilotRoute,
        preview: result.dryRun,
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
      <div role="status" className="max-w-[42em] py-24">
        <Check
          aria-hidden="true"
          className="text-white"
          size={32}
          strokeWidth={1.6}
        />
        <h3 className="mt-24 t-h1-sans">
          {submitState.pilotRoute === 'disqualified'
            ? 'we need a few clarifications.'
            : submitState.pilotRoute === 'one-call'
              ? 'your pilot approval room is ready.'
              : 'your pilot approval room is ready.'}
        </h3>
        <p className="mt-16 t-p-lg-serif text-white">
          {submitState.pilotRoute === 'disqualified'
            ? 'Your request cannot proceed as a standard pilot yet. Review the notes in your room, revise the scope, and resubmit.'
            : submitState.pilotRoute === 'one-call'
              ? 'The plan is assembled and ready for review. A single pilot terms review is required before signing.'
              : 'The plan is assembled — no call required. Review the scope, confirm it as drafted, and sign when ready.'}
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
          {submitState.downloadUrl ? (
            <CTAButton
              href={submitState.downloadUrl}
              target="_blank"
              rel="noreferrer"
              analyticsLabel="Download My Pilot Packet"
              analyticsIntent="pilot_packet_download"
            >
              <ArrowDownToLine aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>download a pdf copy</span>
            </CTAButton>
          ) : null}
        </div>
        {submitState.calendarUrl ? (
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
        ) : null}
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
          <IdentityFields
            context={context}
            email={email}
            onEmailChange={(event) => setEmail(event.target.value)}
            requireWebsite
            onStarted={onStarted}
          />
        </div>
        <div className="sm:col-span-2">
          <LeadField label="which production workflow would the pilot cover? *" name="pilotWorkflow">
            <textarea
              className={`${leadInputClasses} min-h-128 resize-y`}
              id="pilotWorkflow"
              name="pilotWorkflow"
              required
              defaultValue={String(initialAnswers?.pilotWorkflow || '')}
              placeholder="one active workflow with current production behavior, e.g. approved campaign variants for the flagship account"
            />
          </LeadField>
        </div>
        <LeadField label="historical project *" name="historicalProject">
          <select
            className={leadInputClasses}
            id="historicalProject"
            name="historicalProject"
            required
            defaultValue={String(initialAnswers?.historicalProject || '')}
          >
            <option value="" disabled>select one</option>
            <option value="one-completed">one completed project</option>
            <option value="none">none yet</option>
            <option value="more-than-one">more than one project</option>
          </select>
        </LeadField>
        <LeadField label="target start period *" name="targetStartPeriod">
          <select
            className={leadInputClasses}
            id="targetStartPeriod"
            name="targetStartPeriod"
            required
            defaultValue={String(initialAnswers?.targetStartPeriod || '')}
          >
            <option value="" disabled>select one</option>
            <option value="within-30-days">within 30 days</option>
            <option value="within-60-days">within 60 days</option>
            <option value="this-quarter">this quarter</option>
            <option value="later">later</option>
          </select>
        </LeadField>
        <LeadField label="can your organization approve the $5,000 pilot? *" name="approvalPath">
          <select
            className={leadInputClasses}
            id="approvalPath"
            name="approvalPath"
            required
            defaultValue={String(initialAnswers?.approvalPath || '')}
          >
            <option value="" disabled>select one</option>
            <option value="self">I can approve it</option>
            <option value="other">a colleague approves it</option>
            <option value="procurement">procurement review is required</option>
            <option value="not-established">approval path is not established</option>
            <option value="no">it cannot be approved</option>
          </select>
        </LeadField>
        <LeadField label="how should your production data be classified? *" name="dataClassification">
          <select
            className={leadInputClasses}
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
          </select>
        </LeadField>
        <label className="flex items-start gap-10 t-p-sm-sans text-white sm:col-span-2">
          <input
            className="mt-3 size-16 accent-[#5bc4ba]"
            type="checkbox"
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
            <input
              className={leadInputClasses}
              id="productionOwner"
              name="productionOwner"
              required
              defaultValue={String(initialAnswers?.productionOwner || '')}
              placeholder="name and title"
            />
          </LeadField>
        ) : null}
        <LeadField label="pilot participants *" name="participantsRange">
          <select
            className={leadInputClasses}
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
          </select>
        </LeadField>
        <LeadField label="import or integration method *" name="integrationMethod">
          <select
            className={leadInputClasses}
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
          </select>
        </LeadField>
        <div className="sm:col-span-2">
          <LeadField label="required integrations or export paths *" name="requiredIntegrations">
            <textarea
              className={`${leadInputClasses} min-h-96 resize-y`}
              id="requiredIntegrations"
              name="requiredIntegrations"
              required
              defaultValue={String(initialAnswers?.requiredIntegrations || '')}
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
                <input
                  className="mt-3 size-16 accent-[#5bc4ba]"
                  type="checkbox"
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
            <textarea
              className={`${leadInputClasses} min-h-112 resize-y`}
              id="successCriteria"
              name="successCriteria"
              required
              defaultValue={String(initialAnswers?.successCriteria || '')}
              placeholder="e.g. an approved asset is retrievable in under one minute; a variant can be reproduced or meaningfully extended from its stored context"
            />
          </LeadField>
        </div>
      </div>

      <div data-pilot-stage={3} hidden={stage !== 3} onChange={refreshLive} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">who is likely to review or approve this pilot? you can confirm and invite them after your pilot plan is generated.</p>
        </div>
        {missing('economicBuyer') ? (
          <LeadField label="economic buyer *" name="economicBuyer">
            <input className={leadInputClasses} id="economicBuyer" name="economicBuyer" required defaultValue={String(initialAnswers?.economicBuyer || '')} placeholder="name and title" />
          </LeadField>
        ) : null}
        {missing('technicalEvaluator') ? (
          <LeadField label="technical evaluator *" name="technicalEvaluator">
            <input className={leadInputClasses} id="technicalEvaluator" name="technicalEvaluator" required defaultValue={String(initialAnswers?.technicalEvaluator || '')} placeholder="name and title" />
          </LeadField>
        ) : null}
        {missing('budgetOwner') ? (
          <LeadField label="budget-owning function *" name="budgetOwner">
            <select className={leadInputClasses} id="budgetOwner" name="budgetOwner" required defaultValue={String(initialAnswers?.budgetOwner || '')}>
              <option value="" disabled>select one</option>
              <option value="executive">executive leadership</option>
              <option value="creative">creative leadership</option>
              <option value="production">production or operations</option>
              <option value="technology">technology</option>
              <option value="procurement">procurement</option>
              <option value="unknown">not yet known</option>
            </select>
          </LeadField>
        ) : null}
        {missing('budgetReadiness') ? (
          <LeadField label="budget readiness *" name="budgetReadiness">
            <select
              className={leadInputClasses}
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
            </select>
          </LeadField>
        ) : null}
        <LeadField label="annual deployment you are evaluating *" name="annualDeploymentOption">
          <select
            className={leadInputClasses}
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
          </select>
        </LeadField>
        {missing('annualExpectations') ? (
          <div className="sm:col-span-2">
            <LeadField label="expected annual deployment scope *" name="annualExpectations">
              <textarea
                className={`${leadInputClasses} min-h-96 resize-y`}
                id="annualExpectations"
                name="annualExpectations"
                required
                maxLength={1600}
                defaultValue={String(initialAnswers?.annualExpectations || '')}
                placeholder="what the annual deployment should cover — production teams, repositories, expected users and monthly volume, and any operating or security needs"
              />
            </LeadField>
          </div>
        ) : null}
        <label className="flex items-start gap-10 t-p-sm-sans text-white sm:col-span-2">
          <input
            className="mt-3 size-16 accent-[#5bc4ba]"
            type="checkbox"
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
              <input className={leadInputClasses} id="approverName" name="approverName" required defaultValue={String(initialAnswers?.approverName || '')} />
            </LeadField>
            <LeadField label="approver email *" name="approverEmail">
              <input className={leadInputClasses} id="approverEmail" name="approverEmail" type="email" required defaultValue={String(initialAnswers?.approverEmail || '')} />
            </LeadField>
          </div>
        ) : null}
        {liveAnswers.approvalPath === 'procurement' ? (
          <div className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
            <label className="flex items-start gap-10 t-p-sm-sans text-white">
              <input className="mt-3 size-16 accent-[#5bc4ba]" type="checkbox" name="procurementPoRequired" defaultChecked={Boolean(initialAnswers?.procurementPoRequired)} />
              <span>purchase order required</span>
            </label>
            <label className="flex items-start gap-10 t-p-sm-sans text-white">
              <input className="mt-3 size-16 accent-[#5bc4ba]" type="checkbox" name="procurementVendorSetup" defaultChecked={Boolean(initialAnswers?.procurementVendorSetup)} />
              <span>vendor setup required</span>
            </label>
            <LeadField label="expected review time" name="procurementReviewTime">
              <input className={leadInputClasses} id="procurementReviewTime" name="procurementReviewTime" defaultValue={String(initialAnswers?.procurementReviewTime || '')} placeholder="e.g. 2-3 weeks" />
            </LeadField>
            <LeadField label="required procurement documents" name="procurementDocuments">
              <input className={leadInputClasses} id="procurementDocuments" name="procurementDocuments" defaultValue={String(initialAnswers?.procurementDocuments || '')} placeholder="e.g. W-9, insurance certificate" />
            </LeadField>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <LeadField label="security requirements *" name="securityRequirements">
            <textarea
              className={`${leadInputClasses} min-h-96 resize-y`}
              id="securityRequirements"
              name="securityRequirements"
              required
              defaultValue={String(initialAnswers?.securityRequirements || '')}
              placeholder="e.g. SSO/SAML, SOC 2 report, data residency, dedicated infrastructure"
            />
          </LeadField>
        </div>
        <LeadField label="authorized signer *" name="signerName">
          <input className={leadInputClasses} id="signerName" name="signerName" required defaultValue={String(initialAnswers?.signerName || '')} placeholder="full legal name" />
        </LeadField>
            <LeadField label="signer email *" name="signerEmail">
              <input className={leadInputClasses} id="signerEmail" name="signerEmail" type="email" required defaultValue={String(initialAnswers?.signerEmail || '')} placeholder="name@company.com" />
            </LeadField>
            <div className="sm:col-span-2">
              <LeadField label="anything that would block the pilot, optional" name="pilotBlocker">
                <textarea
                  className={`${leadInputClasses} min-h-64 resize-y`}
                  id="pilotBlocker"
                  name="pilotBlocker"
                  defaultValue={String(initialAnswers?.pilotBlocker || '')}
                />
              </LeadField>
            </div>
      </div>

      <div data-pilot-stage={4} hidden={stage !== 4} className="grid gap-20 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="t-p-sm-sans text-white/70">review the summary before submitting.</p>
        </div>
        <dl className="sm:col-span-2 grid gap-12 rounded-sm bg-white/8 px-14 py-16 t-p-sm-sans text-white">
          <SummaryRow label="workflow" value={String(valuesFrom(0).pilotWorkflow || '—')} />
          <SummaryRow label="start period" value={String(valuesFrom(0).targetStartPeriod || '—').replaceAll('-', ' ')} />
          <SummaryRow label="participants" value={String(valuesFrom(1).participantsRange || '—')} />
          <SummaryRow label="integration" value={optionLists.integrationMethodLabel[String(valuesFrom(1).integrationMethod) as keyof typeof optionLists.integrationMethodLabel] || '—'} />
          <SummaryRow label="data classification" value={optionLists.dataClassificationLabel[String(valuesFrom(0).dataClassification) as keyof typeof optionLists.dataClassificationLabel] || '—'} />
          <SummaryRow label="approval path" value={String(valuesFrom(0).approvalPath || '—').replaceAll('-', ' ')} />
          <SummaryRow label="production owner" value={String(valuesFrom(0).productionOwner || '—')} />
          <SummaryRow label="economic buyer" value={String(valuesFrom(3).economicBuyer || '—')} />
          <SummaryRow label="technical evaluator" value={String(valuesFrom(3).technicalEvaluator || '—')} />
          {String(valuesFrom(3).approverName || '') ? <SummaryRow label="approver" value={String(valuesFrom(3).approverName)} /> : null}
          <SummaryRow label="annual option" value={String(valuesFrom(3).annualDeploymentOption || '—').replaceAll('-', ' ')} />
          <SummaryRow label="annual deployment scope" value={String(valuesFrom(3).annualExpectations || '—')} />
          <SummaryRow label="budget readiness" value={String(valuesFrom(3).budgetReadiness || '—').replaceAll('-', ' ')} />
          <SummaryRow label="security requirements" value={String(valuesFrom(3).securityRequirements || '—')} />
          <SummaryRow label="authorized signer" value={String(liveAnswers.signerName || '—')} />
          <SummaryRow label="signer email" value={String(liveAnswers.signerEmail || '—')} />
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

      <div className='col-span-full'>
        {classification.route === 'disqualified' ? (
          <p className="t-p-sm-sans text-white/80 sm:col-span-2" role="note">
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
