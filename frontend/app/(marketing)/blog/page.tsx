import type { Metadata } from 'next'
import { CTAButton } from '@/components/CTAButton'
import { MarketingPageShell } from '@/components/marketing/MarketingPageShell'
import { breadcrumbJsonLd, canonical, marketingMetadata } from '@/lib/seo'
import { getBlogPosts } from '@/sanity/lib/blog'

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
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
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
      { name: 'portals', path: '/' },
      { name: 'Blog', path: '/blog' },
    ]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <MarketingPageShell
        title="AI Creative Production Blog"
        lede="Cited references on production memory in creative operations, not hot takes."
        primaryCta={{ href: '/assessment', label: 'Assess my production workflow' }}
        secondaryCta={{ href: '/production-memory', label: 'What is production memory' }}
      >
        <div className="max-w-6xl mx-auto ui-grid py-fluid-[76,106] pt-0 text-white">
          <div className="col-span-full grid gap-[4px]">
            {posts.map((post) => {
              const date = formatDate(post.publishedAt)
              return (
                <a
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="bg-white/10 duration-200 hover:bg-white/15 p-32 rounded-sm transition-all group"
                >
                  <div className='max-w-5xl mx-auto'>
                    {post.cluster ? (
                      <p className="t-p-sm-sans uppercase text-base tracking-[0.05em] text-white">{post.cluster.replace("-", " ")}</p>
                    ) : null}
                    <h2 className="t-h3-sans mt-12">{post.title}</h2>
                    <p className="t-p-sm-sans mt-16">
                      {date} <span className="ml-5 group-hover:underline decoration-2 underline-offset-4">Read more</span>
                    </p>
                    <p className="t-p-sm-sans mt-24">{post.excerpt}</p>
                    {/* <p className="t-p-sm-sans mt-12">
                      {[...(post.tags || [])].filter(Boolean).join(' · ')}
                    </p> */}
                  </div>
                </a>
              )
            })}
          </div>
          {posts.length === 0 ? (
            <p className="t-p-sans col-span-full">
              No published articles yet. Publish a <code>blog post document</code>.
            </p>
          ) : null}
          <div className="col-span-full mt-56 flex flex-wrap gap-16 border-t border-white/15 pt-40">
            <CTAButton href="/use-cases" appearance="plain">
              Explore use cases
            </CTAButton>
            <CTAButton href="/assessment">Assess production workflow</CTAButton>
          </div>
        </div>
      </MarketingPageShell>
    </>
  )
}
