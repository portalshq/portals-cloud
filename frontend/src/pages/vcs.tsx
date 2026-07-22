import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

type OverviewItem = {
  heading: string;
  iconPath: string;
  textA: string[];
  textB?: string[];
  textC: string[];
  list?: string[];
};

type OverviewTransitionStage = 'hidden' | 'idle' | 'exiting' | 'entering';
type OverviewScrollPhase = 'before' | 'viewing' | 'after';

const iconPaths = [
  'M30.41 41 41 51.59V82h-2V52.41l-4-4-30.29 30.3L3.3 77.3l30.29-30.29-4-4H0v-2h30.41Zm22-2-4-4 30.3-30.29L77.3 3.3 47.01 33.59l-4-4V0h-2v30.41L51.6 41h30.41v-2H52.42Z',
  'M86 43C86 19.29 66.71 0 43 0S0 19.29 0 43s17.4 41.03 39.45 42.84c1.17.13 2.35.2 3.55.2s2.38-.07 3.55-.2C68.61 84.03 86 65.51 86 43M43 83.74c-11.51 0-20.87-9.36-20.87-20.87S31.49 42 43 42s20.87 9.36 20.87 20.87S54.51 83.74 43 83.74m22.87-20.87C65.87 50.26 55.61 40 43 40S20.13 50.26 20.13 62.87c0 6.7 2.9 12.74 7.51 16.93-8.77-5.25-14.65-14.84-14.65-25.78C12.99 37.47 26.46 24 43.01 24s30.02 13.47 30.02 30.02c0 10.94-5.89 20.53-14.66 25.78 4.61-4.19 7.51-10.23 7.51-16.93Zm-1.98 15.39c6.81-5.88 11.13-14.56 11.13-24.24C75.02 36.36 60.65 22 43 22S10.98 36.36 10.98 54.02c0 9.68 4.32 18.36 11.13 24.24C10.08 71.11 2 57.98 2 43 2 20.39 20.39 2 43 2s41 18.39 41 41c0 14.98-8.08 28.11-20.11 35.26',
  'm52.31 31.38-.72-4.17c-1.05-5.96-4.37-11.16-9.33-14.64S31.28 7.76 25.31 8.81l-4.17.74-1.49-8.34 4.17-.74c8.2-1.43 16.46.4 23.28 5.17 6.81 4.77 11.37 11.91 12.82 20.1l.72 4.17-8.34 1.46ZM29.29 6.7c4.97 0 9.82 1.52 13.98 4.43 5.35 3.75 8.92 9.35 10.06 15.78l.42 2.43 4.86-.85-.42-2.43c-1.37-7.72-5.67-14.46-12.1-18.96C39.66 2.59 31.86.86 24.13 2.22l-2.43.43.87 4.86L25 7.08c1.43-.25 2.87-.38 4.29-.38m24.8 48.32-4.21-7.32 3.65-2.12c5.25-3.03 9-7.93 10.57-13.78s.77-11.97-2.26-17.22l-2.12-3.67 7.33-4.21 2.12 3.65c4.15 7.21 5.25 15.6 3.1 23.64-2.15 8.03-7.3 14.75-14.49 18.92l-3.67 2.12Zm-1.8-6.68 2.46 4.27 2.14-1.23c6.79-3.93 11.64-10.27 13.67-17.85s.99-15.5-2.92-22.3l-1.23-2.12-4.27 2.45 1.23 2.14c3.26 5.66 4.13 12.25 2.44 18.56s-5.74 11.58-11.39 14.85zm-.8 19.09c-7.3 0-14.3-2.53-19.96-7.27l-3.25-2.73 5.43-6.47 3.24 2.7c2.3 1.93 4.91 3.37 7.76 4.27 2.86.9 5.81 1.23 8.8.97a22.6 22.6 0 0 0 8.5-2.47c2.66-1.38 4.98-3.25 6.91-5.54l2.71-3.25 6.49 5.43-2.73 3.25c-5.36 6.36-12.87 10.26-21.15 10.98-.93.08-1.85.12-2.77.12ZM30.77 57.22l1.89 1.59c6.01 5.03 13.64 7.42 21.44 6.74 7.81-.68 14.9-4.36 19.95-10.36l1.59-1.89-3.78-3.16-1.57 1.89A24.1 24.1 0 0 1 62.84 58a24.4 24.4 0 0 1-9.17 2.67c-3.22.28-6.41-.07-9.49-1.04s-5.89-2.52-8.37-4.6l-1.89-1.57-3.16 3.77Zm7.56 22.14-3.99-1.44c-7.81-2.86-14.05-8.58-17.56-16.12s-3.89-15.99-1.05-23.81l1.44-3.97 7.96 2.88-1.44 3.99a22.5 22.5 0 0 0-1.35 8.75 22.64 22.64 0 0 0 7.34 15.74c2.21 2.02 4.75 3.57 7.57 4.59l3.97 1.44-2.88 7.96Zm-20.1-43.09-.84 2.31c-2.67 7.37-2.32 15.35.99 22.46s9.2 12.51 16.56 15.21l2.32.84 1.68-4.63-2.31-.84c-3.03-1.1-5.78-2.77-8.16-4.95a24.3 24.3 0 0 1-5.64-7.69 24.4 24.4 0 0 1-2.27-9.27c-.14-3.22.35-6.4 1.46-9.43l.84-2.32-4.63-1.68ZM8.48 50.93H0v-4.17c0-8.33 3.25-16.17 9.14-22.06s13.73-9.14 22.06-9.14h4.15v8.47h-4.23c-2.99 0-5.91.58-8.67 1.72-2.77 1.14-5.24 2.8-7.36 4.91a22.6 22.6 0 0 0-4.92 7.36 22.5 22.5 0 0 0-1.73 8.68l.04 4.22Zm-6.71-1.77H6.7l-.03-2.44c0-3.24.63-6.39 1.86-9.37s3.02-5.65 5.3-7.93a24.43 24.43 0 0 1 17.27-7.16h2.47v-4.94h-2.38c-7.86 0-15.25 3.06-20.81 8.62-5.55 5.57-8.61 12.96-8.61 20.82z',
  'M30.31 76.96c-.35 0-.7-.07-1.03-.2l-.26-.13-22.28-12.8c-.41-.24-.75-.58-.98-.98-.24-.41-.36-.87-.36-1.34s.12-.93.36-1.34c.23-.41.57-.75.98-.98l22.23-12.76c.82-.47 1.88-.47 2.7 0 .41.23.75.57.98.98.24.4.36.87.36 1.34v25.54c0 .47-.13.93-.36 1.34-.24.41-.58.74-.98.98-.41.24-.88.36-1.35.36Zm0-28.9a.73.73 0 0 0-.35.09L7.73 60.92c-.1.06-.19.15-.25.25a.67.67 0 0 0 0 .67c.06.1.15.19.25.25L30.1 74.93c.06.02.37.04.56-.07.1-.06.19-.15.25-.25s.09-.22.09-.34V48.73a.63.63 0 0 0-.09-.33.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09m39.1 5.84c-.47 0-.94-.12-1.35-.36L45.85 40.77a2.7 2.7 0 0 1-1.32-2.31c0-.46.12-.92.35-1.32.17-.3.39-.56.67-.78l.23-.16 22.28-12.81c.41-.23.88-.36 1.35-.36s.94.13 1.35.36c.41.24.75.58.99.99.23.41.36.87.36 1.34V51.2c0 .47-.12.93-.36 1.34-.23.41-.57.75-.99.99-.41.24-.88.36-1.35.36Zm0-28.86c-.12 0-.25.03-.35.09L46.74 37.98s-.08.08-.12.16a.66.66 0 0 0 0 .66c.06.1.14.19.25.25l22.19 12.76c.21.12.49.12.7 0 .11-.06.19-.15.25-.25s.09-.22.09-.34V25.73c0-.12-.03-.24-.09-.34a.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09Zm-39.1 5.85c-.47 0-.94-.12-1.35-.36L6.75 17.77c-.41-.25-.74-.59-.96-.98-.22-.4-.34-.85-.34-1.31s.12-.91.34-1.31.55-.74.94-.98L28.97.41c.82-.47 1.88-.47 2.69 0a2.66 2.66 0 0 1 1.35 2.32v25.48c0 .47-.12.93-.36 1.34s-.58.75-.99.99-.88.36-1.35.36Zm0-28.85a.73.73 0 0 0-.35.09L7.75 14.91c-.08.05-.16.13-.22.24q-.09.15-.09.33c0 .18.03.23.09.33s.14.19.24.25l22.19 12.75a.73.73 0 0 0 .7 0c.11-.06.19-.15.25-.25s.09-.22.09-.34V2.73c0-.12-.03-.23-.09-.34a.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09Zm11.48 74.92c-.47 0-.94-.12-1.35-.36s-.75-.58-.99-.98c-.18-.31-.29-.64-.34-.99l-.02-.29V48.73a2.66 2.66 0 0 1 1.35-2.32c.71-.41 1.6-.47 2.37-.16l.26.12 22.29 12.79c.41.24.75.58.98.98.24.41.36.87.36 1.34s-.12.93-.36 1.34c-.23.41-.57.75-.98.98L43.13 76.58c-.41.24-.88.36-1.35.36Zm0-28.9c-.12 0-.25.03-.35.09-.11.06-.19.15-.25.25s-.09.22-.09.33v25.69s.05.11.09.18c.06.1.15.19.25.25.21.12.49.12.7 0l22.23-12.78c.1-.06.19-.15.25-.25s.09-.22.09-.34-.03-.23-.09-.34-.15-.19-.25-.25L42 48.06s-.12-.03-.21-.03Zm-39.1 5.79A2.66 2.66 0 0 1 .36 52.5 2.64 2.64 0 0 1 0 51.16V25.68c0-.47.12-.93.36-1.34s.58-.75.99-.99c.82-.47 1.88-.47 2.7 0l22.21 12.77c.41.25.74.59.97.99a2.66 2.66 0 0 1 0 2.64c-.23.4-.55.74-.95.98L4.04 53.49c-.41.23-.87.36-1.35.36m0-28.86a.73.73 0 0 0-.35.09c-.11.06-.19.15-.25.25s-.09.22-.09.34v25.49c0 .12.03.24.09.34s.15.19.25.25c.21.12.49.12.7 0l22.21-12.77c.08-.05.17-.14.22-.24a.66.66 0 0 0 0-.66.7.7 0 0 0-.24-.25L3.05 25.08a.73.73 0 0 0-.35-.09Zm39.1 5.85c-.47 0-.94-.13-1.35-.36-.41-.24-.75-.58-.99-.98a2.64 2.64 0 0 1-.36-1.34V2.67A2.66 2.66 0 0 1 40.44.35c.82-.47 1.87-.47 2.69 0l22.21 12.76c.42.26.74.59.97.99.22.4.34.85.34 1.31s-.12.91-.34 1.31-.55.74-.94.98L43.14 30.48c-.41.24-.88.36-1.35.36m0-28.85c-.12 0-.25.03-.35.09s-.19.15-.25.25-.09.22-.09.34v25.48c0 .12.03.24.09.34s.15.19.25.25c.21.12.49.12.7 0l22.21-12.76c.08-.05.16-.13.22-.23a.66.66 0 0 0 0-.66.7.7 0 0 0-.24-.25L42.14 2.09a.73.73 0 0 0-.35-.09Z',
];

