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
    <main className="relative z-(--z-main) min-h-screen bg-[#343434] lowercase text-white">
      <section data-header-theme="light" className="ui-grid min-h-[64vh] items-end pb-40 pt-Header-h">
        <div className="col-span-full max-w-[900px] py-48">
          <h1 className="max-w-[11em] t-d2-sans">bring us the production decision in front of you.</h1>
          <p className="mt-24 max-w-[38em] t-p-lg-serif text-white">
            share enough context for a useful response. 
            <br />
            <span className="flex mt-24 normal-case items-baseline">to request a commercial evaluation, <CTAButton className="ml-8" href={scopeAPilotMailto}>Scope a pilot</CTAButton></span>
          </p>
        </div>
      </section>
      <section data-header-theme="light" className="ui-grid py-fluid-[76,106]">
        <div className="col-span-full max-w-[760px]">
          <ContactLeadForm context={context} initialInterest={params.intent || ''} />
        </div>
      </section>
    </main>
  )
}
