import type {Metadata} from 'next'
import {UseCasesHub} from '@/components/production-memory/ProductionMemoryPage'

export const metadata: Metadata = {
  title: 'AI Production Use Cases | Portals',
  description: 'Explore the production workflows where preserved context, lineage, and approvals create measurable value.',
  alternates: {canonical: '/use-cases'},
  openGraph: {title: 'AI Production Use Cases | Portals', description: 'Explore production-memory use cases.', type: 'website'},
}

export default function Page() { return <UseCasesHub/> }
