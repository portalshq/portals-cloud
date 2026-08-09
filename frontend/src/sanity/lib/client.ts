import {createClient} from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET

if (!projectId) {
  throw new Error('Missing NEXT_PUBLIC_SANITY_PROJECT_ID')
}

if (!dataset) {
  throw new Error('Missing NEXT_PUBLIC_SANITY_DATASET')
}

export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion: '2026-07-01',
  useCdn: true,
})

export const sanityDocumentClient = sanityClient.withConfig({
  useCdn: false,
  stega: false,
})
