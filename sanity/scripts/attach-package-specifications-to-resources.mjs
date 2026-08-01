import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'})

const resourcePackageReferences = {
  'paid-pilot': ['paid-pilot'],
  'ai-production-workflow-risks': ['paid-pilot', 'production-team', 'studio', 'enterprise'],
  'production-memory-field-guide': ['paid-pilot', 'production-team', 'studio', 'enterprise'],
}

async function packageRefs(slugs) {
  const specs = await client.fetch(
    '*[_type == "packageSpecification" && slug.current in $slugs]{_id, "slug": slug.current}',
    {slugs},
  )

  const missing = slugs.filter(
    (slug) => !specs.some((specification) => specification.slug === slug),
  )
  if (missing.length) {
    throw new Error(`Missing package specifications: ${missing.join(', ')}`)
  }

  return slugs.map((slug) => {
    const specification = specs.find((spec) => spec.slug === slug)
    return {
      _key: slug,
      _type: 'reference',
      _ref: specification._id,
    }
  })
}

for (const [resourceSlug, packageSlugs] of Object.entries(resourcePackageReferences)) {
  const resource = await client.fetch(
    '*[_type == "resourceDocument" && slug.current == $slug][0]{_id}',
    {slug: resourceSlug},
  )

  if (!resource?._id) {
    console.log(`skipped missing resource ${resourceSlug}`)
    continue
  }

  const references = await packageRefs(packageSlugs)
  const result = await client
    .patch(resource._id)
    .set({packageSpecifications: references})
    .commit()

  console.log(`updated ${resourceSlug}: ${result._id}`)
}
