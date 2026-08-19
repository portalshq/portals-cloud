export const FAQ_CATEGORIES = [
  'general',
  'assessment',
  'pilot',
  'security',
] as const

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export type FaqItem = {
  question: string
  answer: string
  categories: FaqCategory[]
}

export const faqs: FaqItem[] = [
  {
    question: 'What does a production workflow assessment measure?',
    answer:
      'It evaluates the operational cost of missing production history in one production workflow.',
    categories: ['assessment'],
  },
  {
    question: 'Are the assessment and customized pilot plan free?',
    answer:
      'Yes. The assessment, downloadable result, customized pilot plan, and security details are free.',
    categories: ['assessment'],
  },
  {
    question: 'When does the $5,000 pilot fee apply?',
    answer:
      'The fee applies only after your team approves the customized plan and commercial terms and chooses to conduct the production pilot.',
    categories: ['assessment'],
  },
  {
    question: 'When is a qualification call required?',
    answer:
      'No call is required for standard candidates unless the completed scope reveals an exception. A call is required when someone self-selects into pilot scoping after an educational assessment outcome.',
    categories: ['assessment'],
  },
  {
    question: 'Who is the production history guide for?',
    answer:
      'It is for creative organizations producing high volumes of AI-assisted work across multiple people, tools, clients, projects, or production cycles.',
    categories: ['general'],
  },
  {
    question: 'What is portals?',
    answer:
      'portals is the production repository for AI\u2011native creative organizations. It preserves the history and context behind important AI-generated assets so teams can find, understand, reproduce, and extend their work.',
    categories: ['general'],
  },
  {
    question: 'How is portals different from a DAM?',
    answer:
      'A DAM primarily organizes and distributes finished assets. portals is a production repository and memory system that stores the files and preserves the evolving production identity, history, context, approvals, and lineage behind an AI-generated asset \u2014 how it was made, approved, reproduced, extended, and handed off.',
    categories: ['general', 'assessment'],
  },
  {
    question: 'Do I need portals to use the guide?',
    answer:
      'No. The guide includes minimum practices that teams can implement using folders, spreadsheets, documentation, approval logs, and handoff procedures.',
    categories: ['general'],
  },
  {
    question: 'What is production history?',
    answer:
      'Production history is the complete, recoverable organizational record behind an important asset: its approved version, previous versions, creation context, decisions, and recovery information.',
    categories: ['general'],
  },
  {
    question: 'Does portals replace creative tools?',
    answer:
      'No. portals works beneath the production stack. Teams continue using their preferred generation, editing, review, storage, and delivery tools.',
    categories: ['general'],
  },
  {
    question: 'What does a production pilot prove?',
    answer:
      'A pilot tests whether preserving production history creates measurable value on one real workflow through faster retrieval, stronger reproducibility, controlled extension, better knowledge transfer, or reduced production risk.',
    categories: ['general'],
  },
  {
    question: 'how is this different from a free trial?',
    answer:
      'this is a focused commercial evaluation built to prove an operational ROI using live production work, clearly-defined success criteria, and a final decision date.',
    categories: ['pilot'],
  },
  {
    question: 'what should happen {firstValuePhrase|at first value}?',
    answer:
      'your repository is configured, your team is onboarded, and your first live production asset is successfully mapped with full prompt, model, and approval context.',
    categories: ['pilot'],
  },
  {
    question: 'what does the {pricePhrase|pilot fee} cover?',
    answer:
      'it covers full repository configuration, integration alignment, team onboarding, dedicated engineering support for 21 days, and the final operational ROI evaluation. custom integration development is separately scoped.',
    categories: ['pilot'],
  },
  {
    question: 'which projects should we choose for the pilot?',
    answer:
      'select one active workflow with high iteration cycles (e.g., active ad campaigns, recurring social assets) and one completed historical project that you frequently need to reference or extend.',
    categories: ['pilot'],
  },
  {
    question: 'does the pilot fee apply to an annual agreement?',
    answer:
      'yes. when you transition to an annual contract or pilot extension within the agreed decision window, the $5,000 fee is fully credited toward your annual deployment. the annual deployment scope, price, credit terms, and decision window are defined before the pilot starts.',
    categories: ['pilot'],
  },
  {
    question: 'what happens after {periodPhrase|the pilot}?',
    answer:
      'we review the metrics together and make a clear choice: deploy portals, extend the pilot under defined terms, or conclude it is not the right fit.',
    categories: ['pilot'],
  },
  {
    question: 'do you claim soc 2 or iso certification today?',
    answer:
      'no. the brief states the current security posture without claiming formal soc 2, iso, or other certifications that portals has not earned.',
    categories: ['security'],
  },
  {
    question: 'is private customer data used to train models?',
    answer:
      'no. private customer data is not used as model-training material without written customer permission.',
    categories: ['security'],
  },
  {
    question: 'how is customer data isolated?',
    answer:
      'portals uses logical organization boundaries so customer workspaces, assets, metadata, permissions, and production history are scoped to their organization.',
    categories: ['security'],
  },
  {
    question: 'can my team export or delete their data?',
    answer:
      'yes. the brief documents the export process and deletion handling, including where retention, backups, and contractual requirements can affect timing.',
    categories: ['security'],
  },
  {
    question: 'what happens during a security review?',
    answer:
      'portals shares the public brief, confirms deployment-specific details, reviews requested controls, and documents any contractual commitments separately.',
    categories: ['security'],
  },
]

export type FaqEntry = {
  question: string
  answer: string
}

const TOKEN_PATTERN = /\{([a-zA-Z]+)(?:\|([^}]*))?\}/g

function resolveTokens(text: string, values: Record<string, string>): string {
  return text.replace(
    TOKEN_PATTERN,
    (_match, name: string, fallback?: string) =>
      values[name] || fallback || '',
  )
}

export function getFaqsByCategories(
  categories: FaqCategory[],
  values: Record<string, string> = {},
): FaqEntry[] {
  const wanted = new Set(categories)
  return faqs
    .filter((faq) => faq.categories.some((category) => wanted.has(category)))
    .map((faq) => ({
      question: resolveTokens(faq.question, values),
      answer: resolveTokens(faq.answer, values),
    }))
}
