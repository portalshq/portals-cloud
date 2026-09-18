# Sanity blog posts

Blog content is authored in Sanity as `blogPostDocument` documents served at `/blog`.
The schema is in `sanity/schemaTypes/blogTypes.ts`. To seed or update the initial
twenty articles in a Sanity dataset, run `npm --prefix sanity run migrate:blog-posts`;
the command uses the authenticated Sanity CLI and updates documents by slug without
assigning hand-written document IDs, then links `relatedPosts` references in a second pass.

Each document owns its title, slug, citable `definition` (BLUF paragraph under the H1),
`excerpt`, publication dates, authors, cover image, topic `cluster`, publish `priority`,
tags, `seo` (reuses the shared `seoSettings` type), `keyTakeaways`, `body` (reuses the
shared `resourceBody` portable-text type, rendered by `ResourceBody`), `faqs` (emitted
as `FAQPage` JSON-LD), and `relatedPosts` (explicit links plus automatic cluster fallback).

The frontend reads published posts through `frontend/src/sanity/lib/blog.ts` and the
`BLOG_*` queries in `frontend/src/sanity/lib/queries.ts`. The `blog/[slug]` route uses
`dynamicParams = false` with Sanity `generateStaticParams`, so the production build
generates only published slugs. Metadata uses `marketingMetadata()` with `type: 'article'`;
detail pages emit `BlogPosting` + `BreadcrumbList` + `FAQPage` JSON-LD. The hub emits an
`ItemList` for the article set.

`frontend/app/sitemap.ts` queries the same published documents and adds `/blog` plus
every `/blog/[slug]` path with each document's `_updatedAt` as `lastModified`. Adding a
post in Sanity is sufficient to publish its page + sitemap entry — no code change.

When changing the model, update the schema, migration seed data, GROQ projection,
TypeScript type (`frontend/src/types/blog.ts`), and this document together.
