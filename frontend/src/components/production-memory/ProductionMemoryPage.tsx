'use client'

import { useEffect, useState } from 'react'
import { CTAButton } from '@/components/CTAButton'
import { ResourceLeadForm } from '@/components/leads/ResourceLeadForm'
import type { KnownLeadContext } from '@/lib/leads/contracts'
import type { UseCaseDocument } from '@/types/use-case'
import { PortableTextBlock, ResourceDocument } from '@/types/resource'
import FAQ from '../FAQ'
import { getFaqsByCategories } from '@/lib/faqs'

const risks = [
  ['01', 'Approved version confusion', 'Find the canonical approved asset, its history, and its approval context.', 'approved-version-control'],
  ['02', 'Failed asset reproduction', 'Recover the prompts, models, references, settings, and decisions behind the work.', 'reproduce-ai-generated-assets'],
  ['03', 'Campaign variant sprawl', 'Connect every derivative to its approved source and intended delivery state.', 'ai-campaign-variant-control'],
  ['04', 'Wrong-spec production', 'Track channel, format, duration, market, and readiness requirements.', 'platform-spec-readiness'],
  ['05', 'Production handoff failure', 'Make context an organizational record instead of individual memory.', 'production-handoff-memory'],
  ['06', 'Unused creative waste', 'See what launched, what died, and what remains reusable.', 'unused-creative-asset-utilization'],
  ['07', 'Revision and scope-creep leakage', 'Trace notes, requests, decisions, branches, and the cost they created.', 'revision-scope-creep-cost'],
  ['08', 'Character and continuity drift', 'Preserve canonical references and history across scenes and production cycles.', 'character-continuity-governance'],
] as const

function hrefForUseCase(useCases: UseCaseDocument[], slug: string) {
  return useCases.some((useCase) => useCase.slug === slug) ? `/use-cases/${slug}` : '/use-cases'
}

