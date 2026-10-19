import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2026-07-01'}).withConfig({useCdn: false})
const document = await client.fetch(`
  *[_type == "resourceDocument" && slug.current == "paid-pilot"][0]{
    title,
    seo {metaTitle, metaDescription},
    landingPage {headline, description, primaryCta, secondaryCta},
    sections[] {title, summary, "bodyText": pt::text(body)}
  }
`)
console.log(JSON.stringify(document, null, 2))
