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
} from '@/lib/leads/contracts'
import {ConsentFields, IdentityFields, LeadField, NoScriptLeadFallback} from './LeadFields'
import {LeadSelectField, LeadTextareaField} from '@/components/mui/fields'
import {useFormDraft} from './useFormDraft'
import {usePreservedSwap} from './usePreservedSwap'

export function ContactLeadForm({
  context,
  initialInterest = '',
}: {
  context: KnownLeadContext
  initialInterest?: string
}) {
  const idempotencyKey = useMemo(() => newSubmissionId('contact'), [])
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const started = useRef(false)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft('contact')

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
  }, [restored.email])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: 'contact'})
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('submitting')
    flush()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const result = await submitLead({
        submissionType: 'contact',
        idempotencyKey,
        formVersion: 'contact.v1',
        provider: 'browser',
        identity: Object.fromEntries(
          Object.entries({
            email: String(values.email || context.identity?.email || context.answerValues?.email || ''),
            name: String(values.name || context.identity?.name || context.answerValues?.name || ''),
            company: String(values.company || context.identity?.company || context.answerValues?.company || ''),
            role: String(values.role || context.identity?.role || context.answerValues?.role || ''),
            website: String(values.website || context.identity?.website || context.answerValues?.website || ''),
          }).filter(([, value]) => value),
        ) as LeadIdentity,
        attribution: buildAttribution({
          sourcePage: '/contact',
          ctaLabel: 'Contact Portals',
          intent: String(values.interest || initialInterest || 'general'),
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        whatBroughtYouHere: ((values.whatBroughtYouHere || context.answerValues?.whatBroughtYouHere) as 'workflow-problem' | 'assess-scaling' | 'evaluating-tools' | 'other' | undefined),
        whatBroughtYouHereOther: String(values.whatBroughtYouHereOther || context.answerValues?.whatBroughtYouHereOther || ''),
        howDidYouHearAboutPortals: ((values.howDidYouHearAboutPortals || context.answerValues?.howDidYouHearAboutPortals) as 'google-search' | 'linkedin' | 'email' | 'someone-company' | 'friend-colleague' | 'article-newsletter-podcast' | 'partner-company' | 'social-media' | undefined),
        answers: {
          interest: String(values.interest || initialInterest || ''),
          question: String(values.question || ''),
        },
      })
      setMessage(result.message || 'thanks. portals will follow up about this request.')
      reserve()
      clear()
      setStatus('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'we could not submit your request')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div
        ref={swapRef}
        role="status"
        className="space-y-20 transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? {minHeight: reservedHeight} : undefined}
      >
        <h2 className="t-h1-sans">request received.</h2>
        <p className="max-w-[38em] t-p-lg-serif text-white">{message}</p>
        <CTAButton href="/workflow/ai-production-workflow-risks" analyticsLabel="Explore Use Cases">
          explore use cases
          <ArrowRight aria-hidden="true" size={18} />
        </CTAButton>
      </div>
    )
  }

  return (
    <form
      ref={(element) => {
        swapRef(element)
        draftRef(element)
      }}
      className="space-y-20"
      onFocus={onStarted}
      onSubmit={onSubmit}
    >
      <IdentityFields
        context={context}
        email={email}
        onEmailChange={(event) => setEmail(event.target.value)}
        requireWebsite={publicEmailNeedsWebsite(email) || Boolean(context.requiresWebsite)}
        onStarted={onStarted}
      />
      <LeadField label="What brought you here?" name="whatBroughtYouHere">
        <LeadSelectField
          id="whatBroughtYouHere"
          name="whatBroughtYouHere"
          required
          defaultValue={context.answerValues?.whatBroughtYouHere || ''}
        >
          <option value="" disabled>select one</option>
          <option value="workflow-problem">I have a workflow problem I need to solve</option>
          <option value="assess-scaling">I want to assess whether our current process will scale</option>
          <option value="evaluating-tools">I'm evaluating production tools</option>
          <option value="other">Other</option>
        </LeadSelectField>
      </LeadField>
      {context.answerValues?.whatBroughtYouHere === 'other' ? (
        <LeadField label="Please describe" name="whatBroughtYouHereOther">
          <LeadTextareaField
            id="whatBroughtYouHereOther"
            name="whatBroughtYouHereOther"
            defaultValue={context.answerValues?.whatBroughtYouHereOther || ''}
            placeholder="Describe what brought you here"
          />
        </LeadField>
      ) : null}
      <LeadField label="How did you hear about portals?" name="howDidYouHearAboutPortals">
        <LeadSelectField
          id="howDidYouHearAboutPortals"
          name="howDidYouHearAboutPortals"
          required
          defaultValue={context.answerValues?.howDidYouHearAboutPortals || ''}
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
      <LeadField label="how can we help you? *" name="interest">
        <LeadSelectField
          id="interest"
          name="interest"
          required
          defaultValue={initialInterest}
          onChange={onStarted}
        >
          <option value="" disabled>select a topic</option>
          <option value="workflow-review">workflow review</option>
          <option value="security-review">security review</option>
          <option value="integration">integration or implementation</option>
          <option value="commercial">commercial terms</option>
          <option value="other">something else</option>
        </LeadSelectField>
      </LeadField>
      <LeadField label="your question *" name="question">
        <LeadTextareaField
          id="question"
          name="question"
          required
          minRows={7}
          onChange={onStarted}
          placeholder="share the workflow, diligence question, or decision you are working through"
        />
      </LeadField>
      <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
      <NoScriptLeadFallback />
      {status === 'error' ? <p role="alert" className="t-p-sm-sans text-white">{message}</p> : null}
      <CTAButton type="submit" className="js-lead-submit" disabled={status === 'submitting'} analyticsLabel="Contact Portals">
        {status === 'submitting' ? 'sending...' : 'Contact us'}
        <ArrowRight aria-hidden="true" size={18} />
      </CTAButton>
    </form>
  )
}
