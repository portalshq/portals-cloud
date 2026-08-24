'use client'

import type {ChangeEvent, ReactNode} from 'react'
import {CTAButton} from '@/components/CTAButton'
import {LeadCheckbox, LeadSelectField, LeadTextField} from '@/components/mui/fields'
import type {KnownLeadContext} from '@/lib/leads/contracts'
import {resetKnownProfile} from '@/lib/leads/client'
import {ConditionalReveal} from './ConditionalReveal'

export function LeadField({
  label,
  name,
  children,
}: {
  label: string
  name: string
  children: ReactNode
}) {
  return (
    <label className="block t-p-sm-sans text-white" htmlFor={name}>
      {label}
      {children}
    </label>
  )
}

export function KnownProfileNotice({context}: {context: KnownLeadContext}) {
  if (!context.known) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-12 rounded-sm bg-white/8 px-14 py-12 sm:col-span-2">
      <p className="t-p-sm-sans text-white">
        using the contact details from your previous request in this browser.
      </p>
      <CTAButton
        type="button"
        appearance="plain"
        className="!min-w-0 underline underline-offset-4"
        onClick={async () => {
          await resetKnownProfile()
        }}
      >
        not you?
      </CTAButton>
    </div>
  )
}

export function IdentityFields({
  context,
  email,
  onEmailChange,
  requireWebsite,
  onStarted,
}: {
  context: KnownLeadContext
  email: string
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void
  requireWebsite: boolean
  onStarted: () => void
}) {
  const known = new Set(context.knownFields)
  return (
    <>
      <KnownProfileNotice context={context} />
      {!known.has('name') ? (
        <LeadField label="name *" name="name">
          <LeadTextField
            id="name"
            name="name"
            autoComplete="name"
            required
            onChange={onStarted}
            placeholder="your name"
          />
        </LeadField>
      ) : null}
      {!known.has('email') ? (
        <LeadField label="work email *" name="email">
          <LeadTextField
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              onStarted()
              onEmailChange(event as ChangeEvent<HTMLInputElement>)
            }}
            placeholder="name@company.com"
          />
        </LeadField>
      ) : null}
      {!known.has('company') ? (
        <LeadField label="company *" name="company">
          <LeadTextField
            id="company"
            name="company"
            autoComplete="organization"
            required
            onChange={onStarted}
            placeholder="company name"
          />
        </LeadField>
      ) : null}
      {!known.has('role') ? (
        <LeadField label="role *" name="role">
          <LeadSelectField
            id="role"
            name="role"
            required
            defaultValue=""
            onChange={onStarted}
          >
            <option value="" disabled>select your role</option>
            <option value="founder-executive">founder or executive</option>
            <option value="production-operations">production or operations</option>
            <option value="creative-leadership">creative leadership</option>
            <option value="technical-leadership">technical leadership</option>
            <option value="producer-project-manager">producer or project manager</option>
            <option value="artist-creator">artist or creator</option>
            <option value="other">other</option>
          </LeadSelectField>
        </LeadField>
      ) : null}
      {!known.has('website') ? (
        <ConditionalReveal active={Boolean(requireWebsite || context.requiresWebsite)}>
          <LeadField label="company website *" name="website">
            <LeadTextField
              id="website"
              name="website"
              type="url"
              autoComplete="url"
              required={requireWebsite || context.requiresWebsite}
              onChange={onStarted}
              placeholder="company.com"
            />
          </LeadField>
        </ConditionalReveal>
      ) : null}
    </>
  )
}

export function ConsentFields({
  onStarted,
  showMarketing = true,
}: {
  onStarted: () => void
  showMarketing?: boolean
}) {
  return (
    <div className="space-y-12">
      {showMarketing ? (
      <>
        <p className="t-p-sm-sans text-white">
          By submitting, you agree that we may contact you about this request. see our{' '}
          <a className="underline underline-offset-4" href="/privacy-policy" target="_blank">
            privacy policy
          </a>.
        </p>
        <label className="flex items-start gap-10 t-p-sm-sans text-white">
          <LeadCheckbox
            name="marketingConsent"
            onChange={onStarted}
          />
          <span>Send me resources and product updates from portals. Unsubscribe anytime.</span>
        </label>
        </>
      ) : null}
      <input
        className="absolute -left-[10000px] h-px w-px"
        tabIndex={-1}
        autoComplete="off"
        name="companyFax"
        aria-hidden="true"
      />
    </div>
  )
}

export function NoScriptLeadFallback() {
  return (
    <noscript>
      <style>{'.js-lead-submit{display:none!important}'}</style>
      <p className="t-p-sm-sans text-white">
        This request form needs javascript to deliver and record the next step. you can still{' '}
        <a className="underline underline-offset-4" href="/workflow/ai-production-workflow-risks">
          Explore use cases
        </a>.
      </p>
    </noscript>
  )
}
