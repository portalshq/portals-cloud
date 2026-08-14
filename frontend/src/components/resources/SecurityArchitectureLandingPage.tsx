'use client'

import {useState} from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CircleAlert,
} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {ResourceLeadForm} from '@/components/leads/ResourceLeadForm'
import type {KnownLeadContext} from '@/lib/leads/contracts'
import type {ResourceDocument} from '@/types/resource'
import {getFaqsByCategories} from '@/lib/faqs'
import {ResourceBody} from './ResourceBody'

const CURRENT_CERTIFICATIONS_ANCHOR = 'current-certifications'
const PLANNED_CERTIFICATIONS_ANCHOR = 'planned-certifications'

function publicationDate(value?: string): string {
  if (!value) return 'July 31, 2026'

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-(--z-header)">
      <div className="flex h-Header-h items-center justify-between px-sms">
        <a href="/" className="t-h3-sans !font-medium text-white">
          portals
        </a>
        <a
          href="#controls"
          className="hidden t-p-sm-sans text-white transition-colors hover:text-white sm:block"
        >
          security brief / 2026
        </a>
      </div>
    </header>
  )
}

function FlowingSecurityBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[rgba(1,5,40,0.62)]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(91,196,186,0.18),transparent_34%),linear-gradient(120deg,rgba(1,5,40,0.3)_0%,rgba(1,5,40,0.82)_48%,rgba(6,11,54,0.54)_100%)]" />
    </div>
  )
}

function statusLabel(value?: string) {
  return value ? value.toLowerCase() : 'current'
}

const bodyTone =
  '[&_p]:!text-white [&_li]:!text-white [&_figcaption]:!text-white [&_td]:!text-white [&_th]:!text-white [&_blockquote]:!text-white'

const bodyNoDividers =
  '[&_aside]:!border-transparent [&_blockquote]:!border-transparent [&_figure]:!border-transparent [&_tr]:!border-transparent [&_hr]:hidden'

const securityFaqs = getFaqsByCategories(['security'])

function SectionLabel({children}: {children: string}) {
  return <p className="t-p-sans text-white">{children}</p>
}