export function ProductionMemoryPage({ context, sanityDocument, useCases }: { context: KnownLeadContext; sanityDocument: ResourceDocument | undefined; useCases: UseCaseDocument[] }) {
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    root.classList.add('mobile-snap-page')
    body.classList.add('mobile-snap-page')
    return () => {
      root.classList.remove('mobile-snap-page')
      body.classList.remove('mobile-snap-page')
    }
  }, [])

  return <><main data-page="production-memory" className="text-white">
    <section className="ui-grid min-h-[100vh] lg:min-h-[90vh] items-center py-80 lg:py-48 pm-snap-section"><div className="col-span-full max-w-6xl"><p className="t-p-sans mb-24">the repository for AI-native production</p><h1 className="t-d1-sans max-w-5xl">Production Memory</h1><p className="t-p-sans mt-24 max-w-2xl text-white">AI production teams generate thousands of images, videos, and iterations daily. Every asset carries a history of prompts, model settings, references, revisions and approvals. Without a system to preserve and retrieve that history, teams lose the ability to reproduce, extend, and trust their best work.</p><div className="mt-40 flex flex-wrap gap-16">
      <CTAButton href="#download" appearance="plain" analyticsLabel="Download the Production Memory Brief" analyticsIntent="resource_download">Download the Production Memory Brief</CTAButton>
      <CTAButton href="/assessment" analyticsLabel="Assess Your Production Workflow" analyticsIntent="assessment">Assess Your Production Workflow</CTAButton>
    </div></div></section>
    <section className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[90vh] lg:content-center"><div className="col-span-full lg:col-span-12"><h2 className="t-d2-sans">What is production memory?</h2></div><div className="col-span-full mt-32 max-w-2xl lg:col-span-9 lg:mt-0 content-center"><p className="t-p-sans text-white">Production memory is the complete, recoverable organizational record of how valuable creative work was made.</p>
      {/* <p className="t-p-sans mt-24 text-white">It connects an asset to versions, prompts, models, source references, settings, approvals, rejected directions, production decisions, derivatives, delivery status, and reuse opportunities. A finished asset tells you what shipped. Production memory tells you how it happened, why it changed, what it connects to, and how to build from it again.</p> */}
    </div></section>
    <section className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[90vh] lg:content-center">
      <div className="col-span-full">
        <p className="t-h3-sans text-white">The value of production memory</p>
        <div className="mt-24 flex flex-col gap-[2px] lg:flex-row lg:items-stretch w-full text-black">
          <article className="bg-white p-32 pb-40 rounded-t-[1em] lg:rounded-none origin-center lg:rounded-l-[1em] w-full lg:flex-1 cursor-default transition-all duration-250 ease-in-out">
            <h2 className="t-h3-sans">Stop losing production value&nbsp;✔️</h2><p className="t-p-sans mt-20 max-w-xl h-full">Stop paying your team to rediscover work it already did. 
              <br/>
              Recover approved versions, lineage, decision history, and the context required to reproduce or extend it.</p>
          </article>
          <article className="bg-white p-32 pb-40 rounded-b-[1em] lg:rounded-none origin-center lg:rounded-r-[1em] w-full lg:flex-1 cursor-default transition-all duration-250 ease-in-out"><h2 className="t-h3-sans">Turn prior work into future capacity&nbsp;↗</h2><p className="t-p-sans mt-20 max-w-xl h-full">When successful assets retain their production record, they become reusable systems: 
          faster variants, consistent continuity, smoother handoffs, and less rework.</p></article>
        </div>
      </div>
    </section>
    <section className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[90vh] lg:content-center"><div className="col-span-full lg:col-span-12"><p className="t-p-sans text-white">operating production memory</p><h2 className="t-d2-sans mt-24">Preserve what made the work valuable</h2></div><div className="col-span-full mt-32 grid text-white sm:grid-cols-2 lg:col-span-9 lg:mt-0">{[
      'Asset identity',
      'Prompts and model versions',
      'Model settings and source references',
      'Rejected alternatives and decisions',
      'Approval and contributor history',
      'Complete version history',
    ].map((item) => <div key={item} className="border-t border-white/50 px-24 py-16 t-p-sans text-center md:text-left">{item}</div>)}</div></section>
    <section className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[90vh] lg:content-center"><div className="col-span-full"><h2 className="t-d2-sans mt-24 max-w-4xl">The risks of fragmented context</h2><div className="mt-40 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{risks.map(([n, title, text, slug]) => <a href={hrefForUseCase(useCases, slug)} key={n} className="group flex flex-col bg-white/10 p-24 transition-colors hover:bg-white/15 rounded-sm duration-100"><span className="t-p-sans text-white">{n}</span><h3 className="t-h3-sans mt-24">{title}</h3><p className="t-p-sans mt-16 text-white">{text}</p><span className="mt-auto pt-24 inline-block t-p-sm-sans decoration-2 underline-offset-4 group-hover:underline">read more <span className="inline-block transition-transform duration-[220ms] group-hover:translate-x-5">→</span></span></a>)}</div></div></section>

    {sanityDocument?.sections && <WhatsInside sections={sanityDocument.sections} />}

    <section id="download" className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[90vh] lg:content-center"><div className="col-span-full mx-auto w-full max-w-4xl"><h2 className="t-d2-sans mt-24">Download the Production Memory Brief</h2><p className="t-p-lg-serif mt-24 text-white">How AI-native creative teams preserve the versions, context, decisions, and relationships behind their most valuable work—and turn that memory into faster future production.</p><p className="t-p-sans mt-24 text-white">Share with your organization's Production, Creative Operations, Technical, Executive, and Agency stakeholders.</p><div className="mt-40"><ResourceLeadForm context={context} submissionType="guide_download" title="" description="" interestLabel="which workflow is most relevant?" options={risks.map(([, title]) => ({ value: title.toLowerCase().replaceAll(' ', '-'), label: title.toLowerCase() }))} downloadLabel="Download the Production Memory Brief" sourcePage="/production-memory" /></div></div></section>

    <section className="ui-grid py-fluid-[76,106] lg:py-48 text-white pm-snap-section lg:min-h-[90vh]"><div className="col-span-full w-full max-w-4xl lg:mx-auto"><p className="t-d2-sans mb-24 text-center">Frequently asked questions</p>
      <FAQ faqs={getFaqsByCategories(['general'])} />
    </div></section>

    <section className="ui-grid py-fluid-[76,106] lg:py-48 pm-snap-section lg:min-h-[100vh] lg:content-center"><div className="col-span-full mx-auto max-w-4xl"><h2 className="t-d2-sans mt-24">Production memory pays for itself when it increases production velocity.</h2><p className="t-p-lg-serif mt-32 max-w-3xl text-white lg:mx-auto">A production pilot applies portals to one active workflow and one historical project, then measures whether a team can recover and reuse production memory faster than before.
      <br /><br />
      Post-pilot, any team member will be able to locate the exact approved version instantly, recover the exact prompts and source context, and seamlessly hand off the work to another creator.</p><div className="lg:mx-auto mt-40 max-w-3xl items-center lg:justify-center flex flex-wrap gap-16">
        <CTAButton href="/assessment" appearance="plain">Assess your workflow</CTAButton>
        <CTAButton href="/pilot">How a pilot works</CTAButton>
      </div></div></section>
  </main></>
}


