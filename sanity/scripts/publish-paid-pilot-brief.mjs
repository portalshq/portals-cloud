import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

let keyIndex = 0

function key(prefix) {
  keyIndex += 1
  return `${prefix}-${String(keyIndex).padStart(3, '0')}`
}

function block(text, {listItem, marks = [], style = 'normal'} = {}) {
  return {
    _key: key('block'),
    _type: 'block',
    style,
    ...(listItem ? {listItem, level: 1} : {}),
    markDefs: [],
    children: [
      {
        _key: key('span'),
        _type: 'span',
        marks,
        text,
      },
    ],
  }
}

function packageSpecReference({title, label, valuePath, note, packageSpec}) {
  return {
    _key: key('spec'),
    _type: 'packageSpecReferenceBlock',
    title,
    label,
    valuePath,
    note,
    packageSpecification: packageSpec,
  }
}

function section({
  anchor,
  title,
  summary,
  paragraphs = [],
  bullets = [],
  references = [],
  sectionType = 'offer',
  pdf = true,
}) {
  return {
    _key: key('section'),
    _type: 'documentSection',
    sectionType,
    anchor: {_type: 'slug', current: anchor},
    title,
    summary,
    landingExcerpt: summary,
    surfaces: {
      landing: 'full',
      pdf,
      tableOfContents: false,
    },
    pdfOptions: {
      startOnNewPage: false,
      keepTogether: false,
    },
    body: [
      ...references,
      ...paragraphs.map((text) => block(text)),
      ...bullets.map((text) => block(text, {listItem: 'bullet'})),
    ],
  }
}

async function packageReference(slug) {
  const document = await client.fetch(
    '*[_type == "packageSpecification" && slug.current == $slug][0]{_id}',
    {slug},
  )

  if (!document?._id) {
    throw new Error(`Missing package specification: ${slug}`)
  }

  return {
    _key: slug,
    _type: 'reference',
    _ref: document._id,
  }
}

const paidPilotPackage = await packageReference('paid-pilot')

