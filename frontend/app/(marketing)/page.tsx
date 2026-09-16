import type {Metadata} from 'next'
import {getPackageSpecifications} from '@/lib/package-specifications'
import {marketingMetadata} from '@/lib/seo'
import {VCS} from '@/views/vcs-current/a'

export const metadata: Metadata = marketingMetadata({
  title: 'Production memory for AI-native creative teams | portals',
  description:
    'portals preserves every version and creative decision behind your best assets, so your teams can build on previous work, deliver faster, and scale production.',
  path: '/',
  keywords: [
    'AI creative production',
    'production memory',
    'AI asset version control',
    'creative production repository',
    'campaign variant management',
  ],
})

export default async function HomePage() {
  const packageSpecifications = await getPackageSpecifications()

  return <VCS packageSpecifications={packageSpecifications} />
}
