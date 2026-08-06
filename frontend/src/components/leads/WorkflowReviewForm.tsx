'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {analyticsConsent, buildAttribution, trackEvent} from '@/lib/leads/analytics-client'
import {newSubmissionId, publicEmailNeedsWebsite, submitLead} from '@/lib/leads/client'
import {
  DISCLOSURE_VERSION,
  type KnownLeadContext,
  type LeadIdentity,
  type LeadResponse,
} from '@/lib/leads/contracts'
import {ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback} from './LeadFields'
import {LeadSelectField, LeadTextareaField} from '@/components/mui/fields'
import {useFormDraft} from './useFormDraft'
import {usePreservedSwap} from './usePreservedSwap'

export function WorkflowReviewForm({
  context,
  recommendedWorkflow,
}: {
  context: KnownLeadContext
  recommendedWorkflow?: string
}) {
  const idempotencyKey = useMemo(() => newSubmissionId('workflow-review'), [])
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<LeadResponse | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')
  const started = useRef(false)
  const known = new Set(context.knownAnswerFields)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft('workflow_review')

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
  }, [restored.email])

  useEffect(() => {
    void trackEvent('form_opened', {form_name: 'workflow_review'})
  }, [])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: 'workflow_review'})
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await submitLead({
        submissionType: 'workflow_review',
        idempotencyKey,
        formVersion: 'workflow-review.v1',
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
          ctaLabel: 'Review My Assessment',
          intent: 'workflow_review',
          useCase: recommendedWorkflow || '',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        answers: {
          activeWorkflow: String(values.activeWorkflow || ''),
          timeline: String(values.timeline || ''),
          currentSystems: String(values.currentSystems || ''),
          unresolvedQuestion: String(values.unresolvedQuestion || ''),
          stakeholderInvolved:
            'stakeholderInvolved' in values
              ? values.stakeholderInvolved === 'yes'
              : undefined,
          securityDiligence:
            'securityDiligence' in values
              ? values.securityDiligence === 'yes'
              : undefined,
        },
      })
      reserve()
      clear()
      setResult(response)
      setStatus('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'we could not submit the review')
      setStatus('error')
    }
  }

  if (result) {
    return (
      <div
        ref={swapRef}
        role="status"
        className="space-y-20 transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? {minHeight: reservedHeight} : undefined}
      >
        <h3 className="t-h1-sans">review recorded.</h3>
        <p className="t-p-lg-serif text-white">{result.message}</p>
        {result.nextAction === 'pilot_scope' ? (
          <CTAButton href="/paid-pilot#scope" analyticsLabel="Scope a Production Pilot">
            scope a production pilot
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        ) : (
          <CTAButton href={`/ai-production-workflow-risks#${result.recommendedWorkflow || recommendedWorkflow || 'asset-reproduction'}`}>
            explore the relevant workflow
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        )}
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
      <div>
        <h3 className="t-h1-sans">review my assessment</h3>
        <p className="mt-14 t-p-lg-serif text-white">
          add only the practical context still needed to understand timing and implementation.
        </p>
      </div>
      <IdentityFields
        context={context}
        email={email}
        onEmailChange={(event) => setEmail(event.target.value)}
        requireWebsite={publicEmailNeedsWebsite(email)}
        onStarted={onStarted}
      />
      {!known.has('activeWorkflow') ? (
        <LeadField label="active workflow *" name="activeWorkflow">
          <LeadTextareaField id="activeWorkflow" name="activeWorkflow" minRows={4} resizable={false} required />
        </LeadField>
      ) : null}
      {!known.has('timeline') ? <LeadField label="desired timing *" name="timeline">
        <LeadSelectField id="timeline" name="timeline" required defaultValue="">
          <option value="" disabled>select timing</option>
          <option value="within-30-days">within 30 days</option>
          <option value="1-3-months">one to three months</option>
          <option value="3-plus-months">more than three months</option>
          <option value="not-planned">not currently planned</option>
        </LeadSelectField>
      </LeadField> : null}
      {!known.has('currentSystems') ? <LeadField label="current systems *" name="currentSystems">
        <LeadTextareaField id="currentSystems" name="currentSystems" minRows={3} resizable={false} required />
      </LeadField> : null}
      {!known.has('unresolvedQuestion') ? <LeadField label="main unresolved question *" name="unresolvedQuestion">
        <LeadTextareaField id="unresolvedQuestion" name="unresolvedQuestion" minRows={3} resizable={false} required />
      </LeadField> : null}
      {!known.has('stakeholderInvolved') ? <LeadField label="is another stakeholder involved? *" name="stakeholderInvolved">
        <LeadSelectField id="stakeholderInvolved" name="stakeholderInvolved" required defaultValue="">
          <option value="" disabled>select one</option>
          <option value="yes">yes</option>
          <option value="no">not yet</option>
        </LeadSelectField>
      </LeadField> : null}
      {!known.has('securityDiligence') ? <LeadField label="are security or integration requirements part of the review? *" name="securityDiligence">
        <LeadSelectField id="securityDiligence" name="securityDiligence" required defaultValue="">
          <option value="" disabled>select one</option>
          <option value="yes">yes</option>
          <option value="no">not yet</option>
        </LeadSelectField>
      </LeadField> : null}
      <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
      <NoScriptLeadFallback />
      {status === 'error' ? <p role="alert" className="t-p-sans text-[#ffb4a8]">{error}</p> : null}
      <CTAButton type="submit" className="js-lead-submit" disabled={status === 'submitting'} analyticsLabel="Review My Assessment">
        {status === 'submitting' ? 'submitting...' : 'review my assessment'}
      </CTAButton>
    </form>
  )
}
