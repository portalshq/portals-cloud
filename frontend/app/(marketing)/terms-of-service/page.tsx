import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {LegalDocumentView} from '@/views/legal-document'
import {marketingMetadata} from '@/lib/seo'
import {getLegalDocument} from '@/sanity/lib/legal'

export const metadata: Metadata = marketingMetadata({
  title: 'Terms of service | portals',
  description: 'The terms governing use of portals products, pilots, and services.',
  path: '/terms-of-service',
})

export default async function TermsPage() {
  const document = await getLegalDocument('termsOfService')

  if (!document) notFound()

  return <LegalDocumentView document={document} />
}
