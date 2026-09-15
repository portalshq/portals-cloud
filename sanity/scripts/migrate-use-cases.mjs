import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

const useCases = [
  ['Campaign variant control', 'Control AI campaign variants without losing the approved source', 'ai-campaign-variant-control', 'A client asks for twelve more like the approved asset across new audiences, formats, and markets.', 'Head of Production · Creative Operations · Campaign Producer · Agency Founder', 'Prevent variant confusion, duplicate production, wrong-version delivery, and source ambiguity.', 'Reuse one approved campaign source to produce future variants faster.', 'Time to trace each derivative to its canonical source, approval state, and intended channel.'],
  ['Reproduce AI-generated assets', 'Reproduce AI-generated assets without rebuilding the workflow', 'reproduce-ai-generated-assets', 'A valuable asset from last quarter needs a continuation, but nobody can find the exact recipe that made it.', 'Creative Technologist · Executive Producer · AI Workflow Lead', 'Recover production context and reduce manual reconstruction.', 'Turn successful assets into reusable production recipes for future campaigns.', 'Time for another contributor to understand, reproduce, and extend the asset.'],
  ['Approved version control', 'Know exactly which AI-generated asset was approved', 'approved-version-control', 'Legal approves one version while production continues on another, and the wrong file is delivered.', 'Creative Operations · Producer · Account Director · Agency Founder', 'Prevent wrong-version work, wrong-version delivery, and approval ambiguity.', 'Turn approved assets into reliable starting points for future variants.', 'Whether three teammates can identify the approved asset and context in under one minute.'],
  ['Channel format readiness', 'Keep AI-generated assets ready for every platform', 'platform-spec-readiness', 'A campaign misses a delivery window because a derivative has the wrong format, duration, or channel requirements.', 'Ad Operations · Campaign Operations · Marketing Operations', 'Prevent wrong-spec assets, missed windows, and wasted adaptation work.', 'Accelerate cross-platform production from one approved source.', 'Spec accuracy, adaptation time, and errors across one asset family.'],
  ['Production handoff memory', 'Keep production context moving when people change', 'production-handoff-memory', 'A freelancer or vendor leaves before the next contributor has enough context to continue.', 'Head of Production · Executive Producer · Operations Lead', 'Prevent context loss, duplicated discovery, and fragile handoffs.', 'Onboard contributors into live production faster.', 'Handoff time and the number of questions or rebuilds required to continue.'],
  ['Unused creative asset utilization', 'Turn unused creative into searchable future capacity', 'unused-creative-asset-utilization', 'A rejected or unlaunched asset disappears into a folder even though its ingredients could serve the next campaign.', 'Creative Operations · Brand Operations · Agency Founder', 'Stop losing track of what was made, why it was rejected, and what remains reusable.', 'Make prior creative searchable production capacity.', 'Reusable assets recovered and time saved versus recreating them.'],
  ['Revision and scope-creep cost', 'Trace the work created by every revision branch', 'revision-scope-creep-cost', 'Client, legal, or platform notes create branches whose cost and rationale become impossible to trace.', 'Producer · Account Director · Finance Lead · Agency Founder', 'Connect revisions to requests, decisions, versions, and derivative cost.', 'Use decision history to scope future changes faster.', 'Revision cycle time, branch count, and hours attributable to avoidable rework.'],
  ['Character continuity governance', 'Preserve continuity across generated scenes and cycles', 'character-continuity-governance', 'A recurring character, product, or environment drifts across generated scenes and production cycles.', 'Animation Lead · Creative Technologist · Head of Production', 'Preserve canonical identities, approved references, variations, and history.', 'Extend continuity into new scenes without starting over.', 'Continuity review time and the number of corrections required per scene.'],
].map(([title, outcome, slug, event, buyers, remedy, booster, measure], sortOrder) => ({
  _type: 'useCaseDocument',
  status: 'published',
  title,
  slug: {_type: 'slug', current: slug},
  outcome,
  event,
  buyers,
  remedy,
  booster,
  measure,
  sortOrder,
}))

const existing = await client.fetch('*[_type == "useCaseDocument"]{_id, "slug": slug.current}')

for (const document of useCases) {
  const match = existing.find((item) => item.slug === document.slug.current)
  const result = match
    ? await client.patch(match._id).set(document).commit()
    : await client.create(document)
  console.log(`${match ? 'updated' : 'created'} ${document.slug.current}: ${result._id}`)
}
