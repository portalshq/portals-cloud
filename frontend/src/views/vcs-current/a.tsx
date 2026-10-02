'use client'

import { CTAButton } from '@/components/CTAButton';
import { ProductionLineage } from '@/components/ProductionLineage';
import {
  PACKAGE_SPEC_SLUGS,
  findPackageSpecification,
  packageOriginalPriceLabel,
  packagePriceLabel,
  packagePricingFeatures,
} from '@/lib/package-specifications';
import { formatNumber, scopeAPilotMailto } from '@/lib/utils';
import { blurEnterDurationMs, blurEnterEasing, blurExitDurationMs, blurExitEasing, overviewBlurStaggerMs, overviewColumnMotionStyle, overviewEnterTotalMs, overviewExitTotalMs, overviewMotionStyle, OverviewScrollPhase, OverviewTransitionStage } from '@/types/overview';
import type { PackageSpecification } from '@/types/resource';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

type OverviewItem = {
  heading: string;
  iconPath: React.ReactNode;
  textA: string[];
  textB?: string[];
  textC: string[];
  list?: string[];
};



const iconPaths = [
  <path d='M45.06 5.8 75.23 20.89Q78.97 22.76 78.97 25Q78.97 27.24 75.23 29.11L45.06 44.2Q43 45.23 40.94 44.21L10.77 29.11Q7.03 27.24 7.03 25Q7.03 22.76 10.77 20.89L40.94 5.8Q43 4.77 45.06 5.79ZM44.08 7.77 44.08 7.76Q43 7.23 41.92 7.76L11.75 22.85Q9.23 24.11 9.23 25Q9.23 25.89 11.75 27.15L41.92 42.23Q43 42.77 44.08 42.24L74.25 27.15Q76.77 25.89 76.77 25Q76.77 24.11 74.25 22.85ZM9.49 60.02 41.92 76.24Q43 76.77 44.08 76.23L76.51 60.02L77.49 61.98L45.06 78.21Q43 79.23 40.94 78.2L8.51 61.98ZM9.49 43.02 41.92 59.24Q43 59.77 44.08 59.23L76.51 43.02L77.49 44.98L45.06 61.21Q43 62.23 40.94 61.2L8.51 44.98Z' />,
  <path d='M3.78 53Q3.78 41.77 11.71 33.84Q12.92 32.63 14.2 31.61Q14.2 31.8 14.2 32Q14.2 33.23 14.29 34.42Q13.77 34.89 13.27 35.39Q5.98 42.69 5.98 53Q5.98 63.31 13.27 70.61Q20.56 77.9 30.88 77.9Q41.19 77.9 48.48 70.61Q55.78 63.31 55.78 53Q55.78 42.69 48.48 35.39Q46.67 33.58 44.67 32.22Q45.81 31.63 47.01 31.19Q48.58 32.38 50.04 33.84Q57.98 41.77 57.98 53Q57.98 64.23 50.04 72.16Q42.1 80.1 30.88 80.1Q19.65 80.1 11.71 72.16Q3.78 64.23 3.78 53ZM28.19 49.87Q29.15 40.64 35.96 33.84Q43.9 25.9 55.12 25.9Q66.35 25.9 74.29 33.84Q82.22 41.77 82.22 53Q82.22 64.23 74.29 72.16Q66.35 80.1 55.12 80.1Q49.65 80.1 44.95 78.21Q46.15 77.53 47.3 76.71Q50.96 77.9 55.12 77.9Q65.44 77.9 72.73 70.61Q80.02 63.31 80.02 53Q80.02 42.69 72.73 35.39Q65.44 28.1 55.12 28.1Q44.81 28.1 37.52 35.39Q30.78 42.13 30.27 51.44Q29.2 50.73 28.19 49.87ZM15.9 32Q15.9 20.77 23.84 12.84Q31.77 4.9 43 4.9Q54.23 4.9 62.16 12.84Q68.71 19.39 69.86 28.18Q68.66 27.45 67.41 26.85Q66.01 19.8 60.61 14.39Q53.31 7.1 43 7.1Q32.69 7.1 25.39 14.39Q18.1 21.69 18.1 32Q18.1 42.31 25.39 49.61Q32.69 56.9 43 56.9Q49.04 56.9 54.04 54.4Q53.97 55.71 53.77 56.96Q48.83 59.1 43 59.1Q31.77 59.1 23.84 51.16Q15.9 43.23 15.9 32ZM59.59 50.58Q60.1 50.11 60.61 49.61Q67.34 42.87 67.86 33.56Q68.93 34.27 69.94 35.13Q68.97 44.36 62.16 51.16Q60.96 52.37 59.67 53.39Q59.68 53.2 59.68 53Q59.68 51.77 59.59 50.58ZM38.99 74.81Q37.42 73.62 35.96 72.16Q29.41 65.61 28.27 56.82Q29.46 57.55 30.71 58.15Q32.12 65.2 37.52 70.61Q39.33 72.42 41.33 73.78Q40.19 74.37 38.99 74.81ZM20.11 28.04Q25.05 25.9 30.88 25.9Q36.35 25.9 41.05 27.79Q39.85 28.47 38.7 29.29Q35.04 28.1 30.88 28.1Q24.84 28.1 19.84 30.6Q19.91 29.29 20.11 28.04Z' />,
  <path d='M86 43C86 19.29 66.71 0 43 0S0 19.29 0 43s17.4 41.03 39.45 42.84c1.17.13 2.35.2 3.55.2s2.38-.07 3.55-.2C68.61 84.03 86 65.51 86 43M43 83.74c-11.51 0-20.87-9.36-20.87-20.87S31.49 42 43 42s20.87 9.36 20.87 20.87S54.51 83.74 43 83.74m22.87-20.87C65.87 50.26 55.61 40 43 40S20.13 50.26 20.13 62.87c0 6.7 2.9 12.74 7.51 16.93-8.77-5.25-14.65-14.84-14.65-25.78C12.99 37.47 26.46 24 43.01 24s30.02 13.47 30.02 30.02c0 10.94-5.89 20.53-14.66 25.78 4.61-4.19 7.51-10.23 7.51-16.93Zm-1.98 15.39c6.81-5.88 11.13-14.56 11.13-24.24C75.02 36.36 60.65 22 43 22S10.98 36.36 10.98 54.02c0 9.68 4.32 18.36 11.13 24.24C10.08 71.11 2 57.98 2 43 2 20.39 20.39 2 43 2s41 18.39 41 41c0 14.98-8.08 28.11-20.11 35.26' />,
  <path d='m52.31 31.38-.72-4.17c-1.05-5.96-4.37-11.16-9.33-14.64S31.28 7.76 25.31 8.81l-4.17.74-1.49-8.34 4.17-.74c8.2-1.43 16.46.4 23.28 5.17 6.81 4.77 11.37 11.91 12.82 20.1l.72 4.17-8.34 1.46ZM29.29 6.7c4.97 0 9.82 1.52 13.98 4.43 5.35 3.75 8.92 9.35 10.06 15.78l.42 2.43 4.86-.85-.42-2.43c-1.37-7.72-5.67-14.46-12.1-18.96C39.66 2.59 31.86.86 24.13 2.22l-2.43.43.87 4.86L25 7.08c1.43-.25 2.87-.38 4.29-.38m24.8 48.32-4.21-7.32 3.65-2.12c5.25-3.03 9-7.93 10.57-13.78s.77-11.97-2.26-17.22l-2.12-3.67 7.33-4.21 2.12 3.65c4.15 7.21 5.25 15.6 3.1 23.64-2.15 8.03-7.3 14.75-14.49 18.92l-3.67 2.12Zm-1.8-6.68 2.46 4.27 2.14-1.23c6.79-3.93 11.64-10.27 13.67-17.85s.99-15.5-2.92-22.3l-1.23-2.12-4.27 2.45 1.23 2.14c3.26 5.66 4.13 12.25 2.44 18.56s-5.74 11.58-11.39 14.85zm-.8 19.09c-7.3 0-14.3-2.53-19.96-7.27l-3.25-2.73 5.43-6.47 3.24 2.7c2.3 1.93 4.91 3.37 7.76 4.27 2.86.9 5.81 1.23 8.8.97a22.6 22.6 0 0 0 8.5-2.47c2.66-1.38 4.98-3.25 6.91-5.54l2.71-3.25 6.49 5.43-2.73 3.25c-5.36 6.36-12.87 10.26-21.15 10.98-.93.08-1.85.12-2.77.12ZM30.77 57.22l1.89 1.59c6.01 5.03 13.64 7.42 21.44 6.74 7.81-.68 14.9-4.36 19.95-10.36l1.59-1.89-3.78-3.16-1.57 1.89A24.1 24.1 0 0 1 62.84 58a24.4 24.4 0 0 1-9.17 2.67c-3.22.28-6.41-.07-9.49-1.04s-5.89-2.52-8.37-4.6l-1.89-1.57-3.16 3.77Zm7.56 22.14-3.99-1.44c-7.81-2.86-14.05-8.58-17.56-16.12s-3.89-15.99-1.05-23.81l1.44-3.97 7.96 2.88-1.44 3.99a22.5 22.5 0 0 0-1.35 8.75 22.64 22.64 0 0 0 7.34 15.74c2.21 2.02 4.75 3.57 7.57 4.59l3.97 1.44-2.88 7.96Zm-20.1-43.09-.84 2.31c-2.67 7.37-2.32 15.35.99 22.46s9.2 12.51 16.56 15.21l2.32.84 1.68-4.63-2.31-.84c-3.03-1.1-5.78-2.77-8.16-4.95a24.3 24.3 0 0 1-5.64-7.69 24.4 24.4 0 0 1-2.27-9.27c-.14-3.22.35-6.4 1.46-9.43l.84-2.32-4.63-1.68ZM8.48 50.93H0v-4.17c0-8.33 3.25-16.17 9.14-22.06s13.73-9.14 22.06-9.14h4.15v8.47h-4.23c-2.99 0-5.91.58-8.67 1.72-2.77 1.14-5.24 2.8-7.36 4.91a22.6 22.6 0 0 0-4.92 7.36 22.5 22.5 0 0 0-1.73 8.68l.04 4.22Zm-6.71-1.77H6.7l-.03-2.44c0-3.24.63-6.39 1.86-9.37s3.02-5.65 5.3-7.93a24.43 24.43 0 0 1 17.27-7.16h2.47v-4.94h-2.38c-7.86 0-15.25 3.06-20.81 8.62-5.55 5.57-8.61 12.96-8.61 20.82z' />,
  <path d='M30.31 76.96c-.35 0-.7-.07-1.03-.2l-.26-.13-22.28-12.8c-.41-.24-.75-.58-.98-.98-.24-.41-.36-.87-.36-1.34s.12-.93.36-1.34c.23-.41.57-.75.98-.98l22.23-12.76c.82-.47 1.88-.47 2.7 0 .41.23.75.57.98.98.24.4.36.87.36 1.34v25.54c0 .47-.13.93-.36 1.34-.24.41-.58.74-.98.98-.41.24-.88.36-1.35.36Zm0-28.9a.73.73 0 0 0-.35.09L7.73 60.92c-.1.06-.19.15-.25.25a.67.67 0 0 0 0 .67c.06.1.15.19.25.25L30.1 74.93c.06.02.37.04.56-.07.1-.06.19-.15.25-.25s.09-.22.09-.34V48.73a.63.63 0 0 0-.09-.33.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09m39.1 5.84c-.47 0-.94-.12-1.35-.36L45.85 40.77a2.7 2.7 0 0 1-1.32-2.31c0-.46.12-.92.35-1.32.17-.3.39-.56.67-.78l.23-.16 22.28-12.81c.41-.23.88-.36 1.35-.36s.94.13 1.35.36c.41.24.75.58.99.99.23.41.36.87.36 1.34V51.2c0 .47-.12.93-.36 1.34-.23.41-.57.75-.99.99-.41.24-.88.36-1.35.36Zm0-28.86c-.12 0-.25.03-.35.09L46.74 37.98s-.08.08-.12.16a.66.66 0 0 0 0 .66c.06.1.14.19.25.25l22.19 12.76c.21.12.49.12.7 0 .11-.06.19-.15.25-.25s.09-.22.09-.34V25.73c0-.12-.03-.24-.09-.34a.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09Zm-39.1 5.85c-.47 0-.94-.12-1.35-.36L6.75 17.77c-.41-.25-.74-.59-.96-.98-.22-.4-.34-.85-.34-1.31s.12-.91.34-1.31.55-.74.94-.98L28.97.41c.82-.47 1.88-.47 2.69 0a2.66 2.66 0 0 1 1.35 2.32v25.48c0 .47-.12.93-.36 1.34s-.58.75-.99.99-.88.36-1.35.36Zm0-28.85a.73.73 0 0 0-.35.09L7.75 14.91c-.08.05-.16.13-.22.24q-.09.15-.09.33c0 .18.03.23.09.33s.14.19.24.25l22.19 12.75a.73.73 0 0 0 .7 0c.11-.06.19-.15.25-.25s.09-.22.09-.34V2.73c0-.12-.03-.23-.09-.34a.75.75 0 0 0-.25-.25.73.73 0 0 0-.35-.09Zm11.48 74.92c-.47 0-.94-.12-1.35-.36s-.75-.58-.99-.98c-.18-.31-.29-.64-.34-.99l-.02-.29V48.73a2.66 2.66 0 0 1 1.35-2.32c.71-.41 1.6-.47 2.37-.16l.26.12 22.29 12.79c.41.24.75.58.98.98.24.41.36.87.36 1.34s-.12.93-.36 1.34c-.23.41-.57.75-.98.98L43.13 76.58c-.41.24-.88.36-1.35.36Zm0-28.9c-.12 0-.25.03-.35.09-.11.06-.19.15-.25.25s-.09.22-.09.33v25.69s.05.11.09.18c.06.1.15.19.25.25.21.12.49.12.7 0l22.23-12.78c.1-.06.19-.15.25-.25s.09-.22.09-.34-.03-.23-.09-.34-.15-.19-.25-.25L42 48.06s-.12-.03-.21-.03Zm-39.1 5.79A2.66 2.66 0 0 1 .36 52.5 2.64 2.64 0 0 1 0 51.16V25.68c0-.47.12-.93.36-1.34s.58-.75.99-.99c.82-.47 1.88-.47 2.7 0l22.21 12.77c.41.25.74.59.97.99a2.66 2.66 0 0 1 0 2.64c-.23.4-.55.74-.95.98L4.04 53.49c-.41.23-.87.36-1.35.36m0-28.86a.73.73 0 0 0-.35.09c-.11.06-.19.15-.25.25s-.09.22-.09.34v25.49c0 .12.03.24.09.34s.15.19.25.25c.21.12.49.12.7 0l22.21-12.77c.08-.05.17-.14.22-.24a.66.66 0 0 0 0-.66.7.7 0 0 0-.24-.25L3.05 25.08a.73.73 0 0 0-.35-.09Zm39.1 5.85c-.47 0-.94-.13-1.35-.36-.41-.24-.75-.58-.99-.98a2.64 2.64 0 0 1-.36-1.34V2.67A2.66 2.66 0 0 1 40.44.35c.82-.47 1.87-.47 2.69 0l22.21 12.76c.42.26.74.59.97.99.22.4.34.85.34 1.31s-.12.91-.34 1.31-.55.74-.94.98L43.14 30.48c-.41.24-.88.36-1.35.36m0-28.85c-.12 0-.25.03-.35.09s-.19.15-.25.25-.09.22-.09.34v25.48c0 .12.03.24.09.34s.15.19.25.25c.21.12.49.12.7 0l22.21-12.76c.08-.05.16-.13.22-.23a.66.66 0 0 0 0-.66.7.7 0 0 0-.24-.25L42.14 2.09a.73.73 0 0 0-.35-.09Z' />,
];