const overviewItems: OverviewItem[] = [
  {
    heading: 'Synthetic\nRelationships',
    iconPath: iconPaths[0],
    textA: ['The internet was built around content distribution. The next phase of the internet is built around synthetic relationships.'],
    textB: ['Saga builds character AI agents that can engage users continuously across social platforms, messaging environments, and online communities. These agents do more than generate content. They build familiarity, sustain interaction, and create persistent synthetic relationships between audiences and digital IP.'],
    textC: ['Characters are no longer confined to games, apps, campaigns, or content feeds.'],
  },
  {
    heading: 'What\nSaga is',
    iconPath: iconPaths[1],
    textA: [
      'Saga is a hyperscaling platform for persistent AI agents, character AI systems, and autonomous digital personalities.',
      'It enables studios, creators, and brands to launch persistent AI characters that:',
    ],
    list: [
      'Maintain identity and memory',
      'Interact naturally with users',
      'Operate across multiple platforms simultaneously',
      'Extend the reach and lifespan of digital IP',
    ],
    textC: ['Saga agents are coordinated AI systems designed for continuous interaction at global scale.'],
  },
  {
    heading: 'The Next\nEvolution of IP',
    iconPath: iconPaths[2],
    textA: [
      'For decades, digital IP has been limited by format. Characters could appear in games, films, and social content, but they could not truly participate alongside their audiences.',
      'Advances in conversational AI and autonomous agents are changing that.',
    ],
    textB: ['Characters can now speak, remember, evolve, and build ongoing relationships with people directly. What was once passive media becomes an active participant capable of sustaining engagement far beyond a single platform or moment.'],
    textC: ['This creates an entirely new relationship layer between audiences and the worlds they care about.'],
  },
  {
    heading: 'Why it\nMatters',
    iconPath: iconPaths[3],
    textA: ['Persistent AI agents unlock new monetization, engagement, and audience growth opportunities for gaming, entertainment, and digital IP brands.'],
    textB: ['For audiences, experiences become more personal, dynamic, and continuous. For creators and brands, characters become continuously active, discoverable, and socially present across the internet.'],
    textC: ['This is more than a new software category.', 'It is a new interface layer for the internet itself.'],
  },
];

