import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const comparisonRows = [
  {
    metric: 'Finding the approved version',
    without: 'Guessed from filenames and Slack history',
    withPortals: 'Known, with certainty, in seconds',
  },
  {
    metric: 'Recreating a shipped asset',
    without: 'Rebuilt from scratch, often imperfectly',
    withPortals: 'Reproduced exactly from its full recipe',
  },
  {
    metric: 'Client asks for "five more like this"',
    without: 'Hours to days of rediscovery work',
    withPortals: 'Extended directly from the original lineage',
  },
  {
    metric: 'Knowledge when someone leaves',
    without: 'Walks out the door with them',
    withPortals: 'Stays in the repository, permanently',
  },
  {
    metric: 'AI tool changes its model',
    without: 'Hope someone documented the settings',
    withPortals: 'Recreate from the preserved generation recipe',
  },
  {
    metric: 'Reviewing what changed',
    without: 'Screenshots and memory',
    withPortals: 'Full diff across every version',
  },
  {
    metric: 'Team confidence in "final"',
    without: 'Constant double-checking',
    withPortals: 'Trusted by default',
  },
];

const capabilities = [
  {
    title: 'Every asset type, one system',
    desc: 'Images, video, characters, 3D assets, models, prompts, and datasets are first-class citizens — not edge cases bolted onto a document store.',
  },
  {
    title: 'Model-agnostic by design',
    desc: 'Generate with OpenAI, Runway, Midjourney, Adobe, or your own fine-tuned models. Portals sits underneath the generation layer and doesn\'t care which tool produced the asset.',
  },
  {
    title: 'Fits into your existing production pipeline.',
    desc: 'Every capability — registry, versioning, provenance, relationships — is available through the API. Automate ingestion, build internal tools, or wire Portals into your existing pipeline.',
  },
  {
    title: 'Automatic, not manual',
    desc: 'Provenance capture, version creation, and identity assignment happen at generation time, not through after-the-fact tagging discipline your team will eventually abandon.',
  },
];

const icps = [
  {
    title: 'AI Creative Agencies',
    desc: 'Manage thousands of campaign variations while keeping a clear line to the approved client version, its full source history, and the production context behind it. Never lose a revision request to "we\'re not sure how we made that."',
  },
  {
    title: 'Film, Video & Animation Studios',
    desc: 'Preserve characters, scenes, props, and visual continuity across production cycles that span months. When a sequel or reshoot comes six months later, the canon is still there.',
  },
  {
    title: 'Game Studios',
    desc: 'Version characters, environments, and generated worlds as they evolve from early concept through shipped asset — with full lineage back to the concept art and prompts that started it.',
  },
  {
    title: 'AI-Native Marketing & Brand Teams',
    desc: 'Keep every brand asset — logos, campaign creative, style guides — under one canonical version, so different teams stop unknowingly shipping conflicting versions of the same thing.',
  },
];