const document = {
  _type: 'resourceDocument',
  status: 'published',
  resourceKind: 'brief',
  title: 'portals paid production pilot brief',
  shortTitle: 'paid production pilot',
  slug: {_type: 'slug', current: 'paid-pilot'},
  subtitle: 'a focused commercial evaluation using real production work.',
  abstract:
    'prove that portals can preserve and recover the complete production history of one active ai workflow, so your team can find, understand, reproduce, and extend valuable work without rediscovery or rework.',
  audience: [
    'creative operations leaders',
    'production teams',
    'technical leaders',
    'economic buyers',
  ],
  publisher: 'portals',
  authors: [
    {
      _key: key('author'),
      _type: 'object',
      name: 'portals',
      role: 'production pilot team',
    },
  ],
  publishedAt: '2026-07-31T12:00:00.000Z',
  edition: 'version 1.0',
  seo: {
    _type: 'seoSettings',
    metaTitle: 'paid production pilot | portals',
    metaDescription:
      'scope a portals pilot to preserve and recover one real ai production workflow.',
    keywords: [
      'portals paid pilot',
      'ai production workflow',
      'production memory pilot',
      'creative operations',
    ],
    shareTitle: 'portals paid production pilot',
    shareDescription:
      'a defined commercial evaluation with a first-value milestone.',
    canonicalPath: '/paid-pilot',
    noIndex: false,
  },
  landingPage: {
    _type: 'landingPageSettings',
    enabled: true,
    headline: 'prove production memory on real work.',
    description:
      'prove that a historic production record makes your team faster, cheaper, and infinitely more collaborative.',
    primaryCta: {
      _type: 'cta',
      label: 'scope a paid pilot',
      action: 'internal',
      href: '#scope',
      style: 'primary',
    },
    secondaryCta: {
      _type: 'cta',
      label: 'download the pilot brief',
      action: 'downloadPdf',
      style: 'secondary',
      openInNewTab: true,
    },
    showPublicationMeta: false,
    showSectionNavigation: false,
  },
  pdf: {
    _type: 'pdfSettings',
    enabled: true,
    fileName: 'portals-paid-production-pilot-brief.pdf',
    titleOverride: 'portals paid production pilot brief',
    subtitleOverride: 'production memory pilot',
    pageSize: 'LETTER',
    includeCover: true,
    includeTableOfContents: false,
    showPageNumbers: true,
    headerText: 'portals paid production pilot',
    footerText: 'portals / version 1.0 / july 2026',
    accentColor: '#79C7DA',
    legalNote:
      'pilot scope, integrations, annual deployment price, credit terms, and final decision date must be agreed in writing before launch. this brief is informational and is not a binding order form.',
  },
  packageSpecifications: [paidPilotPackage],
  sections: [
    section({
      anchor: 'objective',
      title: 'objective',
      summary:
        'run a 21-day pilot to eliminate rework, lock in continuity, and decide if Portals belongs in your production stack.',
      paragraphs: [
        'by the final review, any team member will be able to locate the exact approved version instantly, recover the exact prompts and source context, and seamlessly hand off the work to another creator.',
      ],
    }),
    section({
      anchor: 'scope',
      title: 'pilot scope',
      summary:
        'A paid pilot follows a standard, customizable specification.',
      references: [
        packageSpecReference({
          title: 'paid pilot participant cap',
          label: 'participants',
          valuePath: 'limits.participants.displayValue',
          packageSpec: paidPilotPackage,
        }),
        packageSpecReference({
          title: 'paid pilot period',
          label: 'pilot period',
          valuePath: 'milestones.0.displayValue',
          packageSpec: paidPilotPackage,
        }),
      ],
      bullets: [
        'referenced production-team scope',
        'referenced active-workflow scope',
        'referenced historical-project scope',
        'referenced participant cap',
        'integrations agreed before launch',
        'workflow review, onboarding, and final evaluation',
        'success criteria agreed before launch',
      ],
    }),
    section({
      anchor: 'first-value',
      title: 'first-value milestone',
      summary:
        'the first-value milestone is controlled by the referenced paid-pilot package specification.',
      references: [
        packageSpecReference({
          title: 'first-value milestone',
          label: 'first value',
          valuePath: 'milestones.1.displayValue',
          packageSpec: paidPilotPackage,
        }),
      ],
      paragraphs: [
        'within 48 hours, your pilot repository will capture your first complete production record. where available, this includes approved assets & prior versions, alternate generations & source prompts, model configurations, references, approval states, lineage, & decisions',
      ],
    }),
    section({
      anchor: 'success-criteria',
      title: 'success criteria',
      summary:
        'the pilot is a success when your creative workflow becomes drastically faster to retrieve, explain, reproduce, and extend. We track 6 specific metrics:',
      bullets: [
        'instant retrieval — A team member locates an approved asset in under 60 seconds.',
        'unified context — Prompts, models, and revisions live in one place, not across fragmented systems.',
        'infinite continuity — A creator reproduces or meaningfully extends a selected asset without starting over.',
        'seamless handoff — A creator who did not build the asset can understand its history.',
        'proven ROI — The team measures reduced rediscovery and recreation effort enough to justify the annual price.',
        'active adoption — At least three team members actively use Portals during the pilot duration.',
      ],
    }),
    section({
      anchor: 'commercial-terms',
      title: 'commercial terms',
      summary:
        'before launch, we agree on exact dates, pilot owners, included projects, and annual deployment scope.',
      references: [
        packageSpecReference({
          title: 'paid pilot price',
          label: 'price',
          valuePath: 'price.displayValue',
          packageSpec: paidPilotPackage,
        }),
        packageSpecReference({
          title: 'annual-credit decision window',
          label: 'decision window',
          valuePath: 'milestones.2.displayValue',
          packageSpec: paidPilotPackage,
        }),
      ],
      paragraphs: [
        'the pilot credit: if the pilot meets the success criteria and you transition to an annual agreement within the decision window, the $5,000 fee is credited 100% toward your first annual contract.',
      ],
    }),
    section({
      anchor: 'portals-responsibilities',
      title: 'what portals provides',
      summary:
        'portals configures the pilot, aligns the workflow, onboards participants, supports the evaluation, and documents the outcome.',
      bullets: [
        'pilot repository configuration',
        'workflow alignment & onboarding',
        'pre-agreed integration setup',
        'guidance on context, and lineage capture',
        'ongoing support during the pilot duration',
        'final review and annual recommendation',
      ],
    }),
    section({
      anchor: 'customer-responsibilities',
      title: 'what the customer provides',
      summary:
        'the customer provides real production work, a named owner, participating users, system access, timely feedback, and a decision sponsor.',
      bullets: [
        'one named, dedicated pilot owner',
        'access to the selected active/historical projects',
        'relevant assets, prompts, references, & notes',
        'timely feedback during the pilot',
        'attendance at launch and final review',
        'participation from the economic buyer',
      ],
    }),
    section({
      anchor: 'final-review',
      title: 'final pilot review',
      summary:
        'The review produces a clear decision: deploy portals, extend under defined terms, or conclude that it is not the right fit.',
      bullets: [
        'confirm whether the 48-hour milestone was achieved',
        'score the agreed success criteria',
        'identify reduced production risks and observed workflow gains',
        'document remaining constraints',
        'decide whether annual deployment is justified',
      ],
    }),
    section({
      anchor: 'intended-outcome',
      title: 'intended outcome',
      summary:
        'when the team is asked for five more like this, the answer should be available in minutes, not reconstructed over days.',
      paragraphs: [
        'a successful pilot proves that portals preserves not only files, but the decisions, context, versions, and lineage that make valuable creative work reusable.',
      ],
    }),
    section({
      anchor: 'qualification',
      title: 'why the pilot is paid',
      summary:
        'the form is a qualified buying signal; the commercial conversion point is paid pilot acceptance.',
      paragraphs: [
        'a prospect who discusses scope, security, personnel, integrations, timing, or pricing is evaluating a real deployment. indefinite free access does not test the operational or commercial decision the pilot is designed to make.',
      ],
      pdf: false,
    }),
  ],
  finalCta: {
    _type: 'finalCtaBlock',
    headline: 'put one real workflow under test.',
    description:
      'define the people, projects, integrations, success criteria, price, and decision date before implementation begins.',
    primaryCta: {
      _type: 'cta',
      label: 'scope a paid pilot',
      action: 'internal',
      href: '#scope',
      style: 'primary',
    },
    secondaryCta: {
      _type: 'cta',
      label: 'download the pilot brief',
      action: 'downloadPdf',
      style: 'secondary',
      openInNewTab: true,
    },
  },
}

const existing = await client.fetch(
  '*[_type == "resourceDocument" && slug.current == $slug][0]{_id}',
  {slug: document.slug.current},
)

if (existing?._id) {
  const {_type, ...patchData} = document
  const result = await client.patch(existing._id).set(patchData).commit()
  console.log(`updated ${result._id}`)
} else {
  const result = await client.create(document)
  console.log(`created ${result._id}`)
}