const overviewItems: OverviewItem[] = [
  {
    heading: 'Repository',
    iconPath: iconPaths[0],
    textA: ['Approved work, prompts, references, and datasets live in one governed place — so the next brief starts from what already shipped, not from scratch.'],
    textB: ['portals doesn\'t replace the tools your team uses — it becomes the place that work lives.'],
    textC: ['Deliver work in days, not weeks.'],
  },
  {
    heading: 'History',
    iconPath: iconPaths[3],
    textA: [
      'Every edit and approval is a new version.',
    ],
    textB: ['Reuse what worked, restore any prior approved state, and branch from it in seconds — instead of paying to incrementally rebuild it.'],
    textC: ['Stop paying for the same work twice.'],
  },
  {
    heading: 'Provenance',
    iconPath: iconPaths[4],
    textA: ['Automatically capture and attach the production chain to the asset itself.'],
    textB: [
      'Not just where the file is — what was approved, what produced it, and how to extend it without losing brand or continuity.',
    ],
    textC: ['Every shipped asset stays explainable and reusable.'],
  },
  {
    heading: 'Identity',
    iconPath: iconPaths[2],
    textA: [
      'A character is not just a folder of PNGs — a campaign is not just a stack of final files.',
      'Every approved asset keeps a stable, addressable identity, so teams reuse the right version with certainty.',
    ],
    list: [
      'one stable asset identity',
      'characters, props, and locations stay addressable and reusable',
      'approved assets reference approved work — never a guess',
    ],
    textC: ['Approved means approved — verifiable every time.'],
  },
  {
    heading: 'Collaboration',
    iconPath: iconPaths[1],
    textA: ['Teams build on the same approved assets, history, and provenance — in one governed place, not offline folders.'],
    textB: ['When someone leaves, the production memory stays with the team.'],
    textC: ['Scale output without adding rework.'],
  },
];

