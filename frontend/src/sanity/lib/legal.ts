import type {LegalDocument} from '@/types/resource'
import {LEGAL_DOCUMENT_BY_TYPE_QUERY} from './queries'
import {sanityClient} from './client'

export async function getLegalDocument(
  documentType: LegalDocument['documentType'],
): Promise<LegalDocument | null> {
  return sanityClient.fetch<LegalDocument | null>(
    LEGAL_DOCUMENT_BY_TYPE_QUERY,
    {documentType},
    {
      next: {
        revalidate: 3600,
        tags: [`legal:${documentType}`, 'legal'],
      },
    },
  )
}
