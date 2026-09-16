import type {Metadata} from 'next'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {marketingMetadata} from '@/lib/seo'
import {getUseCases} from '@/sanity/lib/use-cases'
import {ProductionMemoryPage} from '@/components/production-memory/ProductionMemoryPage'

export const metadata: Metadata = marketingMetadata({
  title: 'Production memory | portals',
  description:
    'Preserve the versions, context, decisions, and relationships behind valuable AI-generated creative work — and reuse them for faster future production.',
  path: '/production-memory',
  keywords: [
    'production memory',
    'AI asset version control',
    'creative production repository',
    'asset lineage',
    'creative operations',
  ],
})

export default async function Page() {
  const [context, useCases] = await Promise.all([getKnownLeadContext(), getUseCases()])
  return <ProductionMemoryPage context={context} useCases={useCases} />
}