function formatNumber(index: number) {
  return String(index + 1).padStart(3, '0');
}

const blurEnterTransition = 'opacity 1.25s cubic-bezier(0.16, 1, 0.3, 1), filter 1.25s cubic-bezier(0.16, 1, 0.3, 1)';
const blurExitTransition = 'opacity 0.4s cubic-bezier(0.55, 0.06, 0.68, 0.19), filter 0.4s cubic-bezier(0.55, 0.06, 0.68, 0.19)';
const overviewBlurStaggerMs = 150;
const overviewLayerCount = 4;
const overviewExitTotalMs = 400 + overviewBlurStaggerMs * (overviewLayerCount - 1);
const overviewEnterTotalMs = 1250 + overviewBlurStaggerMs * (overviewLayerCount - 1);

function overviewMotionStyle(visibleIndex: number, index: number, stage: OverviewTransitionStage, staggerIndex = 0): CSSProperties {
  const isVisibleLayer = visibleIndex === index;
  const isEnteringOrResting = stage !== 'hidden' && stage !== 'exiting';
  const active = isVisibleLayer && isEnteringOrResting;

  return {
    opacity: active ? 1 : 0,
    filter: active ? 'blur(0px)' : 'blur(10px)',
    pointerEvents: active ? 'auto' : 'none',
    transition: active ? blurEnterTransition : blurExitTransition,
    transitionDelay: isVisibleLayer ? `${staggerIndex * overviewBlurStaggerMs}ms` : '0ms',
  };
}

