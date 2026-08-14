'use client'

import {useState} from 'react'
import type {PortableTextBlock, ResourceDocument} from '@/types/resource'
import {CTAButton} from '@/components/CTAButton'
import {ResourceLeadForm} from '@/components/leads/ResourceLeadForm'
import type {KnownLeadContext} from '@/lib/leads/contracts'
import {productionWorkflows} from '@/lib/production-workflows'
import {getFaqsByCategories} from '@/lib/faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'

function StructuredData() {
  const pageUrl = `${SITE_URL}/ai-production-workflow-risks`

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              name: 'Six Workflow Risks That Make AI Production Hard to Scale',
              description:
                'Discover six workflow risks that make AI-generated creative production difficult to scale—and how portals preserves approved versions, generation history, asset lineage, and production knowledge.',
              url: pageUrl,
            },
            {
              '@type': 'Organization',
              name: 'portals',
              description:
                'The production repository for AI-native creative organizations',
              url: SITE_URL,
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {'@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL},
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: 'AI Production Workflow Risks',
                  item: pageUrl,
                },
              ],
            },
          ],
        }),
      }}
    />
  )
}

function ResourceHero({
  document,
}: {
  document: ResourceDocument
}) {
  const landing = document.landingPage ?? {}

  return (
    <section data-header-theme="light" className="relative min-h-screen flex items-center">
      <header className="pointer-events-none w-full absolute inset-x-0 top-0 z-(--z-header)">
        <div className="flex h-Header-h items-center px-sms !pr-16">
          <div className="pointer-events-auto flex flex-1 items-center gap-x-sgs items-baseline">
            <a className="md:absolute" href="/">
              <span className="t-h3-sans !font-medium">portals</span>
            </a>
          </div>
        </div>
      </header>

      <div className="ui-grid gap-y-fluid-[30,52] mx-auto py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[160.58ch]">
          {landing.eyebrow ? (
            <div className="t-p-sans w-fit hidden xl:block md:mx-auto lowercase">
              <p>{landing.eyebrow}</p>
            </div>
          ) : null}
          <h1 className="t-d2-sans mx-auto lg:text-center max-w-[13em]">
            {landing.headline || document.title}
          </h1>
          <p className="t-p-lg-serif max-w-[29em] mx-auto text-white">
            {landing.description || document.abstract}
          </p>
          <div className="flex flex-col sm:flex-row mx-auto gap-16 items-center justify-center">
            <CTAButton href="#download">
              {'Download the production history guide'}
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

function WorkflowRiskCard({
  risk,
  index,
}: {
  risk: ResourceDocument['sections'][number]
  index: number
}) {
  return (
    <article className="p-24 text-white border border-white/20">
      <h3 className="t-h3-sans mb-16">{risk.title}</h3>
      {risk.summary ? (
        <p className="t-p-sans mb-12">{risk.summary}</p>
      ) : null}
      {risk.landingExcerpt ? (
        <p className="t-p-sans text-white">{risk.landingExcerpt}</p>
      ) : null}
    </article>
  )
}

function ProductionWorkflows({
  sections,
}: {
  sections: ResourceDocument['sections']
}) {
  const riskSections = sections.filter(
    (s) => s.surfaces?.landing === 'summary' && s.sectionType === 'risk',
  )

  if (!riskSections.length) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-36">
          <h2 className="t-d2-sans max-w-[12em]">
            Six production workflow risks
          </h2>
          {/* <div className="grid grid-cols-1 gap-px bg-white/20 rounded-sm backdrop-blur-[12px] lg:grid-cols-2">
            {riskSections.map((risk, i) => (
              <WorkflowRiskCard key={risk._key} risk={risk} index={i} />
            ))}
          </div> */}
          <div className="grid grid-cols-1 gap-[2px] lg:grid-cols-2">
            {productionWorkflows.map((workflow, index) => (
              <article
                id={workflow.id}
                key={workflow.id}
                className="scroll-mt-Header-h p-24 text-white bg-white/20 rounded-sm backdrop-blur-[12px]"
              >
                
                <h3 className="mt-12 t-h3-sans">{workflow.title}</h3>
                <p className="mt-16 t-p-sans text-white">{workflow.problem}</p>
                <p className="mt-12 t-p-sans text-white">instead, {workflow.outcome}</p>
                {workflow.quote && (
                  <blockquote className="mt-20 t-p-sans italic col-span-full border-l-2 border-r-2 px-18 text-white lg:col-span-14">
                    {workflow.quote}
                    {workflow.source && (
                      <cite>
                        {' '}{workflow.source}
                      </cite>
                    )}
                  </blockquote>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
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
          <h2 className="t-d2-sans">{section.title}</h2>
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
            <CTAButton href="#download">Download the guide</CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

function DownloadBriefForm({context}: {context: KnownLeadContext}) {
  return (
    <section id="download" data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full mx-auto max-w-[90%] lg:max-w-[80ch]">
          <ResourceLeadForm
            context={context}
            submissionType="guide_download"
            title="Download the production history guide"
            description="Learn how to diagnose and address the production history risks behind ai-native creative work."
            interestLabel="which workflow risk is most relevant?"
            options={[
              {value: 'approved-version-retrieval', label: 'approved version confusion'},
              {value: 'asset-reproduction', label: 'failed asset reproduction'},
              {value: 'five-more-like-this', label: 'five more like this becomes a rebuild'},
              {value: 'character-continuity', label: 'character or visual continuity drift'},
              {value: 'production-handoff', label: 'production knowledge leaves with the creator'},
              {value: 'campaign-variant-control', label: 'variant families become hard to control'},
              {value: 'not-sure', label: 'not sure yet'},
            ]}
            downloadLabel="Download the guide"
            sourcePage="/ai-production-workflow-risks"
          />
        </div>
      </div>
    </section>
  )
}

function PilotCTASection({document}: {document: ResourceDocument}) {
  const cta = document.finalCta

  if (!cta) return null

  const href = '/paid-pilot#scope'

  return (
    <section id="pilot" data-header-theme="light">
      <div className="min-h-screen ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white items-center">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[90ch]">
          <h2 className="t-d2-sans max-w-[12em] mx-auto">{cta.headline}</h2>
          {cta.description ? (
            <p className="t-p-lg-serif max-w-[50em] text-white">
              {cta.description}
            </p>
          ) : null}
          {cta.primaryCta ? (
            <div className="flex flex-col items-center justify-center gap-24 sm:flex-row">
              <a
                className="t-button min-w-220 w-fit inline-flex justify-center items-center rounded-sm h-48 gap-x-9 px-12 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30"
                href={href}
                target={cta.primaryCta.openInNewTab ? '_blank' : undefined}
                rel={cta.primaryCta.openInNewTab ? 'noreferrer' : undefined}
              >
                <span className="t-p-sans">{cta.primaryCta.label}</span>
              </a>
              <CTAButton
                href="/assessment"
                appearance="plain"
                className="underline underline-offset-4"
                analyticsLabel="Assess Your AI Creative Production Workflow"
                analyticsIntent="assessment"
              >
                Assess your production workflow
              </CTAButton>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

const faqs = getFaqsByCategories(['general'])

function ResourceFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-40 mx-auto max-w-[90%]">
          <h2 className="t-d2-sans max-w-[12em]">
            Frequently asked questions
          </h2>
          <div className="space-y-16 max-w-3xl lg:w-3xl mx-auto">
            {faqs.map((faq, index) => (
              <div key={faq.question} className="border border-white/70 rounded-sm">
                <button
                  data-faq-question={faq.question}
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full p-24 text-left flex justify-between items-center t-p-sans focus:outline-none"
                  aria-expanded={openIndex === index}
                >
                  <span className="t-p-serif">{faq.question}</span>
                  <span
                    className={`transform transition-transform duration-300 ${openIndex === index ? 'rotate-45' : ''}`}
                  >
                    +
                  </span>
                </button>
                {openIndex === index ? (
                  <div className="px-24 pb-24 t-p-sans text-white">
                    {faq.answer}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] min-h-screen items-center text-white">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[160ch]">
          <h4 className="t-global-cta_heading max-w-[13em] mx-auto text-center">
            Stop losing the history of your best work. <br /> Start building on it.
          </h4>
          <p className="t-p-lg-serif max-w-[26em] mx-auto text-white text-left">
            Deliver faster at lower cost with complete asset history and identity from first generation through shipped production.
          </p>
          <div className="flex flex-col sm:flex-row gap-16 items-center justify-center">
            <CTAButton href="/paid-pilot#scope">Scope a pilot</CTAButton>
            <CTAButton
              href="/assessment"
              appearance="plain"
              className="underline underline-offset-4"
              analyticsLabel="Assess Your AI Creative Production Workflow"
              analyticsIntent="assessment"
            >
              Assess your workflow first
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ResourceBriefClient({
  document,
  context,
}: {
  document: ResourceDocument
  context: KnownLeadContext
}) {
  return (
    <>
      <StructuredData />
      <ResourceHero document={document} />
      <ProductionWorkflows sections={document.sections} />
      <WhatsInside sections={document.sections} />
      <DownloadBriefForm context={context} />
      <PilotCTASection document={document} />
      <ResourceFAQ />
      <FinalCTA />
    </>
  )
}
