import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {SecurityArchitectureLandingPage} from '@/components/resources/SecurityArchitectureLandingPage'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {marketingMetadata} from '@/lib/seo'
import {getResourceDocument} from '@/sanity/lib/resources'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const document = await getResourceDocument('security-and-architecture')
  if (!document) return {}
  return marketingMetadata({
    title: document.seo?.metaTitle || 'Security and architecture | portals',
    description:
      document.seo?.metaDescription ||
      'How portals handles security, access control, and architecture for creative production repositories.',
    path: '/security-and-architecture',
    keywords: document.seo?.keywords ?? ['AI production security', 'creative asset security'],
    type: 'article',
    image: document.seo?.shareImageUrl,
    publishedTime: document.publishedAt,
    modifiedTime: document._updatedAt,
  })
}

export default async function SecurityPage() {
  const [document, context] = await Promise.all([
    getResourceDocument('security-and-architecture'),
    getKnownLeadContext(),
  ])
  if (!document || document.landingPage?.enabled === false) notFound()
  return <SecurityArchitectureLandingPage document={document} context={context} />
}
