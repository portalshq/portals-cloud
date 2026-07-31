'use client'

import {useState} from 'react'
import type {PortableTextBlock, ResourceDocument} from '@/types/resource'
import {CTAButton} from '@/components/CTAButton'
import {DEFAULT_GITHUB_PDF_BASE_URL} from '@/lib/resource-pdf'
import { scopeAPilotMailto } from '@/lib/utils'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portals.works'
const PDF_BASE_URL =
  process.env.NEXT_PUBLIC_PDF_BASE_URL || DEFAULT_GITHUB_PDF_BASE_URL
const FIELD_GUIDE_PDF_URL = `${PDF_BASE_URL.replace(/\/$/, '')}/production-memory-field-guide.pdf`

function StructuredData() {
  const pageUrl = `${SITE_URL}/use-cases`

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
                'Discover six workflow risks that make AI-generated creative production difficult to scale—and how Portals preserves approved versions, generation history, asset lineage, and production knowledge.',
              url: pageUrl,
            },
            {
              '@type': 'Organization',
              name: 'Portals',
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
              {'Download the Guide'}
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

function WorkflowRiskGrid({
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
            Six workflow risks that scale with production
          </h2>
          <div className="grid grid-cols-1 gap-px bg-white/20 rounded-sm backdrop-blur-[12px] lg:grid-cols-2">
            {riskSections.map((risk, i) => (
              <WorkflowRiskCard key={risk._key} risk={risk} index={i} />
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
            <CTAButton href="#download">Download the Guide</CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

function DownloadBriefForm() {
  const [formData, setFormData] = useState({
    email: '',
    company: '',
    role: '',
    workflowRisk: '',
    workflowDescription: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.email || !formData.company || !formData.role || !formData.workflowRisk) {
      setError('Please fill in all required fields.')
      return
    }

    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    setIsSubmitting(true)

    // TODO: Integrate with backend/CRM (Attio)
    setTimeout(() => {
      setIsSubmitting(false)
      setIsSuccess(true)
    }, 1000)
  }

  if (isSuccess) {
    return (
      <section id="download" data-header-theme="light">
        <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
          <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[80ch] text-center">
            <h2 className="t-d2-sans">The field guide is ready</h2>
            <p className="t-p-lg-serif text-white">
              You can download the Production Memory Field Guide now.
            </p>
            <div className="flex flex-col sm:flex-row gap-16 justify-center">
              <a
                className="t-button min-w-220 w-fit inline-flex justify-center items-center rounded-sm h-48 gap-x-9 px-12 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30"
                href={FIELD_GUIDE_PDF_URL}
                target="_blank"
                rel="noreferrer"
              >
                <span className="t-p-sans">Download the Field Guide</span>
              </a>
              <a
                className="t-button min-w-220 w-fit inline-flex justify-center items-center rounded-sm h-48 gap-x-9 px-12 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30"
                href="#pilot"
              >
                <span className="t-p-sans">Scope a pilot</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="download" data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[90ch]">
          <h2 className="t-d2-sans text-center">
            Download the Production Memory Field Guide
          </h2>
          <form onSubmit={handleSubmit} className="space-y-24 max-w-[80ch] mx-auto">
          <p className="mb-20 t-p-lg-serif lg:mx-auto text-white">
            Learn how to understand, diagnose, quantify, and address the production-memory risks behind AI-native creative work.
          </p>
            <div>
              <label htmlFor="email" className="block t-p-sans mb-8">
                Work email *
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full p-16 rounded-sm border border-white/20 bg-white/5 text-white placeholder-white/40 t-p-sans focus:outline-none focus:border-white/40"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label htmlFor="company" className="block t-p-sans mb-8">
                Company *
              </label>
              <input
                type="text"
                id="company"
                required
                value={formData.company}
                onChange={(e) => setFormData({...formData, company: e.target.value})}
                className="w-full p-16 rounded-sm border border-white/20 bg-white/5 text-white placeholder-white/40 t-p-sans focus:outline-none focus:border-white/40"
                placeholder="Company name"
              />
            </div>
            <div>
              <label htmlFor="role" className="block t-p-sans mb-8">
                Your role *
              </label>
              <select
                id="role"
                required
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full p-16 rounded-sm border border-white/20 bg-white/5 text-white t-p-sans focus:outline-none focus:border-white/40"
              >
                <option value="">Select your role</option>
                <option value="founder-executive">Founder or executive</option>
                <option value="production-operations">Production or operations</option>
                <option value="creative-leadership">Creative leadership</option>
                <option value="technical-leadership">Technical leadership</option>
                <option value="producer-project-manager">Producer or project manager</option>
                <option value="artist-creator">Artist or creator</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="workflowRisk" className="block t-p-sans mb-8">
                Which workflow risk is most relevant? *
              </label>
              <select
                id="workflowRisk"
                required
                value={formData.workflowRisk}
                onChange={(e) => setFormData({...formData, workflowRisk: e.target.value})}
                className="w-full p-16 rounded-sm border border-white/20 bg-white/5 text-white t-p-sans focus:outline-none focus:border-white/40"
              >
                <option value="">Select a workflow risk</option>
                <option value="approved-version">Approved version confusion</option>
                <option value="reproducibility">Failed asset reproduction</option>
                <option value="variants">&quot;Five more like this&quot; becomes a rebuild</option>
                <option value="continuity">Character or visual continuity drift</option>
                <option value="handoff">Production knowledge leaves with the creator</option>
                <option value="variant-control">Variant families become hard to control</option>
                <option value="not-sure">Not sure yet</option>
              </select>
            </div>
            <div>
              <label htmlFor="workflowDescription" className="block t-p-sans mb-8">
                Describe the workflow you are trying to preserve (optional)
              </label>
              <textarea
                id="workflowDescription"
                value={formData.workflowDescription}
                onChange={(e) => setFormData({...formData, workflowDescription: e.target.value})}
                rows={4}
                className="w-full p-16 rounded-sm border border-white/20 bg-white/5 text-white placeholder-white/40 t-p-sans focus:outline-none focus:border-white/40"
                placeholder="Tell us about your production workflow..."
              />
            </div>
            {error ? (
              <p className="t-p-sans text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="t-button min-w-220 w-full inline-flex justify-center items-center rounded-sm h-48 gap-x-9 px-12 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="t-p-sans">
                {isSubmitting ? 'Submitting...' : 'Download the Guide'}
              </span>
            </button>
            <p className="t-p-sans text-white">
              We follow up when your selected workflow appears relevant to a
              Portals production pilot.
            </p>
          </form>
          <input type="hidden" name="utm_source" />
          <input type="hidden" name="utm_medium" />
          <input type="hidden" name="utm_campaign" />
          <input type="hidden" name="utm_content" />
          <input type="hidden" name="utm_term" />
          <input type="hidden" name="referrer" />
          <input type="hidden" name="landing_page" />
          <input
            type="hidden"
            name="download_asset"
            value="Production Memory Field Guide"
          />
          <input type="hidden" name="selected_use_case" />
        </div>
      </div>
    </section>
  )
}

function PilotCTASection({document}: {document: ResourceDocument}) {
  const cta = document.finalCta

  if (!cta) return null

  const href = scopeAPilotMailto

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
            <div className="flex justify-center">
              <a
                className="t-button min-w-220 w-fit inline-flex justify-center items-center rounded-sm h-48 gap-x-9 px-12 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:!bg-white/30"
                href={href}
                target={cta.primaryCta.openInNewTab ? '_blank' : undefined}
                rel={cta.primaryCta.openInNewTab ? 'noreferrer' : undefined}
              >
                <span className="t-p-sans">{cta.primaryCta.label}</span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

const faqs = [
  {
    question: 'Who is the field guide for?',
    answer:
      'It is for creative organizations producing high volumes of AI-assisted work across multiple people, tools, clients, projects, or production cycles.',
  },
  {
    question: 'What is Portals?',
    answer:
      'Portals is the production repository for AI-native creative organizations. It preserves the history and context behind important AI-generated assets so teams can find, understand, reproduce, and extend their work.',
  },
  {
    question: 'Is Portals a digital asset management system?',
    answer:
      'Portals is not a traditional DAM. A DAM primarily organizes and distributes files. Portals stores the files and preserves the evolving production identity, history, context, approvals, and lineage behind the asset.',
  },
  {
    question: 'Do I need Portals to use the field guide?',
    answer: 'No. The guide includes minimum practices that teams can implement using folders, spreadsheets, documentation, approval logs, and handoff procedures.',
  },
  {
    question: 'What is production memory?',
    answer: 'Production memory is the complete, recoverable organizational record behind an important asset: its approved version, previous versions, creation context, decisions, and recovery information.',
  },
  {
    question: 'Does Portals replace creative tools?',
    answer:
      'No. Portals works beneath the production stack. Teams continue using their preferred generation, editing, review, storage, and delivery tools.',
  },
  {
    question: 'What does a production pilot prove?',
    answer:
      'A pilot tests whether preserving production memory creates measurable value on one real workflow through faster retrieval, stronger reproducibility, controlled extension, better knowledge transfer, or reduced production risk.',
  },
]

function ResourceFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[100ch]">
          <h2 className="t-d2-sans max-w-[12em]">
            Frequently Asked Questions
          </h2>
          <div className="space-y-16">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-white/30 rounded-sm">
                <button
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
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[160ch] text-center">
          <h2 className="t-d2-sans max-w-[13em] mx-auto">
            Stop losing your best AI work. <br /> Start building on it.
          </h2>
          <p className="t-p-lg-serif max-w-[26em] mx-auto text-white">
            Give every asset your team creates a permanent identity, a complete
            history, and a system of record it can be trusted against from first
            generation through shipped production.
          </p>
          <div className="flex flex-col sm:flex-row gap-16 items-center justify-center">
            <CTAButton href={scopeAPilotMailto}>Scope a pilot</CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ResourceBriefClient({
  document,
}: {
  document: ResourceDocument
}) {
  return (
    <>
      <StructuredData />
      <ResourceHero document={document} />
      <WorkflowRiskGrid sections={document.sections} />
      <WhatsInside sections={document.sections} />
      <DownloadBriefForm />
      <PilotCTASection document={document} />
      <ResourceFAQ />
      <FinalCTA />
    </>
  )
}
