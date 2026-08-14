# Product

## Register

product

## Platform

web

## Users

AI-native creators and production organizations — from solo studios and freelancers to agencies, film/video/animation studios, game studios, and AI-native marketing/brand teams. They generate valuable AI content, often collaborate across multiple people, and carry a software budget for production tools. Primary buyers include studio operators, production leads, creative executives, and technical leaders. The primary emotional job: "Help me preserve and control a creative production system," not "help me deploy a model."

## Product Purpose

portals is version control infrastructure for AI-native creative organizations. It gives every AI-generated production asset a permanent identity — including its versions, relationships, provenance, ownership, dependencies, approvals, and usage — so teams can stop losing work, duplicating effort, and arguing over which version is current.

portals is not a file store or another DAM. Traditional tools organize static files; portals models living entities and sits beneath the AI tools a team already uses. It treats every AI-generated asset the way software engineering treats source code: with a trusted identity, complete history, and reproducible record of exactly what produced it.

Success looks like a production team being asked for "five more like this" and answering in minutes with confidence, not spending days rediscovering how the original was made.

## Customer Problem

AI is excellent at generating content but poor at remembering it. Prompts disappear, context windows reset, models change, conversations are lost, and the same prompt can produce a different result later. When teams return to a project, they must reconstruct decisions and context that should have persisted.

This creates recovery work instead of creative work:

- Rewriting prompts that previously worked
- Reconstructing a character, location, or project's rules
- Resolving competing versions without a reliable source of truth
- Regenerating a successful output that was lost or overwritten
- Onboarding collaborators by manually retelling project history

Customers are not buying more AI. They are buying predictability in an unpredictable production process.

## Core Value Pillars

1. **Durable context.** The project remembers its characters, locations, rules, decisions, and history. New work builds on what exists instead of starting over.

2. **Provenance.** Every asset carries a traceable history of its source, lineage, ownership, approvals, and usage. Reviews and handoffs happen without guesswork.

3. **Reproducibility.** A prior version can be restored or branched from a known point in history. When the source tool exposes the required model, seed, inputs, and environment, portals preserves them for exact regeneration; otherwise it preserves the most complete available recipe. Teams can experiment without overwriting what matters.

## Positioning

**Category:** Version control infrastructure for AI-generated assets — a system of record, not a traditional DAM.

**Primary positioning:** Version control for AI-generated assets.

**Core brand message:** Every AI asset. One source of truth.

**Core benefit message:** Stop losing the history of your best work. Start building on it.

**Point of difference:** portals models assets as entities with versions, relationships, provenance, ownership, and dependencies rather than as static files in folders. It is the identity layer beneath every AI tool a team uses. portals relates to workflow and storage tools the way GitHub relates to Jira or Git relates to Dropbox: an adjacent category doing a different job.

**Reason to believe:** Every technology shift that made creation abundant produced infrastructure to control the resulting complexity. Source code produced GitHub, data volume produced Snowflake, and cloud complexity produced modern DevOps. AI-generated content needs the same missing layer: version control that preserves context so work compounds instead of resetting.

### Context-Specific Messages

- **Technical audiences:** Git for AI-native creative teams.
- **Integration buyers:** The operating system for AI-generated assets.
- **Governance and compliance buyers:** A system of record for AI content.
- **Engineering leaders:** Manage AI assets like code.

### Supporting Benefits

- **Never lose work again.** Search, retrieve, and reuse any asset without hunting across drives, chats, or disconnected tools.
- **Know exactly where anything came from.** Every asset carries its full history, making approvals, reviews, and handoffs unambiguous.
- **Iterate without fear.** Branch a concept, test it, merge it back, or discard it without overwriting the version that matters.
- **Onboard collaborators quickly.** New teammates and vendors inherit the project's contextual history instead of relearning it through trial and error.
- **Keep the tools that already work.** portals sits beneath the team's existing AI engines; it does not require a rip-and-replace migration.

## Product Boundaries

portals is the infrastructure and identity layer, not the application layer. It records an asset's approval state and history but does not orchestrate reviews, assignments, or production workflows. It makes assets searchable and recoverable but does not replace the delivery, presentation, or campaign-management functions of a DAM. Adjacent tools remain the place where teams create and coordinate work; portals remains the authoritative record of the assets and context those tools produce.

To preserve that position, portals does not become:

- An asset marketplace
- A creative editor or canvas tool
- An AI generation model
- A workflow engine or review platform
- A traditional DAM replacement

## Product Ladder

- **Creator:** For solo AI studios, freelancers, boutique agencies, and indie developers. One hosted repository where AI assets are searchable, versioned, shareable, and recoverable, with snapshots, rollbacks, and provenance tracking.
- **Studio:** For agencies and production teams operating at volume. Includes Creator capabilities and adds unlimited collaborators, team repositories, branching and version workflows, lineage graphs, recorded approval checkpoints, API access, webhooks, and audit history.
- **Enterprise:** For large creative organizations managing AI-generated intellectual property. Includes Studio capabilities and adds multiple organizations, SSO/SAML, granular permissions, compliance logs, data residency guarantees, dedicated infrastructure, priority SLAs, and private deployment options.

## Technology Foundation

