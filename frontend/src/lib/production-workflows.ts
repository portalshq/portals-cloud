export const productionWorkflows = [
  {
    id: 'five-more-like-this',
    title: 'five more like this',
    problem:
      'an approved asset performs, but the prompt, references, settings, and production decisions behind it are scattered or gone.',
    outcome:
      'recover the complete production record and create new branches without reverse-engineering the original work.',
  },
  {
    id: 'approved-version-retrieval',
    title: 'approved-version retrieval',
    problem:
      'teams search across drives, chats, exports, and filenames to determine which version actually shipped.',
    outcome:
      'locate the canonical approved asset and its approval history in under a minute.',
  },
  {
    id: 'character-continuity',
    title: 'character continuity',
    problem:
      'a recurring character drifts as references, model choices, prompts, and successful generation context change between projects.',
    outcome:
      'preserve the lineage and reusable context needed to extend a character consistently.',
  },
  {
    id: 'campaign-variant-control',
    title: 'campaign variant control',
    problem:
      'channel and market variants multiply faster than teams can track their source, status, and relationship to the approved campaign.',
    outcome:
      'connect every variant to its approved parent, production context, and delivery state.',
  },
  {
    id: 'production-handoff',
    title: 'production handoff',
    problem:
      'critical context remains with the original creator, making continuation slow when people, vendors, or teams change.',
    outcome:
      'give the next collaborator enough history to understand, explain, and continue the work.',
  },
  {
    id: 'asset-reproduction',
    title: 'asset reproduction',
    problem:
      'the final file survives, but the source inputs and decisions required to reproduce it do not.',
    outcome:
      'recover the production recipe and validate whether the asset can be reproduced or meaningfully extended.',
  },
] as const

export type ProductionWorkflowId = (typeof productionWorkflows)[number]['id']

