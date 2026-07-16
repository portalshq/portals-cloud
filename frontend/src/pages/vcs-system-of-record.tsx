import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, GitBranch, History, Search, Sparkles } from 'lucide-react';

const problems = [
  {
    icon: Search,
    title: 'Stop searching for lost work.',
    body:
      'Find any image, prompt, character, scene, or generation history instantly. Every asset stays connected to the context that created it.',
  },
  {
    icon: History,
    title: 'Know exactly what changed.',
    body:
      'Every asset carries its complete lineage — versions, prompts, edits, approvals, and ownership — so teams always know what is current.',
  },
  {
    icon: GitBranch,
    title: 'Build from previous work.',
    body:
      'Restore, branch, and iterate from any previous version instead of regenerating assets from scratch.',
  },
];

const workflow = [
  'Register every AI-generated asset',
  'Capture prompts and production context',
  'Track versions and relationships',
  'Search across your entire creative history',
];

const comparison = [
  ['Traditional storage', 'Portals'],
  ['Files in folders', 'Assets with identity'],
  ['Lost prompts and chats', 'Complete generation history'],
  ['Manual version naming', 'Automatic lineage'],
  ['Static files', 'Connected creative entities'],
];

export function VCS() {
  return (
    <div className="min-h-screen bg-portals-bg text-white selection:bg-portals-primary/30">

      <main className="max-w-[1440px] mx-auto px-6">

        {/* HERO */}
        <section className="min-h-[90vh] grid lg:grid-cols-2 gap-12 items-end py-24">

          <div className="flex flex-col justify-end">

            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-portals-secondary mb-10">
              <Sparkles className="w-3 h-3" />
              System of record for AI-generated assets
            </div>

            <h1 className="
              text-5xl 
              lg:text-7xl
              tracking-[-0.05em]
              leading-[0.95]
              font-medium
              mb-8
            ">
              Every AI asset.
              <br />
              One source of truth.
            </h1>

            <p className="
              text-xl
              leading-relaxed
              text-portals-on-surface-variant
              max-w-xl
              mb-10
            ">
              AI generates incredible work, but it forgets everything that
              happened before. Portals preserves every asset's history,
              relationships, prompts, and versions so creative teams stop
              rebuilding context and start building on previous work.
            </p>

            <div className="flex gap-4">
              <Button>
                Register your first project
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>

              <Button variant="ghost">
                View documentation
              </Button>
            </div>

          </div>


          <div className="
            relative
            h-[600px]
            border
            border-portals-surface-variant
            bg-portals-surface-lowest
            overflow-hidden
          ">

            <div className="
              absolute
              inset-0
              bg-gradient-to-br
              from-portals-primary/20
              via-transparent
              to-transparent
            "/>


            <div className="
              absolute
              inset-8
              border
              border-portals-surface-variant
              p-6
              font-mono
              text-xs
              text-portals-on-surface-variant
            ">

              <div className="mb-8 text-white">
                project://character-series/main
              </div>

              <div className="space-y-4">

                <div>
                  asset:
                  <span className="text-portals-secondary ml-2">
                    character_alex_v42
                  </span>
                </div>

                <div>
                  created:
                  <span className="ml-2">
                    prompt_generation_00831
                  </span>
                </div>

                <div>
                  versions:
                  <span className="ml-2">
                    42 revisions
                  </span>
                </div>

                <div>
                  lineage:
                  <span className="ml-2">
                    preserved
                  </span>
                </div>

              </div>


              <div className="
                absolute
                bottom-6
                left-6
                right-6
                border-t
                border-portals-surface-variant
                pt-6
              ">

                <div className="text-4xl text-portals-secondary">
                  100%
                </div>

                <div className="text-xs uppercase tracking-widest mt-2">
                  asset history preserved
                </div>

              </div>

            </div>

          </div>

        </section>


        {/* PROBLEM */}
        <section className="
          border-t
          border-portals-surface-variant
          py-24
        ">

          <div className="max-w-4xl">

            <h2 className="
              text-4xl
              lg:text-5xl
              tracking-tight
              mb-8
            ">
              AI production has a memory problem.
            </h2>

            <p className="
              text-xl
              text-portals-on-surface-variant
              leading-relaxed
            ">
              Traditional creative tools preserve files. AI workflows discard
              context. The prompt disappears. The conversation expires.
              Multiple versions compete. Teams spend hours recovering decisions
              instead of creating new work.
            </p>

          </div>

        </section>



        {/* BENEFITS */}
        <section className="
          grid
          md:grid-cols-3
          gap-px
          bg-portals-surface-variant
        ">

          {problems.map((item) => {

            const Icon = item.icon;

            return (

              <div
                key={item.title}
                className="
                  bg-portals-bg
                  p-8
                  min-h-[320px]
                "
              >

                <Icon className="w-6 h-6 text-portals-secondary mb-8" />

                <h3 className="
                  text-2xl
                  mb-4
                ">
                  {item.title}
                </h3>

                <p className="
                  text-portals-on-surface-variant
                  leading-relaxed
                ">
                  {item.body}
                </p>

              </div>

            );

          })}

        </section>



        {/* RECOVERY */}
        <section className="
          py-32
          grid
          lg:grid-cols-2
          gap-16
        ">

          <div>

            <h2 className="
              text-5xl
              tracking-tight
              mb-6
            ">
              Most AI work isn't creation.
              <br />
              It's recovery.
            </h2>

          </div>


          <div className="
            text-xl
            leading-relaxed
            text-portals-on-surface-variant
          ">

            Finding the prompt.
            <br />
            Finding the approved version.
            <br />
            Fixing continuity.
            <br />
            Explaining decisions to new collaborators.

            <br /><br />

            Portals removes recovery work so every generation becomes a
            reusable production asset.

          </div>

        </section>



        {/* COMPARISON */}
        <section className="
          border-t
          border-portals-surface-variant
          py-24
        ">

          <h2 className="
            text-4xl
            mb-12
          ">
            Files are not enough for AI production.
          </h2>


          <div className="
            border
            border-portals-surface-variant
          ">

            {comparison.map(([oldValue,newValue],index)=>(
              <div
                key={oldValue}
                className="
                  grid
                  grid-cols-2
                  border-b
                  last:border-b-0
                  border-portals-surface-variant
                "
              >

                <div className="
                  p-6
                  text-portals-on-surface-variant
                ">
                  {oldValue}
                </div>

                <div className="
                  p-6
                  text-portals-secondary
                ">
                  {newValue}
                </div>

              </div>
            ))}

          </div>

        </section>



        {/* WORKFLOW */}
        <section className="
          py-24
          grid
          lg:grid-cols-2
          gap-16
        ">

          <div>

            <h2 className="
              text-4xl
              mb-6
            ">
              One system behind every AI tool.
            </h2>

            <p className="
              text-lg
              text-portals-on-surface-variant
            ">
              Continue using the tools your team already depends on.
              Portals becomes the memory layer connecting them.
            </p>

          </div>


          <div className="space-y-4">

            {workflow.map((item)=>(
              <div
                key={item}
                className="
                  flex
                  items-center
                  gap-4
                  border
                  border-portals-surface-variant
                  p-5
                "
              >

                <Check className="w-5 h-5 text-portals-secondary"/>

                {item}

              </div>
            ))}

          </div>

        </section>



        {/* CTA */}
        <section className="
          border-t
          border-portals-surface-variant
          py-32
        ">

          <h2 className="
            text-5xl
            tracking-tight
            mb-6
          ">
            Stop rebuilding context.
            <br />
            Start building on it.
          </h2>


          <p className="
            text-xl
            text-portals-on-surface-variant
            max-w-xl
            mb-10
          ">
            Give every AI asset a permanent identity and make your creative
            history searchable, reproducible, and reusable.
          </p>


          <Button>
            Register your first project
            <ArrowRight className="ml-2 w-4 h-4"/>
          </Button>


        </section>


      </main>

    </div>
  );
}