import type {Metadata} from 'next'
import Link from 'next/link'
import {ArrowUpRight} from 'lucide-react'
import {AssessmentForm} from '@/components/leads/AssessmentForm'
import {CTAButton} from '@/components/CTAButton'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {SagaWebGLEngine} from '@/lib/SagaWebGLEngine'
import Faq from '@/components/FAQ'
import {getFaqsByCategories} from '@/lib/faqs'

const assessmentUrl = new URL(
  '/assessment',
  process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works',
).toString()
const assessmentImageUrl = new URL(
  '/assessment/opengraph-image',
  process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works',
).toString()

export const metadata: Metadata = {
  title: 'AI Creative Production Workflow Assessment | portals',
  description: 'Creative teams can assess approved-version control, generation history, handoffs, reproducibility, and production-memory risk in four minutes.',
  keywords: [
    'AI creative production workflow assessment',
    'AI production workflow assessment',
    'generative AI workflow audit',
    'AI creative asset management',
    'AI asset version control',
    'prompt and generation history',
    'AI content reproducibility',
    'creative production repository',
    'production memory system',
    'campaign variant management',
    'AI character consistency workflow',
    'creative production handoff',
  ],
  alternates: {canonical: assessmentUrl},
  openGraph: {
    type: 'website',
    url: assessmentUrl,
    siteName: 'portals',
    title: 'AI Creative Production Workflow Assessment | portals',
    description: 'Assess approved versions, prompt and generation history, handoffs, reproducibility, and production-memory risk in four minutes.',
    images: [{url: assessmentImageUrl, width: 1200, height: 630, alt: 'portals AI creative production workflow assessment'}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Creative Production Workflow Assessment | portals',
    description: 'Assess approved versions, generation history, handoffs, and AI content reproducibility in four minutes.',
    images: [assessmentImageUrl],
  },
}

export const dynamic = 'force-dynamic'

function NumberLabel({index}: {index: number}) {
  return (
    <div className="flex items-center gap-x-8">
      <span className="size-8 bg-white" />
      <span className="t-m2 text-white">{String(index).padStart(2, '0')}</span>
    </div>
  )
}

const pageLinks = [
  {href: '#the-assessment', label: 'start the assessment'},
  {href: '#what-happens-next', label: 'what happens next'},
]

const nextSteps = [
  {
    label: 'we score your workflow',
    detail: 'we evaluate your workflow\'s cost risk and determine whether a pilot is the best next step for you.',
  },
  {
    label: 'you get the assessment',
    detail: 'you get a downloadable evaluation that shows where cost risk is concentrated across your workflow.',
  },
  {
    label: 'you choose the next step',
    detail: 'strong candidates can build a free customized pilot plan. schedule a call only when your needs fall outside the standard pilot scope.',
  },
]

const faqs = getFaqsByCategories(['assessment'])

export default async function WorkflowAssessmentPage() {
  const context = await getKnownLeadContext()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'AI Creative Production Workflow Assessment',
      url: `${siteUrl}/assessment`,
      description: metadata.description,
      isPartOf: {'@type': 'WebSite', name: 'portals', url: siteUrl},
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: 'portals', item: siteUrl},
        {'@type': 'ListItem', position: 2, name: 'AI Creative Production Workflow Assessment', item: `${siteUrl}/assessment`},
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {'@type': 'Answer', text: faq.answer},
      })),
    },
  ]
  return (
    <main className="relative z-(--z-main) min-h-screen overflow-hidden text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}} />
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
      <header className="absolute inset-x-0 top-0 z-(--z-header)">
        <div className="flex h-Header-h items-center justify-between px-sms">
          <Link href="/" className="t-h3-sans !font-medium text-white">
            portals
          </Link>
        </div>
      </header>

      <div className="relative z-10">
        <section className="relative flex min-h-screen items-start overflow-hidden">
          <div className="ui-grid relative z-10 w-full gap-y-fluid-[30,52] py-fluid-[76,106] pt-[max(var(--spacing-Header-h),24svh)] text-white">
            <div className="col-span-full lg:col-span-14">
              <h1 className="mt-20 max-w-[10em] t-d2-sans">
                Is your creative team paying the hidden AI production tax?
              </h1>
              <p className="mt-28 max-w-[38em] t-p-serif text-white">
                Assess how well your team preserves approved work, production context, handoffs, continuity, and reproducibility.
              </p>
              <p className="mt-20 max-w-[28em] t-p-serif text-white">
                For agencies, creative studios, production companies, in-house brand and marketing teams, film and animation teams, game and entertainment teams.
              </p>
              <p className="mt-20 max-w-[42em] t-p-sm-sans text-white">
                Complete in four minutes. Depending on your result, you may answer a short pilot-readiness clarification and build a customized pilot plan at no cost. No meeting is required unless the completed scope needs an integration review.
              </p>
            </div>
            <nav
              aria-label="assessment sections"
              className="col-span-full lg:col-span-6 lg:col-start-19 lg:self-start"
            >
              <ol className="mt-18 space-y-12 border-t border-white/20 pt-16">
                {pageLinks.map((link, index) => (
                  <li key={link.href} className="border-b border-white/10 pb-12 last:border-b-0 last:pb-0">
                    <a
                      href={link.href}
                      className="grid grid-cols-[2.9em_1fr] gap-x-12 text-white transition-colors hover:text-white/80"
                    >
                      <span className="t-m2 text-white/80">{String(index + 1).padStart(2, '0')}</span>
                      <span className="t-p-sm-sans">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        <section className="relative">
          <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
            <blockquote className="col-span-full mb-20 lg:col-span-18 lg:col-start-4 px-18">
              <p className="mb-12 t-p-sans text-white">
                <a className="underline underline-offset-4" href="https://openai.com/business/plugins/creative-production/" target="_blank" rel="noreferrer">OpenAI describes creative production</a> that adapts top-performing assets across channels while maintaining consistency. <a className="underline underline-offset-4" href="https://business.adobe.com/products/firefly-business/firefly-creative-production/production-workflows.html" target="_blank" rel="noreferrer">Adobe describes enterprise production workflows</a> for approved-asset variants, localization, and reduced rework. Its <a className="underline underline-offset-4" href="https://business.adobe.com/au/blog/ipg-healths-studio-rx-supercharges-campaign-production-adobe-firefly-custom-ai-models" target="_blank" rel="noreferrer">IPG Health Studio Rx example</a> shows high-volume character variation with brand consistency.
              </p>
            </blockquote>
            <div className="col-span-full lg:col-span-9">
              <h2 className="t-d2-sans">Recognizable production use cases</h2>
            </div>
            <ul className="col-span-full grid gap-16 t-p-sans text-white sm:grid-cols-2 lg:col-span-12 lg:col-start-13">
              <li className="flex items-baseline gap-20">
                <span className="size-8 shrink-0 bg-white" />
                Reproduce an approved AI-generated asset without rebuilding input context from scratch.
              </li>
              <li className="flex items-baseline gap-20">
                <span className="size-8 shrink-0 bg-white" />
                Extend a campaign across channels while preserving approved brand and message choices.
              </li>
              <li className="flex items-baseline gap-20">
                <span className="size-8 shrink-0 bg-white" />
                Maintain character consistency across high-volume variations.
              </li>
              <li className="flex items-baseline gap-20">
                <span className="size-8 shrink-0 bg-white" />
                Transfer a creative production workflow between creators, teams, agencies, or vendors.</li>
            </ul>
          </div>
        </section>

        <section id="the-assessment" className="relative">
          <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
            <div className="col-span-2">
              <NumberLabel index={1} />
            </div> 
            <p className="col-span-full max-w-[28em] lg:col-span-14 lg:col-start-9 t-p-lg-serif text-white">
              Assess how well your team preserves approved work, production context, handoffs, continuity, and reproducibility.
            </p>
            <section className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9">
              <div className="max-w-[42em] space-y-5 text-white">
                <AssessmentForm context={context} />
              </div>
            </section>
          </div>
        </section>

        <section id="what-happens-next" className="relative">
          <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-4">
              <NumberLabel index={2} />
            </div>
            <section className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9">
              <h2 className="max-w-[12em] t-h3-sans">what happens next</h2>
              <ol className="mt-24 max-w-[42em]">
                {nextSteps.map((step, index) => (
                  <li key={step.label} className="grid grid-cols-[2.9em_1fr] border-t border-white/20 py-20 first:border-t-0 first:pt-0 items-baseline">
                    {/* <span className="t-m2 text-white/80">{String(index + 1).padStart(2, '0')}</span> */}
                    <span className="size-8 bg-white shrink-0" />
                    <div>
                      {/* <p className="t-h4-sans text-white">{step.label}</p> */}
                      <p className="max-w-[36em] t-p-sans text-white">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>

        <section className="relative" id="assessment-faq">
          <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
            <div className="col-span-full mx-auto lg:mx-0 lg:col-span-14 lg:col-start-9"><h2 className="t-d2-sans">assessment FAQs</h2></div>
            <div className="col-span-full lg:col-span-14 lg:col-start-9">
              <Faq faqs={faqs} />
            </div>
          </div>
        </section>

        <footer>
          <div className="ui-grid min-h-screen content-center gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-3">
              <NumberLabel index={3} />
            </div>
            <div className="col-span-full lg:col-span-13">
              <h2 className="max-w-[10em] t-d2-sans">
                make your production workflow cost-effective
              </h2>
              <p className="mt-24 max-w-[34em] t-p-lg-serif text-white">
                Your assessment result recommends the right next action: 
                <br/>
                scope a paid pilot, or explore a relevant production use case.
              </p>
              <div className="mt-32 flex flex-wrap items-center gap-16">
                <CTAButton href="#the-assessment" analyticsLabel="View My Recommended Next Step" analyticsIntent="workflow_assessment">
                  <span>View my recommended next step</span>
                  <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
                </CTAButton>
                <CTAButton
                  href="/contact?intent=workflow-assessment"
                  appearance="plain"
                  className="underline underline-offset-4"
                  analyticsLabel="Contact portals"
                  analyticsIntent="workflow_assessment"
                >
                  <span>contact us</span>
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