const problemCards = [
  {
    label: '01',
    title: 'Identify',
    text: 'Nobody trusts the version. Seven files named final, final_v2, and use-this-one — and no one can say which one shipped, or whether it still matches what was approved.',
    quote: <><span className="t-p-lg-sans italic">71%</span> of creative professionals say it takes seven or more people to approve a single asset, with 59% admitting content often ships before approval is even finished.</>,
    cite: 'Lucidpress, April 2026'
  },
  {
    label: '02',
    title: 'Preserve',
    text: 'Work gets paid for twice. Decisions, iterations, and approvals don\'t survive delivery, so teams regenerate from scratch instead of building on what already worked.',
    quote: <><span className="t-p-lg-sans italic">81%</span> of companies struggle with off-brand content creation despite having documented guidelines.</>,
    cite: 'Optimizely, 2026'
  },
  {
    label: '03',
    title: 'Reproduce',
    text: 'Nobody can reproduce it. The exact prompt, model, seed, and reference chain behind an approved asset disappear the moment the file is exported.',
    quote: <><span className="t-p-lg-sans italic">75%</span> of marketing leaders spend three hours or more every week editing, fact-checking, and fixing AI output.</>,
    cite: 'Lucidpress, April 2026'
  },
];

const comparisonRows = [
  {
    metric: 'Find the approved version',
    without: 'Guessed from filenames and Slack history',
    withPortals: 'in seconds, with sign-off intact',
  },
  {
    metric: 'Recreate a shipped asset',
    without: 'Rebuilt from scratch, often imperfectly',
    withPortals: 'reused directly — no rebuild',
  },
  {
    metric: 'Client asks for twelve more like this',
    without: 'Hours to days of rediscovery work',
    withPortals: 'delivered from approved work, in days',
  },
  {
    metric: 'Knowledge when someone leaves',
    without: 'Walks out the door with them',
    withPortals: 'stays with the team, permanently',
  },
  {
    metric: 'Review what changed',
    without: 'Screenshots and memory',
    withPortals: 'auditable in one place',
  },
  {
    metric: 'confidence in final',
    without: 'Constant double-checking',
    withPortals: 'approved means approved',
  },
];

const capabilities = [
  {
    title: 'Support for all assets',
    text: 'Reuse images, video, characters, 3D, prompts, and datasets from one approved source instead of rebuilding them.',
  },
  {
    title: 'Model-agnostic',
    text: 'Keep working in OpenAI, Runway, Midjourney, or ComfyUI — approved work stays reusable no matter which tool made it.',
  },
  {
    title: 'API-first',
    text: 'Put approved versions and history inside your existing pipeline, without changing how your team works day to day.',
  },
  {
    title: 'Automatic',
    text: 'Versions, identity, and production context are captured at creation, so reuse never depends on manual filing.',
  },
];

const workflow = [
  'Register every AI-generated asset',
  'Capture prompts and production context',
  'Track versions',
  'Search across your entire creative history',
];

const audiences = [
  {
    title: 'AI creative agencies',
    text: 'Deliver client variations in days from approved work — with a clear line to the signed-off version, its source history, and how to reproduce it.',
  },
  {
    title: 'Film, video, and animation studios',
    text: 'Hold characters, scenes, and visual continuity across months of production, even as artists and vendors change.',
  },
  {
    title: 'Game studios',
    text: 'Carry characters, environments, and generated worlds from concept to shipped asset without losing what was approved.',
  },
  {
    title: 'AI-native marketing and brand teams',
    text: 'Ship on-brand campaigns faster from one canonical version — stop re-clearing, rebuilding, and reconciling the same asset.',
  },
];

type PricingTier = {
  slug: string;
  name: string;
  price: string;
  originalPrice?: string;
  discountPercentage?: number | null;
  period: string;
  subtitle?: string;
  features: string[];
  cta: string;
  micro?: string;
};

