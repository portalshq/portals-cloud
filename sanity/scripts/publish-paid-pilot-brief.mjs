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
      'turn selected active and historical work into complete, searchable production records, then decide whether portals deserves a place in your production stack.',
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
      'pilot scope, integrations, annual deployment price, credit terms, and final decision date must be agreed in writing before kickoff. this brief is informational and is not a binding order form.',
  },
  packageSpecifications: [paidPilotPackage],
  sections: [
    section({
      anchor: 'objective',
      title: 'objective',
      summary:
        'apply portals to one generative AI workflow to determine whether it materially improves context recovery, reduces wasted generation costs, speeds up creative retrieval, and preserves institutional production knowledge.',
      paragraphs: [
        'the pilot is not a general product trial. it is a focused commercial evaluation using real production work.',
        'by the final review, the team should know the approved version, understand who changed it and why, recover the prompts and source context behind it, trace its lineage, and determine whether another team member can continue the work.',
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
        'success criteria agreed before kickoff',
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
        'where available, the record includes the approved asset, prior versions, alternate generations, source prompts, model and tool context, references, production notes, approval state, decisions, lineage, and reusable context.',
        'the team should be able to locate the approved asset, understand how it was produced, and identify what is required to reproduce or extend it.',
      ],
    }),
    section({
      anchor: 'success-criteria',
      title: 'success criteria',
      summary:
        'the pilot succeeds when the workflow becomes faster to retrieve, explain, reproduce, and extend.',
      bullets: [
        'a designated team member locates the approved asset in under one minute',
        'the relevant generation context is recovered where available',
        'at least one asset is reproduced, extended, or used as a new branch',
        'a team member who did not create the asset can understand its history',
        'the team measures reduced rediscovery or recreation effort',
      ],
    }),
    section({
      anchor: 'commercial-terms',
      title: 'commercial terms',
      summary:
        'the pilot price and annual-credit window are controlled by the referenced paid-pilot package specification.',
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
        'before launch, specify the start date, end date, pilot owner, participating users, included projects, integrations, success criteria, annual deployment scope, final decision date, and annual deployment price*.',
        '* the pilot fee is credited toward the first annual deployment if the customer signs an annual agreement within the agreed decision window, under the written pilot terms.',
      ],
    }),
    section({
      anchor: 'portals-responsibilities',
      title: 'what portals provides',
      summary:
        'portals configures the pilot, aligns the workflow, onboards participants, supports the evaluation, and documents the outcome.',
      bullets: [
        'kickoff and workflow alignment',
        'pilot repository configuration',
        'participating-user onboarding',
        'agreed integration setup where applicable',
        'active and historical project structure',
        'guidance on history, versioning, lineage, and context capture',
        'support during the referenced pilot period',
        'final review and annual deployment recommendation',
      ],
    }),
    section({
      anchor: 'customer-responsibilities',
      title: 'what the customer provides',
      summary:
        'the customer provides real production work, a named owner, participating users, system access, timely feedback, and a decision sponsor.',
      bullets: [
        'one named pilot owner',
        'access to the selected active and historical projects',
        'relevant assets, prompts, references, decisions, and notes',
        'access to agreed systems or exports',
        'timely implementation feedback',
        'attendance at kickoff and final review',
        'participation from the economic buyer before the decision date',
      ],
    }),
    section({
      anchor: 'final-review',
      title: 'final pilot review',
      summary:
        'the review produces a clear decision: deploy portals, extend under defined terms, or conclude that it is not the right fit.',
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
