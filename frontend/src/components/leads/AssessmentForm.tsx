'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight } from 'lucide-react'
import { CTAButton } from '@/components/CTAButton'
import { LeadSelectField, LeadTextareaField } from '@/components/mui/fields'
import {
  analyticsConsent,
  buildAttribution,
  qualificationBehavior,
  trackEvent,
} from '@/lib/leads/analytics-client'
import { newSubmissionId, publicEmailNeedsWebsite, submitLead } from '@/lib/leads/client'
import {
  DISCLOSURE_VERSION,
  type KnownLeadContext,
  type LeadIdentity,
  type LeadResponse,
} from '@/lib/leads/contracts'
import { ConditionalReveal } from './ConditionalReveal'
import { ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback } from './LeadFields'
import { WorkflowReviewForm } from './WorkflowReviewForm'
import { useFormDraft } from './useFormDraft'
import { usePreservedSwap } from './usePreservedSwap'

const frequencyOptions = ['never', 'quarterly', 'monthly', 'weekly', 'daily'] as const

const reasonLabels: Record<string, string> = {
  'strong-workflow-fit': 'Your team and production pattern align with a repository-backed workflow.',
  'repeatable-production': 'The workflow repeats often enough to test in a bounded production pilot.',
  'measurable-rework-risk': 'Your answers show material rediscovery, recreation, or delivery risk.',
  'production-context-fragmented': 'Prompts, references, and generation context are split across people or tools.',
  'approved-version-risk': 'Approved-version control depends on conventions that are difficult to reproduce reliably.',
  'commercial-readiness-needed': 'A few ownership, timing, or approval details are still unknown.',
  'workflow-definition-needed': 'The assessment could not establish a sufficiently specific active workflow.',
  'limited-current-risk': 'The current answers show limited production-memory risk or urgency.',
}

function restoredResult(context: KnownLeadContext): LeadResponse | null {
  if (!context.assessmentCompleted || !context.qualificationOutcome) return null
  return {
    ok: true,
    nextAction:
      context.qualificationOutcome === 'pilot_candidate'
        ? 'pilot_scope'
        : context.qualificationOutcome === 'clarify'
          ? 'commercial_clarification'
          : 'use_case',
    qualificationOutcome: context.qualificationOutcome,
    reasonCodes: context.reasonCodes,
    missingFields: context.missingFields,
    workflowRiskScore: context.scores?.workflowRiskScore,
    recommendedWorkflow: context.recommendedWorkflow,
    downloadUrl: '/api/leads/documents/assessment-result',
    message:
      context.qualificationOutcome === 'pilot_candidate'
        ? 'Your workflow is a viable candidate for a paid production pilot.'
        : context.qualificationOutcome === 'clarify'
          ? 'A few practical details will clarify whether this workflow is ready for a pilot.'
          : 'The relevant production workflow is the most useful place to continue.',
  }
}

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

