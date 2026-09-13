import type {Metadata} from 'next'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {ProductionMemoryPage} from '@/components/production-memory/ProductionMemoryPage'

export const metadata: Metadata = {
  title: 'Production Memory | Portals',
  description: 'Preserve the versions, context, decisions, and relationships behind valuable AI-generated creative work.',
  alternates: {canonical: '/production-memory'},
  openGraph: {title: 'Production Memory | Portals', description: 'Turn production memory into faster future production.', type: 'website'},
}

export default async function Page() {
  const context = await getKnownLeadContext()
  return <ProductionMemoryPage context={context}/>
}
