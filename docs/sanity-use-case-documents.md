# Sanity use-case documents

Use-case content is authored in Sanity as `useCaseDocument` documents. The old frontend-only `use-case-data.ts` source has been removed; the eight production-memory use cases now live in the Sanity dataset and are published with the `published` editorial status.

Each document owns its title, slug, card outcome, triggering event, buyer roles, remedy, booster, pilot measure, and sort order. The schema is in `sanity/schemaTypes/useCaseTypes.ts`. To seed or update the initial documents in a Sanity dataset, run `npm --prefix sanity run migrate:use-cases`; the command uses the authenticated Sanity CLI and updates documents by slug without assigning hand-written document IDs.

The frontend reads published use cases through `frontend/src/sanity/lib/use-cases.ts` and the GROQ queries in `frontend/src/sanity/lib/queries.ts`. The dynamic use-case route uses Sanity in both `generateStaticParams` and page rendering, with `dynamicParams = false`, so the Next.js production build generates only published Sanity slugs. Metadata, related cards, the production-memory page, and workflow recommendations all use the same query result.

`frontend/app/sitemap.ts` queries the same published documents and adds their `/use-cases/[slug]` paths, including each document's `_updatedAt` as `lastModified`. The sitemap no longer imports a frontend data constant.

When changing the model, update the schema, migration seed data, GROQ projection, TypeScript type, and this document together. The frontend build requires `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` to be available at build time, and the dataset must contain published use-case documents before the static pages and sitemap can be generated.
