import {getPublishedPackageSpecification, packageAnnualAmount, packageOnboardingFee, packageInstallmentSchedule} from '@/lib/package-specifications'
import {ProductionTeamCheckout} from '@/components/billing/ProductionTeamCheckout'

export const dynamic = 'force-dynamic'

export default async function ProductionTeamCheckoutPage() {
  const specification = await getPublishedPackageSpecification('production-team')
  if (!specification) return <main className="mx-auto min-h-screen max-w-3xl px-24 py-120 text-white">Production Team checkout is temporarily unavailable.</main>
  const schedule = packageInstallmentSchedule(specification)
  const installments = schedule?.count && schedule.interval
    ? {...schedule, count: schedule.count, interval: schedule.interval}
    : null
  return <ProductionTeamCheckout
    annualAmount={packageAnnualAmount(specification)}
    onboardingFee={packageOnboardingFee(specification)}
    installments={installments}
    currency={specification.price?.currency || 'USD'}
    billingNote={specification.price?.billingNote || ''}
  />
}
