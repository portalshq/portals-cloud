import type {Metadata} from 'next'
import {CTAButton} from '@/components/CTAButton'
import {MarketingPageShell} from '@/components/marketing/MarketingPageShell'
import {breadcrumbJsonLd, canonical, marketingMetadata} from '@/lib/seo'
import {getBlogPosts} from '@/sanity/lib/blog'

export const metadata: Metadata = marketingMetadata({
  title: 'Blog on AI creative production infrastructure | portals',
  description:
    'Practical guides on production memory, AI asset management, provenance, lineage, versioning, reproducibility, and creative operations for AI-native creative teams.',
  path: '/blog',
  keywords: [
    'AI creative production',
    'production memory',
    'AI asset management',
    'AI asset provenance',
    'creative operations',
  ],
})

function formatDate(value?: string) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', year: 'numeric'}).format(new Date(value))
  } catch {
    return null
  }
}

export default async function Page() {
  const posts = await getBlogPosts()
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Portals blog — AI creative production infrastructure',
    itemListElement: posts.map((post, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: canonical(`/blog/${post.slug}`),
      name: post.title,
    })),
  }
  const structuredData = [
    itemList,
    breadcrumbJsonLd([
      {name: 'portals', path: '/'},
      {name: 'Blog', path: '/blog'},
    ]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}} />
      <MarketingPageShell
        eyebrow="blog"
        title="AI creative production, explained as infrastructure."
        lede="Production memory, asset provenance, lineage, versioning, reproducibility, and creative operations — written as citable references, not hot takes."
        sub="Start with production memory, then follow the cluster. Every article ends in the workflow assessment or paid pilot."
        primaryCta={{href: '/assessment', label: 'Assess production workflow'}}
        secondaryCta={{href: '/production-memory', label: 'What is production memory'}}
      >
        <div className="ui-grid pb-fluid-[76,106] text-white">
          <div className="col-span-full grid gap-2 md:grid-cols-2">
            {posts.map((post) => {
              const date = formatDate(post.publishedAt)
              return (
                <a
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="border border-white/15 bg-white/5 p-32 transition hover:bg-white/10"
                >
                  {post.cluster ? (
                    <p className="t-p-sans uppercase tracking-[.16em] text-white/45">{post.cluster}</p>
                  ) : null}
                  <h2 className="t-h3-sans mt-20">{post.title}</h2>
                  <p className="t-p-sans mt-16 text-white/65">{post.excerpt}</p>
                  <p className="t-p-sans mt-24 text-white/40">
                    {[date, post.tags?.[0]].filter(Boolean).join(' · ')}
                  </p>
                </a>
              )
            })}
          </div>
          {posts.length === 0 ? (
            <p className="t-p-sans col-span-full text-white/60">
              No published articles yet. Publish a <code>blogPostDocument</code> in Sanity to list it here — no code change needed.
            </p>
          ) : null}
          <div className="col-span-full mt-56 flex flex-wrap gap-16 border-t border-white/15 pt-40">
            <CTAButton href="/assessment">Assess production workflow</CTAButton>
            <CTAButton href="/use-cases" appearance="plain">
              Explore use cases
            </CTAButton>
          </div>
        </div>
      </MarketingPageShell>
    </>
  )
}
