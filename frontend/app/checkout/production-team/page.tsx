import type {Metadata} from 'next'
import {getPublishedPackageSpecification, packageAnnualAmount, packageOnboardingFee, packageInstallmentSchedule, packagePricingFeatures} from '@/lib/package-specifications'
import {ProductionTeamCheckout} from '@/components/billing/ProductionTeamCheckout'

const checkoutTitle = 'Production Team | Checkout | Production memory for creative teams'
const checkoutDescription = 'Review the Production Team package for production memory for creative teams, compare payment options, and continue to secure checkout.'

export const metadata: Metadata = {
  title: checkoutTitle,
  description: checkoutDescription,
  keywords: ['Production Team', 'production memory', 'creative production teams', 'checkout'],
  robots: 'noindex, nofollow',
  openGraph: {
    title: checkoutTitle,
    description: checkoutDescription,
    type: 'website',
    url: '/checkout/production-team',
  },
  twitter: {
    card: 'summary',
    title: checkoutTitle,
    description: checkoutDescription,
  },
}

export const dynamic = 'force-dynamic'

export default async function ProductionTeamCheckoutPage() {
  const specification = await getPublishedPackageSpecification('production-team')
  if (!specification) return <main className="mx-auto min-h-screen max-w-3xl px-24 py-120 text-white">Production Team checkout is temporarily unavailable.</main>
  const allFeatures = packagePricingFeatures(specification)
  const condensedFeatureSources = allFeatures
    .map((feature, index) => ({feature, index}))
    .filter(({feature, index}) => index >= 6 && /standard/i.test(feature))
  const condensedFeatureKinds = [
    /shar(?:e|ing)/i,
    /integrat/i,
    /support/i,
  ]
  const condensedFeatureIndexes = condensedFeatureKinds.map((pattern) =>
    condensedFeatureSources.find(({feature}) => pattern.test(feature))?.index,
  )
  const hasCondensedStandardFeatures = condensedFeatureIndexes.every(
    (index) => index !== undefined,
  )
  const condensedFeatureStart = Math.min(
    ...condensedFeatureIndexes.filter((index): index is number => index !== undefined),
  )
  const features = allFeatures.flatMap((feature, index) => {
    if (hasCondensedStandardFeatures && index === condensedFeatureStart) {
      return ['Standard sharing, integrations, and support']
    }
    if (hasCondensedStandardFeatures && condensedFeatureIndexes.includes(index)) return []
    return index < 6 || feature.toLowerCase().includes('onboarding') ? [feature] : []
  })
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
    packageName={specification.name}
    overview={specification.subtitle || ''}
    packagePrice={specification.price?.displayValue || ''}
    periodLabel={specification.price?.periodLabel || ''}
    banner={specification.banner || ''}
    microcopy={specification.microcopy || ''}
    features={features}
    legalNote={specification.legalNote || ''}
  />
}
