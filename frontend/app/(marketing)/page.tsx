import type {Metadata} from 'next'
import {getPackageSpecifications} from '@/lib/package-specifications'
import {marketingMetadata, softwareApplicationJsonLd} from '@/lib/seo'
import {VCS} from '@/views/vcs-current/a'

export const metadata: Metadata = marketingMetadata({
  title: 'AI Creative Production Repository & Memory | portals',
  description:
    'Portals is the AI creative production repository preserving approved assets, versions, prompts, and provenance so teams reuse proven work and deliver faster.',
  path: '/',
  keywords: [
    'AI creative asset management',
    'AI-generated asset management',
    'AI creative production',
    'production memory',
    'AI production workflow',
    'generative AI asset management',
    'AI asset version control',
    'AI asset provenance',
    'AI prompt management',
    'AI production repository',
  ],
})

export default async function HomePage() {
  const packageSpecifications = await getPackageSpecifications()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(softwareApplicationJsonLd())}}
      />
      <VCS packageSpecifications={packageSpecifications} />
    </>
  )
}
