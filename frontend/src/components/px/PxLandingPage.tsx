'use client'

import type {ReactNode} from 'react'
import {useState} from 'react'
import type {PxTechnicalContent} from '@/lib/px-content'
import styles from './PxLandingPage.module.css'
import {PxSagaBanner} from './PxSagaBanner'
import {PxCodeBlock} from './PxCodeBlock'
import {PxWebGLTheme} from './PxWebGLTheme'
import {Image, Video, Box, Users, ShoppingBag, Edit} from 'lucide-react'

export type PxLandingPageProps = {
  content: PxTechnicalContent
  /** Set to standalone when this component is rendered outside portals. */
  chrome?: 'integrated' | 'standalone'
}

const GITHUB_URL = 'https://github.com/portalshq/narrativeengine'

function ArrowUpRight() {
  return <span aria-hidden="true">↗</span>
}
function ArrowDownRight() {
  return <span aria-hidden="true">↘</span>
}

function smoothScrollTo(hash: string) {
  const element = globalThis.document.querySelector(hash)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function LinkButton({href, children, quiet = false, className}: {href: string; children: ReactNode; quiet?: boolean; className?: string}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      smoothScrollTo(href)
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={quiet
        ? `items-center gap-10 px-18 py-12 t-p-sm-sans rounded-sm transition hover:border-black hover:text-black ${className} inline-flex`
        : `items-center gap-10 bg-[var(--px-yellow)] px-18 py-12 t-p-sm-sans text-black rounded-sm transition hover:bg-[style:color-mix(in_srgb,_var(--px-yellow)_80%,_white)] ${className} inline-flex`}
    >
      {children} {!quiet && <ArrowUpRight />}
    </a>
  )
}

function SectionMark({number, children}: {number: string; children: ReactNode}) {
  return <p className="flex items-center gap-12 t-p-sm-sans"><span className={styles.node} />{number} / {children}</p>
}

function AssetSlot({label, className}: {label: string; className: string}) {
  return (
    <div
      role="img"
      aria-label={`Reserved media area: ${label}`}
      className={`w-full rounded-sm border border-black/15 bg-black/4 object-cover ${className}`}
      style={{objectFit: 'cover'}}
    />
  )
}

function OrbitGif() {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <div 
      className="m-auto min-h-[250px] aspect-square overflow-hidden rounded-sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img 
        src={isHovered ? "/eye-candy/orbit-gif-1.png" : "/eye-candy/orbit-front.png"}
        alt="Orbit hero image" 
        className="w-full h-full aspect-square object-contain transition-opacity duration-300"
      />
    </div>
  )
}

function ToolIcon({icon}: {icon: ReactNode}) {
  return <span className="inline-flex items-center justify-center w-[50%] h-[50%] lg:w-[25%] lg:h-[25%] shrink-0 text-black/70">{icon}</span>
}

