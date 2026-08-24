'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowDownToLine, ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {analyticsConsent, buildAttribution, trackEvent} from '@/lib/leads/analytics-client'
import {
  DISCLOSURE_VERSION,
  type KnownLeadContext,
  type LeadIdentity,
  type LeadResponse,
  type LeadSubmissionType,
} from '@/lib/leads/contracts'
import {newSubmissionId, publicEmailNeedsWebsite, submitLead} from '@/lib/leads/client'
import {ConsentFields, IdentityFields, KnownProfileNotice, LeadField, NoScriptLeadFallback} from './LeadFields'
import {LeadSelectField, LeadTextareaField} from '@/components/mui/fields'
import {useFormDraft} from './useFormDraft'
import {usePreservedSwap} from './usePreservedSwap'

type Option = {value: string; label: string}

export function ResourceLeadForm({
  context,
  submissionType,
  title,
  description,
  interestLabel,
  options,
  downloadLabel,
  sourcePage,
  knownProfileInterest,
}: {
  context: KnownLeadContext
  submissionType: Extract<LeadSubmissionType, 'guide_download' | 'security_download' | 'pilot_brief_download'>
  title: string
  description: string
  interestLabel: string
  options: Option[]
  downloadLabel: string
  sourcePage: string
  knownProfileInterest?: string
}) {
  const idempotencyKey = useMemo(() => newSubmissionId(submissionType), [submissionType])
  const [email, setEmail] = useState('')
  const [state, setState] = useState<{status: 'idle' | 'submitting' | 'success' | 'error'; result?: LeadResponse; message?: string}>({status: 'idle'})
  const started = useRef(false)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft(submissionType)

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
  }, [restored.email])

  const quickDownload =
    !context.requiresWebsite &&
    ['email', 'company', 'role'].every((field) =>
      context.knownFields.includes(field as 'email' | 'company' | 'role'),
    )

  useEffect(() => {
    void trackEvent('form_opened', {form_name: submissionType})
  }, [submissionType])

  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', {form_name: submissionType})
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({status: 'submitting'})
    flush()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    try {
      const result = await submitLead({
        submissionType,
        idempotencyKey,
        formVersion: 'resource.v1',
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
          sourcePage,
          ctaLabel: downloadLabel,
          intent: submissionType,
          useCase: String(values.interest || ''),
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
          interest: String(
            values.interest ||
              knownProfileInterest ||
              context.recommendedWorkflow ||
              options[0]?.value ||
              'existing-profile',
          ),
          message: '',
        },
      })
      reserve()
      clear()
      setState({status: 'success', result})
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'we could not submit the request',
      })
    }
  }

  if (state.status === 'success' && state.result) {
    return (
      <div
        ref={swapRef}
        role="status"
        className="space-y-24 transition-[min-height] duration-500 ease-out motion-reduce:transition-none"
        style={reservedHeight ? {minHeight: reservedHeight} : undefined}
      >
        <h3 className="t-h1-sans">Your document is ready.</h3>
        <p className="t-p-sans text-white max-w-3xl">
          {state.result.message ||
            'Download the field guide, then assess how reliably your team preserves approved versions, production context, and reusable creative knowledge.'}
        </p>
        <div className="flex flex-col gap-16 sm:flex-row lg:justify-center">
          {state.result.downloadUrl ? (
            <CTAButton
              href={state.result.downloadUrl}
              target="_blank"
              rel="noreferrer"
              analyticsLabel={downloadLabel}
              analyticsIntent={submissionType}
            >
              <ArrowDownToLine aria-hidden="true" size={18} strokeWidth={1.8} />
              {downloadLabel}
            </CTAButton>
          ) : null}
          <CTAButton href="/workflow/assessment" analyticsLabel="Assess Your Workflow">
            Assess production workflow
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </CTAButton>
        </div>
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
      className="space-y-20"
      onFocus={onStarted}
    >
      <div>
        <h2 className="t-h1-sans">{title}</h2>
        <p className="mt-16 t-p-lg-serif text-white">{description}</p>
      </div>
      {quickDownload ? (
        <>
          <KnownProfileNotice context={context} />
          <ConsentFields onStarted={onStarted} showMarketing={false} />
        </>
      ) : (
        <>
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
          <LeadField label={`${interestLabel} *`} name="interest">
            <LeadSelectField
              id="interest"
              name="interest"
              required
              defaultValue=""
              onChange={onStarted}
            >
              <option value="" disabled>select one</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </LeadSelectField>
          </LeadField>
          <ConsentFields onStarted={onStarted} showMarketing={!context.known} />
        </>
      )}
      <NoScriptLeadFallback />
      {state.status === 'error' ? <p role="alert" className="t-p-sans text-[#ffb4a8]">{state.message}</p> : null}
      <CTAButton
        type="submit"
        className="js-lead-submit"
        disabled={state.status === 'submitting'}
        analyticsLabel={downloadLabel}
        analyticsIntent={submissionType}
      >
        {state.status === 'submitting' ? 'submitting...' : downloadLabel}
      </CTAButton>
    </form>
  )
}
