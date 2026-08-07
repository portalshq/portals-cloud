'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowDownToLine, ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {LeadSelectField, LeadTextareaField} from '@/components/mui/fields'
import {
  analyticsConsent,
  buildAttribution,
  qualificationBehavior,
  trackEvent,
} from '@/lib/leads/analytics-client'
import {newSubmissionId, publicEmailNeedsWebsite, submitLead} from '@/lib/leads/client'
import {
  DISCLOSURE_VERSION,
  type KnownLeadContext,
  type LeadIdentity,
  type LeadResponse,
} from '@/lib/leads/contracts'
import {ConditionalReveal} from './ConditionalReveal'
import {ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback} from './LeadFields'
import {WorkflowReviewForm} from './WorkflowReviewForm'
import {useFormDraft} from './useFormDraft'
import {usePreservedSwap} from './usePreservedSwap'

const frequencyOptions = ['never', 'quarterly', 'monthly', 'weekly', 'daily'] as const

function AssessmentSelect({
  id,
  name,
  label,
  required,
  options,
  defaultValue = '',
  onValueChange,
}: {
  id: string
  name: string
  label: string
  required: boolean
  options: readonly string[]
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  return (
    <LeadField label={`${label}${required ? ' *' : ''}`} name={name}>
      <LeadSelectField
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
      >
        <option value="" disabled>select one</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('-', ' ')}
          </option>
        ))}
      </LeadSelectField>
    </LeadField>
  )
}