portals is powered by Lore, a version control engine built for mixed AI-native projects. Images, video, audio, characters, and models are first-class production assets; prompts, model weights, datasets, generation parameters, and other inputs can be captured as assets or dependencies in their provenance.

Lore's customer-facing engineering commitments are:

- **Free branching:** Teams can branch, test, merge, or discard creative directions without overwriting the core asset. Lore is designed to keep branching efficient as repositories scale.
- **Tamper-evident truth:** Revisions, prompt changes, and approvals form a verifiable history that resolves version disputes.
- **Deduplicated performance:** Shared, reusable data fragments and on-demand downloads are designed to keep repositories responsive as asset libraries scale.

## Brand Personality

The Archivist / The Guardian — calm, intelligent, precise, visionary, slightly cinematic. Meticulous, future-facing creative infrastructure that preserves the intelligence behind AI-generated media. Sophisticated but not intimidating. Closer to a filmmaker's notebook or Git for creative worlds than to compliance software or a DAM.

Voice: grounded, plainspoken, confident, and empathetic. Calm and precise rather than hyped; production-fluent rather than academic; assured without dismissing the tools customers already use. Every sentence communicates intent, decisions, context, history, relationships, or continuity.

Tone adjusts by context:

- **Product marketing:** Concrete, concise, and benefit-first.
- **Sales:** Consultative, curious, and grounded in the customer's workflow.
- **Technical and API documentation:** Precise, complete, and unembellished.
- **Incident communication:** Transparent, accountable, and explicit about what happened, what is being done, and when the next update will arrive.

The underlying belief: AI creation is not disposable generation. It is a production process that needs memory.

## Language System

Use language that reinforces version control, connected identity, and production rigor.

| Prefer | Avoid | Rationale |
|---|---|---|
| Version control for AI assets | AI asset management / DAM | Signals infrastructure and engineering discipline, not a file bin. |
| Provenance / asset lineage | Metadata tagging | Describes a connected history rather than flat, manual tags. |
| Durable context | Durable infrastructure | Names the valuable thing being preserved. |
| Reproducibility | Backup / recovery | Implies exact recreation, not only loss prevention. |
| Identity graph | Database / index | Communicates relationships among prompts, versions, and assets. |
| Production asset | File / artifact | Signals an entity with a living identity. |
| Repository | Folder / project | Establishes the version control paradigm. |
| Approval checkpoint | Sign-off | Evokes a recorded, systematic event. |
| Works across your AI tools | Platform-agnostic middleware | Speaks to the producer's daily reality in plain language. |

## Anti-references

- Generic SaaS landing pages (cream backgrounds, gradient cards, hero-metric templates, identical icon grids)
- Traditional DAM/enterprise tools (bureaucratic compliance-software aesthetic, corporate workflow language)
- Playful AI creativity tools (fun/bubbly AI image generators, neon gradients, "magic" terminology)
- Generic AI infrastructure / developer tooling (GPU clouds, API infrastructure, terminal screenshots, code-first heroes, benchmark numbers as primary value)
- Consumer AI companion / "AI magic" products (chat bubbles as primary interface, magic wand metaphors, sparkles, "imagine anything" language)
- Enterprise workflow software (Jira/Monday.com/Asana feel, checklists, status dashboards, approval workflows)
- Stock photography / marketing SaaS aesthetic (people collaborating around laptops, abstract gradients, "empower your team" copy)
- NFT / Web3 / ownership aesthetic (blockchain visual cues, crypto gradients, token language)
- Traditional Hollywood production software (ShotGrid-style interfaces, dense metadata tables)
- Overly futuristic sci-fi (holograms, glowing interfaces, cyberpunk, AI brain imagery)

Positive design territory: Apple craft + Linear precision + Figma creative infrastructure + Pixar production culture + Git version history. The metaphor is "the memory layer of creative worlds," not "a better database for files."

## Design Principles

1. **Creative work deserves the same rigor as software.** portals optimizes for professional production integrity, not speed or novelty. The interface should communicate discipline and care.

2. **Preserve the reasoning, not just the result.** Every design decision should reinforce that portals captures context, decisions, and history — not just files. The interface should feel archival and intentional.

3. **One trusted source of truth.** The product eliminates ambiguity. No "final_v2_use-this-one." The interface should project certainty and completeness.

4. **Sophistication through depth, not complexity.** The system handles deep complexity (entity graphs, provenance chains, version lineage) but presents it with calm clarity. Not bureaucratic. Not oversimplified.

5. **Future-facing, not futuristic.** The design should feel inevitable — like where production infrastructure was always heading — not speculative or sci-fi. Cinematic in spirit, not in decoration.

6. **Problem-first, not architecture-first.** Lead with lost work, duplicated effort, version ambiguity, and continuity failures. Reveal the entity model, identity graph, and Lore engine as the concrete mechanism that resolves those pains.

7. **Demonstrate predictability.** Product flows should make it easy to prove the source, current state, history, and reproducibility of an asset. The core experience turns production chaos into an answer the user can trust.

## Accessibility & Inclusion

WCAG AA standard compliance. 4.5:1 minimum contrast for body text, 3:1 for large text. Full keyboard navigation. Screen reader support. Reduced motion alternatives for all animations. The product serves production teams who may work long hours — the interface should be comfortable for extended use.
