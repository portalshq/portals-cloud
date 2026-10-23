For all UI styling and color token rules, read DESIGN.md.

## UI and UX best practices

Always order customer-facing specifications (pricing, deadlines, terms, options, and any timeline-related information) by chronological relevance to the customer journey. The order should reflect the sequence in which a customer encounters and acts on each item, not by arbitrary grouping or technical implementation order.

## Website copy and metadata

Never change website copy or metadata unless the user specifically asks. When copy changes are not already authorized, present a complete proposed diff before requesting approval. Explicit user requests to implement copy changes authorize routine edits within that scope.

For all marketing-site work (routes, IA, SEO, copy voice), read app/(marketing)/AGENTS.md first.
Marketing definition of done: IA-allowlisted path, marketingMetadata(), OG image, JSON-LD,
hub + /assessment links, sitemap entry, typecheck green. Run seo-auditor + copy-editing skills before merge.

For all lead-related functionality, read src/lib/leads/AGENTS.md.

For the Sanity use-case document model, migration, static generation, and sitemap integration, read [docs/sanity-use-case-documents.md](../docs/sanity-use-case-documents.md).

Read `src/components/leads/AGENTS.md` for lead UI changes. The production diagnostic contract is in `../marketing/ASSESSMENT.md` and the application/approval contract is in `../marketing/PILOT.md`; v4 uses shared branches and deterministic scoring, preserves older submissions, and never exposes internal segmentation.
