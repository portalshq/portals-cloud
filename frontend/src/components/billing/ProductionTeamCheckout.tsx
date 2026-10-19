'use client'

import {useState} from 'react'
import {useRouter} from 'next/navigation'

type Installments = {count: number; interval: string; firstPaymentIncludesOnboarding?: boolean; surcharge?: number} | null

function money(amount: number | null, currency: string) {
  if (amount === null) return ''
  return new Intl.NumberFormat('en-US', {style: 'currency', currency, maximumFractionDigits: 0}).format(amount)
}

export function ProductionTeamCheckout({annualAmount, onboardingFee, installments, currency, billingNote}: {
  annualAmount: number | null
  onboardingFee: number | null
  installments: Installments
  currency: string
  billingNote: string
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

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-24 py-120 text-white">
    <p className="t-p-sm-sans uppercase tracking-wider text-white/65">Production Team</p>
    <h1 className="mt-12 t-d2-sans">Choose how to pay</h1>
    <p className="mt-20 t-p-lg-serif text-white/80">{billingNote}</p>
    <div className="mt-32 grid gap-12 sm:grid-cols-2">
      <button type="button" onClick={() => setCadence('annual')} aria-pressed={cadence === 'annual'} className="rounded border border-white/40 p-20 text-left aria-pressed:bg-white/15">
        <span className="block t-h3-sans">Annual payment</span>
        <span className="mt-8 block t-p-sans">{money(annualAmount, currency)} for the annual term</span>
      </button>
      {installments ? <button type="button" onClick={() => setCadence('quarterly')} aria-pressed={cadence === 'quarterly'} className="rounded border border-white/40 p-20 text-left aria-pressed:bg-white/15">
        <span className="block t-h3-sans">{installments.interval === 'quarter' ? 'Quarterly' : `${installments.interval}ly`} installments</span>
        <span className="mt-8 block t-p-sans">{money(annualAmount === null ? null : annualAmount / installments.count, currency)} × {installments.count} over the annual term</span>
      </button> : null}
    </div>
    {onboardingFee ? <p className="mt-20 t-p-sans">One-time onboarding: {money(onboardingFee, currency)}{installments?.firstPaymentIncludesOnboarding && cadence === 'quarterly' ? ' — included in the first payment' : ''}.</p> : null}
    <button type="button" disabled={busy} onClick={() => void checkout()} className="mt-28 w-fit rounded border border-white/70 px-20 py-12 disabled:opacity-50">{busy ? 'Opening checkout…' : 'Continue to secure checkout'}</button>
    {error ? <p role="alert" className="mt-16 text-red-200">{error}</p> : null}
  </main>
}
