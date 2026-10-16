import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CTAButton } from '@/components/CTAButton'
import { breadcrumbJsonLd, canonical, marketingMetadata } from '@/lib/seo'
import { getUseCase, getUseCases } from '@/sanity/lib/use-cases'

export const dynamicParams = false

export async function generateStaticParams() {
  const useCases = await getUseCases()
  return useCases.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const useCase = await getUseCase(slug)
  if (!useCase) return {}
  return marketingMetadata({
    title: `${useCase.title} | portals`,
    description: useCase.outcome,
    path: `/use-cases/${slug}`,
    keywords: [useCase.title, 'production memory', 'AI production workflow'],
    type: 'article',
    modifiedTime: useCase._updatedAt,
  })
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [useCase, useCases] = await Promise.all([getUseCase(slug), getUseCases()])
  if (!useCase) notFound()
  const index = useCases.findIndex((item) => item.slug === slug)
  const related = useCases.filter((item) => item.slug !== slug).slice(0, 3)
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: useCase.title,
      description: useCase.outcome,
      url: canonical(`/use-cases/${slug}`),
      dateModified: useCase._updatedAt,
      isPartOf: { '@id': canonical('/#website') },
    },
    breadcrumbJsonLd([
      { name: 'portals', path: '/' },
      { name: 'Use cases', path: '/use-cases' },
      { name: useCase.title, path: `/use-cases/${slug}` },
    ]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <main className="ui-grid text-white">
        <section className="col-span-full flex flex-col lg:justify-between min-h-[100vh] py-fluid-[76,106]">
          <div className="max-w-[360px] lg:max-w-3xl">
            <h1 className="t-d1-sans mt-24">{useCase.title}</h1>
            <p className="t-p-lg-serif mt-32 text-white">{useCase.outcome}</p>
            <div className="mt-40 flex flex-wrap gap-16">
              <CTAButton href="/assessment">Assess this workflow</CTAButton>
            </div>
          </div>
          <div className="col-span-full mt-40 grid gap-40 lg:grid-cols-3">
            {[
              { label: 'when this happens', content: useCase.event },
              { label: 'who feels it', content: useCase.buyers },
              { label: 'why it gets worse with AI', content: 'More output, variants, contributors, and tools mean more hidden context to lose between generation and delivery.' },
            ].map((item) => (
              <div key={item.label} className="max-w-[400px] lg:max-w-full">
                <p className="t-p-serif">{item.label}</p>
                <p className="t-p-sans mt-20">{item.content}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="col-span-full py-fluid-[76,106] min-h-[90vh]">
          <p className="t-p-lg-sans">the portals workflow</p>
          <div className="mt-24 grid gap-[2px] md:grid-cols-3">
            {[
              { title: 'Capture', content: 'Register the asset, source context, versions, references, decisions, and approvals automatically, in one durable record.' },
              { title: 'Extend', content: 'Keep parent assets, derivatives, delivery state, and intended use connected as the work branches.' },
              { title: 'Compound', content: 'Use the production record to recover work, make the next version, and hand it off with less rework.' }].map((item) => (
                <article key={item.title} className="pointer-events-none bg-white/10 p-32">
                  <h2 className="t-h3-sans">{item.title}</h2>
                  <p className="t-p-sans mt-20">
                    {item.content}
                  </p>
                </article>
              ))}
          </div>
        </section>
        <section className="col-span-full min-h-[90vh] py-fluid-[76,106]">
          <div className="grid gap-40 lg:grid-cols-2">
            {[
              { label: 'what portals fixes', content: useCase.remedy },
              { label: 'what you can do next', content: useCase.booster },
            ].map((item) => (
              <div key={item.label} className="max-w-[400px] lg:max-w-full">
                <p className="t-p-lg-sans">{item.label}</p>
                <h2 className="t-h3-sans mt-24">{item.content}</h2>
              </div>
            ))}
          </div>
          <div className="mt-40">
            <p className="t-p-lg-sans">what to measure in a paid pilot</p>
            <p className="t-h3-sans mt-24 max-w-3xl">{useCase.measure}</p>
          </div>
        </section>

        <section className="col-span-full min-h-[65vh] py-fluid-[76,106]">
          <h2 className="t-d2-sans">Explore use cases</h2>
          <div className="mt-32 grid gap-[2px] md:grid-cols-3">
            {related.map((item) => (
              <Link
                href={`/use-cases/${item.slug}`}
                key={item.slug}
                className="group flex flex-col bg-white/10 p-24 rounded-sm hover:bg-white/15"
              >
                <h3 className="t-h3-sans">{item.title}</h3>
                <p className="t-p-sans mt-16">{item.outcome}</p>
                <span className="mt-auto pt-24 inline-block t-p-sm-sans decoration-2 underline-offset-4 group-hover:underline">
                  read more{' '}
                  <span className="inline-block transition-transform duration-[220ms] group-hover:translate-x-5">
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {/* <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href="/production-memory#download" appearance="plain">
              Download the Production Memory Brief
            </CTAButton>
            <CTAButton href="/assessment">
              Assess your workflow
            </CTAButton>
          </div> */}
        </section>
      </main>
    </>
  )
}
