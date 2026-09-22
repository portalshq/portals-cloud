import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {LegalDocumentView} from '@/views/legal-document'
import {marketingMetadata} from '@/lib/seo'
import {getLegalDocument} from '@/sanity/lib/legal'

export const metadata: Metadata = marketingMetadata({
  title: 'Privacy policy | portals',
  description: 'How portals collects, uses, and protects data across the production repository and marketing site.',
  path: '/privacy-policy',
})

export default async function PrivacyPage() {
  const document = await getLegalDocument('privacyPolicy')

  if (!document) notFound()

  return <LegalDocumentView document={document} />
}
