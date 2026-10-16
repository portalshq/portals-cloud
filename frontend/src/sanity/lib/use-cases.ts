import {cache} from 'react'
import type {UseCaseDocument} from '@/types/use-case'
import {sanityDocumentClient} from './client'
import {USE_CASES_QUERY, USE_CASE_BY_SLUG_QUERY} from './queries'

// `cache` dedupes the list fetch between the marketing layout (breadcrumb
// labels) and the page itself within one request.
export const getUseCases = cache(async (): Promise<UseCaseDocument[]> => {
  return sanityDocumentClient.fetch<UseCaseDocument[]>(USE_CASES_QUERY)
})

export async function getUseCase(slug: string): Promise<UseCaseDocument | null> {
  return sanityDocumentClient.fetch<UseCaseDocument | null>(USE_CASE_BY_SLUG_QUERY, {slug})
}
