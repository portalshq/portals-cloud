import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {CTAButton} from '@/components/CTAButton'
import {ResourceBody} from '@/components/resources/ResourceBody'
import {breadcrumbJsonLd, canonical, marketingMetadata} from '@/lib/seo'
import {getBlogPost, getBlogPosts} from '@/sanity/lib/blog'

export const dynamicParams = false

export async function generateStaticParams() {
  const posts = await getBlogPosts()
  return posts.map(({slug}) => ({slug}))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{slug: string}>
}): Promise<Metadata> {
  const {slug} = await params
  const post = await getBlogPost(slug)
  if (!post) return {}
  return marketingMetadata({
    title: post.seo?.metaTitle || `${post.title} | portals`,
    description: post.seo?.metaDescription || post.excerpt,
    path: `/blog/${slug}`,
    keywords: post.seo?.keywords?.length ? post.seo.keywords : post.tags,
    type: 'article',
    image: post.seo?.shareImageUrl || post.coverImageUrl,
    noIndex: post.seo?.noIndex,
    publishedTime: post.publishedAt,
    modifiedTime: post._updatedAt,
  })
}

function formatDate(value?: string) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', year: 'numeric'}).format(new Date(value))
  } catch {
    return null
  }
}

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const [post, posts] = await Promise.all([getBlogPost(slug), getBlogPosts()])
  if (!post) notFound()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const authorNames = post.authors?.map((a) => a.name).filter(Boolean)
  const related =
    post.relatedPosts?.length
      ? post.relatedPosts
      : posts.filter((item) => item.slug !== slug && item.cluster === post.cluster).slice(0, 3)
  const relatedFallback =
    related.length > 0 ? related : posts.filter((item) => item.slug !== slug).slice(0, 3)
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      url: canonical(`/blog/${slug}`),
      datePublished: post.publishedAt,
      dateModified: post._updatedAt,
      ...(authorNames?.length ? {author: authorNames.map((name) => ({'@type': 'Person', name}))} : {}),
      ...(post.coverImageUrl ? {image: [post.coverImageUrl]} : {}),
      isPartOf: {'@type': 'Blog', name: 'Portals blog', url: canonical('/blog')},
      publisher: {'@type': 'Organization', name: 'portals', url: siteUrl},
      mainEntityOfPage: canonical(`/blog/${slug}`),
    },
    breadcrumbJsonLd([
      {name: 'portals', path: '/'},
      {name: 'Blog', path: '/blog'},
      {name: post.title, path: `/blog/${slug}`},
    ]),
    ...(post.faqs?.length
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: post.faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {'@type': 'Answer', text: faq.answer},
            })),
          },
        ]
      : []),
  ]
  const published = formatDate(post.publishedAt)
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}} />
      <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-sms py-20 text-white">
        <a href="/" className="t-h3-sans !font-medium">
          portals
        </a>
        <a href="/blog" className="t-p-sans underline underline-offset-4">
          all articles
        </a>
      </header>
      <main className="ui-grid text-white">
        <section className="col-span-full max-w-4xl py-80">
          {post.cluster ? (
            <p className="t-p-sans uppercase tracking-[.16em] text-white/45">blog / {post.cluster}</p>
          ) : null}
          <h1 className="t-d2-sans mt-24">{post.title}</h1>
          <p className="t-p-lg-serif mt-32 text-white/80">{post.definition}</p>
          <p className="t-p-sans mt-24 text-white/45">
            {[published, authorNames?.join(', ')].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href="/assessment">Assess production workflow</CTAButton>
            <CTAButton href="/production-memory" appearance="plain">
              What is production memory
            </CTAButton>
          </div>
        </section>
        {post.keyTakeaways?.length ? (
          <section className="col-span-full max-w-4xl border-t border-white/15 py-40" aria-label="Key takeaways">
            <h2 className="t-h3-sans">Key takeaways</h2>
            <ul className="mt-24 list-disc space-y-12 pl-24 text-white/75">
              {post.keyTakeaways.map((takeaway) => (
                <li key={takeaway} className="t-p-sans leading-[1.55]">
                  {takeaway}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <article className="col-span-full max-w-4xl border-t border-white/15 py-40">
          <ResourceBody value={post.body} />
        </article>
        {post.faqs?.length ? (
          <section className="col-span-full max-w-4xl border-t border-white/15 py-40" aria-label="Frequently asked questions">
            <h2 className="t-h3-sans">Frequently asked questions</h2>
            <div className="mt-24 space-y-24">
              {post.faqs.map((faq) => (
                <div key={faq.question}>
                  <h3 className="t-p-sans font-medium text-white">{faq.question}</h3>
                  <p className="t-p-sans mt-12 leading-[1.6] text-white/70">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="col-span-full border-t border-white/15 py-fluid-[76,106]">
          <h2 className="t-d2-sans">Keep reading</h2>
          <div className="mt-32 grid gap-2 md:grid-cols-3">
            {relatedFallback.map((item) => (
              <a
                href={`/blog/${item.slug}`}
                key={item.slug}
                className="bg-white/10 p-24 hover:bg-white/15"
              >
                <h3 className="t-h3-sans">{item.title}</h3>
                <p className="t-p-sans mt-16 text-white/60">{item.excerpt}</p>
              </a>
            ))}
          </div>
          <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href="/blog">All articles</CTAButton>
            <CTAButton href="/assessment" appearance="plain">
              Assess your workflow
            </CTAButton>
            <CTAButton href="/paid-pilot" appearance="plain">
              Scope a production pilot
            </CTAButton>
          </div>
        </section>
      </main>
    </>
  )
}
