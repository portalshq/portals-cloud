"use client";

import React, { useId, useState } from "react";

type CapabilityStatus = "strong" | "partial" | "limited" | "absent";

type SolutionKey =
  | "portals"
  | "frameio"
  | "shotgrid"
  | "perforce"
  | "storage"
  | "generation";

type MatrixRow = {
  capability: string;
  description?: string;
  values: Record<SolutionKey, CapabilityStatus>;
};

type Comparison = {
  id: Exclude<SolutionKey, "portals">;
  system: string;
  category: string;
  summary: string;
  bestFor: string;
  strengths: string[];
  boundaries: string[];
  portalsDifference: string;
  together: string;
};

const solutionColumns: Array<{
  id: SolutionKey;
  name: string;
  category: string;
}> = [
  {
    id: "portals",
    name: "Portals",
    category: "Production memory",
  },
  {
    id: "frameio",
    name: "Frame.io",
    category: "Review",
  },
  {
    id: "shotgrid",
    name: "ShotGrid",
    category: "Tracking",
  },
  {
    id: "perforce",
    name: "Perforce",
    category: "Version control",
  },
  {
    id: "storage",
    name: "Drive / Dropbox",
    category: "Storage",
  },
  {
    id: "generation",
    name: "Generation systems",
    category: "Creation",
  },
];

const matrixRows: MatrixRow[] = [
  {
    capability: "Store production assets",
    description: "Keep generated and source files available to the team.",
    values: {
      portals: "strong",
      frameio: "strong",
      shotgrid: "partial",
      perforce: "strong",
      storage: "strong",
      generation: "partial",
    },
  },
  {
    capability: "Maintain file versions",
    description: "Retain earlier revisions of a file or media item.",
    values: {
      portals: "strong",
      frameio: "strong",
      shotgrid: "partial",
      perforce: "strong",
      storage: "partial",
      generation: "partial",
    },
  },
  {
    capability: "Review and approve media",
    description: "Collect feedback and establish an approval decision.",
    values: {
      portals: "partial",
      frameio: "strong",
      shotgrid: "strong",
      perforce: "limited",
      storage: "partial",
      generation: "limited",
    },
  },
  {
    capability: "Identify the canonical approved asset",
    description:
      "Distinguish the asset the organization approved from surrounding iterations.",
    values: {
      portals: "strong",
      frameio: "strong",
      shotgrid: "strong",
      perforce: "partial",
      storage: "limited",
      generation: "limited",
    },
  },
  {
    capability: "Preserve generation context",
    description:
      "Record prompts, models, seeds, settings, references, and other inputs.",
    values: {
      portals: "strong",
      frameio: "absent",
      shotgrid: "partial",
      perforce: "partial",
      storage: "limited",
      generation: "strong",
    },
  },
  {
    capability: "Track source-to-output lineage",
    description:
      "Connect a result to the inputs, versions, references, and derivatives behind it.",
    values: {
      portals: "strong",
      frameio: "limited",
      shotgrid: "partial",
      perforce: "partial",
      storage: "absent",
      generation: "partial",
    },
  },
  {
    capability: "Preserve history across AI tools",
    description:
      "Maintain one production record as work moves between generation platforms.",
    values: {
      portals: "strong",
      frameio: "absent",
      shotgrid: "partial",
      perforce: "partial",
      storage: "absent",
      generation: "absent",
    },
  },
  {
    capability: "Reproduce an approved result",
    description:
      "Recover enough context to regenerate, extend, or closely reconstruct approved work.",
    values: {
      portals: "strong",
      frameio: "absent",
      shotgrid: "limited",
      perforce: "partial",
      storage: "absent",
      generation: "partial",
    },
  },
  {
    capability: "Track semantic relationships",
    description:
      "Represent characters, scenes, campaigns, variants, references, and dependencies.",
    values: {
      portals: "strong",
      frameio: "limited",
      shotgrid: "partial",
      perforce: "limited",
      storage: "absent",
      generation: "limited",
    },
  },
  {
    capability: "Restore approved production state",
    description:
      "Recover the connected assets, context, and decisions behind a production checkpoint.",
    values: {
      portals: "strong",
      frameio: "limited",
      shotgrid: "partial",
      perforce: "partial",
      storage: "limited",
      generation: "limited",
    },
  },
];

