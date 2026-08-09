import type {ResourceDocument} from '@/types/resource'
import {RESOURCE_BY_SLUG_QUERY, RESOURCE_SLUGS_QUERY} from './queries'
import {sanityClient, sanityDocumentClient} from './client'

export async function getResourceDocument(
  slug: string,
): Promise<ResourceDocument | null> {
  return sanityClient.fetch<ResourceDocument | null>(
    RESOURCE_BY_SLUG_QUERY,
    {slug},
    {
      next: {
        revalidate: 3600,
        tags: [`resource:${slug}`, 'resources'],
      },
    },
  )
}

export async function getPublishedResourceForPdf(
  slug: string,
): Promise<ResourceDocument | null> {
  return sanityDocumentClient.fetch<ResourceDocument | null>(
    RESOURCE_BY_SLUG_QUERY,
    {slug},
  )
}

export async function getResourceSlugs(): Promise<Array<{slug: string}>> {
  return sanityDocumentClient.fetch<Array<{slug: string}>>(
    RESOURCE_SLUGS_QUERY,
  )
}
