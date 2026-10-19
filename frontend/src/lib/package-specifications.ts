import type { PackageSpecification } from '@/types/resource'
import {
  PACKAGE_SPECIFICATION_BY_SLUG_QUERY,
  PACKAGE_SPECIFICATIONS_QUERY,
} from '@/sanity/lib/queries'
import { sanityClient, sanityDocumentClient } from '@/sanity/lib/client'

export const PACKAGE_SPEC_SLUGS = {
  paidPilot: 'paid-pilot',
  productionTeam: 'production-team',
  studio: 'studio',
  enterprise: 'enterprise',
} as const

type PackageLimitKey = keyof NonNullable<PackageSpecification['limits']>

export function packageAnnualAmount(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.price?.annualAmount || null
}

export function packageOnboardingFee(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.price?.onboardingFee || null
}

export function packageAddOnSeatPrice(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.price?.addOnSeatPrice || null
}

export function packageAddOnSeatMax(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.limits?.addOnSeatsMax?.numericValue || null
}

export function packageInstallmentsAvailable(
  specification: PackageSpecification | undefined,
): boolean {
  return specification?.price?.installmentsAvailable || false
}

export function packageInstallmentSchedule(
  specification: PackageSpecification | undefined,
): NonNullable<PackageSpecification['price']>['installmentSchedule'] | null {
  return specification?.price?.installmentSchedule || null
}

export function findPackageSpecification(
  specifications: PackageSpecification[] | undefined,
  slug: string,
): PackageSpecification | undefined {
  return specifications?.find((specification) => specification.slug === slug)
}

export function packagePriceLabel(
  specification: PackageSpecification | undefined,
): string {
  const price = specification?.price
  if (!price?.displayValue) {
    console.warn('Package specification missing price display value', specification?.slug)
    return ''
  }
  return price.displayValue
}

export function packageOriginalPriceLabel(
  specification: PackageSpecification | undefined,
): string {
  const price = specification?.price
  if (!price?.discount?.discountDisplayValue) {
    return ''
  }
  return price.discount.discountDisplayValue
}

export function packageDiscountPercentage(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.price?.discount?.percentage || null
}

export function packageDiscountSlots(
  specification: PackageSpecification | undefined,
): number | null {
  return specification?.price?.discount?.limitedSlots || null
}

export function packageUrgencyMessage(
  specification: PackageSpecification | undefined,
): string {
  return specification?.price?.discount?.urgencyMessage || ''
}

export function packagePeriodLabel(
  specification: PackageSpecification | undefined,
): string {
  return specification?.price?.periodLabel || ''
}

export function packageLimitLabel(
  specification: PackageSpecification | undefined,
  key: PackageLimitKey,
): string {
  const limit = specification?.limits?.[key]?.displayValue
  if (!limit) {
    console.warn('Package specification missing limit', specification?.slug, key)
    return ''
  }
  return limit
}

export function packageMilestoneLabel(
  specification: PackageSpecification | undefined,
  labelIncludes: string,
): string {
  const needle = labelIncludes.toLowerCase()
  const milestone = specification?.milestones?.find((milestone) =>
    milestone.label.toLowerCase().includes(needle),
  )?.displayValue
  if (!milestone) {
    console.warn('Package specification missing milestone', specification?.slug, labelIncludes)
    return ''
  }
  return milestone
}

export function resolvePackageSpecValue(
  specification: PackageSpecification | undefined,
  valuePath: string | undefined,
): string {
  if (!specification || !valuePath) return ''

  const value = valuePath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, specification)

  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}

export function packagePricingFeatures(
  specification: PackageSpecification,
): string[] {
  return specification.features ?? []
}

export function packageTermDays(
  specification: PackageSpecification | undefined,
): number {
  const pilotPeriodLabel = packageMilestoneLabel(specification, 'pilot period')
  const numericValue = specification?.milestones?.find(
    (milestone) => milestone.label.toLowerCase().includes('pilot period')
  )?.numericValue
  return numericValue || 21
}

export async function getPackageSpecifications(): Promise<
  PackageSpecification[]
> {
  return sanityClient.fetch<PackageSpecification[]>(
    PACKAGE_SPECIFICATIONS_QUERY,
    {},
  )
}

export async function getPublishedPackageSpecifications(): Promise<
  PackageSpecification[]
> {
  return sanityDocumentClient.fetch<PackageSpecification[]>(
    PACKAGE_SPECIFICATIONS_QUERY,
  )
}

export async function getPublishedPackageSpecification(
  slug: string,
): Promise<PackageSpecification | null> {
  return sanityDocumentClient.fetch<PackageSpecification | null>(
    PACKAGE_SPECIFICATION_BY_SLUG_QUERY,
    { slug },
  )
}
