'use client'

import {useState} from 'react'
import {
  ArrowRight,
  Check,
} from 'lucide-react'
import {CTAButton} from '@/components/CTAButton'
import {PilotScopeForm} from '@/components/leads/PilotScopeForm'
import type {KnownLeadContext} from '@/lib/leads/contracts'
import type {
  DocumentSection,
  PackageSpecification,
  PortableTextBlock,
  ResourceDocument,
} from '@/types/resource'
import {
  PACKAGE_SPEC_SLUGS,
  findPackageSpecification,
  packageLimitLabel,
  packageMilestoneLabel,
  packagePriceLabel,
} from '@/lib/package-specifications'

type SubmitState =
  | {status: 'idle'}
  | {status: 'submitting'}
  | {
      status: 'success'
      calendarUrl?: string
      downloadUrl?: string
      preview?: boolean
    }
  | {status: 'error'; message: string}

function paidPilotSpec(document: ResourceDocument): PackageSpecification | undefined {
  return findPackageSpecification(
    document.packageSpecifications,
    PACKAGE_SPEC_SLUGS.paidPilot,
  )
}

function paidPilotFaqs(specification: PackageSpecification | undefined) {
  const firstValue = packageMilestoneLabel(specification, 'first value')
  const period = packageMilestoneLabel(specification, 'pilot period')
  const price = packagePriceLabel(specification)
  const participants = packageLimitLabel(specification, 'participants')

  return [
    {
      question: 'how is this different from a free trial?',
      answer:
        'this is a focused commercial evaluation using real production work, agreed success criteria, named participants, and a final decision date. it is built to prove an operational outcome, not encourage indefinite product exploration.',
    },
    {
      question: firstValue
        ? `what should happen in the first ${firstValue}?`
        : 'what should happen at first value?',
      answer:
        'one active project and one historical project become structured, searchable production records that preserve the available history and reveal what is missing. your team should be able to find the approved asset, understand how it was produced, and see what is required to reproduce or extend it.',
    },
    {
      question: price ? `what does the ${price} cover?` : 'what does the pilot fee cover?',
      answer: [
        'the fee covers workflow alignment, pilot repository configuration',
        participants ? `onboarding for ${participants} participants` : 'participant onboarding',
        'agreed integration setup where applicable, active and historical project structure, support, and the final evaluation. One agreed standard integration or export path is included. Custom integration development is separately scoped.',
      ].join(', '),
    },
    {
      question: 'which projects should we choose?',
      answer:
        'choose one active project with current production behavior and one historical project whose decisions, prompts, versions, or source context are valuable enough to recover and reuse.',
    },
    {
      question: 'does the pilot fee apply to an annual agreement?',
      answer:
        'yes, when the agreed success criteria and written conversion terms are met. the annual deployment scope, price, credit terms, and decision window are defined before kickoff.',
    },
    {
      question: period ? `what happens after ${period}?` : 'what happens after the pilot?',
      answer:
        'the final review produces a clear decision: deploy portals, extend the pilot under a defined scope, or conclude that portals is not the right fit at this time.',
    },
  ]
}

function sectionByAnchor(
  document: ResourceDocument,
  anchor: string,
): DocumentSection | undefined {
  return document.sections.find((section) => section.anchor === anchor)
}

function blockText(block: PortableTextBlock): string {
  return block.children?.map((child) => child.text).join('') ?? ''
}

function sectionParagraphs(section?: DocumentSection): string[] {
  return (
    section?.body
      .filter((block) => block._type === 'block' && !block.listItem)
      .map(blockText)
      .filter(Boolean) ?? []
  )
}

function sectionBullets(section?: DocumentSection): string[] {
  return (
    section?.body
      .filter((block) => block._type === 'block' && Boolean(block.listItem))
      .map(blockText)
      .filter(Boolean) ?? []
  )
}

function StaticPilotBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(1, 5, 40, 0.12) 0%, rgba(1, 5, 40, 0.74) 100%), linear-gradient(135deg, #010528 0%, #142E78 38%, #2F66B5 68%, #79C7DA 100%)',
      }}
    />
  )
}

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-(--z-header)">
      <div className="flex h-Header-h items-center justify-between px-sms">
        <a href="/" className="t-h3-sans !font-medium text-white">
          portals
        </a>
        {/* <CTAButton href="#scope" className="!min-w-0">
          <span>Scope a pilot</span>
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </CTAButton> */}
      </div>
    </header>
  )
}

function Hero({document}: {document: ResourceDocument}) {
  const landing = document.landingPage ?? {}
  const specification = paidPilotSpec(document)
  const metrics = [
    [packageMilestoneLabel(specification, 'pilot period'), 'pilot period'],
    [packagePriceLabel(specification), specification?.price?.billingNote || 'price'],
    [packageMilestoneLabel(specification, 'first value'), 'first value'],
    [packageLimitLabel(specification, 'participants'), 'participants'],
  ].filter(([value]) => Boolean(value))

  return (
    <section
      data-header-theme="light"
      className="relative flex min-h-screen items-center overflow-hidden"
    >
      <Header />
      <div className="ui-grid relative z-10 w-full gap-y-36 py-fluid-[96,126] text-white">
        <div className="col-span-full lg:col-span-14">
          <h1 className="t-d2-sans max-w-[11em]">
            {landing.headline || document.title}
          </h1>
          <p className="mt-28 max-w-[37em] t-p-lg-serif text-white">
            {landing.description || document.abstract}
          </p>
          <div className="mt-32 flex flex-col gap-12 sm:flex-row">
            <CTAButton href="#scope">
              <span>Scope a pilot</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
            </CTAButton>
          </div>
        </div>

        <dl className="col-span-full grid grid-cols-2 gap-x-20 gap-y-28 lg:col-span-8 lg:col-start-18">
          {metrics.map(([value, label]) => (
            <div key={label}>
              <dd className="t-h1-sans text-white">{value}</dd>
              <dt className="mt-6 t-p-sm-sans text-white">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Objective({document}: {document: ResourceDocument}) {
  const objective = sectionByAnchor(document, 'objective')
  const outcome = sectionByAnchor(document, 'intended-outcome')

  if (!objective || !outcome) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-10">
          <p className="t-p-sans text-white">the objective</p>
          <h2 className="mt-20 max-w-[10em] t-d2-sans">
            preserve one workflow well enough to recover and extend it.
          </h2>
        </div>
        <div className="col-span-full lg:col-span-10 lg:col-start-14">
          <p className="t-p-lg-serif text-white">{objective.summary}</p>
          <div className="mt-24 space-y-16 t-p-sans text-white">
            {sectionParagraphs(objective).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-32 max-w-[38em] t-h3-sans text-white">
            {outcome.summary}
          </p>
        </div>
      </div>
    </section>
  )
}

function ScopeAndMilestone({document}: {document: ResourceDocument}) {
  const scope = sectionByAnchor(document, 'scope')
  const milestone = sectionByAnchor(document, 'first-value')
  const specification = paidPilotSpec(document)
  const firstValue = packageMilestoneLabel(specification, 'first value')

  if (!scope || !milestone) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-44 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-11">
          <p className="t-p-sans text-white">a deliberately narrow scope</p>
          <h2 className="mt-20 max-w-[9em] t-d2-sans">
            real work, real people, one decision.
          </h2>
          <p className="mt-24 max-w-[36em] t-p-lg-serif text-white">
            {scope.summary}
          </p>
        </div>
        <ul className="col-span-full grid gap-x-24 gap-y-18 sm:grid-cols-2 lg:col-span-11 lg:col-start-14">
          {sectionBullets(scope).map((item) => (
            <li key={item} className="flex items-start gap-12 t-p-sans text-white">
              <Check
                aria-hidden="true"
                className="mt-2 shrink-0 text-white"
                size={18}
                strokeWidth={1.8}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="col-span-full mt-24 lg:mt-0 lg:col-span-8">
          <p className="t-p-sans text-white">first-value milestone</p>
          <p className="mt-20 t-d2-sans text-white">{firstValue}</p>
        </div>
        <div className="col-span-full lg:mt-24 lg:col-span-12 lg:col-start-13">
          <h3 className="t-p-lg-serif">{milestone.summary}</h3>
          <div className="mt-20 space-y-16 t-p-sans text-white">
            {sectionParagraphs(milestone).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SuccessCriteria({document}: {document: ResourceDocument}) {
  const section = sectionByAnchor(document, 'success-criteria')
  if (!section) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-40 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-10">
          <h2 className="mt-20 max-w-[9em] t-d2-sans">
            success criteria
          </h2>
          <p className="mt-24 max-w-[35em] t-p-lg-serif text-white">
            {section.summary}
          </p>
        </div>
        <ol className="col-span-full space-y-24 lg:col-span-11 lg:col-start-14">
          {sectionBullets(section).map((item, index) => (
            <li key={item} className="grid grid-cols-[48px_1fr] gap-12">
              <span className="t-h2-sans text-white">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="t-p-lg-serif text-white">{item}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CommercialTerms({document}: {document: ResourceDocument}) {
  const section = sectionByAnchor(document, 'commercial-terms')
  const specification = paidPilotSpec(document)
  if (!section) return null
  const commercialValue = [
    packagePriceLabel(specification),
    specification?.price?.billingNote,
  ].filter(Boolean).join(' ')

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-10">
          <h2 className="max-w-[8em] t-d2-sans">commercial terms before launch.</h2>
          {/* <p className="mt-12 t-d2-sans text-white">{commercialValue}</p> */}
        </div>
        <div className="col-span-full lg:col-span-10 lg:col-start-14">
          <p className="t-p-lg-serif text-white">{section.summary}</p>
          <div className="mt-24 space-y-16 t-p-sans text-white">
            {sectionParagraphs(section).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Responsibilities({document}: {document: ResourceDocument}) {
  const portals = sectionByAnchor(document, 'portals-responsibilities')
  const customer = sectionByAnchor(document, 'customer-responsibilities')
  if (!portals || !customer) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-40 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-10">
          <p className="t-d2-sans text-white">responsibilities</p>
          <h2 className="mt-20 max-w-[10em] t-p-lg-serif">
            both sides know what they are bringing.
          </h2>
        </div>

        {[
          [portals, 'portals provides'],
          [customer, 'the customer provides'],
        ].map(([section, label], index) => (
          <div
            key={(section as DocumentSection)._key}
            className={`col-span-full lg:col-span-10 ${index === 0 ? 'lg:col-start-3' : 'lg:col-start-14'}`}
          >
            <h3 className="t-h1-sans text-white">{label as string}</h3>
            <p className="mt-16 t-p-sans text-white">
              {(section as DocumentSection).summary}
            </p>
            <ul className="mt-24 space-y-14">
              {sectionBullets(section as DocumentSection).map((item) => (
                <li key={item} className="flex items-start gap-12 t-p-sans text-white">
                  <Check
                    aria-hidden="true"
                    className="mt-2 shrink-0 text-white"
                    size={17}
                    strokeWidth={1.8}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function PilotForm({
  specSummary,
  context,
}: {
  specSummary: string
  context: KnownLeadContext
}) {
  return (
    <section id="scope" data-header-theme="light" className="scroll-mt-20">
      <div className="ui-grid gap-y-80 py-fluid-[76,106] text-white">
        <div className="col-span-full xl:col-span-10">
          <p className="t-p-sans text-white">build your pilot plan</p>
          <h2 className="mt-20 t-d2-sans">
            put one production workflow under test
          </h2>
          <p className="mt-24 max-w-[35em] t-p-lg-serif text-white">
            five short stages: eligibility, scope, success, purchase, and
            confirmation. your answers produce a personalized pilot plan and
            approval room — no call required.
          </p>
          <p className="mt-24 max-w-[36em] t-p-lg-sans text-white">
            the plan covers objectives, scope, milestones, success criteria,
            commercial terms, and security information. once confirmed, the
            standard pilot agreement is generated for signature and funding.
          </p>
        </div>

        <div className="col-span-full xl:col-span-13 xl:col-start-12 transition-[min-height] duration-500 ease-out motion-reduce:transition-none">
          <PilotScopeForm specSummary={specSummary} context={context} />
        </div>
      </div>
    </section>
  )
}

function PilotFaq({document}: {document: ResourceDocument}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const faqs = paidPilotFaqs(paidPilotSpec(document))

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full mx-auto flex flex-col lg:items-center w-full space-y-36">
          <h2 className="max-w-[18em] t-d2-sans">
            Frequently asked questions
          </h2>
          <div className="space-y-16 max-w-3xl lg:w-3xl">
            {faqs.map((faq, index) => (
              <div
                key={faq.question}
                className="rounded-sm border border-white/70"
              >
                <CTAButton
                  appearance="plain"
                  type="button"
                  onClick={() =>
                    setOpenIndex(openIndex === index ? null : index)
                  }
                  className="flex w-full items-center justify-between !p-24 h-auto text-left text-white focus:outline-none [&>span]:w-full [&>span]:justify-between"
                  aria-expanded={openIndex === index}
                >
                  <span className="t-p-serif">{faq.question}</span>
                  <span
                    aria-hidden="true"
                    className={`transform transition-transform duration-300 ${openIndex === index ? 'rotate-45' : ''}`}
                  >
                    +
                  </span>
                </CTAButton>
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

function FinalDecision({document}: {document: ResourceDocument}) {
  const review = sectionByAnchor(document, 'final-review')
  if (!review) return null

  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-36 py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-13">
          <p className="t-p-sans text-white">the final decision</p>
          <h2 className="mt-20 max-w-[11em] t-d2-sans">
            deploy, extend under defined terms, or stop.
          </h2>
        </div>
        <div className="col-span-full lg:col-span-9 lg:col-start-16">
          <p className="t-p-lg-serif text-white">{review.summary}</p>
          <div className="mt-28 flex flex-col gap-12">
            <CTAButton href="#scope">
              <span>Scope a paid pilot</span>
              <ArrowRight aria-hidden="true" size={18} strokeWidth={1.8} />
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function PaidPilotLandingPage({
  document,
  context,
}: {
  document: ResourceDocument
  context: KnownLeadContext
}) {
  const specification = paidPilotSpec(document)
  const formSpecSummary = [
    [
      packagePriceLabel(specification),
      specification?.price?.billingNote,
    ].filter(Boolean).join(' '),
    packageMilestoneLabel(specification, 'pilot period'),
  ].filter(Boolean).join(' / ')

  return (
    <main className="relative z-(--z-main) min-h-screen overflow-hidden text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none h-px w-full"
        data-webgl-marker="scrollFrom"
        data-webgl-position="0"
        data-webgl-easing="easeInOut"
      />
      <StaticPilotBackground />
      <div className="relative z-10">
        <Hero document={document} />
        <div
          aria-hidden="true"
          className="pointer-events-none h-px w-full"
          data-webgl-marker="scrollTo"
          data-webgl-position="0.96"
        />
        <Objective document={document} />
        <ScopeAndMilestone document={document} />
        <SuccessCriteria document={document} />
        <CommercialTerms document={document} />
        <Responsibilities document={document} />
        <PilotForm specSummary={formSpecSummary} context={context} />
        <PilotFaq document={document} />
        <FinalDecision document={document} />
      </div>
    </main>
  )
}
