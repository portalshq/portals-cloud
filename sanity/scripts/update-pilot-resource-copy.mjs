import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'}).withConfig({useCdn: false})
const apply = process.argv.includes('--apply')
const document = await client.fetch(`
  *[_type == "resourceDocument" && slug.current == "paid-pilot"][0]{
    _id, _rev, title, sections[] {...}
  }
`)
if (!document) throw new Error('Paid pilot resource document not found')

const sections = structuredClone(document.sections || [])
const section = (anchor) => sections.find((candidate) => candidate.anchor?.current === anchor)
const objective = section('objective')
const pilotScope = section('scope')
const firstValue = section('first-value')
const finalReview = section('final-review')
if (!objective || !pilotScope || !firstValue || !finalReview) throw new Error('Expected pilot resource sections are missing')

objective.summary = 'Test one active production workflow, measure the agreed outcomes, and decide whether Portals belongs in your production stack.'
pilotScope.summary = 'The standard pilot has a defined scope; use the assisted path to review requirements outside it.'
for (const block of firstValue.body || []) {
  for (const child of block.children || []) {
    if (typeof child.text === 'string' && child.text.includes('within 48 hours')) {
      child.text = child.text.replace('within 48 hours, your pilot repository will capture', 'your pilot repository will capture')
    }
  }
}
for (const block of finalReview.body || []) {
  for (const child of block.children || []) {
    if (typeof child.text === 'string') {
      child.text = child.text.replace('confirm whether the 48-hour milestone was achieved', 'confirm whether the configured first-value milestone was achieved')
    }
  }
}

const fields = {
  title: 'Studio Pilot',
  'seo.metaTitle': 'Studio Pilot | Portals',
  'seo.metaDescription': 'Evaluate Portals on one real production workflow. Measure retrieval, context recovery, reproducibility, handoffs, and rework against agreed success criteria.',
  'landingPage.headline': 'Studio Pilot',
  'landingPage.description': 'Evaluate Portals against one real production workflow using an agreed scope and measurable success criteria.',
  'landingPage.primaryCta': {_type: 'cta', action: 'internal', href: '/pilot', label: 'Start a pilot', style: 'primary'},
  'landingPage.secondaryCta': {_type: 'cta', action: 'internal', href: '/pilot?mode=assisted', label: 'Talk through a pilot', style: 'secondary'},
  sections,
}

if (!apply) {
  console.log(`DRY RUN resource ${document._id}: ${Object.keys(fields).join(', ')}`)
  console.log('No changes written. Pass --apply to update the configured dataset.')
} else {
  const result = await client.patch(document._id).ifRevisionId(document._rev).set(fields).commit()
  console.log(`UPDATED ${result._id} paid-pilot resource copy`)
}
