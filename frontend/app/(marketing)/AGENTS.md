# Marketing site rules — `app/(marketing)/`

Single positioning sentence (use everywhere, never rephrase into new jargon):

> Production memory for AI-native creative teams — preserve every approved version and reuse it.

## IA allowlist

Canonical routes: `/`, `/production-memory`, `/use-cases`, `/use-cases/[slug]`,
`/blog`, `/blog/[slug]`,
`/assessment`, `/resources/production-memory-brief`, `/contact`, `/paid-pilot`,
`/security-and-architecture`, `/privacy-policy`, `/terms-of-service`,
`/workflow/ai-production-workflow-risks` (legacy, keep until folded into `/use-cases`).

- No new `/workflow/*` public URLs. `/workflow/assessment` 308s to `/assessment`
  (see `next.config.ts`); the file under `workflow/assessment/` is the implementation,
  `/assessment` re-exports it.
- No path aliases: one URL per page. Deleting an alias means adding a `redirects()` entry.
- `/paid-pilot` and `/security-and-architecture` are explicit static routes that read
  fixed Sanity slugs — do not add them to the `[slug]` catch-all.
- Dead placeholder routes (`roadmap`, `interactive`) were deleted. Do not recreate
  without content, metadata, and a sitemap entry.

## Blog — Sanity is the only source

Blog content lives in Sanity as `blogPostDocument` (see
`sanity/schemaTypes/blogTypes.ts`,
seed via `npm --prefix sanity run migrate:blog-posts`).

- Never hardcode titles, slugs, definitions, excerpts, bodies, FAQs, or related
  posts in `app/` or `src/components/`.
- `blog/[slug]` uses `dynamicParams = false` + Sanity `generateStaticParams`.
- `blog/page.tsx` hub fetches `getBlogPosts()`; detail pages fetch `getBlogPost(slug)`.
- `app/sitemap.ts` queries the same published documents. Adding a post in Sanity
  is sufficient to publish its page + sitemap entry — no code change.
- Detail pages emit `BlogPosting` + `BreadcrumbList` + `FAQPage` JSON-LD and reuse
  `ResourceBody` for portable-text rendering so `resourceBody` blocks stay consistent.

## Use cases — Sanity is the only source

Use-case content lives in Sanity as `useCaseDocument` (see
`sanity/schemaTypes/useCaseTypes.ts`, `docs/sanity-use-case-documents.md`,
seed via `npm --prefix sanity run migrate:use-cases`).

- Never hardcode titles, slugs, outcomes, events, buyers, remedies, boosters, or measures
  in `app/` or `src/components/`. The old `use-case-data.ts` was deleted on purpose.
- `use-cases/[slug]` uses `dynamicParams = false` + Sanity `generateStaticParams`.
- `use-cases/page.tsx`, `production-memory/page.tsx` fetch `getUseCases()` and pass
  documents as props to the client components in `ProductionMemoryPage.tsx`.
- `app/sitemap.ts` queries the same published documents. Adding a use case in Sanity
  is sufficient to publish its page + sitemap entry — no code change.

## SEO checklist (every marketing page)

Build metadata with `src/lib/seo.ts` `marketingMetadata()` — title, description,
absolute canonical, OG/Twitter, `siteName: 'portals'`, lowercase `| portals` suffix.
Then verify:

- One `h1` per route. Pillar H1s use `t-d2-sans` (`t-d1-sans` is reserved for `/` and `/use-cases` hub).
- JSON-LD: site-wide `Organization`/`WebSite` is in `app/layout.tsx`; detail pages add
  `Article` + `BreadcrumbList` (see `use-cases/[slug]/page.tsx`).
- `app/sitemap.ts` is an allowlist — adding a route requires adding it there.
- Copy consumer labels: "when this happens / who feels it / what portals fixes /
  what you can do next / what to measure in a paid pilot". Never ship
  remedy/booster/event/measure as UI copy.
- One primary glass CTA + one quiet `plain` secondary per viewport. Primary is
  `Assess production workflow` (`/assessment`) unless the page's job is the pilot or brief.

## Visual rules (extends `DESIGN.md`)

`DESIGN.md` describes the cinematic homepage. Subpages use the same tokens without
the WebGL dependency: default bg `#010528`, hairlines `white/15–20`, fills
`white/5–12`. Banned (do not reintroduce): `#343434`, `#101010`, `#d4a15c`,
`bg-white/8`, forced `!lowercase` on containers. Reuse
`src/components/marketing/MarketingPageShell.tsx` instead of per-page headers.

## Definition of done for a marketing page

Path in IA allowlist · `marketingMetadata()` used · OG image renders ·
JSON-LD valid · links to hub + `/assessment` · sitemap entry ·
`npm run typecheck` green. Run the `seo-auditor` and `copy-editing` skills before merge.
