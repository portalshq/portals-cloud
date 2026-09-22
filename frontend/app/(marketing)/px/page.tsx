import type {Metadata} from 'next'
import {PxLandingPage} from '@/components/px/PxLandingPage'
import {getPxTechnicalContent} from '@/lib/px-content'
import {canonical, marketingMetadata} from '@/lib/seo'

export const metadata: Metadata = marketingMetadata({
  title: 'px — the harness for AI creative work',
  description: 'px gives creators and AI agents persistent worlds, characters, scenes, and representations they can keep building on.',
  path: '/px',
  keywords: ['px protocol', 'AI film', 'AI creative', 'AI production tools', 'AI series', 'AI characters', 'create AI tv', '', 'AI creative tools', 'persistent characters', 'autonomous characters', 'AI creative agents'],
  image: '/px/opengraph-image',
})

export default async function PxPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'PX',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'macOS, Linux, Windows',
        url: canonical('/px'),
        description: 'Create and use persistent narrative entities across creative tools, formats, and AI workflows.',
        isAccessibleForFree: true,
        license: 'https://opensource.org/license/mit',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Portals', item: canonical('/') },
          { '@type': 'ListItem', position: 2, name: 'PX', item: canonical('/px') },
        ],
      },
    ],
  }

  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}} /><PxLandingPage content={await getPxTechnicalContent()} chrome="integrated" /></>
}
