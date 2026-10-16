import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

const updates = [
  {
    slug: 'paid-pilot',
    seo: {
      metaTitle: '21-Day AI Creative Production Pilot | portals',
      metaDescription:
        'Scope a 21-day paid pilot on one active AI creative workflow. Measure asset retrieval, context recovery, reproducibility, handoffs, and rework.',
    },
  },
  {
    slug: 'ai-production-workflow-risks',
    seo: {
      metaTitle: 'AI Production Workflow Risks for Creative Teams | portals',
      metaDescription:
        'The hidden risks in AI creative production workflows (lost prompts, unrecoverable versions, rework, handoff gaps) and how production memory reduces them.',
    },
  },
  {
    slug: 'security-and-architecture',
    seo: {
      metaTitle: 'AI Production Security & Architecture | portals',
      metaDescription:
        'How Portals secures AI creative production data: workspace isolation, access control, permissions, encryption, retention, and architecture.',
    },
  },
]

for (const update of updates) {
  const document = await client.fetch(
    '*[_type == "resourceDocument" && slug.current == $slug][0]{_id, seo, landingPage}',
    {slug: update.slug},
  )
  if (!document?._id) throw new Error(`Missing Sanity resource document: ${update.slug}`)

  const result = await client
    .patch(document._id)
    .set({
      seo: {...document.seo, ...update.seo},
    })
    .commit()
  console.log(`Updated ${update.slug}: ${result._id}`)
}
