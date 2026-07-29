import Link from 'next/link'
import type {Cta, ResourceDocument} from '@/types/resource'
import {resolvePdfDownloadUrl} from '@/lib/resource-pdf'
import {ResourceBody} from './ResourceBody'

function resolveCtaHref(cta: Cta, document: ResourceDocument): string {
  if (cta.action === 'downloadPdf') {
    return resolvePdfDownloadUrl(document) || '#'
  }
  return cta.href || '#'
}

function CtaLink({cta, document}: {cta: Cta; document: ResourceDocument}) {
  const href = resolveCtaHref(cta, document)
  const className =
    cta.style === 'secondary'
      ? 'inline-flex border border-white/25 px-5 py-3 text-sm text-white transition hover:bg-white/8'
      : cta.style === 'text'
        ? 'inline-flex text-sm text-white underline decoration-white/30 underline-offset-4'
        : 'inline-flex bg-white px-5 py-3 text-sm text-black transition hover:bg-white/85'

  if (cta.action === 'external' || cta.action === 'downloadPdf') {
    return (
      <a
        href={href}
        target={
          cta.action === 'downloadPdf' || cta.openInNewTab ? '_blank' : undefined
        }
        rel={
          cta.action === 'downloadPdf' || cta.openInNewTab
            ? 'noreferrer'
            : undefined
        }
        className={className}
      >
        {cta.label}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {cta.label}
    </Link>
  )
}

export function ResourceLandingPage({
  document,
}: {
  document: ResourceDocument
}) {
  const landing = document.landingPage ?? {}

  const visibleSections = document.sections.filter(
    (section) =>
      section.surfaces?.landing &&
      section.surfaces.landing !== 'hidden',
  )

  const publicationDate = document.publishedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(document.publishedAt))
    : null

  return (
    <main className="min-h-screen bg-black text-white">
      <article>
        <header className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-10 lg:pt-36">
          <div>
            {landing.eyebrow ? (
              <p className="mb-6 text-sm uppercase tracking-[0.18em] text-white/50">
                {landing.eyebrow}
              </p>
            ) : null}

            <h1 className="max-w-5xl text-5xl font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              {landing.headline || document.title}
            </h1>

            {document.subtitle ? (
              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/68">
                {document.subtitle}
              </p>
            ) : null}

            <p className="mt-8 max-w-3xl text-lg leading-8 text-white/62">
              {landing.description || document.abstract}
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              {landing.primaryCta ? (
                <CtaLink cta={landing.primaryCta} document={document} />
              ) : null}
              {landing.secondaryCta ? (
                <CtaLink cta={landing.secondaryCta} document={document} />
              ) : null}
            </div>
          </div>

          <aside className="border-t border-white/15 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {landing.showPublicationMeta !== false ? (
              <dl className="space-y-6 text-sm">
                {document.publisher ? (
                  <div>
                    <dt className="text-white/40">Published by</dt>
                    <dd className="mt-1 text-white/78">
                      {document.publisher}
                    </dd>
                  </div>
                ) : null}
                {publicationDate ? (
                  <div>
                    <dt className="text-white/40">Published</dt>
                    <dd className="mt-1 text-white/78">
                      {publicationDate}
                    </dd>
                  </div>
                ) : null}
                {document.edition ? (
                  <div>
                    <dt className="text-white/40">Edition</dt>
                    <dd className="mt-1 text-white/78">
                      {document.edition}
                    </dd>
                  </div>
                ) : null}
                {document.audience?.length ? (
                  <div>
                    <dt className="text-white/40">For</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {document.audience.map((audience) => (
                        <span
                          key={audience}
                          className="border border-white/15 px-2.5 py-1 text-white/68"
                        >
                          {audience}
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </aside>
        </header>

        {landing.showSectionNavigation !== false &&
        visibleSections.length > 1 ? (
          <nav
            aria-label="Resource contents"
            className="mx-auto max-w-7xl border-y border-white/12 px-6 py-6 lg:px-10"
          >
            <ol className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/55">
              {visibleSections.map((section) => (
                <li key={section._key}>
                  <a
                    href={`#${section.anchor}`}
                    className="transition hover:text-white"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="space-y-28">
            {visibleSections.map((section, index) => {
              const mode = section.surfaces?.landing

              return (
                <section
                  id={section.anchor}
                  key={section._key}
                  className="grid scroll-mt-12 gap-10 border-t border-white/12 pt-10 lg:grid-cols-[16rem_minmax(0,46rem)]"
                >
                  <div>
                    <p className="text-sm text-white/35">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    {section.eyebrow ? (
                      <p className="mt-5 text-xs uppercase tracking-[0.16em] text-white/45">
                        {section.eyebrow}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-3xl font-medium tracking-[-0.025em] text-white sm:text-4xl">
                      {section.title}
                    </h2>

                    {mode === 'summary' ? (
                      <>
                        <p className="mt-6 text-lg leading-8 text-white/65">
                          {section.landingExcerpt ||
                            section.summary ||
                            'Read the complete section in the downloadable document.'}
                        </p>
                        {section.sectionCta ? (
                          <div className="mt-7">
                            <CtaLink cta={section.sectionCta} document={document} />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-8">
                        <ResourceBody value={section.body} />
                        {section.sectionCta ? (
                          <div className="mt-8">
                            <CtaLink cta={section.sectionCta} document={document} />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        {document.finalCta ? (
          <footer className="border-t border-white/12">
            <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
              {document.finalCta.eyebrow ? (
                <p className="text-sm uppercase tracking-[0.17em] text-white/45">
                  {document.finalCta.eyebrow}
                </p>
              ) : null}
              <h2 className="mt-5 max-w-4xl text-4xl font-medium tracking-[-0.035em] sm:text-5xl">
                {document.finalCta.headline}
              </h2>
              {document.finalCta.description ? (
                <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
                  {document.finalCta.description}
                </p>
              ) : null}
              <div className="mt-9 flex flex-wrap gap-3">
                {document.finalCta.primaryCta ? (
                  <CtaLink cta={document.finalCta.primaryCta} document={document} />
                ) : null}
                {document.finalCta.secondaryCta ? (
                  <CtaLink
                    cta={document.finalCta.secondaryCta}
                    document={document}
                  />
                ) : null}
              </div>
            </div>
          </footer>
        ) : null}
      </article>
    </main>
  )
}
