import type {Metadata} from 'next'
import Link from 'next/link'
import {ArrowUpRight} from 'lucide-react'
import {AssessmentForm} from '@/components/leads/AssessmentForm'
import {CTAButton} from '@/components/CTAButton'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {SagaWebGLEngine} from '@/lib/SagaWebGLEngine'

const assessmentUrl = new URL(
  '/assessment',
  process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works',
).toString()
const assessmentImageUrl = new URL(
  '/assessment/opengraph-image',
  process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works',
).toString()

export const metadata: Metadata = {
  title: 'AI Creative Production Workflow Assessment | Portals',
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
    siteName: 'Portals',
    title: 'AI Creative Production Workflow Assessment | Portals',
    description: 'Assess approved versions, prompt and generation history, handoffs, reproducibility, and production-memory risk in four minutes.',
    images: [{url: assessmentImageUrl, width: 1200, height: 630, alt: 'Portals AI creative production workflow assessment'}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Creative Production Workflow Assessment | Portals',
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
  {href: '#the-assessment', label: 'the assessment'},
  {href: '#what-happens-next', label: 'what happens next'},
]

const nextSteps = [
  {
    label: 'we score your workflow',
    detail: 'we evaluate production-memory risk and determine whether a pilot, a short readiness clarification, or a relevant use case is the best next step.',
  },
  {
    label: 'you get the assessment',
    detail: 'you get a downloadable evaluation that shows where the risk is concentrated across your workflow.',
  },
  {
    label: 'you choose the next step',
    detail: 'strong candidates can build a free customized pilot plan. a call is used only when the completed scope requires qualification or an exception review.',
  },
]

const faqs = [
  {
    question: 'What does an AI production workflow assessment measure?',
    answer: 'It evaluates approved-version control, prompts and references, asset lineage, production handoffs, reproducibility, continuity, campaign variants, and the operational cost of missing production memory.',
  },
  {
    question: 'How should teams preserve prompts and generation history?',
    answer: 'Keep prompts, source references, model and generation context, revisions, approvals, and derivative relationships attached to the production record for each asset—not scattered across chats and personal notes.',
  },
  {
    question: 'How is Portals different from a DAM?',
    answer: 'A DAM primarily organizes and distributes finished assets. Portals is a production repository and memory system designed to preserve how an AI-generated asset was made, approved, reproduced, extended, and handed off.',
  },
  {
    question: 'Are the assessment and customized pilot plan free?',
    answer: 'Yes. The assessment, downloadable result, customized pilot plan, and security details are free.',
  },
  {
    question: 'When does the $5,000 pilot fee apply?',
    answer: 'The fee applies only after your team approves the customized plan and commercial terms and chooses to conduct the production pilot.',
  },
  {
    question: 'When is a qualification call required?',
    answer: 'No call is required for standard candidates unless the completed scope reveals an exception. A call is required when someone self-selects into pilot scoping after an educational assessment outcome.',
  },
]

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
      isPartOf: {'@type': 'WebSite', name: 'Portals', url: siteUrl},
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: 'Portals', item: siteUrl},
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
              <p className="t-p-sans text-white">AI creative production workflow assessment</p>
              <h1 className="mt-20 max-w-[10em] t-d2-sans">
                Can your AI creative production workflow reliably reproduce its best work?
              </h1>
              <p className="mt-28 max-w-[38em] t-p-lg-serif text-white">
                Assess how your team preserves approved versions, prompt and generation history,
                production handoffs, and the knowledge required for AI content reproducibility.
              </p>
              <p className="mt-20 max-w-[42em] t-p-sans text-white">
                Complete the four-minute assessment. Depending on the result, you may answer a short pilot-readiness clarification and build a free customized pilot plan. No call is required unless the completed scope needs qualification or an exception review.
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
            <div className="col-span-full lg:col-span-10">
              <h2 className="max-w-[11em] t-d2-sans">built for AI-native creative production teams</h2>
              <p className="mt-20 max-w-[38em] t-p-lg-serif text-white">
                The assessment is for agencies, creative studios, production companies, in-house brand and marketing teams, film and animation teams, and game and entertainment teams.
              </p>
            </div>
            <div className="col-span-full lg:col-span-11 lg:col-start-14">
              <h3 className="t-h1-sans">what it evaluates</h3>
              <p className="mt-16 t-p-sans text-white">
                Approved versions, prompts and references, asset lineage, production handoffs, reproducibility, continuity, campaign variant management, and the systems that preserve production knowledge between creators and vendors.
              </p>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-9">
              <h2 className="t-d2-sans">recognizable production situations</h2>
            </div>
            <ul className="col-span-full grid gap-16 t-p-sans text-white sm:grid-cols-2 lg:col-span-12 lg:col-start-13">
              <li>Reproduce an approved AI-generated asset without reconstructing decisions from memory.</li>
              <li>Extend a campaign across channels while preserving approved brand and message choices.</li>
              <li>Maintain character consistency across high-volume variations.</li>
              <li>Transfer a creative production workflow between creators, teams, agencies, or vendors.</li>
            </ul>
            <div className="col-span-full mt-20 lg:col-span-18 lg:col-start-4">
              <p className="t-p-sm-sans text-white/70">industry patterns—not Portals customer claims</p>
              <p className="mt-12 t-p-sans text-white">
                <a className="underline underline-offset-4" href="https://openai.com/business/plugins/creative-production/" target="_blank" rel="noreferrer">OpenAI describes creative production</a> that adapts top-performing assets across channels while maintaining consistency. <a className="underline underline-offset-4" href="https://business.adobe.com/products/firefly-business/firefly-creative-production/production-workflows.html" target="_blank" rel="noreferrer">Adobe describes enterprise production workflows</a> for approved-asset variants, localization, and reduced rework. Its <a className="underline underline-offset-4" href="https://business.adobe.com/au/blog/ipg-healths-studio-rx-supercharges-campaign-production-adobe-firefly-custom-ai-models" target="_blank" rel="noreferrer">IPG Health Studio Rx example</a> shows high-volume character variation with brand consistency.
              </p>
            </div>
          </div>
        </section>

        <section id="the-assessment" className="relative">
          <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-4">
              <NumberLabel index={1} />
            </div>
            <section className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9">
              <p className="mt-18 max-w-[12em] t-p-sm-sans text-white/80">the assessment</p>
              <div className="mt-24 max-w-[42em] space-y-5 text-white">
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
              <h2 className="max-w-[12em] t-d2-sans">what happens next</h2>
              <ol className="mt-24 max-w-[42em]">
                {nextSteps.map((step, index) => (
                  <li key={step.label} className="grid grid-cols-[2.9em_1fr] gap-x-12 border-t border-white/20 py-20 first:border-t-0 first:pt-0">
                    <span className="t-m2 text-white/80">{String(index + 1).padStart(2, '0')}</span>
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
            <div className="col-span-full lg:col-span-8"><h2 className="t-d2-sans">assessment FAQs</h2></div>
            <dl className="col-span-full space-y-20 lg:col-span-13 lg:col-start-12">
              {faqs.map((faq) => (
                <div key={faq.question} className="border-t border-white/20 pt-16">
                  <dt className="t-h3-sans">{faq.question}</dt>
                  <dd className="mt-10 t-p-sans text-white">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <footer>
          <div className="ui-grid min-h-screen content-center gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-3">
              <NumberLabel index={3} />
            </div>
            <div className="col-span-full lg:col-span-13">
              <p className="t-p-sans text-white/80">next step</p>
              <h2 className="mt-20 max-w-[10em] t-d2-sans">
                ready to fix your workflow
              </h2>
              <p className="mt-24 max-w-[34em] t-p-lg-serif text-white">
                Your assessment result recommends the right next action: build a free customized pilot plan, complete readiness, or explore a relevant production use case.
              </p>
              <div className="mt-32 flex flex-wrap items-center gap-16">
                <CTAButton href="#the-assessment" analyticsLabel="View My Recommended Next Step" analyticsIntent="workflow_assessment">
                  <span>view my recommended next step</span>
                  <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
                </CTAButton>
                <CTAButton
                  href="/contact?intent=workflow-assessment"
                  appearance="plain"
                  className="underline underline-offset-4"
                  analyticsLabel="Contact Portals"
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
