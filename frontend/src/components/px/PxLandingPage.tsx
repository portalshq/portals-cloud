import type {ReactNode} from 'react'
import type {PxTechnicalContent} from '@/lib/px-content'
import styles from './PxLandingPage.module.css'
import {PxSagaBanner} from './PxSagaBanner'
import {PxCodeBlock} from './PxCodeBlock'
import {PxWebGLTheme} from './PxWebGLTheme'

export type PxLandingPageProps = {
  content: PxTechnicalContent
  /** Set to standalone when this component is rendered outside portals. */
  chrome?: 'integrated' | 'standalone'
}

const GITHUB_URL = 'https://github.com/portalshq/narrativeengine'

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function LinkButton({href, children, quiet = false}: {href: string; children: ReactNode; quiet?: boolean}) {
  return (
    <a
      href={href}
      className={quiet
        ? 'inline-flex items-center gap-10 px-18 py-12 t-p-sm-sans rounded-sm transition hover:border-black hover:text-black'
        : 'inline-flex items-center gap-10 bg-[var(--px-yellow)] px-18 py-12 t-p-sm-sans text-black rounded-sm transition hover:bg-[style:color-mix(in_srgb,_var(--px-yellow)_80%,_white)]'}
    >
      {children} {!quiet && <Arrow />}
    </a>
  )
}

function SectionMark({number, children}: {number: string; children: ReactNode}) {
  return <p className="flex items-center gap-12 t-p-sm-sans"><span className={styles.node} />{number} / {children}</p>
}

function WorldArt() {
  return (
    <div className={styles.worldArt} aria-label="An illustrated PX world with persistent bear characters" role="img">
      <div className="px-mono absolute left-18 top-16 text-[10px] uppercase text-[#e7f5c0]">bears / scene_04 / dusk</div>
      <div className="absolute right-[12%] top-[12%] h-48 w-48 rounded-full border border-[#e8f0eb]/45" />
      <div className="absolute right-[12%] top-[12%] h-48 w-48 rounded-full border border-[#e8f0eb]/20 [transform:translate(22px,22px)]" />
      <div className={`${styles.bear} left-[17%]`} />
      <div className={`${styles.bear} ${styles.bearSmall} left-[45%]`} />
      <div className={`${styles.bear} ${styles.bearSmall} right-[12%]`} />
      <div className={styles.scanLine} />
      <div className="absolute inset-x-18 bottom-16 flex items-end justify-between border-t border-[#e8f0eb]/30 pt-10 text-xs text-[#d3decf]">
        <span className="px-mono">3 entities resolved</span><span>Lonnie appears in scene</span>
      </div>
    </div>
  )
}

