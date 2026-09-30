import type { Metadata } from 'next'
import { getKnownLeadContext } from '@/lib/leads/profile'
import { marketingMetadata } from '@/lib/seo'
import { getUseCases } from '@/sanity/lib/use-cases'
import { ProductionMemoryPage } from '@/components/production-memory/ProductionMemoryPage'
import { getResourceDocument } from '@/sanity/lib/resources'

export const metadata: Metadata = marketingMetadata({
  title: 'Production Memory: AI Creative Asset Management | portals',
  description:
    'Preserve approved versions, prompts, provenance, decisions, and lineage behind AI creative work, then recover and reuse it for faster production.',
  path: '/production-memory',
  keywords: [
    'production memory',
    'AI creative asset management',
    'AI-generated asset management',
    'generative AI asset management',
    'AI asset version control',
    'AI asset provenance',
    'AI asset lineage',
    'AI generation history',
    'AI prompt versioning',
  ],
})

export const dynamic = 'force-dynamic'

export default async function Page() {
  const SLUG = 'ai-production-workflow-risks'
  const [context, sanityDocument, useCases] = await Promise.all([getKnownLeadContext(), getResourceDocument(SLUG), getUseCases()])
  if (!sanityDocument) {
    return <ProductionMemoryPage context={context} sanityDocument={undefined} useCases={useCases} />
  }
  return <ProductionMemoryPage context={context} sanityDocument={sanityDocument} useCases={useCases} />
}
