import type {Metadata} from 'next'
import {marketingMetadata} from '@/lib/seo'
import {getUseCases} from '@/sanity/lib/use-cases'
import {UseCasesHub} from '@/components/production-memory/ProductionMemoryPage'

export const metadata: Metadata = marketingMetadata({
  title: 'AI production use cases | portals',
  description:
    'Explore the production workflows where preserved context, lineage, and approvals create measurable value — from variant control to character continuity.',
  path: '/use-cases',
  keywords: [
    'AI production use cases',
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