function WhatsInside({
  sections,
}: {
  sections: ResourceDocument['sections']
}) {
  const section = sections.find((s) => s.anchor === 'whats-inside')
  if (!section) return null

  const body = section.body as PortableTextBlock[] | undefined
  if (!body || body.length === 0) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full flex flex-col space-y-36 mx-auto max-w-[90%] lg:max-w-[60ch]">
          <h2 className="t-d2-sans">The Production Memory Brief</h2>
          <div className="flex flex-1 flex-col gap-y-8">
            {body.map((block, i) => {
              const text = block.children?.[0]?.text || ''
              if (i === 0) {
                return (
                  <p key={block._key} className="mb-20 t-p-lg-serif max-w-[50em] text-white">
                    {text}
                  </p>
                )
              }
              if (i === body.length - 1) {
                return (
                  <p key={block._key} className="mt-20 t-p-sans max-w-[50em]">
                    {text}
                  </p>
                )
              }
              return (
                <div
                  key={block._key}
                  className="flex items-start gap-x-16 t-p-sans max-w-[50em]"
                >
                  <span className="flex h-[1.364em] items-center">
                    <span className="size-8 shrink-0 bg-current" />
                  </span>
                  <span>{text}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center">
            <CTAButton href="#download" appearance='plain'>Download the Production Memory Brief</CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function UseCasesHub({ useCases }: { useCases: UseCaseDocument[] }) {
  return <><main className="ui-grid text-white"><section className="col-span-full h-[80vh] max-w-6xl py-80">
    <h1 className="t-d1-serif mt-24 max-w-5xl">AI Creative Production Memory Use Cases</h1>
    <p className="t-p-sans mt-32 max-w-3xl text-white">Explore the operational moments where fragmented context becomes expensive—and where portals helps teams retrieve, reuse, extend, and compound creative work.</p>
    <div className="mt-40 flex flex-wrap gap-16">
      <CTAButton href="#use-cases" appearance="plain">Explore use cases</CTAButton>
      <CTAButton href="/production-memory">About production memory</CTAButton></div></section>
    <section id="use-cases" className="col-span-full py-fluid-[76,106]">
      <div className="grid gap-[2px] md:grid-cols-2">
        {useCases.map(({ title, outcome, slug }, i) => <a key={slug} href={`/use-cases/${slug}`} className="group flex flex-col bg-white/10 p-32 transition-all duration-100 hover:bg-white/15"><span className="t-p-sm-sans text-white">{String(i + 1).padStart(2, '0')}</span><h2 className="t-h3-sans mt-40">{title}</h2><p className="t-p-sans mt-16">{outcome}</p><span className="mt-auto pt-32 inline-block t-p-sans decoration-2 underline-offset-4 group-hover:underline">read more <span className="inline-block transition-transform duration-[220ms] group-hover:translate-x-5">→</span></span></a>)}</div></section></main></>
}