const pricingTiers = [
  {
    name: 'Team',
    price: '$500',
    period: '/ month',
    subtitle: 'For small creative teams building a trusted production repository.',
    features: [
      'Shared production repository',
      'Version history & rollback',
      'Asset identity & provenance',
      'Up to 10 collaborators',
      'Email support',
    ],
    popular: false,
  },
  {
    name: 'Studio',
    price: '$2,000',
    period: '/ month',
    subtitle: 'For production teams managing client work and high-volume AI assets.',
    features: [
      'Everything in Team',
      'Unlimited collaborators',
      'Asset lineage & dependency graph',
      'API access & webhooks',
      'Priority support',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$5,000+',
    period: '/ month',
    subtitle: 'For organizations standardizing AI production across multiple teams.',
    features: [
      'Everything in Studio',
      'SSO & enterprise identity',
      'Dedicated infrastructure',
      'Fine-grained permissions',
      'Governance & compliance controls',
      'Personalized onboarding with the founders',
      'SLA & dedicated success manager',
      'Custom integrations',
    ],
    popular: false,
  }
];

export function VCS() {
  return (
    <div className="min-h-screen bg-portals-bg text-white font-sans">

      <main className="max-w-[1440px] mx-auto px-6">

        {/* ─── 1. Hero ─── */}

        <section className="grid lg:grid-cols-2 min-h-[90vh] gap-12 pt-24 pb-20">

          <div className="flex flex-col justify-center">

            <div className="text-lg lowercase tracking-widest text-portals-secondary mb-8">
              THE PRODUCTION REPOSITORY FOR AI-NATIVE CREATIVE ORGANIZATIONS
            </div>

            <h1 className="text-5xl lg:text-7xl tracking-[-0.04em] leading-[1.05] mb-8">
              Stop losing the history behind your best work.
            </h1>

            <p className="text-lg text-portals-on-surface-variant max-w-xl mb-12">
              Portals preserves every version, generation, and creative decision behind your best assets — so teams can reuse successful work, deliver faster, and scale production without losing what works.
            </p>

            <div className="flex gap-4 mb-6">
              <Button>
                Request access
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="ghost">
                Read Docs
              </Button>
            </div>
          </div>

          <div className="relative min-h-[500px] overflow-hidden">

            <div
              className="
              absolute inset-0
              bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2070&auto=format&fit=crop')]
              bg-cover
              bg-center
              opacity-50
              "
            />

            <div className="absolute inset-0 bg-gradient-to-r from-portals-bg via-transparent to-transparent" />

            <div className="
              absolute
              bottom-12
              right-0
              bg-portals-surface-lowest/90
              backdrop-blur-lg
              p-8
              w-[300px]
            ">
              <div className="text-5xl text-portals-secondary font-mono">∞</div>
              <div className="mt-4 text-sm text-portals-on-surface-variant">
                asset history preserved
              </div>
            </div>

          </div>

        </section>


        {/* ─── 2. Problem ─── */}

        <section className="py-24">

          <div className="text-lg lowercase tracking-widest text-portals-secondary mb-8">
            THE PROBLEM
          </div>

          <div className="max-w-4xl">

            <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-8">
              Your team already solved this. You just can't prove it, find it, or do it again.
            </h2>

            <p className="text-lg text-portals-on-surface-variant leading-relaxed mb-12">
              AI production teams generate thousands of images, videos, prompts, and iterations every month. The final asset ships. The client approves it. Everyone moves on. Three months later, someone asks for "five more like this" — and the team that made it can't tell you how.
            </p>

            <p className="text-lg text-portals-on-surface-variant leading-relaxed mb-16">
              Three failures compound every week your team creates with AI:
            </p>

          </div>

          <div className="grid md:grid-cols-3 gap-px bg-portals-surface-variant">

            <div className="bg-portals-bg p-10">
              <div className="text-portals-secondary font-mono text-sm mb-4">01</div>
              <h3 className="text-2xl mb-4">Consistency</h3>
              <p className="text-portals-on-surface-variant text-lg leading-relaxed">
                <strong className="text-white">Nobody trusts the version.</strong> Seven files named "final," "final_v2," and "use-this-one" — and no one is sure which one shipped, or whether it still matches the approved character, style, or brand.
              </p>
            </div>

            <div className="bg-portals-bg p-10">
              <div className="text-portals-secondary font-mono text-sm mb-4">02</div>
              <h3 className="text-2xl mb-4">Reproducibility</h3>
              <p className="text-portals-on-surface-variant text-lg leading-relaxed">
                <strong className="text-white">Nobody can reproduce it.</strong> The exact prompt, model, seed, and reference chain behind an approved asset disappear the moment the file is exported. What's left is the output — not the process that made it possible.
              </p>
            </div>

            <div className="bg-portals-bg p-10">
              <div className="text-portals-secondary font-mono text-sm mb-4">03</div>
              <h3 className="text-2xl mb-4">History</h3>
              <p className="text-portals-on-surface-variant text-lg leading-relaxed">
                <strong className="text-white">Work gets paid for twice.</strong> Decisions, iterations, and approvals vanish after delivery. Instead of building on what already worked, teams regenerate it from scratch — and usually don't land in the same place twice.
              </p>
            </div>

          </div>

          <div className="mt-16 max-w-3xl">
            <blockquote className="border-l-2 border-portals-secondary pl-6 text-portals-on-surface-variant italic text-lg leading-relaxed">
              Tencent's video chief named this the main blocker to AI replacing long-form production — visual and continuity drift "becomes very obvious" as productions scale.
              <cite className="block mt-3 not-italic text-sm text-portals-on-surface-variant/60">
                — Variety, 2026
              </cite>
            </blockquote>
          </div>

        </section>


        {/* ─── 3. Solution intro ─── */}

        <section className="py-24 border-t border-portals-surface-variant">

          <div className="max-w-4xl">
            <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-8">
              The production repository for AI-native creative organizations.
            </h2>

            <p className="text-lg text-portals-on-surface-variant leading-relaxed mb-8">
              Portals gives every production asset a permanent identity, complete history, and reproducible creation record, so successful work can always be trusted, found, and extended.
            </p>

            <p className="text-lg text-portals-on-surface-variant leading-relaxed mb-8">
              Existing tools answer <em className="text-white">"where is the file?"</em> Portals answers <em className="text-white">"what is this, where did it come from, and can we make it again?"</em>
            </p>

            <p className="text-lg text-portals-on-surface-variant leading-relaxed">
              That distinction is the entire product. Everything below is a consequence of taking it seriously.
            </p>
          </div>

        </section>


        {/* ─── 4. The Five Pillars ─── */}

        <section className="py-24 border-t border-portals-surface-variant">

          <div className="max-w-4xl mb-20">
            <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-8">
              Five pillars. One production repository.
            </h2>
            <p className="text-lg text-portals-on-surface-variant leading-relaxed">
              Portals is built around five capabilities that compound into each other. None of them is optional — remove any one and the system degrades back into a file store.
            </p>
          </div>

          {/* Pillar 01 — Repository */}
          <div className="py-20 border-t border-portals-surface-variant">
            <div className="text-portals-secondary font-mono text-sm mb-4">01</div>
            <h3 className="text-3xl lg:text-4xl tracking-[-0.02em] mb-6">Repository</h3>
            <p className="text-xl text-portals-on-surface-variant leading-relaxed mb-6">
              A canonical home for every production asset.
            </p>
            <p className="text-portals-on-surface-variant leading-relaxed mb-10 max-w-3xl">
              Every image, video, character, model, prompt, and dataset your team creates lives inside one governed repository — not scattered across Midjourney histories, Runway projects, Dropbox folders, Slack threads, and someone's desktop. The repository doesn't replace the tools your team already uses to <em>generate</em> work; it becomes the place that work lives once it matters.
            </p>
            <div className="grid md:grid-cols-3 gap-px bg-portals-surface-variant">
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">Unified storage across every asset type your production touches</p>
              </div>
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">Structured like a codebase, not a folder tree — projects, collaborators, and permissions scoped cleanly</p>
              </div>
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">Ingests from the tools you already use: no forced migration, no workflow rewrite</p>
              </div>
            </div>
          </div>

          {/* Pillar 02 — Identity */}
          <div className="grid lg:grid-cols-2 gap-16 py-20 border-t border-portals-surface-variant">
            <div>
              <div className="text-portals-secondary font-mono text-sm mb-4">02</div>
              <h3 className="text-3xl lg:text-4xl tracking-[-0.02em] mb-6">Identity</h3>
              <p className="text-xl text-portals-on-surface-variant leading-relaxed mb-8">
                Every asset gets a permanent, stable address.
              </p>
              <p className="text-portals-on-surface-variant leading-relaxed mb-8">
                A character is not a folder of PNGs. A campaign is not a stack of "final" files. In Portals, every asset — and every meaningful <em>entity</em> behind it, like a character, a location, or a brand style — receives a persistent ID the moment it's created. That ID doesn't change when the file is renamed, exported, re-uploaded, or edited by someone else.
              </p>
              <p className="text-sm text-portals-on-surface-variant/70 font-medium">
                Why it matters: Identity is what makes an asset <em>findable and referenceable</em> six months later, by someone who wasn't in the room when it was made. Without it, "the approved version" is a claim. With it, it's a fact.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Stable identity independent of filename, location, or export format</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Entities, not just files: characters, props, styles, and locations are addressable objects with their own histories</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Every downstream system — search, automation, integrations — can reference an asset with certainty</p>
              </div>
            </div>
          </div>

          {/* Pillar 03 — History */}
          <div className="grid lg:grid-cols-2 gap-16 py-20 border-t border-portals-surface-variant">
            <div>
              <div className="text-portals-secondary font-mono text-sm mb-4">03</div>
              <h3 className="text-3xl lg:text-4xl tracking-[-0.02em] mb-6">History</h3>
              <p className="text-xl text-portals-on-surface-variant leading-relaxed mb-8">
                Never lose an approved version again.
              </p>
              <p className="text-portals-on-surface-variant leading-relaxed mb-8">
                Every edit, regeneration, and approval becomes a new version — not a replacement. Portals preserves the full lineage of an asset from first generation to shipped output, so any prior state can be recalled, compared, or restored in seconds.
              </p>
              <p className="text-sm text-portals-on-surface-variant/70 font-medium">
                Why it matters: History turns "we think this was the approved version" into "here is the approved version, and everything that led to it." It's the difference between institutional memory and institutional guesswork.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Full version history for every asset, automatically — no manual "save as" discipline required</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Instant rollback to any previous state</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Branch from any point in an asset's history to explore a new direction without losing the original</p>
              </div>
            </div>
          </div>

          {/* Pillar 04 — Provenance */}
          <div className="py-20 border-t border-portals-surface-variant">
            <div className="text-portals-secondary font-mono text-sm mb-4">04</div>
            <h3 className="text-3xl lg:text-4xl tracking-[-0.02em] mb-6">Reproducibility</h3>
            <p className="text-xl text-portals-on-surface-variant leading-relaxed mb-6">
              Reproduce successful work instead of rebuilding it.
            </p>
            <p className="text-portals-on-surface-variant leading-relaxed mb-10 max-w-3xl">
              The final export is the least interesting part of an AI-generated asset. The valuable part is what produced it: the prompt, the model and version, the seed, the reference images, the parameters, the edits, and the approvals along the way. Portals captures that chain automatically, attached to the asset itself.
            </p>
            <div className="grid md:grid-cols-3 gap-px bg-portals-surface-variant">
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">Automatic capture of prompt, model, parameters, and source references at generation time</p>
              </div>
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">Full dependency graph: what this asset was derived from, and everything derived from it</p>
              </div>
              <div className="bg-portals-bg p-6">
                <p className="text-sm text-portals-on-surface-variant">One-click access to the complete "recipe" behind any shipped asset — enough to reproduce it, extend it, or explain it</p>
              </div>
            </div>
          </div>

          {/* Pillar 05 — Collaboration */}
          <div className="grid lg:grid-cols-2 gap-16 py-20 border-t border-portals-surface-variant">
            <div>
              <div className="text-portals-secondary font-mono text-sm mb-4">05</div>
              <h3 className="text-3xl lg:text-4xl tracking-[-0.02em] mb-6">Collaboration</h3>
              <p className="text-xl text-portals-on-surface-variant leading-relaxed mb-8">
                Work from a single source of truth.
              </p>
              <p className="text-portals-on-surface-variant leading-relaxed mb-8">
                Because every asset lives in a single governed repository with real identity and history, teams collaborate on the assets themselves — not on synced folders and hopeful naming conventions. Everyone sees the same version, the same history, and the same provenance, without a separate tool layered on top.
              </p>
              <p className="text-sm text-portals-on-surface-variant/70 font-medium">
                Why it matters: Collaboration isn't a feature bolted onto storage. It's what naturally happens once a team has one place they actually trust.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Shared visibility into who changed what, when, and why — no status meetings required</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">No duplicate "just in case" local copies, because the repository is trusted</p>
              </div>
              <div className="bg-portals-surface-lowest p-6 border border-portals-surface-variant">
                <p className="text-sm text-portals-on-surface-variant">Scales from a five-person team to a multi-department organization without changing how work is done</p>
              </div>
            </div>
          </div>

        </section>


        {/* ─── 5. Without / With comparison ─── */}

        <section className="py-24 border-t border-portals-surface-variant">

          <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-16 max-w-4xl">
            What changes when your production has a memory.
          </h2>

          <div className="border border-portals-surface-variant">
            <div className="grid grid-cols-3 bg-portals-surface-lowest border-b border-portals-surface-variant">
              <div className="p-6 text-sm font-medium text-portals-on-surface-variant"></div>
              <div className="p-6 text-sm font-medium text-portals-on-surface-variant border-l border-portals-surface-variant">
                Without Portals
              </div>
              <div className="p-6 text-sm font-medium text-portals-secondary border-l border-portals-surface-variant">
                With Portals
              </div>
            </div>
            {comparisonRows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-3 border-t border-portals-surface-variant"
              >
                <div className="p-6 text-sm font-medium">
                  {row.metric}
                </div>
                <div className="p-6 text-sm text-portals-on-surface-variant border-l border-portals-surface-variant">
                  {row.without}
                </div>
                <div className="p-6 text-sm text-white border-l border-portals-surface-variant">
                  {row.withPortals}
                </div>
              </div>
            ))}
          </div>

        </section>


        {/* ─── 6. Built for AI production ─── */}

        <section className="py-24 border-t border-portals-surface-variant">

          <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-16 max-w-4xl">
            Built for how AI production actually works.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-portals-surface-variant mb-16">
            {capabilities.map((cap, i) => (
              <div key={i} className="bg-portals-bg p-10">
                <h3 className="text-xl mb-4">{cap.title}</h3>
                <p className="text-portals-on-surface-variant leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-portals-surface-lowest border border-portals-surface-variant p-10">
            <h3 className="text-xl mb-4">An open core</h3>
            <p className="text-portals-on-surface-variant leading-relaxed mb-8">
              Portals is hosted on an open-source version control foundation. We didn't reinvent that layer — we built the layer above it: entity-aware versioning, automatic provenance, and the identity graph that connects every asset your organization creates.
            </p>
            <Button variant="outline">
              Read Documentation
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

        </section>


        {/* ─── 7. Who it's for ─── */}

        <section className="py-24 border-t border-portals-surface-variant">

          <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-16 max-w-4xl">
            For organizations where AI output is intellectual property.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-portals-surface-variant">
            {icps.map((icp, i) => (
              <div key={i} className="bg-portals-bg p-10">
                <h3 className="text-xl mb-4">{icp.title}</h3>
                <p className="text-portals-on-surface-variant leading-relaxed">
                  {icp.desc}
                </p>
              </div>
            ))}
          </div>

          {/* for pitch deck  */}
          {/* <div className="mt-12 max-w-3xl">
            <p className="text-portals-on-surface-variant text-sm leading-relaxed">
              Common thread: these teams already generate high volumes of AI content, already collaborate across multiple people, and already carry a software budget for the tools that touch production. Portals becomes the layer none of those tools replace.
            </p>
          </div> */}

        </section>


        {/* ─── 8. Pricing ─── */}

        <section className="py-24 border-t border-portals-surface-variant" id="pricing">

          <div className="text-lg lowercase tracking-widest text-portals-secondary mb-8">
            PRICING
          </div>

          <h2 className="text-4xl lg:text-5xl tracking-[-0.03em] leading-[1.1] mb-16 max-w-4xl">
            A clear path from adoption to enterprise scale.
          </h2>

          <div className="grid md:grid-cols-3 gap-px bg-portals-surface-variant">
            {pricingTiers.map((tier, i) => (
              <div
                key={i}
                className={`bg-portals-bg p-10 flex flex-col ${tier.popular ? 'border border-portals-secondary' : ''
                  }`}
              >
                {tier.popular && (
                  <div className="text-portals-secondary text-xs font-mono uppercase tracking-widest mb-6">
                    Most Popular
                  </div>
                )}

                <h3 className="text-2xl mb-2">{tier.name}</h3>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl">{tier.price}</span>
                  <span className="text-portals-on-surface-variant text-sm">{tier.period}</span>
                </div>

                <p className="text-sm text-portals-on-surface-variant mb-8">
                  {tier.subtitle}
                </p>

                <ul className="flex flex-col gap-3 mb-10 flex-1">
                  {tier.features.map((feature, j) => (
                    <li key={j} className="text-sm text-portals-on-surface-variant flex items-start gap-3">
                      <span className="text-portals-secondary mt-0.5">→</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button variant={tier.popular ? 'default' : 'outline'} className="w-full">
                  {tier.name === 'Enterprise' ? 'Talk to Sales' : 'Get Started'}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-12 flex gap-4">
            <Button variant="ghost">
              See Full Pricing
            </Button>
            <Button variant="ghost">
              Talk to Sales
            </Button>
          </div>

        </section>


        {/* ─── 9. Closing CTA ─── */}

        <section className="py-32 border-t border-portals-surface-variant">

          <h2 className="text-5xl lg:text-6xl tracking-tight max-w-4xl mb-8">
            Stop losing your best AI work.
            <br />
            Start building on it.
          </h2>

          <p className="text-lg text-portals-on-surface-variant max-w-2xl mb-10">
            Give every asset your team creates a permanent identity, a complete history, and a system of record it can be trusted against — from first generation through shipped production.
          </p>

          <div className="flex gap-4 mb-6">
            <Button>
              Request Access
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button variant="ghost">
              Read the Docs
            </Button>
          </div>

          <p className="text-sm text-portals-on-surface-variant/60">
            No migration required. Portals sits underneath the tools your team already uses.
          </p>

        </section>

      </main>

    </div>
  );
}
