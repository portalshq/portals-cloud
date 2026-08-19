import type {PackageSpecification} from '@/types/resource'
import {
  PACKAGE_SPECIFICATION_BY_SLUG_QUERY,
  PACKAGE_SPECIFICATIONS_QUERY,
} from '@/sanity/lib/queries'
import {sanityClient, sanityDocumentClient} from '@/sanity/lib/client'

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
  return specification?.price?.displayValue || '$5,000'
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
  const defaultValues: Partial<Record<PackageLimitKey, string>> = {
    productionTeams: '1',
    activeWorkflows: '1',
    historicalProjects: '1',
    participants: 'up to 5',
    productionMembers: '5',
    activeRepositories: '3',
    workspaces: 'multiple',
    reviewersGuests: 'unlimited',
  }
  return specification?.limits?.[key]?.displayValue || defaultValues[key] || ''
}

export function packageMilestoneLabel(
  specification: PackageSpecification | undefined,
  labelIncludes: string,
): string {
  const needle = labelIncludes.toLowerCase()
  const defaultValues: Record<string, string> = {
    'pilot period': '21 days',
    'first value': '48 hours',
    'annual-credit decision window': '14 days',
  }
  return (
    specification?.milestones?.find((milestone) =>
      milestone.label.toLowerCase().includes(needle),
    )?.displayValue || defaultValues[needle] || ''
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
    {
      next: {
        revalidate: 3600,
        tags: ['package-specifications'],
      },
    },
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
    {slug},
  )
}