const comparisons: Comparison[] = [
  {
    id: "frameio",
    system: "Frame.io",
    category: "Media review and approval",
    summary:
      "Frame.io gives stakeholders a polished surface for reviewing, commenting on, presenting, and approving media.",
    bestFor:
      "Teams that need precise visual feedback, external review links, annotations, version stacks, and approval decisions.",
    strengths: [
      "Purpose-built video and media review",
      "Time-coded comments and annotations",
      "Stakeholder presentation and approval workflows",
      "Clear comparison between submitted media versions",
    ],
    boundaries: [
      "Does not natively preserve complete AI-generation recipes",
      "Does not establish cross-platform prompt, model, seed, and reference lineage",
      "Version stacks show related exports, not necessarily their full production ancestry",
    ],
    portalsDifference:
      "Portals preserves the production record behind the reviewed file: its source inputs, generation context, derivatives, dependencies, and reusable approved state.",
    together:
      "Use Frame.io as the review surface and Portals as the production record behind the approved asset.",
  },
  {
    id: "shotgrid",
    system: "ShotGrid",
    category: "Production tracking",
    summary:
      "ShotGrid coordinates shots, assets, tasks, versions, statuses, submissions, reviews, and production ownership.",
    bestFor:
      "Studios operating formal film, animation, VFX, or game-production pipelines with many tasks and contributors.",
    strengths: [
      "Mature production entities and task tracking",
      "Shot, asset, status, and ownership management",
      "Review and approval workflows",
      "Configurable studio pipeline structure",
    ],
    boundaries: [
      "AI-generation lineage generally requires custom schemas and integrations",
      "Production status does not automatically preserve reproducible generation state",
      "Prompt, model, reference, and derivative relationships are not the native abstraction",
    ],
    portalsDifference:
      "Portals treats AI asset lineage and reproducibility as first-class product concepts rather than custom production metadata.",
    together:
      "Use ShotGrid to manage production activity and Portals to preserve the asset graph and generation context beneath it.",
  },
  {
    id: "perforce",
    system: "Perforce",
    category: "File and binary version control",
    summary:
      "Perforce provides high-scale source control for code, large binary files, branches, changelists, permissions, and distributed teams.",
    bestFor:
      "Technical studios that need proven repository infrastructure for large files, source code, and tightly controlled production assets.",
    strengths: [
      "Strong revision history for large binary assets",
      "Scalable centralized repository model",
      "Changelists, branching, permissions, and conflict management",
      "Established use in game and media-production environments",
    ],
    boundaries: [
      "Primarily versions files, directories, and changelists",
      "AI-specific relationships must be encoded through conventions or custom tooling",
      "Creative users may require specialized interfaces and repository administration",
    ],
    portalsDifference:
      "Portals versions the production meaning surrounding files: generation recipes, approvals, semantic relationships, lineage, and reproducible creative state.",
    together:
      "Keep Perforce as the underlying source repository while Portals provides the creative-facing production-memory layer above it.",
  },
  {
    id: "storage",
    system: "Drive / Dropbox",
    category: "Cloud file storage",
    summary:
      "Drive and Dropbox make files straightforward to upload, synchronize, share, organize, and recover.",
    bestFor:
      "Teams that need familiar storage, broad access, basic collaboration, and low-friction file sharing.",
    strengths: [
      "Familiar file and folder model",
      "Straightforward sharing and access management",
      "Broad adoption across creative organizations",
      "Basic activity and file-recovery history",
    ],
    boundaries: [
      "Folders do not express source-to-output lineage",
      "Approval state often depends on filenames, comments, or team memory",
      "Generation context and downstream dependencies remain implicit",
    ],
    portalsDifference:
      "Portals turns scattered files into an explicit production graph, showing what was approved, where it came from, what it depends on, and how it can be reproduced.",
    together:
      "Keep files in existing cloud storage while Portals maintains the structured production record connecting them.",
  },
  {
    id: "generation",
    system: "Generation systems",
    category: "Tool-specific creation history",
    summary:
      "Generation platforms preserve prompts, outputs, settings, projects, or workflow histories inside their own product boundaries.",
    bestFor:
      "Creators producing and iterating within one generation platform or one executable workflow environment.",
    strengths: [
      "Immediate access to tool-specific generation history",
      "Native model and parameter controls",
      "Fast iteration within the same platform",
      "Potentially reproducible workflows inside supported environments",
    ],
    boundaries: [
      "History is fragmented across every generation platform",
      "Context may weaken after export or handoff",
      "One platform rarely captures external review, approval, and downstream use",
      "Model or product changes can affect long-term reproducibility",
    ],
    portalsDifference:
      "Portals preserves one cross-tool record that survives exports, platform changes, handoffs, approvals, and continued production.",
    together:
      "Generate in the tools best suited to each task and use Portals to maintain the durable history connecting their outputs.",
  },
];

