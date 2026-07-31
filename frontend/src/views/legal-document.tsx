'use client'

import Link from 'next/link'
import {ArrowUpRight} from 'lucide-react'
import {SagaWebGLEngine} from '@/lib/SagaWebGLEngine'
import {CTAButton} from '@/components/CTAButton'
import type {LegalDocument} from '@/types/resource'
import {ResourceBody} from '@/components/resources/ResourceBody'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function formatNumber(value: number): string {
  return String(value).padStart(2, '0')
}

function Header({document}: {document: LegalDocument}) {
  return (
    <header className="absolute inset-x-0 top-0 z-(--z-header)">
      <div className="flex h-Header-h items-center justify-between px-sms">
        <Link href="/" className="t-h3-sans !font-medium text-white">
          portals
        </Link>
        <a
          href="#document-sections"
          className="hidden t-p-sm-sans text-white transition-colors hover:text-white sm:block"
        >
          {document.title.toLowerCase()} / {new Date(document.effectiveDate).getFullYear()}
        </a>
      </div>
    </header>
  )
}

function NumberLabel({index}: {index: number}) {
  return (
    <div className="flex items-center gap-x-8">
      <span className="size-8 bg-white" />
      <span className="t-m2 text-white">{formatNumber(index)}</span>
    </div>
  )
}

const legalBodyTone =
  '[&_p]:!text-white [&_li]:!text-white [&_figcaption]:!text-white [&_td]:!text-white [&_th]:!text-white [&_blockquote]:!text-white'

const legalBodyOpen =
  '[&_aside]:!border-transparent [&_aside]:!bg-transparent [&_aside]:!px-0 [&_aside]:!py-0 [&_blockquote]:!border-white/30 [&_figure]:!border-transparent [&_tr]:!border-transparent [&_hr]:hidden'

export function LegalDocumentView({document}: {document: LegalDocument}) {
  return (
    <main className="relative z-(--z-main) min-h-screen overflow-hidden text-white lowercase">
      <SagaWebGLEngine />
      <div
        className="pointer-events-none h-px w-full"
        aria-hidden="true"
        data-webgl-marker="scrollFrom"
        data-webgl-position="0.96"
        data-webgl-easing="easeInOut"
      />
      <div
        className="pointer-events-none h-px w-full"
        aria-hidden="true"
        data-webgl-marker="scrollTo"
        data-webgl-position="0.96"
      />
      <Header document={document} />

      <div className="relative z-10">
        <section className="relative flex min-h-screen items-center overflow-hidden">
          <div className="ui-grid relative z-10 w-full gap-y-fluid-[30,52] py-fluid-[76,106] pt-[max(var(--spacing-Header-h),24svh)] text-white">
            <div className="col-span-full lg:col-span-3">
              <NumberLabel index={1} />
            </div>
            <div className="col-span-full lg:col-span-14">
              <p className="t-p-sans text-white">
                effective {formatDate(document.effectiveDate).toLowerCase()}
              </p>
              <h1 className="mt-20 max-w-[10em] t-d2-sans">
                {document.title.toLowerCase()}
              </h1>
              <p className="mt-28 max-w-[38em] t-p-lg-serif text-white">
                {document.summary}
              </p>
            </div>
            <nav
              aria-label={`${document.title} sections`}
              className="col-span-full lg:col-span-6 lg:col-start-19 lg:self-start"
            >
              <p className="t-m2 text-white/80">contents</p>
              <ol className="mt-18 space-y-12 border-t border-white/20 pt-16">
                {document.sections.map((section, index) => (
                  <li key={section._key} className="border-b border-white/10 pb-12 last:border-b-0 last:pb-0">
                    <a
                      href={`#${section.anchor}`}
                      className="grid grid-cols-[2.9em_1fr] gap-x-12 text-white transition-colors hover:text-white/80"
                    >
                      <span className="t-m2 text-white/80">{formatNumber(index + 2)}</span>
                      <span className="t-p-sm-sans">{section.title.toLowerCase()}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        <section
          id="document-sections"
          className="relative"
        >
          {document.sections.map((section, index) => (
            <div key={section._key} className="ui-grid gap-y-fluid-[30,52] border-t border-white/20 py-fluid-[76,106] text-white">
              <div className="col-span-full lg:col-span-4">
                <NumberLabel index={index + 2} />
                <p className="mt-18 max-w-[12em] t-p-sm-sans text-white/80">
                  {section.title.toLowerCase()}
                </p>
              </div>
              <section
                id={section.anchor}
                className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9"
              >
                <h2 className="max-w-[12em] t-d2-sans">
                  {section.title.toLowerCase()}
                </h2>
                <div
                  className={`mt-24 max-w-[42em] space-y-5 text-white ${legalBodyTone} ${legalBodyOpen}`}
                >
                  <ResourceBody value={section.body} />
                </div>
              </section>
            </div>
          ))}
        </section>

        <footer className="border-t border-white/20">
          <div className="ui-grid min-h-screen content-center gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-3">
              <NumberLabel index={document.sections.length + 2} />
            </div>
            <div className="col-span-full lg:col-span-13">
              <p className="t-p-sans text-white/80">contact</p>
              <h2 className="mt-20 max-w-[10em] t-d2-sans">
                questions about {document.title.toLowerCase()}.
              </h2>
              <p className="mt-24 max-w-[34em] t-p-lg-serif text-white">
                Reach Portals for privacy, legal, or document questions at the address below.
              </p>
              <div className="mt-32">
                <CTAButton href={`mailto:${document.contactEmail}`}>
                  <span>{document.contactEmail}</span>
                  <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
                </CTAButton>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
