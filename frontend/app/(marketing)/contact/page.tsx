import type {Metadata} from 'next'
import {ContactLeadForm} from '@/components/leads/ContactLeadForm'
import {getKnownLeadContext} from '@/lib/leads/profile'
import { CTAButton } from '@/components/CTAButton'
import { scopeAPilotMailto } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Ask about a production workflow, security review, integration, or commercial evaluation.',
}

export const dynamic = 'force-dynamic'

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{intent?: string}>
}) {
  const [context, params] = await Promise.all([
    getKnownLeadContext(),
    searchParams,
  ])
  return (
    <main className="relative z-(--z-main) min-h-screen bg-[#343434] text-white">
      <section data-header-theme="light" className="ui-grid pt-Header-h py-fluid-[76,106]">
        <div className="col-span-full max-w-[900px] flex flex-col gap-y-32 py-48">
          <h1 className="max-w-[12em] t-d2-sans">
            stop paying the hidden production tax in your AI workflows
          </h1>
          <p className="max-w-[38em] t-p-serif text-white">
            Ask a question for a direct response, or assess your production workflow.
            <br />
            <span className="flex mt-12 normal-case items-baseline">To request a commercial evaluation, scope a pilot.</span>
          </p>
          <div className="flex gap-24">
            <CTAButton
              href="/assessment"
              appearance="plain"
              className="underline underline-offset-4"
              analyticsLabel="Assess Your AI Creative Production Workflow"
              analyticsIntent="assessment"
            >
              Assess production workflow
            </CTAButton>
            <CTAButton href={scopeAPilotMailto}>Scope a pilot</CTAButton>
          </div>
        </div>
        <div className="col-span-full max-w-[760px]">
          <ContactLeadForm context={context} initialInterest={params.intent || ''} />
        </div>
      </section>
    </main>
  )
}
