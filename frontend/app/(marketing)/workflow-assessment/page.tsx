import type {Metadata} from 'next'
import Link from 'next/link'
import {ArrowUpRight} from 'lucide-react'
import {AssessmentForm} from '@/components/leads/AssessmentForm'
import {CTAButton} from '@/components/CTAButton'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {SagaWebGLEngine} from '@/lib/SagaWebGLEngine'

export const metadata: Metadata = {
  title: 'Assess Your AI Production Workflow | Portals',
  description: 'Assess how your team preserves approved versions, generation history, and production knowledge. See whether production-memory risk, pain, and timing justify a workflow review or paid pilot.',
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
    detail: 'your production-memory risk, pain, and intent are scored from about four minutes of answers.',
  },
  {
    label: 'you get the assessment',
    detail: 'a downloadable breakdown shows where the risk is concentrated across your workflow.',
  },
  {
    label: 'you choose the next step',
    detail: 'review the assessment with the team, or scope a paid pilot to test the fix in production.',
  },
]

export default async function WorkflowAssessmentPage() {
  const context = await getKnownLeadContext()
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
      <header className="absolute inset-x-0 top-0 z-(--z-header)">
        <div className="flex h-Header-h items-center justify-between px-sms">
          <Link href="/" className="t-h3-sans !font-medium text-white">
            portals
          </Link>
          <a
            href="#the-assessment"
            className="hidden t-p-sm-sans text-white transition-colors hover:text-white sm:block"
          >
            workflow assessment
          </a>
        </div>
      </header>

      <div className="relative z-10">
        <section className="relative flex min-h-screen items-center overflow-hidden">
          <div className="ui-grid relative z-10 w-full gap-y-fluid-[30,52] py-fluid-[76,106] pt-[max(var(--spacing-Header-h),24svh)] text-white">
            <div className="col-span-full lg:col-span-14">
              <h1 className="max-w-[10em] t-d2-sans">
                can your team reliably reproduce its best ai-generated work?
              </h1>
              <p className="mt-20 t-p-sans text-white">approximately four minutes</p>
              <p className="mt-28 max-w-[38em] t-p-lg-serif text-white">
                assess how your team preserves approved versions, generation history, and production
                knowledge. see whether production-memory risk, pain, and timing justify a workflow
                review or paid pilot.
              </p>
            </div>
            <nav
              aria-label="assessment sections"
              className="col-span-full lg:col-span-6 lg:col-start-19 lg:self-start"
            >
              <p className="t-m2 text-white/80">on this page</p>
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

        <section id="the-assessment" className="relative">
          <div className="ui-grid gap-y-fluid-[30,52] border-t border-white/20 py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-4">
              <NumberLabel index={1} />
              <p className="mt-18 max-w-[12em] t-p-sm-sans text-white/80">the assessment</p>
            </div>
            <section className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9">
              <h2 className="max-w-[12em] t-d2-sans">the assessment</h2>
              <div className="mt-24 max-w-[42em] space-y-5 text-white">
                <AssessmentForm context={context} />
              </div>
            </section>
          </div>
        </section>

        <section id="what-happens-next" className="relative">
          <div className="ui-grid gap-y-fluid-[30,52] border-t border-white/20 py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-4">
              <NumberLabel index={2} />
              <p className="mt-18 max-w-[12em] t-p-sm-sans text-white/80">what happens next</p>
            </div>
            <section className="col-span-full scroll-mt-24 lg:col-span-14 lg:col-start-9">
              <h2 className="max-w-[12em] t-d2-sans">what happens next</h2>
              <ol className="mt-24 max-w-[42em]">
                {nextSteps.map((step, index) => (
                  <li key={step.label} className="grid grid-cols-[2.9em_1fr] gap-x-12 border-t border-white/20 py-20 first:border-t-0 first:pt-0">
                    <span className="t-m2 text-white/80">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="t-h4-sans text-white">{step.label}</p>
                      <p className="mt-8 max-w-[36em] t-p-sans text-white">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>

        <footer className="border-t border-white/20">
          <div className="ui-grid min-h-screen content-center gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
            <div className="col-span-full lg:col-span-3">
              <NumberLabel index={3} />
            </div>
            <div className="col-span-full lg:col-span-13">
              <p className="t-p-sans text-white/80">next step</p>
              <h2 className="mt-20 max-w-[10em] t-d2-sans">
                ready to fix your workflow.
              </h2>
              <p className="mt-24 max-w-[34em] t-p-lg-serif text-white">
                scope a paid pilot, or contact us to continue the conversation.
              </p>
              <div className="mt-32 flex flex-wrap items-center gap-16">
                <CTAButton href="/paid-pilot#scope" analyticsLabel="Scope a Production Pilot" analyticsIntent="workflow_assessment">
                  <span>scope a paid pilot</span>
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
