import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {CTAButton} from '@/components/CTAButton'
import {breadcrumbJsonLd, canonical, marketingMetadata} from '@/lib/seo'
import {getUseCase, getUseCases} from '@/sanity/lib/use-cases'

export const dynamicParams = false

export async function generateStaticParams() {
  const useCases = await getUseCases()
  return useCases.map(({slug}) => ({slug}))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{slug: string}>
}): Promise<Metadata> {
  const {slug} = await params
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

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const [useCase, useCases] = await Promise.all([getUseCase(slug), getUseCases()])
  if (!useCase) notFound()
  const index = useCases.findIndex((item) => item.slug === slug)
  const related = useCases.filter((item) => item.slug !== slug).slice(0, 3)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: useCase.title,
      description: useCase.outcome,
      url: canonical(`/use-cases/${slug}`),
      dateModified: useCase._updatedAt,
      isPartOf: {'@type': 'WebSite', name: 'portals', url: siteUrl},
    },
    breadcrumbJsonLd([
      {name: 'portals', path: '/'},
      {name: 'Use cases', path: '/use-cases'},
      {name: useCase.title, path: `/use-cases/${slug}`},
    ]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}} />
      <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-sms py-20 text-white">
        <a href="/" className="t-h3-sans !font-medium">
          portals
        </a>
        <a href="/use-cases" className="t-p-sans underline underline-offset-4">
          all use cases
        </a>
      </header>
      <main className="ui-grid text-white">
        <section className="col-span-full min-h-[65vh] max-w-6xl py-80">
          <p className="t-p-sans uppercase tracking-[.16em] text-white/45">
            use case / {String(index + 1).padStart(2, '0')}
          </p>
          <h1 className="t-d1-sans mt-24 max-w-5xl">{useCase.title}</h1>
          <p className="t-p-lg-serif mt-32 max-w-3xl text-white/75">{useCase.outcome}</p>
          <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href="/assessment">Assess this workflow</CTAButton>
            <CTAButton href="/paid-pilot#scope" appearance="plain">
              Scope a production pilot
            </CTAButton>
          </div>
        </section>
        <section className="col-span-full border-t border-white/15 py-fluid-[76,106]">
          <div className="grid gap-40 lg:grid-cols-3">
            <div>
              <p className="t-p-sans uppercase tracking-[.16em] text-white/45">when this happens</p>
              <p className="t-p-sans mt-20 text-white/75">{useCase.event}</p>
            </div>
            <div>
              <p className="t-p-sans uppercase tracking-[.16em] text-white/45">who feels it</p>
              <p className="t-p-sans mt-20 text-white/75">{useCase.buyers}</p>
            </div>
            <div>
              <p className="t-p-sans uppercase tracking-[.16em] text-white/45">why it gets worse with AI</p>
              <p className="t-p-sans mt-20 text-white/65">
                More output, variants, contributors, and tools mean more hidden context to lose between
                generation and delivery.
              </p>
            </div>
          </div>
        </section>
        <section className="col-span-full border-t border-white/15 py-fluid-[76,106]">
          <p className="t-p-sans uppercase tracking-[.16em] text-white/45">the portals workflow</p>
          <div className="mt-24 grid gap-2 md:grid-cols-3">
            <article className="bg-white/10 p-32">
              <h2 className="t-h3-sans">Capture</h2>
              <p className="t-p-sans mt-20 text-white/65">
                Register the asset, source context, versions, references, decisions, and approvals in one
                durable record.
              </p>
            </article>
            <article className="bg-white/10 p-32">
              <h2 className="t-h3-sans">Connect</h2>
              <p className="t-p-sans mt-20 text-white/65">
                Keep parent assets, derivatives, delivery state, and intended use connected as the work
                branches.
              </p>
            </article>
            <article className="bg-white/10 p-32">
              <h2 className="t-h3-sans">Compound</h2>
              <p className="t-p-sans mt-20 text-white/65">
                Use the production record to recover work, make the next version, and hand it off with less
                rework.
              </p>
            </article>
          </div>
        </section>
        <section className="col-span-full border-t border-white/15 py-fluid-[76,106]">
          <div className="grid gap-40 lg:grid-cols-2">
            <div>
              <p className="t-p-sans uppercase tracking-[.16em] text-white/45">what portals fixes</p>
              <h2 className="t-d2-sans mt-24">{useCase.remedy}</h2>
            </div>
            <div>
              <p className="t-p-sans uppercase tracking-[.16em] text-white/45">what you can do next</p>
              <h2 className="t-d2-sans mt-24">{useCase.booster}</h2>
            </div>
          </div>
          <div className="mt-56 border-t border-white/20 pt-24">
            <p className="t-p-sans uppercase tracking-[.16em] text-white/45">what to measure in a paid pilot</p>
            <p className="t-p-lg-serif mt-20 max-w-3xl text-white/80">{useCase.measure}</p>
          </div>
        </section>
        <section className="col-span-full border-t border-white/15 py-fluid-[76,106]">
          <h2 className="t-d2-sans">Explore use cases</h2>
          <div className="mt-32 grid gap-2 md:grid-cols-3">
            {related.map((item) => (
              <a
                href={`/use-cases/${item.slug}`}
                key={item.slug}
                className="bg-white/10 p-24 hover:bg-white/15"
              >
                <h3 className="t-h3-sans">{item.title}</h3>
                <p className="t-p-sans mt-16 text-white/60">{item.outcome}</p>
              </a>
            ))}
          </div>
          <div className="mt-40 flex flex-wrap gap-16">
            <CTAButton href="/resources/production-memory-brief" appearance="plain">
              Download the Production Memory Brief
            </CTAButton>
            <CTAButton href="/assessment" appearance="plain">
              Assess your workflow
            </CTAButton>
          </div>
        </section>
      </main>
    </>
  )
}
