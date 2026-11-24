'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAttribution, trackEvent } from '@/lib/leads/analytics-client'

type FormStep = 'subscribe' | 'confirmed'

/** Collects all UTM params, extended tracking fields, and first/last touch data. */
function collectTrackingPayload(): Record<string, string> {
  const params = new URLSearchParams(window.location.search)

  // Current (last-touch) UTMs
  const utm_source = params.get('utm_source') || ''
  const utm_medium = params.get('utm_medium') || ''
  const utm_campaign = params.get('utm_campaign') || ''
  const utm_content = params.get('utm_content') || ''
  const utm_term = params.get('utm_term') || ''

  // Extended tracking params
  const content_id = params.get('content_id') || ''
  const product = params.get('product') || ''
  const topic = params.get('topic') || ''
  const placement = params.get('placement') || ''
  const cta = params.get('cta') || ''

  // Referrer and landing page
  const referrer = document.referrer.slice(0, 500)
  const landing_page = `${window.location.pathname}${window.location.search}`.slice(0, 500)

  // First-touch from localStorage (captured on initial site visit)
  let firstTouch: Record<string, string> = {}
  try {
    const stored = window.localStorage.getItem('portals_first_touch')
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>
      firstTouch = {
        first_touch_source: parsed.utmSource || '',
        first_touch_medium: parsed.utmMedium || '',
        first_touch_campaign: parsed.utmCampaign || '',
        first_touch_content: parsed.utmContent || '',
        first_touch_term: parsed.utmTerm || '',
        first_touch_landing_page: parsed.sourcePage || '',
      }
    }
  } catch {
    // localStorage unavailable or corrupt — continue without first-touch data
  }

  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referrer,
    landing_page,
    content_id,
    product,
    topic,
    placement,
    cta,
    signup_ts: new Date().toISOString(),
    ...firstTouch,
  }
}

export function NewsletterForm() {
  const [step, setStep] = useState<FormStep>('subscribe')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedRef = useRef<HTMLDivElement>(null)
  const idempotencyKey = useMemo(
    () => `newsletter:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`,
    [],
  )

  // Track form start
  const started = useRef(false)
  function onStarted() {
    if (started.current) return
    started.current = true
    void trackEvent('form_started', { form_name: 'newsletter' })
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setErrorMessage('')

    const tracking = collectTrackingPayload()

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          ...tracking,
        }),
      })
      const result = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'subscription failed')
      }

      void trackEvent('newsletter_subscribed', {
        form_name: 'newsletter',
        email_domain: email.split('@')[1] || '',
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        landing_page: tracking.landing_page,
      })

      setStep('confirmed')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'please try again')
      setStatus('error')
    }
  }

  // After step transition, focus the confirmation for screen readers
  useEffect(() => {
    if (step === 'confirmed') confirmedRef.current?.focus()
  }, [step])

  if (step === 'confirmed') {
    return (
      <div
        ref={confirmedRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col items-start gap-y-16 w-full max-w-[360px] animate-in slide-in-from-bottom-6 fade-in duration-500"
        style={{ minHeight: 300 }}
      >
        <h1 className="t-h3-sans text-white font-medium">You're on the list.</h1>
        <p className="t-p-sm-sans text-white max-w-[32em]">
          The first issue lands the first week of December. Check your email for a confirmation message.
        </p>
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col justify-center items-start gap-y-16 w-full max-w-[480px]"
      style={{ minHeight: 300 }}
      onFocus={onStarted}
      onSubmit={onSubmit}
    >
      <h1 className="t-h3-sans text-white font-medium">The next era of entertainment, measured.</h1>
      <p className="t-p-sm-sans text-white max-w-[32em]">
        A monthly issue on interactive entertainment, emerging consumer behavior,
        and the economics of fanship. Original research, industry takes, and
        experiments in building formats people return to. 
      </p>
      <p className="t-p-sm-sans text-white">Subscribe to the monthly newsletter.</p>

      <div className="w-full flex flex-col gap-y-6">
        <label htmlFor="newsletter-name" className="t-p-sm-sans text-white text-sm">
          name
        </label>
        <input
          id="newsletter-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full h-48 px-16 bg-transparent border border-white  rounded-sm text-white t-p-sm-sans placeholder:text-white/50 outline-none focus:border-white transition-colors"
        />
      </div>

      <div className="w-full flex flex-col gap-y-6">
        <label htmlFor="newsletter-email" className="t-p-sm-sans text-white text-sm">
          email
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="your@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full h-48 px-16 bg-transparent border border-white  rounded-sm text-white t-p-sm-sans placeholder:text-white/50 outline-none focus:border-white transition-colors"
        />
      </div>

      {status === 'error' ? (
        <p role="alert" className="t-p-sm-sans text-red-400">{errorMessage}</p>
      ) : null}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="h-52 px-36 self-center rounded-full bg-[#7C3AED] text-white t-p-sm-sans cursor-pointer transition-opacity opacity-90 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'submitting' ? 'Subscribing...' : 'Subscribe'}
      </button>
    </form>
  )
}