export function AssessmentForm({context}: {context: KnownLeadContext}) {
  const known = useMemo(() => new Set(context.knownAnswerFields), [context.knownAnswerFields])
  const idempotencyKey = useMemo(() => newSubmissionId('assessment'), [])
  const [email, setEmail] = useState('')
  const [recreationFrequency, setRecreationFrequency] = useState<string>(
    () => (context.answerValues?.recreationFrequency as string | undefined) || '',
  )
  const [incidentType, setIncidentType] = useState<string>(
    () => (context.answerValues?.incidentType as string | undefined) || '',
  )
  const [result, setResult] = useState<LeadResponse | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')
  const started = useRef(false)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft('workflow_assessment')

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
    if (restored.recreationFrequency) setRecreationFrequency(restored.recreationFrequency)
    if (restored.incidentType) setIncidentType(restored.incidentType)
  }, [restored.email, restored.recreationFrequency, restored.incidentType])

  useEffect(() => {
    void trackEvent('form_opened', {form_name: 'workflow_assessment'})
  }, [])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: 'workflow_assessment'})
  }

  const incidentEligible =
    context.incidentFollowUpEligible ??
    (recreationFrequency !== '' && recreationFrequency !== 'never')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const behavior = qualificationBehavior()
      const response = await submitLead({
        submissionType: 'assessment',
        idempotencyKey,
        formVersion: 'assessment.v1',
        provider: 'browser',
        identity: Object.fromEntries(
          Object.entries({
            email: String(values.email || ''),
            name: String(values.name || ''),
            company: String(values.company || ''),
            role: String(values.role || ''),
            website: String(values.website || ''),
          }).filter(([, value]) => value),
        ) as LeadIdentity,
        attribution: buildAttribution({
          sourcePage: '/workflow-assessment',
          ctaLabel: 'Assess Your Workflow',
          intent: 'workflow_assessment',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        answers: {
          teamType: String(values.teamType || ''),
          teamSize: String(values.teamSize || ''),
          workflowCollaborators: String(values.workflowCollaborators || ''),
          toolsUsed: String(values.toolsUsed || ''),
          approvedVersionMethod: String(values.approvedVersionMethod || ''),
          productionContextMethod: String(values.productionContextMethod || ''),
          recreationFrequency: String(values.recreationFrequency || ''),
          incidentType: String(values.incidentType || ''),
          incidentDescription: String(values.incidentDescription || ''),
          peopleAffected: String(values.peopleAffected || ''),
          hoursLost: String(values.hoursLost || ''),
          deliveryImpact: String(values.deliveryImpact || ''),
          recurringWorkflow: String(values.recurringWorkflow || ''),
          assetVolume: String(values.assetVolume || ''),
          annualAffectedValue: String(values.annualAffectedValue || ''),
          activeWorkflow: String(values.activeWorkflow || ''),
          pricingOrPilotViewed: behavior.pricingOrPilotViewed,
          securityDiligence: behavior.securityDiligence,
          message: String(values.message || ''),
        },
      })
      reserve()
      clear()
      setResult(response)
      void trackEvent('assessment_completed', {
        qualification_tier: response.qualificationTier || 'unknown',
      })
      setStatus('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'we could not score the assessment')
      setStatus('error')
    }
  }

  if (result) {
    const workflow = result.recommendedWorkflow || 'asset-reproduction'
    return (
      <div
        ref={swapRef}
        role="status"
        className="space-y-28 transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? {minHeight: reservedHeight} : undefined}
      >
        <div className="space-y-14">
          <h2 className="t-d2-sans max-w-[12em]">
            {result.qualificationTier === 'high'
              ? 'strong fit'
              : result.qualificationTier === 'low'
                ? 'not urgent'
                : 'needs review'}
          </h2>
          <p className="max-w-[38em] t-p-lg-serif text-white">{result.message}</p>
        </div>
        {result.scores ? (
          <div className="space-y-20">
            <p className="t-p-lg-serif text-white">
              production-memory risk: <span className="t-h1-sans">{result.scores.assessmentScore}/24</span>
            </p>
            <dl className="grid max-w-[680px] grid-cols-3 gap-20">
              {(['fit', 'pain', 'intent'] as const).map((key) => (
                <div key={key}>
                  <dt className="t-p-sm-sans text-white">{key}</dt>
                  <dd className="mt-8 t-h1-sans text-white">{result.scores?.[key].normalized}%</dd>
                  <dd className="mt-4 t-p-sm-sans text-white">{result.scores?.[key].coverage}% coverage</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {result.downloadUrl ? (
          <CTAButton
            href={result.downloadUrl}
            target="_blank"
            rel="noreferrer"
            analyticsLabel="Download My Assessment"
            analyticsIntent="assessment_result"
          >
            <ArrowDownToLine aria-hidden="true" size={18} />
            download my assessment
          </CTAButton>
        ) : null}
        {result.nextAction === 'pilot_scope' ? (
          <CTAButton href="/paid-pilot#scope" analyticsLabel="Scope a Production Pilot">
            scope a production pilot
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        ) : result.nextAction === 'assessment_review' ? (
          <CTAButton
            type="button"
            onClick={() => setReviewOpen(true)}
            analyticsLabel="Review My Assessment"
            analyticsIntent="workflow_review"
          >
            review my assessment
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        ) : (
          <CTAButton
            href={`/ai-production-workflow-risks#${workflow}`}
            analyticsLabel="Explore the Relevant Workflow"
            analyticsUseCase={workflow}
          >
            explore the relevant workflow
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        )}
        {reviewOpen ? (
          <div className="mt-40 max-w-[680px]">
            <WorkflowReviewForm
              context={{...context, known: true}}
              recommendedWorkflow={result.recommendedWorkflow}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <form
      ref={(element) => {
        swapRef(element)
        draftRef(element)
      }}
      onSubmit={onSubmit}
      onFocus={onStarted}
      className="space-y-20"
    >
      <IdentityFields
        context={context}
        email={email}
        onEmailChange={(event) => setEmail(event.target.value)}
        requireWebsite={publicEmailNeedsWebsite(email)}
        onStarted={onStarted}
      />
      {!known.has('teamType') ? (
        <AssessmentSelect
          id="teamType"
          name="teamType"
          label="team type"
          required
          options={['agency', 'creative-studio', 'production-company', 'in-house-creative', 'brand-marketing', 'film-animation', 'game-entertainment', 'independent-creator', 'other']}
        />
      ) : null}
      {!known.has('teamSize') ? (
        <AssessmentSelect id="teamSize" name="teamSize" label="production team size" required options={['1', '2-4', '5-9', '10-24', '25-plus']} />
      ) : null}
      {!known.has('workflowCollaborators') ? (
        <AssessmentSelect id="workflowCollaborators" name="workflowCollaborators" label="people involved in production" required options={['1', '2-4', '5-9', '10-plus']} />
      ) : null}
      {!known.has('toolsUsed') ? (
        <AssessmentSelect id="toolsUsed" name="toolsUsed" label="ai creative tools used" required options={['1', '2', '3-4', '5-plus']} />
      ) : null}
      {!known.has('approvedVersionMethod') ? (
        <AssessmentSelect id="approvedVersionMethod" name="approvedVersionMethod" label="current approved version method" required options={['canonical-system', 'documented-review', 'folder-naming', 'chat-spreadsheet', 'creator-memory', 'inconsistent']} />
      ) : null}
      {!known.has('productionContextMethod') ? (
        <AssessmentSelect id="productionContextMethod" name="productionContextMethod" label="where generation context is stored" required options={['attached-record', 'project-document', 'multiple-tools', 'chat-personal-notes', 'memory-inconsistent']} />
      ) : null}
      {!known.has('recreationFrequency') ? (
        <AssessmentSelect
          id="recreationFrequency"
          name="recreationFrequency"
          label="frequency of rediscovery recreation"
          required
          options={frequencyOptions}
          defaultValue={recreationFrequency}
          onValueChange={(value) => {
            onStarted()
            setRecreationFrequency(value)
          }}
        />
      ) : null}
      {!known.has('incidentType') ? (
        <AssessmentSelect
          id="incidentType"
          name="incidentType"
          label="most recent incident"
          required
          options={['none', 'version-confusion', 'missing-context', 'failed-reproduction', 'recreated-work', 'other']}
          defaultValue={incidentType}
          onValueChange={(value) => {
            onStarted()
            setIncidentType(value)
          }}
        />
      ) : null}
      {incidentType === 'other' ? (
        <LeadField label="describe the incident *" name="incidentDescription">
          <LeadTextareaField
            id="incidentDescription"
            name="incidentDescription"
            minRows={3}
            resizable={false}
            required
            onChange={onStarted}
          />
        </LeadField>
      ) : null}
      <ConditionalReveal active={incidentEligible}>
        <div className="space-y-20 py-6">
          {!known.has('peopleAffected') ? (
            <AssessmentSelect id="peopleAffected" name="peopleAffected" label="people affected by the last incident" required options={['1', '2-4', '5-9', '10-24', '25-plus']} />
          ) : null}
          {!known.has('hoursLost') ? (
            <AssessmentSelect id="hoursLost" name="hoursLost" label="time lost to the last incident" required options={['none', 'under-1-hour', '1-4-hours', 'one-day', '2-5-days', 'week-plus']} />
          ) : null}
          {!known.has('deliveryImpact') ? (
            <AssessmentSelect id="deliveryImpact" name="deliveryImpact" label="delivery impact of the last incident" required options={['none', 'internal-delay', 'delivery-delayed', 'client-affected', 'revenue-relationship']} />
          ) : null}
        </div>
      </ConditionalReveal>
      {!known.has('recurringWorkflow') ? (
        <AssessmentSelect id="recurringWorkflow" name="recurringWorkflow" label="how often the workflow repeats" required options={['one-off', 'quarterly', 'monthly', 'weekly', 'daily']} />
      ) : null}
      {!known.has('assetVolume') ? (
        <AssessmentSelect id="assetVolume" name="assetVolume" label="assets produced per month" required options={['under-25', '25-99', '100-499', '500-plus']} />
      ) : null}
      {!known.has('annualAffectedValue') ? (
        <AssessmentSelect id="annualAffectedValue" name="annualAffectedValue" label="annual value of the affected work" required={false} options={['under-10k', '10k-49k', '50k-99k', '100k-499k', '500k-plus']} />
      ) : null}
      {!known.has('activeWorkflow') ? (
        <LeadField label="active workflow to test *" name="activeWorkflow">
          <LeadTextareaField id="activeWorkflow" name="activeWorkflow" minRows={4} resizable={false} required />
        </LeadField>
      ) : null}
      <LeadField label="anything else we should know?" name="message">
        <LeadTextareaField id="message" name="message" minRows={4} resizable={false} onChange={onStarted} />
      </LeadField>
      <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
      <NoScriptLeadFallback />
      {status === 'error' ? <p role="alert" className="t-p-sans text-[#ffb4a8]">{error}</p> : null}
      <CTAButton type="submit" className="js-lead-submit" disabled={status === 'submitting'} analyticsLabel="Assess Your Workflow">
        {status === 'submitting' ? 'scoring...' : 'score my workflow'}
      </CTAButton>
    </form>
  )
}