function NumberLabel({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-x-8">
      <span className="size-8 bg-white" />
      <span className="t-m2">{formatNumber(index)}</span>
    </div>
  );
}

function Icon({ item }: { item: OverviewItem }) {
  const viewBox = item.iconPath === iconPaths[1] ? '0 0 86 86.04' : item.iconPath === iconPaths[2] ? '0 0 78.13 79.35' : item.iconPath === iconPaths[3] ? '0 0 72.11 76.96' : '0 0 82 82';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} className="w-fluid-[44,86] fill-current" aria-hidden="true">
      <path d={item.iconPath} />
    </svg>
  );
}

function Paragraphs({ lines, className, boldLast = false }: { lines?: string[]; className: string; boldLast?: boolean }) {
  if (!lines?.length) return null;

  return (
    <div className={`${className} space-y-24`}>
      {lines.map((text, index) => (
        <p key={text}>{boldLast && index === lines.length - 1 ? <strong>{text}</strong> : text}</p>
      ))}
    </div>
  );
}

function ListColumn({ item }: { item: OverviewItem }) {
  if (!item.list) return <Paragraphs lines={item.textB} className="t-p-lg-serif" />;

  return (
    <ul className="space-y-16">
      {item.list.map((text) => (
        <li key={text} className="rounded-[10px] border bg-white/10 px-16 py-8 backdrop-blur-[20px]">
          <div className="flex items-start gap-x-16 t-p-sans leading-[1.2em]">
            <span className="flex h-[1.364em] items-center">
              <span className="size-8 shrink-0 bg-current" />
            </span>
            <span>{text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OverviewContent({ item, index, visibleIndex, transitionStage }: { item: OverviewItem; index: number; visibleIndex: number; transitionStage: OverviewTransitionStage }) {
  return (
    <div
      data-content-index={index}
      className="saga-overview-content col-start-1 row-start-1"
      style={overviewMotionStyle(visibleIndex, index, transitionStage)}
    >
      <div className="ui-grid px-0">
        <div className="col-span-3 row-start-1 flex items-start justify-end">
          <Icon item={item} />
        </div>
        <div className="col-span-21">
          <h3 className="t-d2-sans">
            {item.heading.split('\n').map((line, lineIndex) => (
              <span key={line}>
                {line}
                {lineIndex < item.heading.split('\n').length - 1 && <br />}
              </span>
            ))}
          </h3>
        </div>
      </div>
    </div>
  );
}

function OverviewMobileItem({ item, index }: { item: OverviewItem; index: number }) {
  return (
    <div className="ui-grid relative items-center text-white">
      {index === 0 && <div className="pointer-events-none h-px w-full" aria-hidden="true" data-webgl-marker="scrollTo" data-webgl-position="0.96" />}
      {index > 0 && <div className="pointer-events-none h-px w-full" aria-hidden="true" data-webgl-marker="colorRamps" />}
      <div className="col-span-full grid grid-cols-subgrid gap-y-30">
        <div className="col-span-full grid auto-rows-auto grid-cols-subgrid gap-y-16">
          <div className="col-span-3 row-start-1 flex items-start justify-end">
            <NumberLabel index={index} />
          </div>
          <div className="col-span-3 row-start-2 flex items-start justify-end">
            <Icon item={item} />
          </div>
          <div className="col-span-21 row-start-2">
            <h3 className="t-d2-sans">
              {item.heading.split('\n').map((line, lineIndex) => (
                <span key={line}>
                  {line}
                  {lineIndex < item.heading.split('\n').length - 1 && <br />}
                </span>
              ))}
            </h3>
          </div>
        </div>
        <div className="col-span-full space-y-18">
          <div className="relative -mx-sms h-px bg-white/20" />
        </div>
        <div className="col-span-11 col-start-2 space-y-24 sm:col-span-21 sm:col-start-4">
          <Paragraphs lines={item.textA} className="t-p-lg-serif" />
          <ListColumn item={item} />
          <Paragraphs lines={item.textC} className="t-h3-sans" boldLast={index === overviewItems.length - 1} />
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const requestedIndexRef = useRef(0);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [transitionStage, setTransitionStage] = useState<OverviewTransitionStage>('hidden');
  const [scrollPhase, setScrollPhase] = useState<OverviewScrollPhase>('before');
  const [progress, setProgress] = useState(0);
  const itemCount = overviewItems.length;

  useEffect(() => {
    let raf = 0;

    const update = () => {
      raf = 0;
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const scrollRange = Math.max(1, section.offsetHeight - window.innerHeight);
      const unclampedProgress = -rect.top / scrollRange;
      const rawProgress = Math.min(1, Math.max(0, unclampedProgress));
      const nextIndex = Math.min(itemCount - 1, Math.floor(rawProgress * itemCount));
      const nextScrollPhase: OverviewScrollPhase = unclampedProgress < 0 ? 'before' : unclampedProgress > 1 ? 'after' : 'viewing';

      setProgress(rawProgress);
      setScrollPhase(nextScrollPhase);
      requestedIndexRef.current = nextIndex;
      setScrollIndex(nextIndex);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [itemCount]);

  useEffect(() => {
    requestedIndexRef.current = scrollIndex;

    if (scrollPhase === 'before') {
      if (transitionStage !== 'hidden') {
        setTransitionStage('hidden');
      }
      return undefined;
    }

    if (scrollPhase === 'after') {
      if (visibleIndex !== itemCount - 1) {
        setVisibleIndex(itemCount - 1);
      }
      if (transitionStage !== 'idle') {
        setTransitionStage('idle');
      }
      return undefined;
    }

    if (transitionStage === 'hidden') {
      setVisibleIndex(scrollIndex);
      const rafId = window.requestAnimationFrame(() => {
        setTransitionStage('entering');
      });

      return () => window.cancelAnimationFrame(rafId);
    }

    if (transitionStage === 'idle' && scrollIndex !== visibleIndex) {
      setTransitionStage('exiting');
    }

    return undefined;
  }, [itemCount, scrollIndex, scrollPhase, transitionStage, visibleIndex]);

  useEffect(() => {
    if (scrollPhase !== 'viewing') return undefined;

    if (transitionStage === 'exiting') {
      const timeoutId = window.setTimeout(() => {
        setVisibleIndex(requestedIndexRef.current);
        setTransitionStage('entering');
      }, overviewExitTotalMs);

      return () => window.clearTimeout(timeoutId);
    }

    if (transitionStage === 'entering') {
      const timeoutId = window.setTimeout(() => {
        setTransitionStage('idle');
      }, overviewEnterTotalMs);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [scrollPhase, transitionStage]);

  const progressScale = useMemo(() => ({ transform: `scaleX(${progress})` }), [progress]);

  return (
    <section ref={sectionRef} data-header-theme="light" data-slice-type="overview" data-slice-variation="default">
      <div className="relative">
        <div className="saga-overview-desktop">
          <div className="saga-overview-pin z-10">
            <div className="ui-grid relative min-h-screen items-center py-Header-h text-white">
              <div className="col-span-full grid grid-cols-subgrid gap-y-fluid-[30,52]">
                <div className="col-span-full grid">
                  {overviewItems.map((item, index) => (
                    <OverviewContent key={item.heading} item={item} index={index} visibleIndex={visibleIndex} transitionStage={transitionStage} />
                  ))}
                </div>

                <div className="col-span-full space-y-18">
                  <NumberLabel index={scrollIndex} />
                  <div className="relative -mx-sms h-px bg-white/20">
                    <div data-progress-line className="absolute top-0 left-0 h-px w-full origin-left bg-white" style={progressScale} />
                  </div>
                </div>

                <div className="col-span-21 col-start-4 grid grid-cols-subgrid">
                  <div className="col-span-7">
                    <div className="grid">
                      {overviewItems.map((item, index) => (
                        <div key={`${item.heading}-a`} data-content-index={index} className="saga-overview-content col-start-1 row-start-1" style={overviewMotionStyle(visibleIndex, index, transitionStage, 1)}>
                          <Paragraphs lines={item.textA} className="t-p-lg-serif" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-7">
                    <div className="grid">
                      {overviewItems.map((item, index) => (
                        <div key={`${item.heading}-b`} data-content-index={index} className="saga-overview-content col-start-1 row-start-1" style={overviewMotionStyle(visibleIndex, index, transitionStage, 2)}>
                          <ListColumn item={item} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-7">
                    <div className="grid">
                      {overviewItems.map((item, index) => (
                        <div key={`${item.heading}-c`} data-content-index={index} className="saga-overview-content col-start-1 row-start-1" style={overviewMotionStyle(visibleIndex, index, transitionStage, 3)}>
                          <Paragraphs lines={item.textC} className="t-h3-sans" boldLast={index === overviewItems.length - 1} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 z-0" aria-hidden="true">
            {overviewItems.map((item, index) => (
              <div className="saga-ramp-marker" key={`${item.heading}-marker`}>
                {index === 0 && <div className="pointer-events-none h-px w-full" data-webgl-marker="scrollTo" data-webgl-position="0.96" />}
                {index > 0 && <div className="pointer-events-none h-px w-full" data-webgl-marker="colorRamps" />}
                {index === overviewItems.length - 1 && <div className="pointer-events-none h-px w-full" data-webgl-marker="colorRamps" />}
              </div>
            ))}
          </div>
        </div>

        <div className="saga-overview-mobile space-y-fluid-[106,212] py-fluid-[76,106]">
          {overviewItems.map((item, index) => (
            <OverviewMobileItem key={item.heading} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function VCS() {
  return (
    <main className="relative z-(--z-main)">
      <div className="pointer-events-none h-px w-full" aria-hidden="true" data-webgl-marker="scrollFrom" data-webgl-position="0" data-webgl-easing="easeInOut" />

      <section data-header-theme="light" data-slice-type="hero" data-slice-variation="default">
        <div className="ui-grid min-h-screen gap-y-[max(var(--spacing-sgs),12.5svh)] pt-[max(var(--spacing-Header-h),29.5svh)] pb-sms text-white">
          <div className="col-span-full space-y-20">
            <h1 className="max-w-[8.725em] t-d1-sans">
              Pioneering Synthetic <strong className="t-d1-serif">Relationships</strong>
            </h1>
          </div>
          <div className="col-span-full grid grid-cols-subgrid">
            <div className="col-span-8 col-start-5 flex justify-end lg:col-span-full">
              <div className="max-w-[10.85em] t-m1">
                <p>Character AI Agents as a growth channel.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-header-theme="light" data-slice-type="lead" data-slice-variation="default">
        <div className="ui-grid items-center text-white py-fluid-[76,106] lg:min-h-screen">
          <div className="space-y-[0.95em] col-span-full lg:col-span-20 lg:col-start-3">
            <p className="t-d2-sans">
              Saga builds AI agents that turn characters, brands, and worlds into living digital participants that can{' '}
              <strong className="t-d2-serif">engage, adapt, and grow </strong>
              across the internet.
            </p>
          </div>
        </div>
      </section>

      <OverviewSection />

      <section data-header-theme="light">
        <div className="relative flex min-h-screen items-center text-white">
          <div className="ui-grid flex-1 gap-y-sms py-sms">
            <div className="relative z-30 col-span-full flex flex-col items-center gap-y-fluid-[32,40] text-center">
              <NumberLabel index={0} />
              <h4 className="t-global-cta_heading">See how it works in practice</h4>
              <a className="t-button inline-flex items-center rounded-sm h-48 gap-x-9 pr-12 pl-18 border border-white/10 bg-white/12 text-white backdrop-blur-[50px] transition-colors duration-500 hover:bg-white/30" href="/platform">
                <span>Explore Use Cases</span>
                <svg viewBox="0 0 18.31 16.53" className="size-19 fill-current" aria-hidden="true">
                  <path d="m18.31 8.26-8.26 8.26-1.12-1.12 6.36-6.36H0V7.46h15.28L8.93 1.12 10.05 0z" />
                </svg>
              </a>
            </div>
          </div>
          <div className="absolute inset-0 z-10" />
          <div className="absolute inset-x-0 bottom-0 z-20 h-194 bg-[linear-gradient(180deg,rgba(255,255,255,0)_9.93%,#FFF_100%)]" />
        </div>
      </section>
    </main>
  );
}
