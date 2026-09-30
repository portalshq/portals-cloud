import type {Metadata} from 'next'
import {marketingMetadata} from '@/lib/seo'
import {getUseCases} from '@/sanity/lib/use-cases'
import {UseCasesHub} from '@/components/production-memory/ProductionMemoryPage'

export const metadata: Metadata = marketingMetadata({
  title: 'AI Creative Production Use Cases & Workflows | portals',
  description:
    'AI creative production workflows where preserved lineage and approvals pay off: asset retrieval, variant control, reproducibility, continuity, and handoffs.',
  path: '/use-cases',
  keywords: [
    'AI production use cases',
    'AI creative production workflow',
    'AI creative workflow software',
    'AI asset version control',
    'AI asset provenance',
    'AI creative handoff',
    'AI character consistency workflow',
    'campaign variant control',
    'approved version control',
    'character continuity',
    'production handoff',
  ],
})

export default async function Page() {
  const useCases = await getUseCases()
  return <UseCasesHub useCases={useCases} />
}
