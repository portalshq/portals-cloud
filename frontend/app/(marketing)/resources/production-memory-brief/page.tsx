import type {Metadata} from 'next'
import {getKnownLeadContext} from '@/lib/leads/profile'
import {ResourceLeadForm} from '@/components/leads/ResourceLeadForm'
import {CTAButton} from '@/components/CTAButton'

export const metadata: Metadata = {
  title: 'The Production Memory Brief | Portals',
  description: 'A commercial brief for preserving the versions, context, decisions, and relationships behind valuable AI-native creative work.',
  alternates: {canonical: '/resources/production-memory-brief'},
  openGraph: {title: 'The Production Memory Brief | Portals', description: 'Preserve production context and turn it into faster future work.', type: 'article'},
}

export default async function Page() {
  const context = await getKnownLeadContext()
  return <><header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-sms py-20 text-white"><a href="/" className="t-h3-sans !font-medium">portals</a><a href="/production-memory" className="t-p-sans underline underline-offset-4">production memory</a></header><main className="ui-grid min-h-screen text-white"><section className="col-span-full max-w-5xl py-80"><p className="t-p-sans uppercase tracking-[.16em] text-white/45">downloadable brief</p><h1 className="t-d1-sans mt-24">The Production Memory Brief</h1><p className="t-p-lg-serif mt-32 max-w-3xl text-white/75">How AI-native creative teams preserve the versions, context, decisions, and relationships behind their most valuable work—and turn that memory into faster future production.</p><div className="mt-40 flex flex-wrap gap-16"><CTAButton href="#download">Download the Production Memory Brief</CTAButton><CTAButton href="/workflow/assessment" appearance="plain">Assess Your Workflow</CTAButton></div></section><section id="download" className="col-span-full border-t border-white/15 py-fluid-[76,106]"><div className="mx-auto max-w-4xl"><h2 className="t-d2-sans">Make the case internally.</h2><p className="t-p-sans mt-24 max-w-2xl text-white/65">The brief includes the production-memory framework, market evidence, remedy and booster value, a diagnostic worksheet, manual-versus-software criteria, and paid-pilot evaluation criteria.</p><div className="mt-40"><ResourceLeadForm context={context} submissionType="guide_download" title="Download the Production Memory Brief" description="Built to be shared with production, creative operations, technical, executive, and agency stakeholders." interestLabel="what brought you here?" options={[{value:'production-memory',label:'production memory'},{value:'approved-version',label:'approved version control'},{value:'reproduction',label:'asset reproduction'},{value:'variants',label:'campaign variants'},{value:'handoffs',label:'production handoffs'}]} downloadLabel="Download the Production Memory Brief" sourcePage="/resources/production-memory-brief"/></div></div></section></main></>
}
