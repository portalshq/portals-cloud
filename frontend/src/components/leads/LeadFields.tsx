'use client'

import type {ChangeEvent, ReactNode} from 'react'
import {CTAButton} from '@/components/CTAButton'
import {LeadCheckbox, LeadSelectField, LeadTextField} from '@/components/mui/fields'
import type {KnownLeadContext, LeadIdentity} from '@/lib/leads/contracts'
import {publicEmailNeedsWebsite, resetKnownProfile} from '@/lib/leads/client'
import type {PrefilledIdentity} from '@/lib/leads/identity-prefill'
import {ConditionalReveal} from './ConditionalReveal'
import type {UrlParams} from '@/lib/leads/url-params'
import { cn } from '@/lib/utils'

export function LeadField({
  label,
  name,
  children,
  className
}: {
  label: string
  name: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("block t-p-sm-sans text-white", className)}>
      <label htmlFor={name}>{label}</label>
      {children}
    </div>
  )
}

export function KnownProfileNotice({
  identity,
  onReset,
}: {
  identity?: Partial<LeadIdentity>
  onReset?: () => void | Promise<void>
}) {
  const summary = [identity?.name, identity?.email, identity?.company]
    .filter(Boolean)
    .join(' · ')
  if (!summary) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-12 rounded-sm bg-white/8 px-14 py-12 sm:col-span-2">
      <p className="t-p-sm-sans text-white">{summary}</p>
      <CTAButton
        type="button"
        appearance="plain"
        className="!min-w-0 underline underline-offset-4"
        onClick={async () => {
          if (onReset) {
            await onReset()
            return
          }
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
  prefilledIdentity,
  email,
  onEmailChange,
  requireWebsite,
  onStarted,
  urlParams = {},
}: {
  context: KnownLeadContext
  prefilledIdentity: PrefilledIdentity
  email: string
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void
  requireWebsite: boolean
  onStarted: () => void
  urlParams?: UrlParams
}) {
  const grouped = new Set(prefilledIdentity.fields)
  const groupedEmail = prefilledIdentity.identity.email
  const websiteRequired = Boolean(
    requireWebsite ||
      context.requiresWebsite ||
      (groupedEmail && publicEmailNeedsWebsite(groupedEmail)),
  )
  return (
    <>
      <KnownProfileNotice identity={prefilledIdentity.identity} />
      {!grouped.has('name') ? (
        <LeadField label="name *" name="name">
          <LeadTextField
            id="name"
            name="name"
            autoComplete="name"
            required
            onChange={onStarted}
            placeholder="your name"
            defaultValue={urlParams.name || ''}
          />
        </LeadField>
      ) : null}
      {!grouped.has('email') ? (
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
      {!grouped.has('company') ? (
        <LeadField label="company *" name="company">
          <LeadTextField
            id="company"
            name="company"
            autoComplete="organization"
            required
            onChange={onStarted}
            placeholder="company name"
            defaultValue={urlParams.company || ''}
          />
        </LeadField>
      ) : null}
      {!grouped.has('role') ? (
        <LeadField label="role *" name="role">
          <LeadSelectField
            id="role"
            name="role"
            required
            defaultValue={urlParams.role || ''}
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
      {!grouped.has('website') ? (
        <ConditionalReveal active={websiteRequired}>
          <LeadField label="company website *" name="website">
            <LeadTextField
              id="website"
              name="website"
              type="url"
              autoComplete="url"
              required={websiteRequired}
              onChange={onStarted}
              placeholder="company.com"
              defaultValue={urlParams.website || ''}
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
  marketingDefaultChecked = false,
}: {
  onStarted: () => void
  showMarketing?: boolean
  marketingDefaultChecked?: boolean
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
            defaultChecked={marketingDefaultChecked}
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
        <a className="underline underline-offset-4" href="/use-cases">
          Explore use cases
        </a>.
      </p>
    </noscript>
  )
}
