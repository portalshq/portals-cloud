import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getResourceDocument } from '@/sanity/lib/resources'
import {getKnownLeadContext} from '@/lib/leads/profile'
import { ResourceBriefClient } from './client'

const SLUG = 'ai-production-workflow-risks'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const document = await getResourceDocument(SLUG)
  if (!document) return {}

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const canonicalPath = '/ai-production-workflow-risks'

  return {
    title: document.seo?.metaTitle || document.title,
    description: document.seo?.metaDescription || document.abstract,
    keywords: document.seo?.keywords,
    alternates: { canonical: new URL(canonicalPath, siteUrl) },
    robots: document.seo?.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article',
      title: document.seo?.shareTitle || document.seo?.metaTitle || document.title,
      description: document.seo?.shareDescription || document.seo?.metaDescription || document.abstract,
    },
  }
}

export default async function ResourceBriefPage() {
  const [document, context] = await Promise.all([
    getResourceDocument(SLUG),
    getKnownLeadContext(),
  ])
  if (!document) notFound()

  return <ResourceBriefClient document={document} context={context} />
}
