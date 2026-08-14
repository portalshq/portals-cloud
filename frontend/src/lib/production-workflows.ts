export const productionWorkflows: {
  id: string
  title: string
  problem: string
  outcome: string
  quote?: string
  source?: string
}[] = [
  {
    id: 'five-more-like-this',
    title: 'five more like this',
    problem:
      'an approved asset performs, but the production context behind it is scattered or gone. "five more like this" demands a rebuild',
    outcome:
      'recover the complete production record and create new branches without reconstructing the original work.',
  },
  {
    id: 'approved-version-retrieval',
    title: 'approved-version retrieval',
    problem:
      'teams search across drives, chats, exports, and filenames to determine what actually shipped',
    outcome:
      'easily locate the canonical approved asset and its full approval and version history.',
  },
  {
    id: 'character-continuity',
    title: 'character continuity',
    problem:
      'characters, products, props, and visual rules change across tools, creators, and production cycles',
    outcome:
      'preserve the references, variations, and production history needed to extend a character consistently.',
    quote:
      'Tencent\'s video chief named "visual and continuity drift" the main blocker to AI replacing long-form production.',
    source: 'Variety, 2026',
  },
  {
    id: 'campaign-variant-control',
    title: 'campaign variant control',
    problem:
      'channel and market variants multiply faster than teams can manually track',
    outcome:
      'connect every variant to its approved parent, production context, and delivery state.',
  },
  {
    id: 'production-handoff',
    title: 'production handoff',
    problem:
      'product context stays with the original creator, slowing down pipelines when people, vendors, or teams change',
    outcome:
      'give every collaborator a shared history to understand, explain, and continue the work.',
  },
  {
    id: 'asset-reproduction',
    title: 'asset reproduction',
    problem:
      'the final file survives, but the source inputs and decisions required to reproduce it do not',
    outcome:
      'keep every asset connected to the context required to extend it.',
  },
] as const

export type ProductionWorkflowId = (typeof productionWorkflows)[number]['id']

