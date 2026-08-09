import type {PackageSpecification} from '@/types/resource'

export const PACKAGE_SPEC_SLUGS = {
  paidPilot: 'paid-pilot',
  productionTeam: 'production-team',
  studio: 'studio',
  enterprise: 'enterprise',
} as const

type PackageLimitKey = keyof NonNullable<PackageSpecification['limits']>

export function findPackageSpecification(
  specifications: PackageSpecification[] | undefined,
  slug: string,
): PackageSpecification | undefined {
  return specifications?.find((specification) => specification.slug === slug)
}

export function packagePriceLabel(
  specification: PackageSpecification | undefined,
): string {
  return specification?.price?.displayValue || ''
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
  return specification?.limits?.[key]?.displayValue || ''
}

export function packageMilestoneLabel(
  specification: PackageSpecification | undefined,
  labelIncludes: string,
): string {
  const needle = labelIncludes.toLowerCase()
  return (
    specification?.milestones?.find((milestone) =>
      milestone.label.toLowerCase().includes(needle),
    )?.displayValue || ''
  )
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
