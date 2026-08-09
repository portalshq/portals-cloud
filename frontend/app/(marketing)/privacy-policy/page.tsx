import {notFound} from 'next/navigation'
import {LegalDocumentView} from '@/views/legal-document'
import {getLegalDocument} from '@/sanity/lib/legal'

export default async function PrivacyPage() {
  const document = await getLegalDocument('privacyPolicy')

  if (!document) notFound()

  return <LegalDocumentView document={document} />
}