export function PxLandingPage({content, chrome = 'integrated'}: PxLandingPageProps) {
  const isStandalone = chrome === 'standalone'

  return (
    <main className={styles.page} data-webgl-theme="px">
      <PxWebGLTheme />
      <div className="relative isolate">
        <div className={styles.aurora} aria-hidden="true" />
        <div className={styles.gridNoise} aria-hidden="true" />
        <nav className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between px-20 py-20 md:px-40" aria-label="PX">
          <a href={isStandalone ? '/' : '/'} className="flex items-baseline gap-8 text-xl"><span className="t-h3-sans font-medium text-white">px</span>{!isStandalone && <span className="t-p-sm-sans">by portals</span>}</a>
          <div className="hidden items-center gap-20 md:flex">
            <LinkButton href="#how-it-works" quiet>Docs</LinkButton>
            <LinkButton href="#bears" quiet>Examples</LinkButton>
            <LinkButton href={GITHUB_URL} quiet>GitHub</LinkButton>
            <LinkButton href="#install">Install PX</LinkButton>
          </div>
        </nav>

        <section className="relative z-10 mx-auto grid min-h-[calc(100svh-80px)] max-w-[1440px] items-center gap-40 px-20 pb-68 pt-24 md:px-40 lg:grid-cols-[1.04fr_.96fr]">
          <div className="max-w-3xl">
            {/* <p className="mb-20 t-p-sm-sans text-[#dffc72]">Introducing PX <span className="text-white/45">/ protocol for persistent creative work</span></p> */}
            <h1 className={`${styles.chromeWord} text-[clamp(92px,18vw,260px)] font-medium leading-[1em]`}>px</h1>
            <h2 className="mt-32 max-w-[10.5em] text-[clamp(36px,5vw,78px)] leading-[.94]">A harness for your <span className="px-serif text-[#dffc72]">AI creative work.</span></h2>
            <p className="mt-28 max-w-xl t-p-sans">Create persistent characters, worlds, objects, and scenes with AI agents — then keep building on them across tools and formats.</p>
            <div className="mt-34 flex flex-wrap gap-20">
              <LinkButton href={GITHUB_URL} quiet>View on GitHub</LinkButton>
              <LinkButton href="#install">Install PX</LinkButton>
            </div>
          </div>
          <div className="lg:pt-38"><WorldArt /></div>
        </section>
      </div>

      <PxSagaBanner>
        <div className="max-w-4xl">
          <p className="t-d2-sans leading-[.92]">A world keeps its shape<br /><span className="t-d2-serif">when the tool changes.</span></p>
          <p className="mt-20 max-w-xl t-p-sm-sans">px keeps characters, locations, scenes, and representations resolvable for the next creative move.</p>
        </div>
      </PxSagaBanner>

      <section className="px-20 py-14 text-black md:px-40">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-20 text-[clamp(22px,3vw,42px)] leading-none"><span>CREATE IT ONCE.</span><span className="px-serif">KEEP CREATING WITH IT.</span><span className="hidden lg:inline">✳</span></div>
      </section>

      <section className="mx-auto">
        <div className="mx-auto px-20 py-28 md:px-40 md:py-40 max-w-[1440px]">
          <SectionMark number="01">give your creative projects memory</SectionMark>
          <div className="mt-28 grid gap-[2px] lg:grid-cols-3">
            {[
              ['Objects', 'Generate in-world objects.', 'Props, events, and products belong to the world and can be summoned again.'],
              ['Characters', 'Characters you can keep creating with.', 'Give a character a stable identity, a readable manifest, and usable representations.'],
              ['Scenes', 'Put those characters and locations into new scenes.', 'Resolve the entities that define a scene, then shape your narrative.'],
            ].map(([label, title, body], index) => (
              <article key={label} className={`bg-black/4 rounded-sm min-h-72 p-24 md:p-30`}>
                <p className="t-p-sm-sans">0{index + 1} / {label}</p>
                <h2 className="mt-32 max-w-[11em] t-h3-sans leading-[.95]">{title}</h2>
                <p className="mt-20 max-w-sm t-p-sm-sans">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="bears" className="px-20 py-28 md:px-40 md:py-40">
        <div className="mx-auto grid max-w-[1440px] gap-32 lg:grid-cols-[.8fr_1.2fr] lg:gap-60">
          <div>
            <SectionMark number="02">Bears</SectionMark>
            <h2 className="mt-24 t-d2-sans">Stop starting over.</h2>
            <p className="t-p-serif mt-24 max-w-md">Your creative work stops disappearing between generations.</p>
            <p className="t-p-sm-sans mt-24 max-w-md">px entities have identity, history, and representations. Correct Lonnie once; reuse the evolving character anywhere your next agent can resolve PX.</p>
          </div>
          <div className="space-y-10">
            <details open className={`${styles.card} group p-18`}>
              <summary className="cursor-pointer list-none marker:hidden t-p-sm-sans"><span className="mr-12 ">01</span> Create Lonnie <span className="float-right t-p-sm-sans group-open:rotate-45">+</span></summary>
              <p className="mt-16 border-t-2 border-white/50 pt-16 text-white t-p-sm-sans">“Create a bear character named Lonnie. Lonnie is a black bear with an energetic, rebellious personality. He likes climbing trees and wears a baseball cap.”</p>
            </details>
            <details className={`${styles.card} group p-18`}>
              <summary className="cursor-pointer list-none marker:hidden t-p-sm-sans"><span className="mr-12 ">02</span> Keep the character <span className="float-right t-p-sm-sans group-open:rotate-45">+</span></summary>
              <p className="mt-16 border-t-2 border-white/50 pt-16 text-white t-p-sm-sans">PX stores Lonnie as a character entity with a stable <code>px://</code> address and a durable manifest.</p>
            </details>
            <details className={`${styles.card} group p-18`}>
              <summary className="cursor-pointer list-none marker:hidden t-p-sm-sans"><span className="mr-12 ">03</span> Revise and reuse <span className="float-right t-p-sm-sans group-open:rotate-45">+</span></summary>
              <p className="mt-16 border-t-2 border-white/50 pt-16 text-white t-p-sm-sans">“Actually — no baseball cap. Give him blue shorts.” Then bring the same Lonnie into a new scene, image, clip, or future iteration.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <SectionMark number="03">entity, not a file</SectionMark>
          <div className="mt-28 grid gap-28 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
            <div><h2 className="t-d2-sans leading-[.92]">One character.<br /><span className="t-d2-serif text-[#dffc72]">Many representations.</span></h2>
            <p className="mt-24 max-w-lg t-p-sm-sans leading-[1.3]">Keep the entity. Change the representation. PX manifests can attach direct representations with their format and provenance — for example, a reference image or a scene clip.</p></div>
            <div className={`bg-black/2 rounded-sm p-20 md:p-30`}>
              <p className="t-p-sm-sans">px://bears/character/lonnie</p>
              <div className="mt-24 space-y-14 t-p-sm-sans leading-[1.3]">
                <p><span className="">identity</span><br />Lonnie — black bear, restless climber</p>
                <p><span className="">representation</span><br /><span className="text-[#dffc72]">reference_image</span> / png</p>
                <p><span className="">representation</span><br /><span className="text-[#dffc72]">alternate_take</span> / png</p>
                <p><span className="">scene appearance</span><br />Bears / scene_04 / dusk</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-20 py-28 md:px-40 md:py-40">
        <div className="mx-auto max-w-[1440px]">
          <SectionMark number="04">how px works</SectionMark>
          <div className="mt-28 grid gap-[2px] md:grid-cols-4">
            {[
              ['URI', 'Identity', 'A px:// URI identifies a narrative resource.'],
              ['Manifest', 'Current state', 'A readable, structured, versionable YAML representation.'],
              ['Commit', 'History', 'Content-addressed snapshots and patch metadata.'],
              ['Resolver', 'Context', 'Resolve a URI or query a subtree for the next task.'],
            ].map(([key, title, body], index) => <div key={key} className="bg-black/4 rounded-sm p-20">
              <p className="t-p-sm-sans">0{index + 1}</p>
              <h3 className="mt-20 t-d2-sans">{key}</h3>
              <p className="mt-20 leading-[1.3] t-p-sm-sans">{body}</p>
            </div>)}
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <div className="grid gap-28 lg:grid-cols-[.72fr_1.28fr]">
            <div><SectionMark number="05">the developer surface</SectionMark><h2 className="mt-24 t-d2-sans leading-[.92]">Install it.<br />Make something.</h2><p className="mt-22 max-w-md leading-[1.35] t-p-sm-sans">px ships with a CLI, agent skills, an on-demand MCP server, and a resolver for the narrative resources inside your project.</p></div>
            <div className="space-y-14">
              <div><p className="mb-8 t-p-sm-sans">Install px</p><PxCodeBlock>{content.install}</PxCodeBlock></div>
              <div className="grid gap-[2px] md:grid-cols-2">
                <div><p className="mb-8 t-p-sm-sans">Start a world</p><PxCodeBlock>{content.initialize}</PxCodeBlock></div>
                <div><p className="mb-8 t-p-sm-sans">Teach px to an agent</p><PxCodeBlock>{content.skillInstall}</PxCodeBlock></div>
              </div>
            </div>
          </div>
          <div className="mt-40 grid gap-[2px] border-t-2 border-white/15 pt-28 lg:grid-cols-2">
            <article>
              <p className="t-p-sm-sans">Agents & MCP</p>
              <p className="mt-14 max-w-lg t-p-sm-sans leading-[1.35]">{content.mcpSummary}</p>
            </article>
            <article>
              <p className="t-p-sm-sans">Representations</p>
              <PxCodeBlock>{content.addRepresentation}</PxCodeBlock>
            </article>
          </div>
          <div className="mt-16 grid gap-[2px] lg:grid-cols-2">
            <article>
              <p className="mb-8 t-p-sm-sans">TypeScript SDK</p>
              <PxCodeBlock>{content.typescriptSdk}</PxCodeBlock>
            </article>
            <article>
              <p className="mb-8 t-p-sm-sans">Python SDK</p>
              <PxCodeBlock>{content.pythonSdk}</PxCodeBlock>
            </article>
          </div>
        </div>
      </section>

      <PxSagaBanner>
        <div className="grid gap-24 lg:grid-cols-[1fr_.7fr] lg:items-end">
          <div>
            <p className="t-p-sm-sans">For filmmakers, writers, artists, creative developers, and the projects that grow into worlds.</p>
            <h2 className="mt-20 t-d2-sans leading-[.96]">Make something weird.<br /><span className="px-serif">Keep building it.</span></h2>
          </div>
          <div className="lg:justify-self-end"><LinkButton href={GITHUB_URL}>Explore PX on GitHub</LinkButton></div>
        </div>
      </PxSagaBanner>

      <section aria-label="PX and Portals" className="!bg-black mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 pt-40 pb-80 t-p-sm-sans !text-white md:px-40">
          <p>PX is free and open source for creators and developers building locally.</p>
          <a href="/" className="mt-20 inline-block !text-white">Building with a production team? <span className="underline decoration-2 underline-offset-4">Explore Portals <Arrow /></span></a>
        </div>
      </section>
    </main>
  )
}