export function AssessmentForm({ context, preface }: { context: KnownLeadContext; preface?: ReactNode }) {
  const [leadContext, setLeadContext] = useState<KnownLeadContext>(context)
  const known = useMemo(() => new Set(leadContext.knownAnswerFields), [leadContext.knownAnswerFields])
  const idempotencyKey = useMemo(() => newSubmissionId('assessment'), [])
  const [email, setEmail] = useState('')
  const [recreationFrequency, setRecreationFrequency] = useState<string>(
    () => (leadContext.answerValues?.recreationFrequency as string | undefined) || '',
  )
  const [incidentType, setIncidentType] = useState<string>(
    () => (leadContext.answerValues?.incidentType as string | undefined) || '',
  )
  const [result, setResult] = useState<LeadResponse | null>(() => restoredResult(leadContext))
  const [reviewOpen, setReviewOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')
  const started = useRef(false)
  const { ref: swapRef, reservedHeight, reserve } = usePreservedSwap()
  const { ref: draftRef, restored, flush, clear } = useFormDraft('workflow_assessment')

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
    if (restored.recreationFrequency) setRecreationFrequency(restored.recreationFrequency)
    if (restored.incidentType) setIncidentType(restored.incidentType)
  }, [restored.email, restored.recreationFrequency, restored.incidentType])

  useEffect(() => {
    void trackEvent('form_opened', { form_name: 'workflow_assessment' })
  }, [])

  useEffect(() => {
    if (!result) return
    void trackEvent('assessment_result_viewed', {
      qualification_outcome: result.qualificationOutcome || 'unknown',
      workflow_risk_score: result.workflowRiskScore ?? 'unknown',
    })
  }, [result])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', { form_name: 'workflow_assessment' })
  }

  const incidentEligible =
    leadContext.incidentFollowUpEligible ??
    (recreationFrequency !== '' && recreationFrequency !== 'never')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const behavior = qualificationBehavior()
      const submittedIdentity: LeadIdentity = Object.fromEntries(
        Object.entries({
          email: String(values.email || leadContext.identity?.email || leadContext.answerValues?.email || ''),
          name: String(values.name || leadContext.identity?.name || leadContext.answerValues?.name || ''),
          company: String(values.company || leadContext.identity?.company || leadContext.answerValues?.company || ''),
          role: String(values.role || leadContext.identity?.role || leadContext.answerValues?.role || ''),
          website: String(values.website || leadContext.identity?.website || leadContext.answerValues?.website || ''),
        }).filter(([, value]) => value),
      ) as LeadIdentity
      const submittedAnswers = {
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
      }
      const response = await submitLead({
        submissionType: 'assessment',
        idempotencyKey,
        formVersion: 'assessment.v1',
        provider: 'browser',
        identity: submittedIdentity,
        attribution: buildAttribution({
          sourcePage: '/assessment',
          ctaLabel: 'Assess production workflow',
          intent: 'workflow_assessment',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        whatBroughtYouHere: ((values.whatBroughtYouHere || leadContext.answerValues?.whatBroughtYouHere) as 'workflow-problem' | 'assess-scaling' | 'evaluating-tools' | 'other' | undefined),
        whatBroughtYouHereOther: String(values.whatBroughtYouHereOther || leadContext.answerValues?.whatBroughtYouHereOther || ''),
        howDidYouHearAboutPortals: ((values.howDidYouHearAboutPortals || leadContext.answerValues?.howDidYouHearAboutPortals) as 'google-search' | 'linkedin' | 'email' | 'someone-company' | 'friend-colleague' | 'article-newsletter-podcast' | 'partner-company' | 'social-media' | undefined),
        answers: submittedAnswers,
      })
      const newKnownFields = Array.from(
        new Set([
          ...(leadContext.knownFields || []),
          ...(submittedIdentity.email ? ['email' as const] : []),
          ...(submittedIdentity.name ? ['name' as const] : []),
          ...(submittedIdentity.company ? ['company' as const] : []),
          ...(submittedIdentity.role ? ['role' as const] : []),
          ...(submittedIdentity.website ? ['website' as const] : []),
        ]),
      )
      const newIdentity = {
        ...(leadContext.identity || {}),
        ...submittedIdentity,
      }
      const newAnswerValues = {
        ...(leadContext.answerValues || {}),
        ...newIdentity,
        ...Object.fromEntries(
          Object.entries(submittedAnswers).filter(
            ([, v]) => typeof v === 'string' ? v.trim().length > 0 : v != null,
          ),
        ),
      }
      const newKnownAnswerFields = Object.keys(newAnswerValues)
      const updatedContext: KnownLeadContext = {
        known: true,
        knownFields: newKnownFields,
        knownAnswerFields: newKnownAnswerFields,
        identity: newIdentity,
        answerValues: newAnswerValues,
        requiresWebsite:
          Boolean(newIdentity.email) &&
          !newIdentity.website &&
          publicEmailNeedsWebsite(newIdentity.email || ''),
        scores: response.scores || leadContext.scores,
        qualificationTier: response.qualificationTier || leadContext.qualificationTier,
        qualificationOutcome: response.qualificationOutcome || leadContext.qualificationOutcome,
        reasonCodes: response.reasonCodes || leadContext.reasonCodes,
        missingFields: response.missingFields || leadContext.missingFields,
        assessmentCompleted: true,
        recommendedWorkflow: response.recommendedWorkflow || leadContext.recommendedWorkflow,
        incidentFollowUpEligible: submittedAnswers.recreationFrequency !== 'never',
      }
      setLeadContext(updatedContext)
      reserve()
      clear()
      setResult(response)
      setStatus('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'we could not score the assessment')
      setStatus('error')
    }
  }

  if (result) {
    const workflow = result.recommendedWorkflow || 'asset-reproduction'
    const outcome = result.qualificationOutcome ||
      (result.nextAction === 'pilot_scope'
        ? 'pilot_candidate'
        : result.nextAction === 'commercial_clarification' || result.nextAction === 'assessment_review'
          ? 'clarify'
          : 'education')
    const reasons = (result.reasonCodes || []).map((code) => reasonLabels[code]).filter(Boolean)
    return (
      <div
        ref={swapRef}
        role="status"
        className="space-y-28 transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? { minHeight: reservedHeight } : undefined}
      >
        <div className="space-y-14">
          <p className="t-p-sans">we've evaluated your workflow</p>
          <h2 className="t-d2-sans max-w-[12em]">
            {outcome === 'pilot_candidate'
              ? 'pilot candidate'
              : outcome === 'clarify'
                ? 'complete pilot readiness'
                : 'not pilot ready'}
          </h2>
          <p className="max-w-[38em] t-p-sans">{result.message}</p>
        </div>
        {typeof result.workflowRiskScore === 'number' ? (
          <div className="space-y-20">
            <p className="t-p-lg-serif text-white">
              your production memory risk: <span className="t-h1-sans">{result.workflowRiskScore}/24</span>
            </p>
          </div>
        ) : null}
        {reasons.length ? <div className="max-w-[680px] space-y-10">
          <ul className="space-y-8 t-p-sans text-white">
            {reasons.map((reason) => <li key={reason} className="flex items-center gap-12">
              <span className="size-8 shrink-0 bg-white" />
              {reason}</li>)}
          </ul>
        </div> : null}
        {result.missingFields?.length ? <p className="max-w-[680px] t-p-sans">
          Still needed: {result.missingFields.map((field) => field.replaceAll(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}.
        </p> : null}
        <div className="max-w-[720px] space-y-16">
          {result.nextAction === 'pilot_scope' && (
              <p className="t-p-sans">
                Your assessment answers carry over. There is no fee to scope or receive your customized plan. The $5,000 fee applies only if you approve and conduct the pilot.
              </p>
          )}
          <div className="flex items-center gap-16">
            {result.nextAction === 'pilot_scope' ? (
                <CTAButton href="/paid-pilot?from=assessment#scope" analyticsLabel="Build My Customized Pilot Plan" onClick={() => void trackEvent('pilot_handoff_clicked', { workflow })}>
                  Build my customized pilot plan
                  <ArrowRight aria-hidden="true" size={18} />
                </CTAButton>
            ) : result.nextAction === 'commercial_clarification' || result.nextAction === 'assessment_review' ? (
              <CTAButton
                type="button"
                onClick={() => setReviewOpen(true)}
                analyticsLabel="Complete Pilot Readiness"
                analyticsIntent="commercial_readiness"
              >
                Complete pilot readiness
                <ArrowRight aria-hidden="true" size={18} />
              </CTAButton>
            ) : (
              <div>
                <CTAButton
                  href={`/ai-production-workflow-risks#${workflow}`}
                  analyticsLabel="Explore the Relevant Workflow"
                  analyticsUseCase={workflow}
                  onClick={() => void trackEvent('education_use_case_clicked', { workflow })}
                >
                  explore the relevant production use case
                  <ArrowRight aria-hidden="true" size={18} />
                </CTAButton>
                <div className="border-l border-white/50 pl-20">
                  <p className="t-p-lg-serif">
                    Think your workflow could benefit from a production repository and memory system? You’re invited to build a free customized pilot plan.
                  </p>
                  {/* <p className="mt-8 t-p-sans">
                    Building and receiving the plan is free. Because the assessment did not establish fit, completing the scope triggers one qualification call before a pilot can proceed.
                  </p> */}
                  <CTAButton
                    href="/paid-pilot?from=assessment-override#scope"
                    analyticsLabel="Build a Customized Pilot Plan"
                    onClick={() => void trackEvent('assessment_override_started', { workflow })}
                    className="mt-14"
                  >
                    Build a customized pilot plan
                    <ArrowRight aria-hidden="true" size={18} />
                  </CTAButton>
                </div>
              </div>
            )}
            {result.downloadUrl ? (
              <CTAButton href={result.downloadUrl} target="_blank" rel="noreferrer" analyticsLabel="Download My Assessment" analyticsIntent="assessment_result">
                <ArrowDownToLine aria-hidden="true" size={18} />
                Download my evaluation
              </CTAButton>
            ) : null}
          </div>
        </div>
        {reviewOpen ? (
          <div className="mt-40 max-w-[680px]">
            <WorkflowReviewForm
              context={leadContext}
              recommendedWorkflow={result.recommendedWorkflow}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {preface && preface}
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
          context={leadContext}
          email={email}
          onEmailChange={(event) => setEmail(event.target.value)}
          requireWebsite={publicEmailNeedsWebsite(email) || Boolean(leadContext.requiresWebsite)}
          onStarted={onStarted}
        />
        <LeadField label="What brought you here?" name="whatBroughtYouHere">
          <LeadSelectField
            id="whatBroughtYouHere"
            name="whatBroughtYouHere"
            required
            defaultValue={leadContext.answerValues?.whatBroughtYouHere || ''}
          >
            <option value="" disabled>select one</option>
            <option value="workflow-problem">I have a workflow problem I need to solve</option>
            <option value="assess-scaling">I want to assess whether our current process will scale</option>
            <option value="evaluating-tools">I'm evaluating production tools</option>
            <option value="other">Other</option>
          </LeadSelectField>
        </LeadField>
        {leadContext.answerValues?.whatBroughtYouHere === 'other' ? (
          <LeadField label="Please describe" name="whatBroughtYouHereOther">
            <LeadTextareaField
              id="whatBroughtYouHereOther"
              name="whatBroughtYouHereOther"
              defaultValue={leadContext.answerValues?.whatBroughtYouHereOther || ''}
              placeholder="Describe what brought you here"
            />
          </LeadField>
        ) : null}
        <LeadField label="How did you hear about portals?" name="howDidYouHearAboutPortals">
          <LeadSelectField
            id="howDidYouHearAboutPortals"
            name="howDidYouHearAboutPortals"
            required
            defaultValue={leadContext.answerValues?.howDidYouHearAboutPortals || ''}
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
        <ConsentFields onStarted={onStarted} showMarketing={!leadContext.known} />
        <NoScriptLeadFallback />
        {status === 'error' ? <p role="alert" className="t-p-sans text-[#ffb4a8]">{error}</p> : null}
        <CTAButton type="submit" className="js-lead-submit" disabled={status === 'submitting'} analyticsLabel="Assess Your Workflow">
          {status === 'submitting' ? 'Scoring...' : 'Score my workflow'}
        </CTAButton>
      </form>
    </>
  )
}
