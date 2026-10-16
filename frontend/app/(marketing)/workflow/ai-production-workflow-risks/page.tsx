import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { marketingMetadata } from '@/lib/seo'
import { getResourceDocument } from '@/sanity/lib/resources'
import {getKnownLeadContext} from '@/lib/leads/profile'
import { ResourceBriefClient } from './client'

const SLUG = 'ai-production-workflow-risks'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const document = await getResourceDocument(SLUG)
  if (!document) return {}

  return marketingMetadata({
    title: document.seo?.metaTitle || 'AI Production Workflow Risks for Creative Teams | portals',
    description:
      document.seo?.metaDescription ||
      'The hidden risks in AI creative production workflows (lost prompts, unrecoverable versions, rework, handoff gaps) and how production memory reduces them.',
    path: document.seo?.canonicalPath || '/workflow/ai-production-workflow-risks',
    keywords: document.seo?.keywords ?? [
      'AI production workflow',
      'AI creative production workflow',
      'AI asset version control',
      'AI generation history',
      'reproduce AI-generated assets',
      'AI creative handoff',
      'AI character consistency',
    ],
    type: 'article',
    image: document.seo?.shareImageUrl,
    shareTitle: document.seo?.shareTitle,
    shareDescription: document.seo?.shareDescription,
    noIndex: document.seo?.noIndex,
    publishedTime: document.publishedAt,
    modifiedTime: document._updatedAt,
  })
}

export default async function ResourceBriefPage() {
  const [document, context] = await Promise.all([
    getResourceDocument(SLUG),
    getKnownLeadContext(),
  ])
  if (!document) notFound()

  return <ResourceBriefClient document={document} context={context} />
}