function Hero({document}: {document: ResourceDocument}) {
  const landing = document.landingPage ?? {}

  return (
    <section
      data-header-theme="light"
      className="relative flex min-h-screen items-center overflow-hidden"
    >
      <Header />
      <div className="ui-grid relative z-10 w-full gap-y-36 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-16">
          {landing.eyebrow ? (
            <p className="mb-24 t-p-sans text-white">
              {landing.eyebrow.toLowerCase()}
            </p>
          ) : null}
          <h1 className="t-d2-sans max-w-[12em]">
            {landing.headline || document.title}
          </h1>
          <p className="mt-28 max-w-[38em] t-p-lg-serif text-white">
            {landing.description || document.abstract}
          </p>
          <div className="mt-32 flex flex-col gap-12 sm:flex-row">
            <CTAButton href="#download" analyticsLabel="Download the Security Brief" analyticsIntent="security_download">
              <ArrowDownToLine aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>Download security details</span>
            </CTAButton>
            <CTAButton
              href="/paid-pilot#scope"
              analyticsLabel="Scope a Paid Pilot"
              analyticsIntent="pilot_scope"
            >
              <span>Scope a paid pilot</span>
              <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
            </CTAButton>
          </div>
        </div>

        <dl className="col-span-full mt-44 grid grid-cols-2 gap-20 lg:col-span-8 lg:col-start-17 lg:mt-0">
          {[
            ['status', 'public brief'],
            ['version', (document.edition || 'version 1.0').toLowerCase()],
            ['published', publicationDate(document.publishedAt).toLowerCase()],
            ['certifications', 'none'],
          ].map(([label, value]) => (
            <div key={label} className="min-h-96 rounded-sm bg-white/8 p-16 backdrop-blur-[18px]">
              <dt className="t-p-sm-sans text-white">
                {label}
              </dt>
              <dd className="mt-14 t-p-sm-sans text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Principles() {
  const principles = [
    'Logical organization isolation',
    'Explicit access boundaries',
    'Recoverable production history',
    'No training without written permission',
  ]

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-32 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-12">
          <h2 className="t-d2-sans max-w-[9em]">
            your production context is sensitive operational
            data. 
          </h2>
          <p className="mt-32 max-w-[39em] t-p-lg-serif text-white">
            Source media, prompts, client decisions, model settings, and lineage
            can carry commercial and intellectual-property value. Our security architecture is designed to protect it.
          </p>
        </div>
        <div className="col-span-full lg:col-span-11 lg:col-start-14">
          <ul className="grid gap-12">
            {principles.map((principle) => (
              <li
                key={principle}
                className="flex min-h-64 items-center gap-14 rounded-sm bg-white/8 p-16 t-p-sans text-white backdrop-blur-[18px]"
              >
                <Check
                  aria-hidden="true"
                  className="shrink-0 text-white"
                  size={18}
                  strokeWidth={1.8}
                />
                {principle.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function ControlInventory({document}: {document: ResourceDocument}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const controls = document.sections.filter(
    (section) =>
      section.anchor !== CURRENT_CERTIFICATIONS_ANCHOR &&
      section.anchor !== PLANNED_CERTIFICATIONS_ANCHOR,
  )

  return (
    <section
      id="controls"
      data-header-theme="light"
      className="scroll-mt-24"
    >
      <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-12">
          <h2 className="t-d2-sans max-w-[7em]">our current security posture</h2>
          <p className="mt-32 col-span-full t-p-serif text-white">
            Architecture, policy, operating position,
            and commitments. 
            <br/>
            Deployment-specific details and contractual controls are
            confirmed during pilot review.
          </p>
        </div>

        <div className="col-span-full mt-20 space-y-16">
          {controls.map((section, index) => (
            <div
              key={section._key}
              id={section.anchor}
              className="scroll-mt-24 rounded-sm border border-white/30 bg-white/8 backdrop-blur-[18px]"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex min-h-112 w-full items-center justify-between gap-20 p-24 text-left t-p-sans focus:outline-none"
                aria-expanded={openIndex === index}
                aria-controls={`${section.anchor}-content`}
              >
                <span>
                  <span className="mb-10 block t-p-sm-sans text-white">
                    {String(index + 1).padStart(2, '0')} / {statusLabel(section.eyebrow)}
                  </span>
                  {/* <span className="block t-p-serif">{section.title.toLowerCase()}</span> */}
                  <span className="mt-10 block max-w-[52em] t-p-sm-sans text-white">
                    {section.summary}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-[24px] leading-none transition-transform duration-300 ${openIndex === index ? 'rotate-45' : ''}`}
                >
                  +
                </span>
              </button>
              {openIndex === index ? (
                <div
                  id={`${section.anchor}-content`}
                  className={`px-24 pb-24 t-p-sm-sans text-white ${bodyTone} ${bodyNoDividers}`}
                >
                  <ResourceBody value={section.body} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AssuranceStatus({document}: {document: ResourceDocument}) {
  const current = document.sections.find(
    (section) => section.anchor === CURRENT_CERTIFICATIONS_ANCHOR,
  )
  const planned = document.sections.find(
    (section) => section.anchor === PLANNED_CERTIFICATIONS_ANCHOR,
  )

  if (!current || !planned) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-40 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-10">
          <div className="flex items-center gap-12 mt-24">
            <CircleAlert
              aria-hidden="true"
              className="text-white"
              size={30}
              strokeWidth={1.4}
            />
            <p className="t-p-sans text-white">{statusLabel(current.eyebrow)}</p>
          </div>
          {/* <h2 className="mt-24 t-d2-sans max-w-[10em]">
            no formal certification is claimed.
          </h2> */}
          <p className="mt-24 max-w-[36em] t-h3-sans text-white">
            {current.summary}
          </p>
          <div className={`mt-24 max-w-[42em] t-p-sans ${bodyTone} ${bodyNoDividers}`}>
            <ResourceBody value={current.body} />
          </div>
        </div>

        <div className="col-span-full rounded-sm bg-white/8 p-24 backdrop-blur-[18px] lg:col-span-11 lg:col-start-14">
          <h3 className="t-h3-sans">{planned.title.toLowerCase()}</h3>
          <p className="mt-24 t-p-sm-sans text-white">{planned.summary}</p>
          <div className={`mt-20 ${bodyTone} ${bodyNoDividers}`}>
            <ResourceBody value={planned.body} />
          </div>
        </div>
      </div>
    </section>
  )
}

function DownloadSection({
  document,
  context,
}: {
  document: ResourceDocument
  context: KnownLeadContext
}) {
  return (
    <section id="download" data-header-theme="light">
      <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
        {/* <div className="col-span-full lg:col-span-13">
          <SectionLabel>downloadable brief</SectionLabel>
          <h2 className="mt-20 t-d2-sans max-w-[10em]">
            put the security posture in the review packet.
          </h2>
        </div> */}
        <div className="col-span-full max-w-[48em] mx-auto">
          <ResourceLeadForm
            context={context}
            submissionType="security_download"
            title="Download the security brief"
            description="the pdf contains the control inventory, current certification statement, planned roadmap, legal note, and internal navigation."
            interestLabel="which diligence area matters most?"
            options={[
              {value: 'data-protection', label: 'data storage, isolation, and encryption'},
              {value: 'access-controls', label: 'authentication, permissions, and audit logging'},
              {value: 'resilience', label: 'backup, recovery, availability, and incident response'},
              {value: 'data-lifecycle', label: 'retention, deletion, and export'},
              {value: 'vendors', label: 'model policy and subprocessors'},
              {value: 'assurance', label: 'current and planned certifications'},
            ]}
            downloadLabel="Download security brief"
            sourcePage="/security-and-architecture"
          />
          <CTAButton className="mt-20" href="/paid-pilot#scope" analyticsLabel="Scope a Paid Pilot" analyticsIntent="pilot_scope">
            <span>Scope a paid pilot</span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.8} />
          </CTAButton>
        </div>
      </div>
    </section>
  )
}

function SecurityFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full mx-auto w-full max-w-[700px] space-y-36">
          <h2 className="t-d2-sans max-w-[12em]">
            Frequently asked questions
          </h2>
          <div className="space-y-16">
            {securityFaqs.map((faq, index) => (
              <div
                key={faq.question}
                className="rounded-sm border border-white/70 bg-white/8 backdrop-blur-[18px]"
              >
                <button
                  data-faq-question={faq.question}
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="cursor-pointer flex w-full items-center justify-between p-24 text-left t-p-sans focus:outline-none"
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

export function SecurityArchitectureLandingPage({
  document,
  context,
}: {
  document: ResourceDocument
  context: KnownLeadContext
}) {
  return (
    <main className="relative z-(--z-main) min-h-screen overflow-hidden text-white">
      <FlowingSecurityBackground />
      <div className="relative z-10">
        <Hero document={document} />
        <Principles />
        <ControlInventory document={document} />
        <AssuranceStatus document={document} />
        <SecurityFAQ />
        <DownloadSection document={document} context={context} />
      </div>
    </main>
  )
}
