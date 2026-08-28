'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {ArrowDownToLine, ArrowRight} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {analyticsConsent, buildAttribution, retrieveFormParams, trackEvent} from '@/lib/leads/analytics-client'
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
import {
  applyFallbackDefaults,
  normalizeUrlParams,
  parseUrlParams,
  shouldHideField,
  validateUrlParamEmail,
  type UrlParams,
} from '@/lib/leads/url-params'

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
  const [urlParams, setUrlParams] = useState<UrlParams>({})
  const [showField, setShowField] = useState<Record<string, boolean>>({})
  const started = useRef(false)
  const {ref: swapRef, reservedHeight, reserve} = usePreservedSwap()
  const {ref: draftRef, restored, flush, clear} = useFormDraft(submissionType)

  useEffect(() => {
    if (restored.email) setEmail(restored.email)
  }, [restored.email])

  // Parse URL parameters and integrate with form
  useEffect(() => {
    const rawUrlParams = parseUrlParams()
    const storedParams = retrieveFormParams()
    
    // Merge URL params with stored params (URL params take priority)
    const mergedParams = { ...storedParams, ...rawUrlParams }
    const normalizedParams = normalizeUrlParams(mergedParams)
    const paramsWithDefaults = applyFallbackDefaults(normalizedParams)
    
    setUrlParams(paramsWithDefaults)
    
    // Determine which fields to hide based on pre-filled values
    const fieldVisibility: Record<string, boolean> = {}
    fieldVisibility.howDidYouHearAboutPortals = !shouldHideField('howDidYouHearAboutPortals', paramsWithDefaults.how_did_you_hear)
    fieldVisibility.whatBroughtYouHere = !shouldHideField('whatBroughtYouHere', paramsWithDefaults.what_brought_you)
    fieldVisibility.interest = !shouldHideField('interest', paramsWithDefaults.interest)
    
    setShowField(fieldVisibility)
    
    // Track URL parameter usage for analytics
    if (Object.keys(paramsWithDefaults).length > 0) {
      void trackEvent('form_url_params_used', {
        form_name: submissionType,
        param_count: Object.keys(paramsWithDefaults).length,
        params: Object.keys(paramsWithDefaults),
      })
    }
  }, [submissionType])

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
      // Merge URL params with form values and context (priority: form > context > URL params)
      const submittedIdentity: LeadIdentity = Object.fromEntries(
        Object.entries({
          email: String(values.email || context.identity?.email || context.answerValues?.email || urlParams.email || ''),
          name: String(values.name || context.identity?.name || context.answerValues?.name || urlParams.name || ''),
          company: String(values.company || context.identity?.company || context.answerValues?.company || urlParams.company || ''),
          role: String(values.role || context.identity?.role || context.answerValues?.role || urlParams.role || ''),
          website: String(values.website || context.identity?.website || context.answerValues?.website || urlParams.website || ''),
        }).filter(([, value]) => value),
      ) as LeadIdentity
      
      // Validate email domain if provided via URL params
      if (urlParams.email && !values.email) {
        const emailValidation = validateUrlParamEmail(urlParams.email)
        if (!emailValidation.valid) {
          setState({
            status: 'error',
            message: emailValidation.error || 'invalid email',
          })
          return
        }
      }
      
      const result = await submitLead({
        submissionType,
        idempotencyKey,
        formVersion: 'resource.v1',
        provider: 'browser',
        identity: submittedIdentity,
        attribution: buildAttribution({
          sourcePage,
          ctaLabel: downloadLabel,
          intent: submissionType,
          useCase: String(values.interest || urlParams.interest || ''),
        }),
        consent: {
          disclosureVersion: DISCLOSURE_VERSION,
          marketing: values.marketingConsent === 'on',
          analytics: analyticsConsent() === 'accepted',
        },
        companyFax: String(values.companyFax || ''),
        whatBroughtYouHere: ((values.whatBroughtYouHere || context.answerValues?.whatBroughtYouHere || urlParams.what_brought_you) as 'workflow-problem' | 'assess-scaling' | 'evaluating-tools' | 'other' | undefined),
        whatBroughtYouHereOther: String(values.whatBroughtYouHereOther || context.answerValues?.whatBroughtYouHereOther || urlParams.what_brought_you_other || ''),
        howDidYouHearAboutPortals: ((values.howDidYouHearAboutPortals || context.answerValues?.howDidYouHearAboutPortals || urlParams.how_did_you_hear) as 'google-search' | 'linkedin' | 'email' | 'someone-company' | 'friend-colleague' | 'article-newsletter-podcast' | 'partner-company' | 'social-media' | undefined),
        answers: {
          interest: String(
            values.interest ||
              knownProfileInterest ||
              context.recommendedWorkflow ||
              urlParams.interest ||
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
            urlParams={urlParams}
          />
          {/* What brought you here - with URL param support and field hiding */}
          {showField.whatBroughtYouHere ? (
            <LeadField label="What brought you here?" name="whatBroughtYouHere">
              <LeadSelectField
                id="whatBroughtYouHere"
                name="whatBroughtYouHere"
                required
                defaultValue={context.answerValues?.whatBroughtYouHere || urlParams.what_brought_you || ''}
              >
                <option value="" disabled>select one</option>
                <option value="workflow-problem">I have a workflow problem I need to solve</option>
                <option value="assess-scaling">I want to assess whether our current process will scale</option>
                <option value="evaluating-tools">I'm evaluating production tools</option>
                <option value="other">Other</option>
              </LeadSelectField>
            </LeadField>
          ) : urlParams.what_brought_you ? (
            <div className="space-y-8 py-12 border-b border-white/10">
              <p className="t-p-sm-sans text-white/60">What brought you here</p>
              <p className="t-p-sans">{urlParams.what_brought_you.replace(/-/g, ' ')}</p>
              <button 
                type="button" 
                onClick={() => setShowField(prev => ({...prev, whatBroughtYouHere: true}))}
                className="t-p-sm-sans text-white/60 underline hover:text-white"
              >
                Edit
              </button>
            </div>
          ) : (
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
          )}
          
          {(context.answerValues?.whatBroughtYouHere === 'other' || urlParams.what_brought_you === 'other') ? (
            <LeadField label="Please describe" name="whatBroughtYouHereOther">
              <LeadTextareaField
                id="whatBroughtYouHereOther"
                name="whatBroughtYouHereOther"
                defaultValue={context.answerValues?.whatBroughtYouHereOther || urlParams.what_brought_you_other || ''}
                placeholder="Describe what brought you here"
              />
            </LeadField>
          ) : null}
          
          {/* How did you hear about portals - with URL param support and field hiding */}
          {showField.howDidYouHearAboutPortals ? (
            <LeadField label="How did you hear about portals?" name="howDidYouHearAboutPortals">
              <LeadSelectField
                id="howDidYouHearAboutPortals"
                name="howDidYouHearAboutPortals"
                required
                defaultValue={context.answerValues?.howDidYouHearAboutPortals || urlParams.how_did_you_hear || ''}
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
          ) : urlParams.how_did_you_hear ? (
            <div className="space-y-8 py-12 border-b border-white/10">
              <p className="t-p-sm-sans text-white/60">How you heard about us</p>
              <p className="t-p-sans">{urlParams.how_did_you_hear.replace(/-/g, ' ')}</p>
              <button 
                type="button" 
                onClick={() => setShowField(prev => ({...prev, howDidYouHearAboutPortals: true}))}
                className="t-p-sm-sans text-white/60 underline hover:text-white"
              >
                Edit
              </button>
            </div>
          ) : (
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
          )}
          
          {/* Interest field - with URL param support and field hiding */}
          {showField.interest ? (
            <LeadField label={`${interestLabel} *`} name="interest">
              <LeadSelectField
                id="interest"
                name="interest"
                required
                defaultValue={urlParams.interest || ''}
                onChange={onStarted}
              >
                <option value="" disabled>select one</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </LeadSelectField>
            </LeadField>
          ) : urlParams.interest ? (
            <div className="space-y-8 py-12 border-b border-white/10">
              <p className="t-p-sm-sans text-white/60">{interestLabel}</p>
              <p className="t-p-sans">{urlParams.interest.replace(/-/g, ' ')}</p>
              <button 
                type="button" 
                onClick={() => setShowField(prev => ({...prev, interest: true}))}
                className="t-p-sm-sans text-white/60 underline hover:text-white"
              >
                Edit
              </button>
            </div>
          ) : (
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
          )}
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
