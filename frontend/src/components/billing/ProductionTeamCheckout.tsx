'use client'

import {useState} from 'react'
import {useRouter} from 'next/navigation'
import { CTAButton } from '../CTAButton';

type Installments = {count: number; interval: string; firstPaymentIncludesOnboarding?: boolean; surcharge?: number} | null

function money(amount: number | null, currency: string) {
  if (amount === null) return ''
  return new Intl.NumberFormat('en-US', {style: 'currency', currency, maximumFractionDigits: 0}).format(amount)
}

export function ProductionTeamCheckout({annualAmount, onboardingFee, installments, currency, billingNote, packageName, overview, packagePrice, periodLabel, banner, microcopy, features, legalNote}: {
  annualAmount: number | null
  onboardingFee: number | null
  installments: Installments
  currency: string
  billingNote: string
  packageName: string
  overview: string
  packagePrice: string
  periodLabel: string
  banner: string
  microcopy: string
  features: string[]
  legalNote: string
}) {
  const router = useRouter()
  const [cadence, setCadence] = useState<'annual' | 'quarterly'>('annual')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function checkout() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/stripe/checkout/production-team', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({billingCadence: cadence}),
      })
      const result = await response.json()
      if (response.status === 401) {
        router.push(`/auth/sign-in?next=${encodeURIComponent('/checkout/production-team')}`)
        return
      }
      if (!response.ok || !result.url) throw new Error(result.message || 'Checkout could not be started.')
      window.location.assign(result.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Checkout could not be started.')
      setBusy(false)
    }
  }

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-24 py-24 text-white">
    <h1 className="t-p-lg-sans">Checkout</h1>
    <section aria-labelledby="package-overview" className="mb-40">
      <div className="flex flex-wrap items-center gap-12">
        <h2 id="package-overview" className="mt-12 t-h1-sans">{packageName}</h2>
        {banner ? <span className="rounded border border-white/50 px-12 py-6 t-p-sm-sans">{banner}</span> : null}
      </div>
      {overview ? <p className="mt-12 t-p-sm-sans">{overview}</p> : null}
      <p className="mt-16 t-p-sm-sans lowercase"><span className="t-h3-sans">{packagePrice}</span>{periodLabel ? ` ${periodLabel}` : ''}{billingNote ? `, ${billingNote}` : ''}</p>
      {microcopy ? <p className="mt-8 t-p-sm-sans">{microcopy}</p> : null}
      {features.length ? <ul className="mt-20 space-y-8">
        {features.map((feature) => <li key={feature} className="flex gap-8 t-p-sm-sans"><span aria-hidden="true">+</span><span>{feature}</span></li>)}
      </ul> : null}
      {legalNote ? <p className="mt-16 t-p-sm-sans">{legalNote}</p> : null}
    </section>
    <div className="grid gap-12 sm:grid-cols-2">
      <button type="button" onClick={() => setCadence('annual')} aria-pressed={cadence === 'annual'} className="rounded border border-white/50 p-20 text-left hover:bg-white/5 duration-100 aria-pressed:bg-white/25 cursor-pointer">
        <span className="block t-h3-sans">Annual payment</span>
        <span className="mt-8 block t-p-sm-sans">{money(annualAmount, currency)} for the annual term</span>
        {onboardingFee ? <span className="mt-8 block t-p-sm-sans">+ one-time onboarding fee: {money(onboardingFee, currency)}</span> : null}
      </button>
      {installments ? <button type="button" onClick={() => setCadence('quarterly')} aria-pressed={cadence === 'quarterly'} className="rounded border border-white/50 p-20 text-left hover:bg-white/5 duration-100 aria-pressed:bg-white/25 cursor-pointer">
        <span className="block t-h3-sans">{installments.interval === 'quarter' ? 'Quarterly' : `${installments.interval}ly`} installments</span>
        <span className="mt-8 block t-p-sm-sans">{money(annualAmount === null ? null : annualAmount / installments.count, currency)} × {installments.count} over the annual term</span>
        {onboardingFee ? <span className="mt-8 block t-p-sm-sans">+ one-time onboarding fee: {money(onboardingFee, currency)}{installments.firstPaymentIncludesOnboarding ? ' (included in first payment)' : ''}</span> : null}
      </button> : null}
    </div>
    <CTAButton disabled={busy} onClick={() => void checkout()} className="mt-28 w-fit rounded border border-white/70 px-20 py-12 disabled:opacity-50 t-p-sm-sans">{busy ? 'Opening checkout…' : 'Continue to secure checkout'}</CTAButton>
    {error ? <p role="alert" className="mt-16 text-red-200">{error}</p> : null}
  </main>
}
