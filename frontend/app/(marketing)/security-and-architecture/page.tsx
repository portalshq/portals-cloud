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
    title: document.seo?.metaTitle || 'AI Production Security & Architecture | portals',
    description:
      document.seo?.metaDescription ||
      'How Portals secures AI creative production data: workspace isolation, access control, permissions, encryption, retention, and architecture.',
    path: document.seo?.canonicalPath || '/security-and-architecture',
    keywords: document.seo?.keywords ?? [
      'AI production security',
      'AI creative production data security',
      'AI asset management security',
      'AI production repository security',
      'AI data handling',
    ],
    type: 'article',
    image: document.seo?.shareImageUrl,
    shareTitle: document.seo?.shareTitle,
    shareDescription: document.seo?.shareDescription,
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