const statusConfig: Record<
  CapabilityStatus,
  {
    label: string;
    symbol: string;
    className: string;
  }
> = {
  strong: {
    label: "Strong",
    symbol: "●",
    className:
      "border-white/20 bg-white text-black shadow-[0_0_22px_rgba(255,255,255,0.12)]",
  },
  partial: {
    label: "Partial",
    symbol: "◐",
    className: "border-white/15 bg-white/10 text-white",
  },
  limited: {
    label: "Limited",
    symbol: "–",
    className: "border-white/10 bg-white/[0.045] text-white/55",
  },
  absent: {
    label: "Not native",
    symbol: "×",
    className: "border-transparent bg-transparent text-white/25",
  },
};

function CapabilityMark({
  status,
  emphasized = false,
}: {
  status: CapabilityStatus;
  emphasized?: boolean;
}) {
  const config = statusConfig[status];

  return (
    <span
      className={[
        "group/mark relative inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2",
        "text-xs font-medium transition duration-200",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-white/60",
        config.className,
        emphasized && status !== "strong"
          ? "border-white/20 bg-white/[0.08]"
          : "",
      ].join(" ")}
      aria-label={config.label}
      title={config.label}
    >
      <span aria-hidden="true">{config.symbol}</span>
      <span className="sr-only">{config.label}</span>
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={[
        "h-5 w-5 transition-transform duration-300",
        open ? "rotate-180" : "rotate-0",
      ].join(" ")}
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComparisonMatrix() {
  return (
    <div className="relative mt-10">
      <div className="pointer-events-none absolute -inset-12 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_34%)]" />

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left">
            <caption className="sr-only">
              Comparison of Portals with Frame.io, ShotGrid, Perforce, Drive or
              Dropbox, and generation systems.
            </caption>

            <thead>
              <tr>
                <th
                  scope="col"
                  className={[
                    "sticky left-0 top-0 z-30 w-[280px] min-w-[280px]",
                    "border-b border-r border-white/10 bg-[#0b0b0c]/95 px-6 py-5",
                    "backdrop-blur-xl",
                  ].join(" ")}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
                    Capability
                  </span>
                  <span className="mt-2 block text-sm font-medium text-white/75">
                    What the system preserves
                  </span>
                </th>

                {solutionColumns.map((solution, index) => {
                  const isPortals = solution.id === "portals";

                  return (
                    <th
                      key={solution.id}
                      scope="col"
                      className={[
                        "top-0 z-20 min-w-[150px] border-b border-r border-white/10 px-5 py-5",
                        "bg-[#0b0b0c]/95 align-bottom backdrop-blur-xl last:border-r-0",
                        isPortals
                          ? "sticky left-[280px] z-30 bg-white text-black"
                          : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "block text-[9px] font-semibold uppercase tracking-[0.2em]",
                          isPortals ? "text-black/45" : "text-white/35",
                        ].join(" ")}
                      >
                        {String(index + 1).padStart(2, "0")} ·{" "}
                        {solution.category}
                      </span>

                      <span className="mt-2 block text-base font-semibold">
                        {solution.name}
                      </span>

                      {isPortals && (
                        <span className="mt-3 inline-flex rounded-full border border-black/10 bg-black/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/65">
                          Purpose-built
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {matrixRows.map((row, rowIndex) => (
                <tr
                  key={row.capability}
                  className="group/row transition-colors hover:bg-white/[0.025]"
                >
                  <th
                    scope="row"
                    className={[
                      "sticky left-0 z-20 border-b border-r border-white/10",
                      "bg-[#0b0b0c]/95 px-6 py-5 align-middle backdrop-blur-xl",
                      rowIndex === matrixRows.length - 1 ? "border-b-0" : "",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-medium leading-5 text-white">
                      {row.capability}
                    </span>

                    {row.description && (
                      <span className="mt-1.5 block max-w-[235px] text-xs leading-5 text-white/38">
                        {row.description}
                      </span>
                    )}
                  </th>

                  {solutionColumns.map((solution) => {
                    const isPortals = solution.id === "portals";
                    const status = row.values[solution.id];

                    return (
                      <td
                        key={solution.id}
                        className={[
                          "border-b border-r border-white/10 px-5 py-5 text-center align-middle last:border-r-0",
                          rowIndex === matrixRows.length - 1
                            ? "border-b-0"
                            : "",
                          isPortals
                            ? "sticky left-[280px] z-10 bg-[#181819]/95 backdrop-blur-xl"
                            : "",
                        ].join(" ")}
                      >
                        <CapabilityMark
                          status={status}
                          emphasized={isPortals}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/10 bg-white/[0.025] px-6 py-4">
          {(Object.keys(statusConfig) as CapabilityStatus[]).map((status) => (
            <div
              key={status}
              className="flex items-center gap-2 text-xs text-white/50"
            >
              <CapabilityMark status={status} />
              <span>{statusConfig[status].label}</span>
            </div>
          ))}

          <p className="ml-auto max-w-xl text-right text-[11px] leading-5 text-white/30">
            Ratings describe each product category’s primary native purpose.
            Exact functionality can vary by plan, configuration, and
            implementation.
          </p>
        </div>
      </div>
    </div>
  );
}

function ComparisonAccordion() {
  const sectionId = useId();
  const [activeId, setActiveId] = useState<Comparison["id"] | null>("frameio");

  return (
    <div className="mt-20">
      <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase text-white/40">
            Detailed comparisons
          </p>

          <h3 className="mt-4 max-w-xl text-balance text-3xl font-medium text-white sm:text-4xl">
            Portals complements the systems already in your stack.
          </h3>
        </div>

        <p className="max-w-2xl text-pretty text-base text-white/52 lg:justify-self-end">
          Each adjacent system solves a legitimate production problem. The
          distinction is whether it preserves files, reviews, schedules,
          executable workflows, or the connected production history behind an
          approved asset.
        </p>
      </div>

      <div className="mt-10 divide-y divide-white/10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025]">
        {comparisons.map((comparison, index) => {
          const isOpen = activeId === comparison.id;
          const buttonId = `${sectionId}-${comparison.id}-button`;
          const panelId = `${sectionId}-${comparison.id}-panel`;

          return (
            <article key={comparison.id}>
              <h4>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() =>
                    setActiveId((current) =>
                      current === comparison.id ? null : comparison.id,
                    )
                  }
                  className={[
                    "group flex w-full items-center gap-5 px-5 py-6 text-left",
                    "transition-colors hover:bg-white/[0.035]",
                    "focus:outline-none focus-visible:bg-white/[0.05]",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60",
                    "sm:px-7",
                  ].join(" ")}
                >
                  <span className="w-8 shrink-0 font-mono text-xs text-white/25">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[0.65fr_1.35fr] sm:items-center sm:gap-8">
                    <span className="block text-lg font-medium tracking-[-0.02em] text-white">
                      {comparison.system}
                    </span>

                    <span className="mt-1 block text-sm text-white/40 sm:mt-0">
                      {comparison.category}
                    </span>
                  </span>

                  <span
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                      "transition duration-300",
                      isOpen
                        ? "border-white bg-white text-black"
                        : "border-white/15 bg-white/[0.035] text-white/60 group-hover:border-white/30",
                    ].join(" ")}
                  >
                    <ChevronIcon open={isOpen} />
                  </span>
                </button>
              </h4>

              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
              >
                <div className="grid gap-8 border-t border-white/10 bg-black/20 px-5 py-8 sm:px-7 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14 lg:py-10">
                  <div>
                    <p className="text-xl text-white/88">
                      {comparison.summary}
                    </p>

                    <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35">
                        Best for
                      </p>
                      <p className="mt-3 text-sm text-white/68">
                        {comparison.bestFor}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-7 sm:grid-cols-2">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35">
                        What it does well
                      </p>

                      <ul className="mt-4 space-y-3">
                        {comparison.strengths.map((strength) => (
                          <li
                            key={strength}
                            className="flex gap-3 text-sm text-white/66"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/60"
                            />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/35">
                        Where its scope ends
                      </p>

                      <ul className="mt-4 space-y-3">
                        {comparison.boundaries.map((boundary) => (
                          <li
                            key={boundary}
                            className="flex gap-3 text-sm leading-6 text-white/50"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/25"
                            />
                            <span>{boundary}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-white text-black sm:col-span-2">
                      <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-black/45">
                            Portals difference
                          </p>
                          <p className="mt-3 text-sm leading-6 text-black/80">
                            {comparison.portalsDifference}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-black/45">
                            Better together
                          </p>
                          <p className="mt-3 text-sm leading-6 text-black/65">
                            {comparison.together}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function PortalsComparisonMatrix() {
  return (
    <section
      aria-labelledby="comparison-heading"
      className="relative isolate overflow-hidden bg-[#070708] px-4 py-24 text-white sm:px-6 sm:py-32 lg:px-8"
    >

      <div className="mx-auto max-w-[1500px]">
        <header className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <h2
              id="comparison-heading"
              className="mt-7 max-w-4xl text-balance text-4xl font-medium leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl"
            >
              Your stack stores the work.
              <span className="block text-white/42">
                Portals preserves how it became reproducible.
              </span>
            </h2>
          </div>

          <div className="lg:pb-2">
            <p className="max-w-2xl text-pretty text-base leading-7 text-white/55 sm:text-lg sm:leading-8">
              Frame.io preserves review. ShotGrid preserves production status.
              Perforce preserves file revisions. Drive and Dropbox preserve
              files. Generation tools preserve their own sessions. Portals
              preserves the cross-tool history connecting them.
            </p>

            <a
              href="#detailed-comparisons"
              className={[
                "mt-7 inline-flex items-center gap-2 text-sm font-medium text-white",
                "underline decoration-white/25 underline-offset-8 transition",
                "hover:decoration-white focus:outline-none focus-visible:ring-2",
                "focus-visible:ring-white/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070708]",
              ].join(" ")}
            >
              Explore detailed comparisons
              <ArrowIcon />
            </a>
          </div>
        </header>

        <ComparisonMatrix />

        <div id="detailed-comparisons">
          <ComparisonAccordion />
        </div>

        <footer className="mt-20 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]">
          <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
            <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r lg:p-9">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/35">
                The category distinction
              </p>

              <p className="mt-5 text-2xl font-medium leading-tight tracking-[-0.035em] text-white sm:text-3xl">
                Portals does not need to replace your production stack.
              </p>
            </div>

            <div className="grid gap-px bg-white/10 sm:grid-cols-2">
              {[
                ["Storage systems", "Preserve the file."],
                ["Review systems", "Preserve the feedback."],
                ["Production systems", "Preserve the schedule."],
                ["Portals", "Preserves the production memory connecting them."],
              ].map(([label, statement], index) => (
                <div
                  key={label}
                  className={[
                    "bg-[#0d0d0f] p-6 sm:p-7",
                    index === 3 ? "bg-white text-black" : "",
                  ].join(" ")}
                >
                  <p
                    className={[
                      "text-[9px] font-semibold uppercase tracking-[0.22em]",
                      index === 3 ? "text-black/40" : "text-white/30",
                    ].join(" ")}
                  >
                    {label}
                  </p>

                  <p
                    className={[
                      "mt-3 text-base font-medium leading-6",
                      index === 3 ? "text-black" : "text-white/72",
                    ].join(" ")}
                  >
                    {statement}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </section>
  );
}