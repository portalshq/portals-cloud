'use client'

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ArrowDownToLine, ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {
  analyticsConsent,
  buildAttribution,
  qualificationBehavior,
  trackEvent,
} from '@/lib/leads/analytics-client'
import type {KnownLeadContext, LeadRequest, LeadResponse} from '@/lib/leads/contracts'
import {submitLead} from '@/lib/leads/client'
import {tallyLeadRequest} from '@/lib/leads/tally'
import {WorkflowReviewForm} from './WorkflowReviewForm'
import {usePreservedSwap} from './usePreservedSwap'

type TallyMessage = {event?: string; payload?: Record<string, unknown>}

function Result({
  result,
  onVerify,
  onReview,
  verifying,
}: {
  result: LeadResponse
  onVerify: () => void
  onReview: () => void
  verifying: boolean
}) {
  const workflow = result.recommendedWorkflow || 'asset-reproduction'
  return (
    <div className="space-y-28" role="status">
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
        <dl className="grid max-w-[680px] grid-cols-3 gap-20">
          {(['fit', 'pain', 'intent'] as const).map((key) => (
            <div key={key}>
              <dt className="t-p-sm-sans text-white">{key}</dt>
              <dd className="mt-8 t-h1-sans text-white">{result.scores?.[key].normalized}%</dd>
              <dd className="mt-4 t-p-sm-sans text-white">{result.scores?.[key].coverage}% coverage</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.provisional ? (
        <div className="space-y-12">
          <p className="max-w-[38em] t-p-sans text-white">
            your score is provisional until tally verifies the submission. verify it before creating the private result document.
          </p>
          <CTAButton
            type="button"
            disabled={verifying}
            onClick={onVerify}
            analyticsLabel="Verify My Assessment"
            analyticsIntent="assessment_result"
          >
            {verifying ? 'verifying assessment' : 'verify my assessment'}
          </CTAButton>
        </div>
      ) : result.downloadUrl ? (
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
          onClick={onReview}
          analyticsLabel="Review My Assessment"
          analyticsIntent="workflow_review"
        >
          review my assessment
          <ArrowRight aria-hidden="true" size={18} />
        </CTAButton>
      ) : (
        <CTAButton href={`/ai-production-workflow-risks#${workflow}`} analyticsLabel="Explore the Relevant Workflow" analyticsUseCase={workflow}>
          explore the relevant workflow
          <ArrowRight aria-hidden="true" size={18} />
        </CTAButton>
      )}
    </div>
  )
}

export function TallyAssessment({context}: {context: KnownLeadContext}) {
  const formId = process.env.NEXT_PUBLIC_TALLY_ASSESSMENT_FORM_ID
  const [result, setResult] = useState<LeadResponse | null>(null)
  const [error, setError] = useState('')
  const [lastRequest, setLastRequest] = useState<LeadRequest | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const started = useRef(false)
  const resultShown = useRef(false)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const src = useMemo(() => {
    if (!formId) return ''
    const behavior = qualificationBehavior()
    const attribution = buildAttribution({
      sourcePage: '/workflow-assessment',
      ctaLabel: 'Assess Your Workflow',
      intent: 'workflow_assessment',
    })
    const params = new URLSearchParams({
      alignLeft: '1',
      hideTitle: '1',
      transparentBackground: '1',
      dynamicHeight: '1',
      source_page: '/workflow-assessment',
      cta_label: 'Assess Your Workflow',
      use_case: attribution.useCase,
      referrer: attribution.referrer,
      utm_source: attribution.utmSource,
      utm_medium: attribution.utmMedium,
      utm_campaign: attribution.utmCampaign,
      utm_content: attribution.utmContent,
      utm_term: attribution.utmTerm,
      known_profile: context.known ? 'true' : 'false',
      known_email: context.knownFields.includes('email') ? 'true' : 'false',
      known_company: context.knownFields.includes('company') ? 'true' : 'false',
      known_role: context.knownFields.includes('role') ? 'true' : 'false',
      known_website: context.knownFields.includes('website') ? 'true' : 'false',
      requires_website: context.requiresWebsite ? 'true' : 'false',
      portals_context: context.tallyContext || '',
      analytics_consent: analyticsConsent() === 'accepted' ? 'true' : 'false',
      pricing_or_pilot_viewed: behavior.pricingOrPilotViewed ? 'true' : 'false',
      security_diligence: behavior.securityDiligence ? 'true' : 'false',
    })
    const progressiveFields: Record<string, string> = {
      teamType: 'team_type',
      teamSize: 'production_team_size',
      workflowCollaborators: 'workflow_collaborators',
      toolsUsed: 'tools_used',
      approvedVersionMethod: 'approved_version_method',
      productionContextMethod: 'production_context_method',
      recreationFrequency: 'recreation_frequency',
      incidentType: 'most_recent_incident',
      peopleAffected: 'people_affected',
      hoursLost: 'hours_lost',
      deliveryImpact: 'delivery_client_impact',
      recurringWorkflow: 'recurring_workflow',
      assetVolume: 'asset_volume',
      annualAffectedValue: 'annual_affected_value',
      activeWorkflow: 'active_workflow_to_test',
    }
    const knownAnswers = new Set(context.knownAnswerFields)
    for (const [answer, field] of Object.entries(progressiveFields)) {
      params.set(`known_${field}`, knownAnswers.has(answer) ? 'true' : 'false')
    }
    return `https://tally.so/embed/${formId}?${params.toString()}`
  }, [context, formId])

  const resolveSubmission = useCallback(async (leadRequest: LeadRequest) => {
    setError('')
    setVerifying(true)
    try {
      let current = await submitLead(leadRequest)
      for (let attempt = 0; current.provisional && attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000))
        current = await submitLead(leadRequest)
      }
      if (!resultShown.current) {
        reserve()
        resultShown.current = true
      }
      setResult(current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'we could not score the assessment')
    } finally {
      setVerifying(false)
    }
  }, [])

  const progressiveContext = useMemo<KnownLeadContext>(() => {
    if (!lastRequest) return context
    const knownFields = new Set(context.knownFields)
    for (const key of ['email', 'name', 'company', 'role', 'website'] as const) {
      const value = lastRequest.identity?.[key]
      if (typeof value === 'string' && value.trim()) knownFields.add(key)
    }
    const knownAnswerFields = new Set(context.knownAnswerFields)
    for (const [key, value] of Object.entries(lastRequest.answers)) {
      if (typeof value === 'string' ? value.trim() : value != null) {
        knownAnswerFields.add(key)
      }
    }
    return {
      ...context,
      known: true,
      knownFields: [...knownFields],
      knownAnswerFields: [...knownAnswerFields],
      scores: result?.scores || context.scores,
      qualificationTier: result?.qualificationTier || context.qualificationTier,
      recommendedWorkflow:
        result?.recommendedWorkflow || context.recommendedWorkflow,
    }
  }, [context, lastRequest, result])

  useEffect(() => {
    function receive(event: MessageEvent) {
      const allowedOrigins = new Set([
        'https://tally.so',
        process.env.NEXT_PUBLIC_TALLY_ORIGIN,
      ].filter(Boolean))
      if (!allowedOrigins.has(event.origin) || typeof event.data !== 'string') return
      if (!event.data.includes('Tally.')) return
      let message: TallyMessage
      try {
        message = JSON.parse(event.data) as TallyMessage
      } catch {
        return
      }
      const eventName = message.event || (event.data.match(/Tally\.[A-Za-z]+/)?.[0] ?? '')
      if (eventName === 'Tally.FormLoaded') {
        void trackEvent('form_opened', {form_name: 'workflow_assessment'})
      }
      if (eventName === 'Tally.FormPageView' && !started.current) {
        started.current = true
        void trackEvent('form_started', {form_name: 'workflow_assessment'})
      }
      if (eventName === 'Tally.FormSubmitted' && message.payload) {
        const leadRequest = tallyLeadRequest(message.payload, 'tally_client')
        setLastRequest(leadRequest)
        void resolveSubmission(leadRequest)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [resolveSubmission])

  if (result) {
    return (
      <div
        ref={swapRef}
        className="transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? {minHeight: reservedHeight} : undefined}
      >
        <Result
          result={result}
          verifying={verifying}
          onReview={() => setReviewOpen(true)}
          onVerify={() => {
            if (lastRequest) void resolveSubmission(lastRequest)
          }}
        />
        {reviewOpen ? (
          <div className="mt-40 max-w-[680px]">
            <WorkflowReviewForm
              context={progressiveContext}
              recommendedWorkflow={result.recommendedWorkflow}
            />
          </div>
        ) : null}
      </div>
    )
  }
  if (!formId) {
    return (
      <div className="space-y-20">
        <h2 className="t-h1-sans">workflow assessment</h2>
        <p className="max-w-[36em] t-p-lg-serif text-white">
          the assessment form is ready for its tally form id. until it is connected, explore the production workflows directly.
        </p>
        <CTAButton href="/ai-production-workflow-risks">explore use cases</CTAButton>
      </div>
    )
  }
  return (
    <div ref={swapRef}>
      <iframe
        title="portals workflow assessment"
        src={src}
        loading="eager"
        width="100%"
        height="720"
        frameBorder="0"
        marginHeight={0}
        marginWidth={0}
        className="min-h-[720px] w-full"
      />
      <noscript>
        <a href={`https://tally.so/r/${formId}`}>open the workflow assessment</a>
      </noscript>
      {error ? (
        <div className="mt-20 space-y-14" role="alert">
          <p className="t-p-sans text-[#ffb4a8]">{error}</p>
          <CTAButton href="/ai-production-workflow-risks">explore use cases</CTAButton>
        </div>
      ) : null}
    </div>
  )
}