function EntityManifest() {
  const yamlManifest = `id: px://eye-candy/character/dua
name: Dua
entity_type: character
version: 23
properties:
  occupation: sentinel officer
  wardrobe: highest-tech dark sentinel officer suit; precision-tailored, adaptive technical fabric, integrated armor-weave, subtle engineered seams; no cape
  negative_constraints: no cape; no insignia; no logos; no fantasy armor; no firearms; no extra characters; no text; no watermark
  role: protagonist
  species: human
  visual_constraints: mature; cinematic; hyperwarm highlights against contrasted muted tones; AAA flagship sci-fi world; preserve established architecture; highest-tech suit; clean unmarked silhouette
  weapon: katana
representations:
  character_sheet:
    hash: blake3:1fe7f42163c6261b234fb54fe58c8f0771ff6c28b8ae79448a2102a9b8f85148
    format: png
    uri: character_sheet.png
    provenance:
      model: gpt-image-2
      prompt: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876799a3d1388c5f97d4
      derived_from: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876793a3d1388c5f97d4
  portrait:
    hash: blake3:5437873babf828d2728d1a6e396cd685594cbfc4ab5dcdb99566b0fba868d4e0
    format: png
    uri: portrait.png
    provenance:
      model: gpt-image-2
      prompt: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876799a3d1388c5f97d4
      derived_from: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876793a3d1388c5f97d4
  action_pose: 
    hash: blake3:5437873babf828d2728d1a6e396cd685594cbfc4ab5dcdb99566b0fba868d4e0
    format: png
    uri: action_pose.png
    provenance:
      model: gpt-image-2
      prompt: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876799a3d1388c5f97d4
      derived_from: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876793a3d1388c5f97d4
  mesh_model: 
    hash: blake3:5437873babf828d2728d1a6e396cd685594cbfc4ab5dcdb99566b0fba868d4e0
    format: png
    uri: mesh_model.png
    provenance:
      model: gpt-image-2
      prompt: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876799a3d1388c5f97d4
      derived_from: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876793a3d1388c5f97d4
  coat_variant: 
    hash: blake3:5437873babf828d2728d1a6e396cd685594cbfc4ab5dcdb99566b0fba868d4e0
    format: png
    uri: coat.png
    provenance:
      model: gpt-image-2
      prompt: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876799a3d1388c5f97d4
      derived_from: blake3:7730cee23da503ea29289ececb14175ffa0a376d8d4c876793a3d1388c5f97d4
entity_type: character`;

  return (
    <div className="mt-24">
      <pre className="text-[12px] leading-[1.2] font-mono whitespace-pre-wrap break-all">
        {yamlManifest.slice(0,520).trimEnd().concat('...')}
      </pre>
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
          <a href={isStandalone ? '/' : '/'} className="flex items-baseline gap-8 text-xl"><span className="t-h3-sans font-medium text-white">px</span></a>
          <div className="items-center gap-20 flex">
            <LinkButton href="#how-it-works" quiet className="!hidden md:!inline-flex">Docs</LinkButton>
            <LinkButton href="#eye-candy" quiet className="!hidden md:!inline-flex">Examples</LinkButton>
            <LinkButton href={GITHUB_URL} quiet className="!hidden md:!inline-flex">GitHub</LinkButton>
            <LinkButton href="#install">Install</LinkButton>
          </div>
        </nav>

        <section id="hero" className="relative z-10 mx-auto grid min-h-[calc(100svh-80px)] max-w-[1440px] gap-40 px-20 md:pt-24 md:px-40 md:grid-cols-2 overflow-visible">
          <div className="max-w-3xl">
            <h1 className={`${styles.chromeWord} text-[clamp(92px,18vw,260px)] font-medium leading-[1.2em] !mx-0 !px-0 cursor-default pointer-events-none`}>px</h1>
            <h2 className="mt-32 max-w-[10.5em] text-[clamp(36px,5vw,60px)] leading-[.94]">The AI agent for <span className="px-serif text-[#dffc72]">creative work</span></h2>
            <p className="mt-28 max-w-xl t-p-sans">Create persistent characters, worlds, objects, and scenes with AI agents — then keep building on them across tools and formats.</p>
            <div className="mt-34 flex flex-wrap gap-20 hidden sm:block">
              <LinkButton href={GITHUB_URL} quiet>View on GitHub</LinkButton>
              <LinkButton href="#install">Install</LinkButton>
            </div>
          </div>
          <div className="lg:pt-38 overflow-visible">
            <img 
              src="/eye-candy/dua-hero.png" 
              alt="Dua base outfit, katana, and Orbit hero image" 
              className="h-full w-full overflow-visible object-cover rounded-sm pointer-events-none"
            />
          </div>
        </section>
      </div>

      <PxSagaBanner>
        <div className="max-w-5xl">
          <p className="t-d2-sans leading-[.92]">A world keeps its <span className="t-d2-serif">shape</span><br />when the tool changes.</p>
          <p className="mt-20 max-w-lg t-p-sm-sans">px keeps characters, locations, scenes, and representations resolvable for the next creative move.</p>
        </div>
      </PxSagaBanner>

      <section className="px-20 py-14 text-black md:px-40">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-20 text-[clamp(22px,3vw,42px)] leading-none"><span>BUILD ONCE.</span><span className="px-serif">CREATE INFINITELY.</span><span className="hidden lg:inline">✳</span></div>
      </section>

      <section id="memory" className="mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <SectionMark number="01">give your creative projects memory</SectionMark>
          <div className="mt-28 grid gap-[2px] lg:grid-cols-3">
            {[
              ['Objects', 'Generate in-world objects.', 'Orbit remains available as an approved product or prop anywhere the world needs it.', 'Orbit product reference'],
              ['Characters', 'Characters you can keep creating with.', 'Dua keeps her identity across a character sheet, portrait, action pose, and wardrobe variants.', 'Dua pose sheet'],
              ['Scenes', 'Put those characters and locations into new scenes.', 'Resolve Dua, Orbit, and Underground Station together for the next scene or campaign.', 'Dua, Orbit, and Underground Station scene'],
            ].map(([label, title, body, asset], index) => (
              <article key={label} className="rounded-sm bg-black/4 p-18 pt-24 md:pt-30">
                <p className="t-p-sm-sans">0{index + 1} / {label}</p>
                  {label === "Objects" && (
                  <div className="mt-16 max-h-[500px] h-[500px] flex flex-col overflow-hidden">
                    <img 
                      src={"/eye-candy/orbit-front.png"}
                      alt="Orbit hero image" 
                      className="w-full h-auto max-h-[280px] aspect-square object-contain transition-opacity duration-300"
                    />
                    <div className="mt-10 grid grid-cols-3 gap-10 flex-1">
                      <img 
                        src="/eye-candy/orbit-v1.png" 
                        alt="Orbit v1" 
                        className="w-full h-full object-contain rounded-sm"
                      />
                      <img 
                        src="/eye-candy/orbit-v2.png" 
                        alt="Orbit v2" 
                        className="w-full h-full object-contain rounded-sm"
                      />
                      <img 
                        src="/eye-candy/orbit.png" 
                        alt="Orbit" 
                        className="w-full h-full object-contain rounded-sm"
                      />
                    </div>
                   </div>
                  ) || label === "Characters" && (
                    <div className="mt-16 max-h-[500px] h-[500px] grid grid-cols-1 md:grid-cols-[1.2fr_1fr] lg:grid-cols-1 2xl:grid-cols-[1.5fr_1fr] gap-10 overflow-clip rounded-sm">
                      <img 
                        src="/eye-candy/dua-wide.png" 
                        alt="Dua" 
                        className="h-[500px] opacity-98 overflow-visible object-cover rounded-sm"
                      />
                      <img 
                        src="/eye-candy/dua-back-2.png" 
                        alt="Dua back" 
                        className="hidden md:block lg:hidden 2xl:block overflow-clip rounded-sm transform scale-150 origin-[60%_10%] top-0 object-top"
                      />
                    </div>
                  ) || label === "Scenes" && (
                    <img 
                      src="/eye-candy/dua-orbit-station.png" 
                      alt="Dua, Orbit, and Underground Station scene" 
                      className="mt-16 max-h-[500px] h-[500px] w-full object-cover rounded-sm object-[60%_0%]"
                    />
                  ) || <AssetSlot label={asset} className="mt-20 h-full" />}
                <h2 className="mt-24 max-w-[12em] sm:max-w-[16em] lg:max-w-[12em] t-h3-sans leading-[.95]">{title}</h2>
                <p className="mt-20 max-w-sm t-p-sm-sans">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="eye-candy">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <SectionMark number="02">"Eye Candy"</SectionMark>
          <h2 className="mt-24 t-d2-sans">Stop starting over.</h2>
          <div className="mt-28 gap-[2px]">
            <div>
              <p className="t-p-serif mt-24 max-w-lg">The same character, product, wardrobe, and location remain available to every new scene, campaign, or tool.</p>
              <p className="t-p-sm-sans mt-24 max-w-lg">Dua starts in a performance-fashion sport top and technical pants. Her coat is a reusable variant; her katana stays part of the character context.</p>
            </div>

            <div className="mt-28 grid md:grid-cols-2 xl:grid-cols-[auto_auto_auto] gap-[2px]">
              <article className="rounded-sm bg-black/4 p-18 pt-24 md:pt-30 flex flex-col">
                <p className="t-p-sm-sans">01 / Create Dua</p>
                <p className="mt-10 max-w-lg t-p-sm-sans">Establish a character once, then keep her face, base outfit, and narrative attributes intact.</p>
                <div className="mt-16 h-full w-full overflow-hidden">
                  <img 
                    src="/eye-candy/dua-sheet-2.png" 
                    alt="Dua character sheet" 
                    className="h-full object-cover object-left rounded-sm"
                  />
                </div>
              </article>

              <article className="rounded-sm bg-black/4 p-18 pt-24 md:pt-30">
                <p className="t-p-sm-sans">02 / Keep the character</p>
                <p className="mt-10 max-w-lg t-p-sm-sans">Use the same Dua in the base outfit, the technical coat variant, or a katana action pose.</p>
                <div className="mt-16 grid grid-cols-2 xl:grid-cols-[max-content_max-content_max-content] gap-1">
                  <div className="overflow-visible flex flex-col items-center justify-center">
                    <img 
                      src="/eye-candy/dua-front-1-3.png" 
                      alt="Dua base sport top and pants" 
                      className="h-[45vh] lg:h-auto max-h-[450px] object-cover overflow-visible rounded-sm"
                    />
                    <p className="mt-8 t-p-sm-sans text-center">Base outfit</p>
                  </div>
                  <div className="overflow-visible flex flex-col items-center justify-center">
                    <img 
                      src="/eye-candy/dua-coat-1-3.png" 
                      alt="Dua coat variant" 
                      className="h-[45vh] lg:h-auto max-h-[450px] object-cover overflow-visible rounded-sm"
                    />
                    <p className="mt-8 t-p-sm-sans text-center">Coat variant</p>
                  </div>
                  <div className="hidden xl:block overflow-visible flex flex-col items-center justify-center">
                    <img 
                      src="/eye-candy/dua-coat-detail-1-3.png" 
                      alt="Dua coat detail" 
                      className="h-[45vh] lg:h-auto max-h-[450px] object-cover overflow-visible rounded-sm"
                    />
                  </div>
                </div>
              </article>

              <article className="rounded-sm bg-black/4 p-18 pt-24 md:pt-30">
                <p className="t-p-sm-sans">03 / Revise and reuse</p>
                <p className="mt-10 max-w-lg t-p-sm-sans">Resolve Dua + Orbit + Underground Station for a new cinematic scene, editorial campaign, or video sequence.</p>
                <div className="mt-16 h-[450px]">
                  <img 
                    src="/eye-candy/dua-orbit-station-coat.png" 
                    alt="Dua, coat variant, katana, Orbit, and Underground Station campaign scene" 
                    className="h-full w-full object-cover object-[57%_50%] rounded-sm"
                  />
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <SectionMark number="03">entity, not a file</SectionMark>
          <div className="mt-28 grid gap-28 xl:grid-cols-[.88fr_1.12fr] lg:items-center relative">
            <div>
              <h2 className="t-d2-sans leading-[.92]">One character.<br /><span className="t-d2-serif text-[#dffc72]">Many representations.</span></h2>
              <p className="mt-24 max-w-xs sm:max-w-lg t-p-sm-sans leading-[1.3]">Keep the entity. Change the representation. px keeps every usable form connected to Dua’s source identity and relationships.</p>
            </div>
            <img 
              src="/eye-candy/dua-pose.png" 
              alt="Dua representation" 
              className="z-5 absolute h-[500px] lg:h-[700px] xl:h-[600px] aspect-[1/3] drop-shadow-lg object-cover right-[5vw] md:right-[10vw] xl:left-[36%] -top-[5%] xl:-top-[25%]"
            />
            <div className="rounded-sm bg-[#fbfbfb] p-20 md:p-30 grid gap-28 lg:grid-cols-[.9fr_1.1fr] lg:z-5 xl:z-0">
              <div>
                <p className="t-p-sm-sans">px://eye-candy/character/dua</p>
                <EntityManifest />
              </div>
              <div className="grid grid-cols-3 gap-10">
                {[
                  ['Portrait', 'Dua portrait representation', '/eye-candy/dua-face-1-1.png'],
                  ['Action', 'Dua katana action representation', '/eye-candy/dua-action-pose.png'],
                  ['3D', 'Orbit 3D representation', '/eye-candy/dua-model.png'],
                  ['Audio', 'Dua voice representation', '/eye-candy/wave.png'],
                  ['Sheet', 'Dua character sheet', '/eye-candy/frame.png'],
                  ['Coat', 'Technical coat reference', '/eye-candy/coat-1-1.png'],
                ].map(([label, asset, imageSrc]) => (
                  <div key={label}>
                    <img 
                      src={imageSrc} 
                      alt={asset} 
                      className="w-full aspect-square object-cover bg-black/4 rounded-sm"
                    />
                    <p className="mt-6 t-p-sm-sans">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-20 py-28 md:px-40 md:py-40">
        <div className="mx-auto max-w-[1440px]">
          <SectionMark number="04">how px works</SectionMark>
          <div className="mt-28 grid gap-[2px] md:grid-cols-2 lg:grid-cols-4">
            {[
              ['URI', 'Identity', 'A px:// URI identifies a narrative resource.'],
              ['Manifest', 'Current state', 'A readable, versionable YAML manifest.'],
              ['Commit', 'History', 'Content-addressed snapshots.'],
              ['Resolver', 'Context', 'Resolve a resource or representation for the next task.'],
            ].map(([key, title, body], index) => <div key={key} className="rounded-sm bg-[var(--px-yellow)] p-20">
              <p className="t-p-sm-sans">0{index + 1}</p>
              <h3 className="mt-20 t-d2-sans">{key}</h3>
              <p className="mt-20 leading-[1.3] t-p-sm-sans">{body}</p>
            </div>)}
          </div>
        </div>
      </section>

      <section className="px-20 py-28 md:px-40 md:py-40">
        <div className="mx-auto max-w-[1440px]">
          <SectionMark number="05">for brand teams</SectionMark>
          <div className="mt-24 grid gap-32 lg:grid-cols-[.72fr_1.28fr] lg:gap-60">
            <div>
              <h2 className="t-d2-sans leading-[.92]">Produce more.<br /><span className="t-d2-serif text-[#dffc72]">Rebuild less.</span></h2>
              <p className="t-p-serif mt-24 max-w-md">Keep approved products, talent, styling, and campaign context consistent across every tool, format, market, and deliverable.</p>
              <p className="t-p-sm-sans mt-24 max-w-md">One source of truth. Hundreds of on-brand outputs.</p>
              <div className="mt-28"><LinkButton href="/assessment">Bring PX to your team</LinkButton></div>
            </div>

            <div className="">
              <div className="grid gap-[2px] lg:grid-cols-[.9fr_.9fr_.42fr]">
                <div className="rounded-sm bg-black/4 p-18">
                  <p className="t-p-sm-sans">Approved Versions</p>
                  <div className="mt-12 grid grid-cols-2 gap-10">
                    <div>
                      <img 
                        src="/eye-candy/dua.png" 
                        alt="Approved Dua character" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Dua</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/katana.png" 
                        alt="Approved katana" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Katana</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/orbit-product.png" 
                        alt="Approved Orbit product object" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Orbit</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/station-emergency.png" 
                        alt="Approved Underground Station location" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Station</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-sm bg-black/4 p-18">
                  <p className="t-p-sm-sans">Campaign Ouputs</p>
                  <div className="mt-12 grid grid-cols-2 gap-10">
                    <div>
                      <img 
                        src="/eye-candy/dua-ugc.png" 
                        alt="Dua UGC campaign output" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Dua UGC</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/orbit-product.png" 
                        alt="Orbit product campaign output" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Orbit Product</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/sensei-battle.png" 
                        alt="Sensei battle campaign output" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Sensei Battle</p>
                    </div>
                    <div>
                      <img 
                        src="/eye-candy/sensei-battle.png" 
                        alt="Sensei battle campaign output" 
                        className="aspect-square object-cover rounded-sm"
                      />
                      <p className="mt-6 t-p-sm-sans">Sensei Battle</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-sm bg-black/4 p-18">
                  <p className="t-p-sm-sans">Workflow Tools</p>
                  <div className="mt-10 grid grid-cols-4 md:grid-cols-6 lg:grid-cols-1 gap-8 text-[12px]">
                    {[
                      ['Image', <Image width="100%" height="100%" key="image" />],
                      ['Video', <Video width="100%" height="100%" key="video" />],
                      ['3D', <Box width="100%" height="100%" key="3d" />],
                      ['Social', <Users width="100%" height="100%" key="social" />],
                      ['Retail', <ShoppingBag width="100%" height="100%" />],
                      ['Editor', <Edit width="100%" height="100%" />],
                    ].map(([tool, icon]) => (
                      <div key={tool as string} className="flex aspect-square lg:aspect-auto bg-white rounded-[12px] lg:rounded-sm shadow items-center justify-center border-b border-black/15 p-8 h-fit">
                        <div className="w-[50%] flex flex-col lg:flex-row items-center gap-4 shrink-0">
                          <ToolIcon icon={icon} />
                          <span>{tool}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 py-28 md:px-40 md:py-40">
          <div className="grid gap-[2px] lg:grid-cols-2">
            <div><SectionMark number="06">the developer surface</SectionMark><h2 className="mt-24 t-d2-sans leading-[.92]">Install it.<br />Make something.</h2><p className="mt-22 max-w-md leading-[1.35] t-p-sm-sans">px ships with an MCP server, agent skills, and a command line tool for resolving and editing resources inside your project.</p></div>
            <div className="min-w-0 space-y-14">
              <div><p className="mb-8 t-p-sm-sans">1. Install px + skills</p><PxCodeBlock>{content.install}</PxCodeBlock></div>
              <div><p className="mb-8 t-p-sm-sans">a. Connect MCP with Codex</p><PxCodeBlock>{content.codexMcpInstall}</PxCodeBlock></div>
              <div><p className="mb-8 t-p-sm-sans">2. Start the Eye-Candy world</p><PxCodeBlock>{'px init eye-candy\n\n# Create a character the world can resolve\npx create character dua -u eye-candy -n "Dua"'}</PxCodeBlock></div>
              <div><p className="mb-8 t-p-sm-sans">3. Add a representation</p><PxCodeBlock>{'px add px://eye-candy/character/dua portrait ./dua-portrait.png --format png -m "Add approved portrait"'}</PxCodeBlock></div>
            </div>
          </div>
          <div className="mt-16 grid gap-[2px] space-y-14 lg:grid-cols-2">
            <article><p className="mb-8 t-p-sm-sans">TypeScript SDK</p><PxCodeBlock>{"import {repoCreateEntity} from '@portalshq/px'\n\nconst dua = repoCreateEntity('eye-candy', 'character', 'dua', 'Dua')"}</PxCodeBlock></article>
            <article><p className="mb-8 t-p-sm-sans">Python SDK</p><PxCodeBlock>{"from px_sdk import repo_create_entity\n\ndua = repo_create_entity('eye-candy', 'character', 'dua', 'Dua')"}</PxCodeBlock></article>
          </div>
        </div>
      </section>

      <PxSagaBanner>
        <div className="grid gap-24 lg:grid-cols-[1fr_.7fr] lg:items-end">
          <div>
            <p className="t-p-sm-sans">For filmmakers, writers, artists, creative developers, production teams, and the projects that grow into worlds.</p>
            <h2 className="mt-20 t-d2-sans leading-[.96]">Make something weird.<br /><span>Build with <span className={`t-d2-sans text-white ${styles.chromeWord} text-[clamp(92px,18vw,120px)] font-bold leading-[1.2em] !mx-0 !px-0 cursor-default pointer-events-none`}
            >px</span></span>{" "}.</h2>
          </div>
          <div className="lg:justify-self-end"><LinkButton href={GITHUB_URL}>Explore px on GitHub</LinkButton></div>
        </div>
      </PxSagaBanner>

      <section aria-label="PX and Portals" className="!bg-black mx-auto">
        <div className="mx-auto max-w-[1440px] px-20 pb-80 pt-40 t-p-sm-sans !text-white md:px-40">
          <p>px is free and open source for creators and developers building locally.</p>
          <p className="mt-20 inline-block !text-white">Building with a production team? <span>Explore Portals <ArrowDownRight /></span></p>
        </div>
      </section>
    </main>
  )
}
