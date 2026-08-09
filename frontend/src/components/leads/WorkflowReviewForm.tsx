'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {LeadSelectField, LeadTextareaField} from '@/components/mui/fields'
import {analyticsConsent, buildAttribution, trackEvent} from '@/lib/leads/analytics-client'
import {newSubmissionId, publicEmailNeedsWebsite, submitLead} from '@/lib/leads/client'
import {
  commercialReadinessAnswersSchema,
  DISCLOSURE_VERSION,
  type KnownLeadContext,
  type LeadIdentity,
  type LeadResponse,
} from '@/lib/leads/contracts'
import {ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback} from './LeadFields'
import {useFormDraft} from './useFormDraft'
import {usePreservedSwap} from './usePreservedSwap'

const readinessFields = [
  'targetStartPeriod',
  'approvalPath',
  'productionOwner',
  'primaryObjection',
] as const

export function WorkflowReviewForm({
  context,
  recommendedWorkflow,
}: {
  context: KnownLeadContext
  recommendedWorkflow?: string
}) {
  const idempotencyKey = useMemo(() => newSubmissionId('commercial-readiness'), [])
  const [email, setEmail] = useState('')
  const [objection, setObjection] = useState(
    String(context.answerValues?.primaryObjection || ''),
  )
  const [result, setResult] = useState<LeadResponse | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')
  const started = useRef(false)
  const known = new Set(context.knownAnswerFields)
  const missing = new Set(
    context.missingFields?.length
      ? context.missingFields
      : readinessFields.filter((field) => !known.has(field)),
  )
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft('commercial_readiness')

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
    if (restored.primaryObjection) setObjection(restored.primaryObjection)
  }, [restored.email, restored.primaryObjection])

  useEffect(() => {
    void trackEvent('commercial_clarification_started', {
      missing_fields: [...missing].join(','),
    })
  }, [])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: 'commercial_readiness'})
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const carried = context.answerValues || {}
    const answer = (key: string) => String(values[key] || carried[key] || '')
    try {
      const response = await submitLead({
        submissionType: 'commercial_readiness',
        idempotencyKey,
        formVersion: 'commercial-readiness.v1',
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
          sourcePage: '/assessment',
          ctaLabel: 'Complete Pilot Readiness',
          intent: 'commercial_readiness',
          useCase: recommendedWorkflow || '',
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        answers: commercialReadinessAnswersSchema.parse({
          targetStartPeriod: answer('targetStartPeriod'),
          approvalPath: answer('approvalPath'),
          productionOwner: answer('productionOwner'),
          primaryObjection: answer('primaryObjection'),
          objectionDetail: answer('objectionDetail'),
        }),
      })
      reserve()
      clear()
      setResult(response)
      setStatus('idle')
      void trackEvent('commercial_clarification_completed', {
        qualification_outcome: response.qualificationOutcome || 'unknown',
        next_action: response.nextAction,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'we could not save your pilot readiness')
      setStatus('error')
    }
  }

  if (result) {
    const workflow = result.recommendedWorkflow || recommendedWorkflow || 'asset-reproduction'
    return (
      <div ref={swapRef} role="status" className="space-y-20" style={reservedHeight ? {minHeight: reservedHeight} : undefined}>
        <h3 className="t-h1-sans">
          {result.nextAction === 'pilot_scope' ? 'ready to build your pilot plan.' : 'your next step is clear.'}
        </h3>
        <p className="t-p-lg-serif text-white">{result.message}</p>
        {result.nextAction === 'pilot_scope' ? (
          <>
            <p className="t-p-sans text-white/80">
              Your assessment answers carry over. There is no fee to scope or receive your plan; the $5,000 fee applies only if you approve and conduct the pilot.
            </p>
            <CTAButton href="/paid-pilot?from=assessment#scope" analyticsLabel="Build My Customized Pilot Plan" onClick={() => void trackEvent('pilot_handoff_clicked', {workflow})}>
              build my customized pilot plan
              <ArrowRight aria-hidden="true" size={18} />
            </CTAButton>
          </>
        ) : (
          <CTAButton href={`/ai-production-workflow-risks#${workflow}`} analyticsLabel="Explore the Relevant Workflow">
            explore the relevant workflow
            <ArrowRight aria-hidden="true" size={18} />
          </CTAButton>
        )}
      </div>
    )
  }

  return (
    <form ref={(element) => { swapRef(element); draftRef(element) }} onSubmit={onSubmit} onFocus={onStarted} className="space-y-20">
      <div>
        <h3 className="t-h1-sans">complete pilot readiness</h3>
        <p className="mt-14 t-p-lg-serif text-white">
          Answer only the practical details the assessment could not establish. Objections travel with your scope; they do not automatically block a pilot plan.
        </p>
      </div>
      <IdentityFields context={context} email={email} onEmailChange={(event) => setEmail(event.target.value)} requireWebsite={publicEmailNeedsWebsite(email)} onStarted={onStarted} />
      {missing.has('targetStartPeriod') ? <LeadField label="target start period *" name="targetStartPeriod">
        <LeadSelectField id="targetStartPeriod" name="targetStartPeriod" required defaultValue="">
          <option value="" disabled>select timing</option>
          <option value="within-30-days">within 30 days</option>
          <option value="within-60-days">within 60 days</option>
          <option value="this-quarter">this quarter</option>
          <option value="later">later</option>
        </LeadSelectField>
      </LeadField> : null}
      {missing.has('approvalPath') ? <LeadField label="$5,000 pilot approval path *" name="approvalPath">
        <LeadSelectField id="approvalPath" name="approvalPath" required defaultValue="">
          <option value="" disabled>select approval path</option>
          <option value="self">I can approve it</option>
          <option value="other">a colleague approves it</option>
          <option value="procurement">procurement is involved</option>
          <option value="not-established">approval path is not established</option>
          <option value="no">we cannot approve a $5,000 pilot</option>
        </LeadSelectField>
      </LeadField> : null}
      {missing.has('productionOwner') ? <LeadField label="production owner *" name="productionOwner">
        <LeadTextareaField id="productionOwner" name="productionOwner" minRows={2} resizable={false} required placeholder="Name or role responsible for the workflow" />
      </LeadField> : null}
      {missing.has('primaryObjection') ? <LeadField label="main question or objection *" name="primaryObjection">
        <LeadSelectField id="primaryObjection" name="primaryObjection" required defaultValue={objection} onChange={(event) => setObjection(event.target.value)}>
          <option value="" disabled>select one</option>
          <option value="none">none</option>
          <option value="workflow-fit">workflow fit</option>
          <option value="value">value</option>
          <option value="pilot-scope">pilot scope</option>
          <option value="security">security</option>
          <option value="integration">integration</option>
          <option value="procurement">procurement</option>
          <option value="timing-budget">timing or budget</option>
          <option value="stakeholder-alignment">stakeholder alignment</option>
          <option value="other">other</option>
        </LeadSelectField>
      </LeadField> : null}
      {(objection && objection !== 'none') || known.has('primaryObjection') ? <LeadField label="what should the pilot plan address? *" name="objectionDetail">
        <LeadTextareaField id="objectionDetail" name="objectionDetail" minRows={3} resizable={false} required={objection !== 'none'} />
      </LeadField> : null}
      <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
      <NoScriptLeadFallback />
      {status === 'error' ? <p role="alert" className="t-p-sans text-[#ffb4a8]">{error}</p> : null}
      <CTAButton type="submit" className="js-lead-submit" disabled={status === 'submitting'} analyticsLabel="Complete Pilot Readiness">
        {status === 'submitting' ? 'checking...' : 'complete pilot readiness'}
      </CTAButton>
    </form>
  )
}
