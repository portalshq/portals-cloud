import type {Metadata} from 'next'
import {ContactLeadForm} from '@/components/leads/ContactLeadForm'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {CTAButton} from '@/components/CTAButton'
import {marketingMetadata} from '@/lib/seo'
import {scopeAPilotMailto} from '@/lib/utils'

export const metadata: Metadata = marketingMetadata({
  title: 'Contact us | portals',
  description:
    'Ask about a production workflow, security review, integration, or commercial evaluation — or assess your workflow in four minutes.',
  path: '/contact',
  keywords: ['contact portals', 'production memory demo', 'AI production pilot inquiry'],
})

export const dynamic = 'force-dynamic'

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{intent?: string}>
}) {
  const [context, params] = await Promise.all([getKnownLeadContext(), searchParams])
  return (
    <main className="relative z-(--z-main) min-h-screen text-white">
      <section data-header-theme="light" className="ui-grid pt-Header-h py-fluid-[76,106]">
        <div className="col-span-full max-w-[900px] flex flex-col gap-y-32 py-48">
          <h1 className="max-w-[12em] t-d2-sans">Talk to us</h1>
          <p className="max-w-[38em] t-p-lg-serif text-white">
            Ask a question for a direct response, or assess your production workflow in four minutes.
          </p>
          <div className="flex flex-wrap gap-16">
            <CTAButton href="/assessment" analyticsLabel="Assess production workflow" analyticsIntent="assessment">
              Assess production workflow
            </CTAButton>
            <CTAButton
              href={scopeAPilotMailto}
              appearance="plain"
              analyticsLabel="Scope a pilot"
              analyticsIntent="pilot_scope"
            >
              Scope a pilot
            </CTAButton>
          </div>
        </div>
        <div className="col-span-full max-w-[760px]">
          <ContactLeadForm context={context} initialInterest={params.intent || ''} />
        </div>
      </section>
    </main>
  )
}