function pricingTierFromSpec(specification: PackageSpecification): PricingTier {
  return {
    slug: specification.slug,
    name: specification.name,
    price: packagePriceLabel(specification),
    originalPrice: packageOriginalPriceLabel(specification),
    discountPercentage: specification.price?.discount?.percentage,
    period: specification.price?.periodLabel || '',
    subtitle: specification.subtitle,
    features: packagePricingFeatures(specification),
    cta: specification.ctaLabel || 'Scope a pilot',
    micro: specification.microcopy,
  };
}

function pricingTierHref(tier: PricingTier): string {
  return tier.slug === PACKAGE_SPEC_SLUGS.productionTeam
    ? '/assessment'
    : scopeAPilotMailto;
}

function NumberLabel({ index, className = "" }: { index: number; className?: string }) {
  return (
    <div className={`flex items-center gap-x-8 ${className}`}>
      <span className="size-8 bg-white" />
      <span className="t-m2">{formatNumber(index)}</span>
    </div>
  );
}

function Icon({ item, className = "w-fluid-[44,86] fill-current" }: { item: OverviewItem; className?: string }) {
  const viewBox = item.iconPath === iconPaths[2] ? '0 0 86 86.04' : item.iconPath === iconPaths[3] ? '0 0 78.13 79.35' : item.iconPath === iconPaths[4] ? '0 0 72.11 76.96' : '0 0 82 82';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} className={className} aria-hidden="true">
      {item.iconPath}
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
  if (!item.list) return <Paragraphs lines={item.textB} className="t-p-lg-sans" />;

  return (
    <ul className="saga-overview-list space-y-8">
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

function OverviewContent({ item, index, visibleIndex, transitionStage, scrollDirection, staggerIndex = 0 }: { item: OverviewItem; index: number; visibleIndex: number; transitionStage: OverviewTransitionStage, scrollDirection: 'up' | 'down', staggerIndex?: number }) {
  return (
    <div
      data-content-index={index}
      className="saga-overview-content relative col-start-1 row-start-1"
      style={overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection, staggerIndex)}
    >
      <div className="ui-grid px-0">
        <div className="col-span-3 row-start-1 flex items-start justify-end md:justify-center lg:justify-end">
          <Icon item={item} />
        </div>
        <div className="saga-overview-mobile-heading col-span-6 col-start-4 lg:col-span-21 lg:col-start-4">
          <h3 className="t-d2-sans saga-overview-heading">
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
          <div className="col-span-2 row-start-2 flex items-start justify-end">
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
          <Paragraphs lines={item.textC} className="t-h3-sans" boldLast={false} />
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressLineRef = useRef<HTMLDivElement>(null);
  const requestedIndexRef = useRef(0);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [transitionStage, setTransitionStage] = useState<OverviewTransitionStage>('hidden');
  const [scrollPhase, setScrollPhase] = useState<OverviewScrollPhase>('before');
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [visibleColumn, setVisibleColumn] = useState(0);
  const lastProgressRef = useRef(0);
  const renderedProgressRef = useRef(-1);
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
      const renderedProgress = Math.round(rawProgress * 1000) / 1000;
      const nextIndex = Math.min(itemCount - 1, Math.floor(rawProgress * itemCount));
      const stageProgress = rawProgress * itemCount - nextIndex;
      setVisibleColumn(stageProgress >= 2 / 3 ? 2 : stageProgress >= 1 / 3 ? 1 : 0);
      const nextScrollPhase: OverviewScrollPhase = unclampedProgress < 0 ? 'before' : unclampedProgress > 1 ? 'after' : 'viewing';

      if (progressLineRef.current && renderedProgress !== renderedProgressRef.current) {
        progressLineRef.current.style.transform = `translate3d(0, 0, 0) scaleX(${renderedProgress})`;
        renderedProgressRef.current = renderedProgress;
      }

      if (rawProgress > lastProgressRef.current) {
        setScrollDirection('down');
      } else if (rawProgress < lastProgressRef.current) {
        setScrollDirection('up');
      }
      lastProgressRef.current = rawProgress;
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

    if (scrollIndex !== visibleIndex) {
      setVisibleIndex(scrollIndex);
      setTransitionStage('entering');
      return undefined;
    }

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
  }, [scrollPhase, transitionStage, scrollIndex]);

  return (
    <section ref={sectionRef} data-header-theme="light" data-slice-type="overview" data-slice-variation="default">
      <div className="relative">
        <div className="saga-overview-desktop">
          <div className="saga-overview-pin relative z-10">
            <div className="ui-grid relative z-10 min-h-screen items-center py-Header-h text-white">
              <div className="col-span-full grid grid-cols-subgrid gap-y-fluid-[30,52]">
                <div className="col-span-full grid">
                  {overviewItems.map((item, index) => (
                    <OverviewContent key={item.heading} item={item} index={index} visibleIndex={visibleIndex} transitionStage={transitionStage} scrollDirection={scrollDirection} staggerIndex={1} />
                  ))}
                </div>

                <div className="pointer-events-none col-span-full col-start-4 top-0 right-0 hidden items-center overflow-hidden lg:flex">
                  <ProductionLineage
                    stage={transitionStage === 'hidden' ? -1 : visibleIndex}
                    transitionStage={transitionStage}
                    scrollDirection={scrollDirection}
                    labels
                  />
                </div>
                <div className="col-span-full space-y-18">
                  <NumberLabel index={scrollIndex} />
                  <div className="relative -mx-sms h-px bg-white/20">
                    <div ref={progressLineRef} data-progress-line className="saga-overview-progress-line absolute top-0 left-0 h-px w-full origin-left bg-white" />
                  </div>
                </div>

                <div
                  className="saga-overview-subsections col-span-21 col-start-4 grid grid-cols-subgrid"
                >


                  <div className="saga-overview-desktop-subsections contents">
                    <div className="saga-overview-subsection col-span-7">
                      <div className="saga-overview-subsection-stack grid">
                        {overviewItems.map((item, index) => (
                          <div key={`${item.heading}-a`} data-content-index={index} data-overview-visible={visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting'} className="saga-overview-content col-start-1 row-start-1" style={{ ...overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection), ...overviewColumnMotionStyle(visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting', scrollDirection) }}>
                            <Paragraphs lines={item.textA} className="t-p-lg-serif" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="saga-overview-subsection col-span-7">
                      <div className="saga-overview-subsection-stack grid">
                        {overviewItems.map((item, index) => (
                          <div key={`${item.heading}-b`} data-content-index={index} data-overview-visible={visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting' && visibleColumn >= 1} className="saga-overview-content col-start-1 row-start-1" style={{ ...overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection), ...overviewColumnMotionStyle(visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting' && visibleColumn >= 1, scrollDirection) }}>
                            <ListColumn item={item} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="saga-overview-subsection col-span-7">
                      <div className="saga-overview-subsection-stack grid">
                        {overviewItems.map((item, index) => (
                          <div key={`${item.heading}-c`} data-content-index={index} data-overview-visible={visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting' && visibleColumn >= 2} className="saga-overview-content col-start-1 row-start-1" style={{ ...overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection), ...overviewColumnMotionStyle(visibleIndex === index && transitionStage !== 'hidden' && transitionStage !== 'exiting' && visibleColumn >= 2, scrollDirection) }}>
                            <Paragraphs lines={item.textC} className="t-h3-sans" boldLast={false} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="saga-overview-mobile-subsections">
                    {overviewItems.map((item, index) => (
                      <div key={`${item.heading}-mobile-subsections`} data-content-index={index} data-overview-visible={visibleIndex === index} className="saga-overview-mobile-subsection-content">
                        <div className="saga-overview-content" style={overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection, 2)}>
                          <Paragraphs lines={item.textA} className="t-p-lg-serif" />
                        </div>
                        {!item.list && (
                          <div className="saga-overview-content" style={overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection, 3)}>
                            <Paragraphs lines={item.textB} className="t-p-lg-serif" />
                          </div>
                        )}
                        {item.list && (
                          <div className="saga-overview-content" style={overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection, 3)}>
                            <ListColumn item={item} />
                          </div>
                        )}
                        <div className="saga-overview-content" style={overviewMotionStyle(visibleIndex, index, transitionStage, scrollDirection, 4)}>
                          <Paragraphs lines={item.textC} className="t-h3-sans" boldLast={false} />
                        </div>
                      </div>
                    ))}
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

          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {overviewItems.map((item, index) => (
              <div
                className="saga-overview-snap-point absolute left-0 size-px"
                key={`${item.heading}-snap-point`}
                style={{ top: `calc(2px + ${index} * (100% - 100svh) / ${itemCount})` }}
              />
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

function ArrowIcon() {
  return (
    <svg viewBox="0 0 18.31 16.53" className="size-19 fill-current" aria-hidden="true">
      <path d="m18.31 8.26-8.26 8.26-1.12-1.12 6.36-6.36H0V7.46h15.28L8.93 1.12 10.05 0z" />
    </svg>
  );
}

function SectionKicker({ children }: { children: string }) {
  return <p className="t-m2 text-white">{children}</p>;
}

function ProductionImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[2px] border border-white/20 bg-[#07121d] ${className}`}>
      <img src={src} alt={alt} className="size-full object-cover" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" aria-hidden="true" />
    </div>
  );
}

type LineagePoint = { x: number; y: number };
type LineageEdges = { entry: LineagePoint; exit: LineagePoint };
type LineageDot = LineagePoint & { node: number; visibleStage: number; role: 'entry' | 'exit' };
type LineageSegment = { d: string; stage: number; from: number; to: number };
type LineageLayout = { dots: LineageDot[]; segments: LineageSegment[]; tail: LineagePoint | null };

const emptyLineageLayout: LineageLayout = { dots: [], segments: [], tail: null };
const lineageSvgWidth = 1000;
const lineageSvgHeight = 440;
// Tail past the final node, in viewBox units. Ends in a dot the 'deliver outputs'
// label centers on, sitting below the connector by lineageLabelLift.
const lineageTailLength = 60;
const lineageLabelLift = 46;
const roundPoint = (value: number) => Math.round(value * 10) / 10;

function lineageLinkPath(from: LineagePoint, to: LineagePoint) {
  if (Math.abs(from.y - to.y) < 1) return `M${from.x} ${from.y}H${to.x}`;
  const bendX = roundPoint((from.x + to.x) / 2);
  return `M${from.x} ${from.y}H${bendX}V${to.y}H${to.x}`;
}

// Connectors are measured off the node images, so dots and lines stay attached to
// the artwork at any container size, aspect ratio, or loaded image dimension.
function measureLineageLayout(track: HTMLElement): LineageLayout | null {
  const trackRect = track.getBoundingClientRect();
  if (!trackRect.width || !trackRect.height) return null;

  const toX = (value: number) => roundPoint((value - trackRect.left) * (lineageSvgWidth / trackRect.width));
  const toY = (value: number) => roundPoint((value - trackRect.top) * (lineageSvgHeight / trackRect.height));

  const edgesOf = (image: Element | null): LineageEdges | null => {
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    const y = toY(rect.top + rect.height / 2);
    return { entry: { x: toX(rect.left), y }, exit: { x: toX(rect.right), y } };
  };

  const imageOf = (node: string) => track.querySelector(`[data-node="${node}"] img`);
  const source = edgesOf(imageOf('source'));
  const versions = edgesOf(imageOf('versions'));
  const selected = edgesOf(imageOf('selected'));
  const campaign = edgesOf(imageOf('campaign-outputs'));
  const outputs = Array.from(track.querySelectorAll('[data-node="outputs"] img'), edgesOf);

  const dots: LineageDot[] = [];
  const segments: LineageSegment[] = [];

  if (source) dots.push({ ...source.exit, node: 0, visibleStage: 0, role: 'exit' });
  if (versions) dots.push(
    { ...versions.entry, node: 1, visibleStage: 1, role: 'entry' },
    { ...versions.exit, node: 1, visibleStage: 1, role: 'exit' },
  );
  if (selected) dots.push(
    { ...selected.entry, node: 2, visibleStage: 2, role: 'entry' },
    { ...selected.exit, node: 2, visibleStage: 2, role: 'exit' },
  );
  for (const output of outputs) {
    if (!output) continue;
    dots.push(
      { ...output.entry, node: 3, visibleStage: 4, role: 'entry' },
      { ...output.exit, node: 3, visibleStage: 3, role: 'exit' },
    );
  }
  if (campaign) dots.push({ ...campaign.entry, node: 4, visibleStage: 4, role: 'entry' });

  if (source && versions) segments.push({ d: lineageLinkPath(source.exit, versions.entry), stage: 1, from: 0, to: 1 });
  if (versions && selected) segments.push({ d: lineageLinkPath(versions.exit, selected.entry), stage: 2, from: 1, to: 2 });

  const topRow = outputs[2];
  const bottomRow = outputs[5];

  if (selected && topRow && bottomRow) {
    const splitX = roundPoint((selected.exit.x + topRow.entry.x) / 2);
    const topY = topRow.entry.y;
    const bottomY = bottomRow.entry.y;

    segments.push(
      { d: `M${selected.exit.x} ${selected.exit.y}H${splitX}V${topY}H${topRow.entry.x}`, stage: 3, from: 2, to: 3 },
      { d: `M${splitX} ${topY}V${bottomY}`, stage: 3, from: 2, to: 3 },
      { d: `M${splitX} ${topY}H${topRow.exit.x}`, stage: 3, from: 2, to: 3 },
      { d: `M${splitX} ${bottomY}H${bottomRow.exit.x}`, stage: 3, from: 2, to: 3 },
    );
  }

  if (campaign && topRow && bottomRow) {
    const bendX = roundPoint((topRow.exit.x + campaign.entry.x) / 2);

    segments.push(
      { d: `M${topRow.exit.x} ${topRow.exit.y}H${bendX}V${campaign.entry.y}H${campaign.entry.x}`, stage: 4, from: 3, to: 4 },
      { d: `M${bottomRow.exit.x} ${bottomRow.exit.y}H${bendX}V${campaign.entry.y}`, stage: 4, from: 3, to: 4 },
    );
  }

  let tail: LineagePoint | null = null;

  if (campaign) {
    tail = { x: campaign.exit.x + lineageTailLength, y: campaign.exit.y };
    dots.push({ ...tail, node: 4, visibleStage: 4, role: 'entry' });
    segments.push({ d: `M${campaign.exit.x} ${campaign.exit.y}H${tail.x}`, stage: 4, from: 4, to: 4 });
  }

  return { dots, segments, tail };
}

function ProblemSection() {
  return (
    <section className="saga-problem-section relative z-10" data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] pb-fluid-[76,106] md:py-fluid-[76,106] md:mt-140 md:mb-80 text-white lg:min-h-screen lg:content-center">
        {/* <div className="col-span-full lg:col-span-6">
          <SectionKicker>the problem</SectionKicker>
        </div> */}
        <div className="relative z-10 col-span-full space-y-34 lg:col-span-16">
          <h2 className="t-d2-sans max-w-[13.8em]">
            When a client asks for twelve more assets, does your team build from history, or start from scratch?
          </h2>
          <p className="t-p-lg-serif max-w-[38em] leading-[1.25]">
            Your teams generate thousands of images, videos, and iterations daily.
            When a project ships, the history walks out the door — so the next brief pays for the same discovery, rebuilds, and re-approvals again:
          </p>
        </div>
        <div className="col-span-full grid grid-cols-1 lg:grid-cols-3">
          {problemCards.map((card, index) => (
            <div key={card.title}>
              <article className={`min-h-194 h-full p-24 rounded-sm text-white flex flex-col ${index % 2 === 0 ? 'bg-white/10' : ''}`}>
                <div className="mb-20 flex items-center gap-x-8">
                  <span className="size-8 bg-white" />
                  <span className="t-m2">{card.label}</span>
                </div>
                <h3 className="t-h3-sans mb-[0.4em]">{card.title}</h3>
                <blockquote className="mt-12 col-span-full t-p-sans leading-[1.25] italic text-white">
                  {card.quote}
                  <cite>{' '}{card.cite}</cite>
                </blockquote>
                {card.title === 'Reproduce' && (
                  <>
                    <img
                      src="/images/vcs/components/version-stack.png"
                      alt="A stack of related campaign photo versions"
                      className="m-auto max-h-[400px] w-full object-contain"
                    />
                    <p className="mt-12 t-p-sans text-center">Reuse creative recipes to generate new on-brand outputs.</p>
                  </>
                )}
                {card.title === 'Identify' && (
                  <>
                    <img
                      src="/images/vcs/components/front-photo-print.png"
                      alt="A single portrait print of the campaign model"
                      className="m-auto max-h-[400px] w-full -rotate-[7deg] object-contain"
                    />
                    <p className="mt-12 t-p-sans text-center">Pin visual properties and references of approved images.</p>
                  </>
                )}
                {card.title === 'Preserve' && (
                  <>
                    <div className="grid w-full max-w-[351px] m-auto h-[400px] items-end grid-cols-2 gap-1 lg:w-fit lg:max-w-none lg:grid-cols-[max-content] xl:grid-cols-[repeat(2,max-content)]">
                      {[
                        ['/images/vcs/components/front-photo-print.png', 'A single bordered portrait print'],
                        ['/images/vcs/components/model-variation-04.png', 'The model in a cobalt knit with a side braid'],
                        ['/images/vcs/components/preserve-portrait-03.png', 'The model in a flowing cobalt blouse'],
                        ['/images/vcs/components/preserve-portrait-02.png', 'The model in a cobalt blazer'],
                      ].map(([src, alt], index) => (
                        <img key={src} src={src} alt={alt} className={`h-[190px] max-w-full lg:max-w-none object-contain ${index === 0 ? '-rotate-[8.5deg] scale-[129%] overflow-visible p-0 m-0' : 'border-[8px] border-[#f5ebe0] rounded-[1px]'} ${index % 2 === 1 ? 'lg:hidden xl:block' : ''}`} />
                      ))}
                    </div>
                    <p className="mt-12 t-p-sans text-center">Keep defining traits consistent across variations.</p>
                  </>
                )}
              </article>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid items-center gap-y-fluid-[30,52] py-fluid-[76,106] text-white min-h-screen">
        <div className="col-span-full space-y-36 mx-auto max-w-[90%] lg:max-w-[160.58ch]">
          <h2 className="t-d2-sans mx-auto w-fit">
            the production memory
            <br />
            AI{`\u2011`}native creative teams
          </h2>
          <p className="t-p-lg-sans text-justify max-w-[30em] mx-auto leading-[1.25] text-white">
            Preserve every approved asset, its history, and the context that produced it. Extend approved work using identity instead of rebuilding from scratch — reduce rework, eliminate manual context reconstruction, accelerate delivery, and scale output without adding headcount.
          </p>
          <p className="t-p-lg-sans text-justify max-w-[30em] mx-auto leading-[1.25] text-white">
            Built for high-volume teams without changing the tools they already use.
          </p>
          <div className="flex justify-center">
            {/* <CTAButton href={"/ai-production-workflow-risks"}>Explore use cases</CTAButton> */}
            <CTAButton href="/assessment" analyticsLabel="Assess Your Workflow" analyticsIntent="assessment">
              Assess production workflow
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full">
          <h2 className="t-d2-sans max-w-[12.58em]">What changes when your production has a memory?</h2>
        </div>
        <div className="hidden md:block col-span-full">
          <div className="grid-cols-[1fr_1fr_1.2fr] t-m2 text-white/80 grid">
            <div className="p-16 col-span-2" />
            {/* <div className="p-16 lowercase">without portals</div> */}
            <div className="p-16 text-white lowercase">with portals</div>
          </div>
          {comparisonRows.map((row, index) => (
            <div key={row.metric} className={`grid grid-cols-1 border-t border-white/50 grid-cols-[1fr_.6fr] lg:grid-cols-[1fr_1fr_1.2fr] lowercase ${index === comparisonRows.length - 1 ? 'border-b' : ''}`}>
              <div className="p-16 t-p-sans lg:col-span-2 text-white w-[26ch] bg-transparent">{row.metric}</div>
              {/* <div className="border-white/50 p-16 t-p-sans text-white/80 border-t-0 border-l">
                <span className="mb-8 block t-m2 lg:hidden !lowercase">without portals</span>
                {row.without}
              </div> */}
              <div className="border-white/50 p-16 col-span-1 t-p-sans text-white border-t-0 border-l">
                {row.withPortals}
              </div>
            </div>
          ))}
          <div className='grid grid-cols-[1fr_1fr_1.2fr] pt-30'><CTAButton href="/production-memory" className="ml-16 col-start-3">Explore production memory</CTAButton></div>
        </div>
        <div className="md:hidden col-span-full">
          {comparisonRows.map((row) => (
            <div key={row.metric} className="grid grid-cols-1 border-t border-white/50 lowercase">
              <div className="inline-flex p-16 t-p-sans col-span-full text-white">{row.metric} {row.withPortals}</div>
            </div>
          ))}
          <div className='flex pt-30 justify-end items-end'><CTAButton href="/production-memory">Explore production memory</CTAButton></div>
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section data-header-theme="light" id="docs">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full">
          <h2 className="t-d2-sans">Built for AI production workflows</h2>
        </div>
        <div className="col-span-full grid grid-cols-1 gap-px bg-white/20 rounded-sm backdrop-blur-[12px] lg:grid-cols-2">
          {capabilities.map((capability) => (
            <article key={capability.title} className="p-24">
              <h3 className="t-h3-sans mb-16">{capability.title}</h3>
              <p className="t-p-sans text-white">{capability.text}</p>
            </article>
          ))}
        </div>
        <div className='col-span-full'>
          <CTAButton href="/assessment" analyticsLabel="Assess Your Workflow" analyticsIntent="assessment">
            Assess production workflow
          </CTAButton>
        </div>
      </div>
    </section>
  );
}

const pxFoundations: { title: React.ReactNode; text: React.ReactNode }[] = [
  {
    title: 'Persistent entities',
    text: 'Characters, objects, locations, and worlds keep their identity as they evolve.',
  },
  {
    title: 'Across tools and formats',
    text: 'Move between image, video, 3D, agents, and creative applications without rebuilding project context from scratch.',
  },
  {
    title: 'Built for agents and creators',
    text: (<span>Use <strong>px</strong> from the command line, through AI agents, or inside Python and TypeScript applications.</span>),
  },
];

function PxSection() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <h2 className="t-d2-sans max-w-[13.8em] col-span-full lg:row-start-1">Powered by open data foundations for AI production</h2>
        <div className="col-span-full space-y-24 lg:row-start-2 lg:col-span-11">
          <p className="t-p-lg-serif max-w-[38em] md:text-justify leading-[1.25]">
            portals builds on <span className="t-p-lg-sans font-bold">px</span>, giving production teams shared control over persistent data objects: characters, locations, worlds, and their representations across tools and formats.
          </p>
          <p className="t-p-lg-sans max-w-[30em] md:text-justify">Create an asset once. Give it an identity. Build a world from it.</p>
        </div>

        <div className="col-span-full lg:row-start-3 lg:col-span-12 grid grid-cols-1 gap-px bg-white/20 rounded-sm backdrop-blur-[12px]">
          {pxFoundations.map((item) => (
            <article key={item.title?.toString()} className="flex flex-col p-24">
              <h3 className="t-h3-sans mb-16">{item.title}</h3>
              <p className="t-p-sans text-white">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="hidden lg:block col-span-12 lg:col-span-11 xl:col-span-6 lg:col-start-13 xl:col-start-13 lg:row-span-3">
          <div className='grid grid-cols-2 gap-px'>
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman-6.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman-5.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman-2.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman-3.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
            <img
              src="/images/vcs/components/campaign-contact-sheet-woman-4.png"
              alt="Character reference image from the px creative foundation"
              className="aspect-[7/8] w-full object-cover object-top rounded-sm"
            />
          </div>
          <div className="lineage-node-label flex justify-between">
            <span>px://campaign/character/eliza</span>
            <span>revision 8</span>
          </div>
        </div>
        <div className="col-span-full lg:row-start-4 lg:col-span-12 flex flex-col gap-30">
          <p className="t-p-sans text-white"><strong>px</strong> is free and open source for creators and developers building locally.</p>
          <CTAButton href="/px" analyticsLabel="Explore px" analyticsIntent="education">
            Explore<span className="font-bold">{' '}px</span>
          </CTAButton>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full space-y-24 lg:col-span-9">
          <h2 className="t-d2-sans">One system behind every AI tool</h2>
          <p className="t-p-lg-serif">
            Continue using the tools your team already depends on.
          </p>
        </div>
        <div className="col-span-full grid gap-y-8 lg:col-span-12 lg:col-start-13">
          {workflow.map((item, index) => (
            <div key={item} className="flex items-center gap-x-16 border rounded-sm p-18 t-p-sans">
              {/* <span className="t-m2 text-white">{formatNumber(index)}</span> */}
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section data-header-theme="light">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        <div className="col-span-full lg:col-span-14">
          <h2 className="t-d2-sans max-w-[13.8em]">For organizations producing high-volume media with AI</h2>
        </div>
        <div className="col-span-full grid grid-cols-1 gap-px lg:grid-cols-2">
          {audiences.map((audience) => (
            <article key={audience.title} className="p-24">
              <h3 className="t-h3-sans mb-16">{audience.title}</h3>
              <p className="t-p-sans text-white">{audience.text}</p>
            </article>
          ))}
        </div>
        {/* <p className="col-span-full t-p-sans text-white lg:col-span-12 lg:col-start-7">
          Common thread: these teams already generate high volumes of AI content, already collaborate across multiple people, and already carry a software budget for the tools that touch production. portals becomes the layer none of those tools replace.
        </p> */}
      </div>
    </section>
  );
}

function PricingSection({
  packageSpecifications,
}: {
  packageSpecifications: PackageSpecification[];
}) {
  const pilotSpec = findPackageSpecification(
    packageSpecifications,
    PACKAGE_SPEC_SLUGS.paidPilot,
  );
  const pilotTier = pilotSpec ? pricingTierFromSpec(pilotSpec) : undefined;
  const pricingTiers = [
    PACKAGE_SPEC_SLUGS.productionTeam,
    PACKAGE_SPEC_SLUGS.studio,
    PACKAGE_SPEC_SLUGS.enterprise,
  ]
    .map((slug) => findPackageSpecification(packageSpecifications, slug))
    .filter((specification): specification is PackageSpecification => Boolean(specification))
    .map(pricingTierFromSpec);

  return (
    <section data-header-theme="light" id="pricing">
      <div className="ui-grid gap-y-fluid-[30,52] py-fluid-[76,106] text-white">
        {/* <div className="col-span-full lg:col-span-6">
          <SectionKicker>pricing</SectionKicker>
        </div> */}
        <div className="col-span-full lg:mx-auto">
          <h2 className="t-d2-sans max-w-[12.58em] lg:text-center">A clear path from adoption to enterprise scale</h2>
        </div>
        <div className="col-span-full grid grid-cols-1 gap-px max-w-[42em] lg:mx-auto rounded">
          {pilotTier ? [pilotTier].map((tier) => (
            <article key={tier.name} className="flex min-h-194 flex-col p-24 col-start-2 rounded border">
              <h3 className="t-h3-sans mb-20">{tier.name}</h3>
              <div className="my-20 flex flex-row flex-wrap items-baseline gap-x-8">
                <span className="t-m2 !lowercase">{tier.period}</span>
              </div>
              <p className="t-p-sans">{tier.subtitle}</p>
              <ul className="my-24 flex flex-1 flex-col gap-y-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-8 t-p-sans">
                    <span>+</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <CTAButton href={pricingTierHref(tier)}>{tier.cta}</CTAButton>
              {tier.micro && <p className="mt-24 t-p-sans">{tier.micro}</p>}
            </article>
          )) : null}
        </div>
        <div className="mt-40 col-span-full grid grid-cols-1 gap-px lg:grid-cols-3">
          {pricingTiers.map((tier) => (
            <article key={tier.name} className="relative flex min-h-194 flex-col p-24">
              <h3 className="t-h3-sans mb-20">{tier.name}</h3>
              <div className="my-20 flex flex-row flex-wrap items-baseline gap-x-8">
                <span className="t-h3-sans">{tier.price}</span>
                <span className="t-m2 !lowercase">{tier.period}</span>
              </div>
              <p className="t-p-sans">{tier.subtitle}</p>
              <ul className="my-24 flex flex-1 flex-col gap-y-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-x-8 t-p-sans text-white">
                    <span className="text-white">+</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <CTAButton href={pricingTierHref(tier)}>{tier.cta}</CTAButton>
              {tier.micro && <p className="relative lg:absolute -bottom-54 mt-24 t-p-sans text-white">{tier.micro}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VCS({
  packageSpecifications,
}: {
  packageSpecifications: PackageSpecification[];
}) {
  const heroHeadingRef = useRef<HTMLHeadingElement>(null);
  const headerBrandRef = useRef<HTMLAnchorElement>(null);
  const mobileRepositoryCopyRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 47.99rem)');
    let frame = 0;

    const update = () => {
      frame = 0;
      const brand = headerBrandRef.current;
      const heading = heroHeadingRef.current;
      const copy = mobileRepositoryCopyRef.current;

      if (!mobileQuery.matches) {
        if (brand) brand.style.transform = '';
        if (copy) copy.style.transform = '';
        return;
      }

      // Accelerate the pinned copy upward over 25vh, ending one line above the problem section.
      if (copy) {
        const problemSection = copy.parentElement?.nextElementSibling;

        if (problemSection) {
          const pin = parseFloat(getComputedStyle(copy).top) || 0;
          const ramp = window.innerHeight * 0.25;
          const release = pin + copy.offsetHeight;
          const lineHeight = parseFloat(getComputedStyle(copy).lineHeight) || copy.offsetHeight;
          const finish = pin + copy.offsetHeight / 2 - ramp / 2 + lineHeight;
          const sectionTop = problemSection.getBoundingClientRect().top;
          const distance = Math.min(Math.max(finish + ramp - sectionTop, 0), ramp);
          const lift = (distance * distance) / (2 * ramp);
          const stickyLift = Math.min(Math.max(release - sectionTop, 0), release - finish);
          copy.style.transform = `translate3d(0, calc(-50% + ${stickyLift}px - ${lift}px), 0)`;
        }
      }

      if (brand && heading) {
        const brandRestingBottom = 24 + brand.offsetHeight;
        const brandPush = Math.min(0, heading.getBoundingClientRect().top - brandRestingBottom);
        brand.style.transform = `translate3d(0, ${brandPush}px, 0)`;
      }
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    mobileQuery.addEventListener('change', requestUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      mobileQuery.removeEventListener('change', requestUpdate);
    };
  }, []);

  return (
    <main className="relative z-(--z-main)">
      <div className="pointer-events-none h-px w-full" aria-hidden="true" data-webgl-marker="scrollFrom" data-webgl-position="0" data-webgl-easing="easeInOut" />

      <header
        className="saga-front-header pointer-events-none w-full absolute md:!fixed inset-x-0 top-0 z-(--z-header)"
      >
        <div className="flex h-Header-h items-center px-sms">
          <div className="pointer-events-auto flex flex-1 items-center justify-between gap-x-sgs">
            <a ref={headerBrandRef} className="saga-front-header-brand" href="/">
              <span className="t-h3-sans !font-medium">
                portals
              </span>
            </a>

            <nav aria-label="Page" className="hidden shrink-0 items-center gap-x-16 text-white sm:flex">
              <CTAButton href={scopeAPilotMailto} analyticsLabel="Scope a Pilot" analyticsIntent="pilot_scope">Scope a pilot</CTAButton>
            </nav>
          </div>
        </div>
      </header>
      <section className="saga-front-hero relative isolate min-h-screen flex items-center overflow-x-clip" data-header-theme="light" data-slice-type="hero" data-slice-variation="default">
        <div className="pointer-events-none z-[-10]" aria-hidden="true">
          <img src="/images/vcs/components/creative-production-hero-woman-portrait-4k-alt-2.png" alt=""
            className="hidden lg:block absolute h-full right-[calc(18%-12rem)] xl:right-[calc(18%-6rem)] top-[50%] scale-[200%] object-cover" />
        </div>
        {/* <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,13,.96)_0%,rgba(3,8,13,.82)_32%,rgba(3,8,13,.22)_68%,rgba(3,8,13,.10)_100%)]" />
          <div className="absolute inset-x-sms bottom-[36svh] hidden items-center gap-12 border-t border-white/50 pt-10 t-m2 text-white md:flex">
            <span className="size-8 bg-white" />
            <span>APPROVED VERSION</span>
            <span className="ml-auto">REFERENCE → HISTORY → DELIVERY</span>
          </div> */}
        <div className="relative z-10 ui-grid w-full my-auto gap-y-[max(var(--spacing-sgs),12.5svh)] pt-[max(var(--spacing-Header-h))] pb-sms text-white">
          <div className="col-span-full space-y-30">
            <h1 ref={heroHeadingRef} className="max-w-[12.725em] text-balance t-d2-sans">
              scale{' '}
              <strong className="t-d2-serif">creative media production</strong>{' '}
              <br/>without the overhead
            </h1>
            <p className="t-h3-sans max-w-[24.5ch]">ship campaigns faster, cut production costs, and keep every asset traceable from brief to delivery.</p>
            <p className="t-p-sm-sans max-w-[52ch]">
              Discover the bottlenecks costing you time, output, and margin in 4 minutes · Receive personalized recommendations
            </p>
            <div className="saga-hero-assess grid grid-cols-[max-content_max-content] gap-30">
              <CTAButton
                href="/assessment"
                analyticsLabel="Assess Your Workflow"
                analyticsIntent="assessment"
              >
                Find my production bottlenecks
              </CTAButton>
              <CTAButton className="!hidden" href="/use-cases" analyticsLabel="Explore Use Cases" analyticsIntent="education">
                Explore use cases
              </CTAButton>
            </div>
          </div>
        </div>
        <div className="saga-hero-repository saga-hero-repository--desktop col-span-full grid grid-cols-subgrid">
          <div className="md:col-span-8 md:col-start-5 flex justify-center md:justify-end items-end col-span-full">
            <div className="saga-hero-repository-anchor">
              <div className="saga-hero-repository-copy t-p-sans lowercase!">
                <p>
                  the production memory for
                  <br />
                  AI{`\u2011`}native creative teams
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="saga-mobile-repository-transition">
        <p ref={mobileRepositoryCopyRef} className="saga-mobile-repository-copy t-p-sans lowercase!">
          the production memory for
            AI{`\u2011`}native creative teams
        </p>
      </div>

      <ProblemSection />
      <SolutionSection />
      <OverviewSection />
      <ComparisonSection />
      <WorkflowSection />
      <CapabilitiesSection />
      <PxSection />
      <AudienceSection />
      <PricingSection packageSpecifications={packageSpecifications} />

      <section data-header-theme="light">
        <div className="relative flex min-h-screen items-center text-white">
          <div className="ui-grid flex-1 gap-y-sms py-sms">
            <div className="relative z-30 col-span-full flex flex-col items-center gap-y-fluid-[32,40] text-center">
              <h4 className="t-global-cta_heading max-w-[13em]">Stop losing the history of your best work.<br /> Start building on it.</h4>
              <p className="t-p-lg-serif max-w-[25em] md:w-auto text-white text-left">
                Ship repeat campaigns faster, cut rebuild and re-approval costs, and keep every asset provable from prompt to final with a complete lifecycle that works with your existing tools.
              </p>
              <div className="flex items-center gap-16">
                <CTAButton href={"/use-cases"} appearance="plain">Explore use cases</CTAButton>
                <CTAButton href="/assessment" analyticsLabel="Assess Your Workflow" analyticsIntent="assessment">
                  Assess production workflow
                </CTAButton>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 z-10" />
        </div>
      </section>
    </main>
  );
}
