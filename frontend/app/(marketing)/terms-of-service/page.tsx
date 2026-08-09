import {notFound} from 'next/navigation'
import {LegalDocumentView} from '@/views/legal-document'
import {getLegalDocument} from '@/sanity/lib/legal'

export default async function TermsPage() {
  const document = await getLegalDocument('termsOfService')

  if (!document) notFound()

  return <LegalDocumentView document={document} />
}
