import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const pillars = [
  {
    title: "Never lose the approved version",
    desc:
      "Track every generated image, video, character, and model revision. Know exactly what shipped, who approved it, and what changed.",
    img:
      "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?q=80&w=800&auto=format&fit=crop",
    cta: "Explore version history",
  },
  {
    title: "Preserve how AI work was created",
    desc:
      "Every asset keeps its prompt history, source files, model context, and generation lineage. Your best results become reusable.",
    img:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop",
    cta: "View provenance",
  },
  {
    title: "Reproduce results months later",
    desc:
      "Restore previous versions, branch experiments, and continue production without rebuilding lost context.",
    img:
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=800&auto=format&fit=crop",
    cta: "See reproducibility",
  },
  {
    title: "Run AI production like software",
    desc:
      "Give creative teams the same version control discipline engineering teams use for source code.",
    img:
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop",
    cta: "Read documentation",
  },
];

export function VCS() {
  return (
    <div className="min-h-screen bg-portals-bg text-white font-sans">

      <main className="max-w-[1440px] mx-auto px-6">

        {/* Hero */}

        <section className="grid lg:grid-cols-2 min-h-[90vh] gap-12 pt-24 pb-20">

          <div className="flex flex-col justify-center">

            <div className="text-lg lowercase tracking-widest text-portals-secondary mb-8">
              THE PRODUCTION REPOSITORY FOR AI-NATIVE CREATIVE ORGANIZATIONS
            </div>

            <h1 className="text-5xl lg:text-7xl tracking-[-0.04em] leading-[1.05] mb-8">
              Stop losing how your best work was made.
            </h1>

            <p className="text-lg text-portals-on-surface-variant max-w-xl mb-12">
              Preserve versions, context, models, and creative decisions behind every asset, so your organization can reproduce successful work, deliver within budget, and scale production.
            </p>


            <div className="flex gap-4">

              <Button variant="ghost">
                Read Docs
              </Button>

              <Button>
                Request access
                <ArrowRight className="ml-2 w-4 h-4"/>
              </Button>

            </div>

          </div>



          <div className="relative min-h-[500px] overflow-hidden">

            <div
              className="
              absolute inset-0
              bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')]
              bg-cover
              bg-center
              opacity-50
              "
            />

            <div className="absolute inset-0 bg-gradient-to-r from-portals-bg via-transparent to-transparent"/>


            <div className="
              absolute
              bottom-12
              right-0
              bg-portals-surface-lowest/90
              backdrop-blur-lg
              p-8
              w-[300px]
            ">

              <div className="text-5xl text-portals-secondary font-mono">
                ∞
              </div>

              <div className="mt-4 text-sm text-portals-on-surface-variant">
                asset history preserved
              </div>

            </div>

          </div>


        </section>



        {/* Problem */}

        <section className="border-y border-portals-surface-variant py-24">

          <div className="max-w-4xl">

            <h2 className="text-4xl mb-8">
              History, ownership, rollback, and collaboration guarantees for your AI-generated production assets.
            </h2>


            <p className="text-lg text-portals-on-surface-variant leading-relaxed">
              Your team generates thousands of images, videos, characters, models, and variations every day.
              <br/><br/>
              A week later, the context behind the asset is scattered across prompts, tools, conversations, and folders. Your team can't determine which variation shipped, why it was selected, or how to produce it again.
              <br/><br/>
              Portals Cloud gives every asset a permanent history — so your organization can preserve ownership, context, and control as AI production scales.
            </p>

          </div>

        </section>



        <section className="grid md:grid-cols-2 gap-px bg-portals-surface-variant">
        
                  {[
    {
      title: "Every asset has a history",
      desc:
        "Track the prompt, source assets, model version, edits, approvals, and every iteration that created the final result.",
      img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
      cta: "Explore provenance",
    },
    {
      title: "Never lose an approved version",
      desc:
        "Restore any previous state, branch new concepts, and reproduce production assets without rebuilding context from memory.",
      img: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?q=80&w=1200&auto=format&fit=crop",
      cta: "View workflows",
    },
    {
      title: "Built for AI production",
      desc:
        "Images, video, characters, models, prompts, and datasets live inside one versioned system of record.",
      img: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1200&auto=format&fit=crop",
      cta: "Read documentation",
    },
    {
      title: "Scale AI production without losing control",
      desc:
        "Give teams a shared source of truth as assets move from experimentation to client approval to production.",
      img: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1200&auto=format&fit=crop",
      cta: "Developer platform",
    },
  ].map((feature, i) => (
        
                    <div
                      key={i}
                      className="relative h-[500px] bg-portals-bg overflow-hidden flex flex-col justify-end p-8"
                    >
        
                      <img
                        src={feature.img}
                        className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale"
                      />
        
                      <div className="absolute inset-0 bg-gradient-to-t from-portals-bg via-portals-bg/70 to-transparent" />
        
                      <div className="relative z-10">
        
                        <h3 className="text-3xl mb-4">
                          {feature.title}
                        </h3>
        
                        <p className="text-portals-on-surface-variant max-w-md mb-6">
                          {feature.desc}
                        </p>
        
                        <Button variant="outline">
                          {feature.cta}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
        
                      </div>
        
                    </div>
        
                  ))}
        
                </section>
        
        
                {/* ICP */}
                <section className="py-24 border-t border-portals-surface-variant">
        
                  <h2 className="text-4xl mb-12">
                    Built for teams where AI output becomes intellectual property.
                  </h2>
        
        
                  <div className="grid md:grid-cols-3 gap-12">
        
                    <div>
                      <h3 className="text-xl mb-3">
                        AI creative agencies
                      </h3>
        
                      <p className="text-portals-on-surface-variant">
                        Manage thousands of campaign variations while keeping the
                        approved client version, source history, and production context.
                      </p>
                    </div>
        
        
                    <div>
                      <h3 className="text-xl mb-3">
                        Film and video studios
                      </h3>
        
                      <p className="text-portals-on-surface-variant">
                        Preserve characters, scenes, and visual continuity across long
                        production cycles.
                      </p>
                    </div>
        
        
                    <div>
                      <h3 className="text-xl mb-3">
                        Game studios
                      </h3>
        
                      <p className="text-portals-on-surface-variant">
                        Version characters, environments, and generated worlds as they
                        evolve from concept to production.
                      </p>
                    </div>
        
                  </div>
        
                </section>

        {/* Closing CTA */}

        <section className="py-32 border-t border-portals-surface-variant">
        
                  <h2 className="text-5xl lg:text-6xl tracking-tight max-w-4xl mb-8">
                    Stop losing your best AI work.
                    <br />
                    Start building on it.
                  </h2>
        
                  <p className="text-lg text-portals-on-surface-variant max-w-2xl mb-10">
                    Give every AI-generated asset a trusted history from creation through production.
                  </p>
        
                  <Button>
                    Start building with Portals Cloud
                    <ArrowRight className="ml-2 w-4 h-4"/>
                  </Button>
        
                </section>

      </main>

    </div>
  );
}