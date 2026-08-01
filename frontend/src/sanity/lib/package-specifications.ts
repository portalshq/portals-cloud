import type {PackageSpecification} from '@/types/resource'
import {
  PACKAGE_SPECIFICATION_BY_SLUG_QUERY,
  PACKAGE_SPECIFICATIONS_QUERY,
} from './queries'
import {sanityClient, sanityDocumentClient} from './client'

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
