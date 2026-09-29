// ─────────────────────────────────────────────────────────────────────────────
// Drop-in replacement for everything from `const lineageOutputs` through the end
// of `ProductionLineage` in the VCS file.
//
// 1) Update the React import at the top of the file:
//      import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
// 2) Delete the old constants lineageSvgWidth, lineageSvgHeight, lineageTailLength,
//    lineageLabelLift (no longer used). Everything else outside this block is untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { blurEnterDurationMs, blurEnterEasing, blurExitDurationMs, blurExitEasing, overviewMotionStyle, OverviewTransitionStage } from "@/types/overview";
import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const lineageOutputs = [
    { src: '/images/vcs/components/preserve-portrait-01.png', label: 'portrait crop' },
    { src: '/images/vcs/components/preserve-portrait-02.png', label: 'studio look' },
    { src: '/images/vcs/components/preserve-portrait-03.png', label: 'detail frame' },
    { src: '/images/vcs/components/creative-production-hero-woman-portrait-4k-alt.png', label: 'campaign still' },
    { src: '/images/vcs/components/creative-production-hero-woman-portrait-4k-alt-2.png', label: 'alternate pose' },
    { src: '/images/vcs/components/creative-production-hero-woman-portrait-4k-alt-2.png', label: 'final delivery' },
];
const lineageOutputColumns = 3;
const lineageOutputRows = [
    lineageOutputs.slice(0, lineageOutputColumns),
    lineageOutputs.slice(lineageOutputColumns),
];
const compactLineageImages = [
    { src: '/images/vcs/components/selected-version-sleeve.png', alt: 'Approved campaign portrait' },
    { src: '/images/vcs/components/three-model-photo-stack.png', alt: 'Stack of campaign versions' },
    { src: '/images/vcs/components/front-photo-print.png', alt: 'Selected campaign portrait' },
    null,
    { src: '/images/vcs/components/version-stack.png', alt: 'Stack of campaign outputs' },
];

type LineagePoint = { x: number; y: number };
type LineageEdges = { entry: LineagePoint; exit: LineagePoint };
type LineageDot = LineagePoint & { node: number; visibleStage: number; role: 'entry' | 'exit' };
type LineageSegment = { d: string; stage: number; from: number; to: number };
type LineageLabelKey = 'source' | 'select' | 'branch' | 'deliver';
type LineageLayout = {
    width: number; // track size in px; the SVG viewBox uses it 1:1
    height: number;
    positions: number[];
    dots: LineageDot[];
    segments: LineageSegment[];
    labels: Record<LineageLabelKey, LineagePoint> | null; // dead center of each segment
    selectedScale: number; // shrink so the tilted print fits the track height
};

const emptyLineageLayout: LineageLayout = {
    width: 0,
    height: 0,
    positions: [],
    dots: [],
    segments: [],
    labels: null,
    selectedScale: 1,
};

// Single source of truth for the print's tilt: used for rendering AND for finding its true edge.
const selectedRotationDeg = -8.5;
const roundPoint = (value: number) => Math.round(value * 10) / 10;
const midpoint = (a: LineagePoint, b: LineagePoint): LineagePoint => ({
    x: roundPoint((a.x + b.x) / 2),
    y: roundPoint((a.y + b.y) / 2),
});
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function lineageLinkPath(from: LineagePoint, to: LineagePoint) {
    if (Math.abs(from.y - to.y) < 1) return `M${from.x} ${from.y}H${to.x}`;
    const bendX = roundPoint((from.x + to.x) / 2);
    return `M${from.x} ${from.y}H${bendX}V${to.y}H${to.x}`;
}

// Layout-based position (offset*), unaffected by blur/translate motion or print rotation.
function offsetWithin(element: HTMLElement, root: HTMLElement): LineagePoint {
    let x = 0;
    let y = 0;
    for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
        x += node.offsetLeft;
        y += node.offsetTop;
    }
    return { x, y };
}

// Each slot centers the image or image grid. Connector geometry uses these same positions.
function visibleLineageNodes(stage: number, width: number): number[] {
    if (stage < 0) return [];
    if (width < 1280) return stage === 0 ? [0] : [stage - 1, stage];
    if (stage < 3) return Array.from({ length: stage + 1 }, (_, index) => index);
    return stage === 3 ? [2, 3] : [2, 3, 4];
}

function measureLineageLayout(track: HTMLElement, stage: number): LineageLayout | null {
    const width = track.clientWidth;
    const height = track.clientHeight;
    if (!width || !height) return null;

    const nodes = ['source', 'versions', 'selected', 'outputs', 'campaign-outputs']
        .map((name) => track.querySelector<HTMLElement>(`[data-node="${name}"]`));
    if (nodes.some((node) => !node)) return null;
    const visible = visibleLineageNodes(stage, window.innerWidth);
    const slotCenters = window.innerWidth < 1280 ? [width * .18, width * .5] : [width / 6, width / 2, width * 5 / 6];
    const firstVisible = visible[0] ?? 0;
    const positions = nodes.map((node, index) => {
        const slot = visible.includes(index) ? visible.indexOf(index) : index - firstVisible;
        return roundPoint((slotCenters[slot] ?? (slot < 0 ? slotCenters[0] + slot * width / 3 : slotCenters.at(-1)! + (slot - slotCenters.length + 1) * width / 3)) - node!.offsetWidth / 2);
    });
    const trackLeft = track.getBoundingClientRect().left;
    const visualPositions = nodes.map((node) => roundPoint(node!.getBoundingClientRect().left - trackLeft));
    const imageOf = (node: string) => track.querySelector<HTMLImageElement>(`[data-node="${node}"] img`);

    const edgesOf = (image: HTMLImageElement | null, nodeIndex: number): LineageEdges | null => {
        if (!image) return null;
        const origin = offsetWithin(image, nodes[nodeIndex]!);
        const y = roundPoint(origin.y + image.offsetHeight / 2);
        return {
            entry: { x: roundPoint(visualPositions[nodeIndex] + origin.x), y },
            exit: { x: roundPoint(visualPositions[nodeIndex] + origin.x + image.offsetWidth), y },
        };
    };

    const source = edgesOf(imageOf('source'), 0);
    const versions = edgesOf(imageOf('versions'), 1);
    const campaign = edgesOf(imageOf('campaign-outputs'), 4);
    const outputs = Array.from(track.querySelectorAll<HTMLImageElement>('[data-node="outputs"] img'), (image) => edgesOf(image, 3));

    // The selected print is rotated. Scale it so its rotated bounds fit the track height, then
    // find where the horizontal midline actually crosses the tilted edge.
    const selectedImage = imageOf('selected');
    let selected: LineageEdges | null = null;
    let selectedScale = 1;
    if (selectedImage) {
        const w = selectedImage.offsetWidth;
        const h = selectedImage.offsetHeight;
        const theta = (Math.abs(selectedRotationDeg) * Math.PI) / 180;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        selectedScale = w && h ? Math.min(1, height / (w * sin + h * cos)) : 1;
        const reach = Math.min((w * selectedScale) / 2 / cos, sin > 1e-6 ? (h * selectedScale) / 2 / sin : Infinity);
        const origin = offsetWithin(selectedImage, nodes[2]!);
        const cx = visualPositions[2] + origin.x + w / 2;
        const cy = roundPoint(origin.y + h / 2);
        selected = { entry: { x: roundPoint(cx - reach), y: cy }, exit: { x: roundPoint(cx + reach), y: cy } };
        selectedScale = roundPoint(selectedScale * 1000) / 1000;
    }

    const rows = [outputs.slice(0, lineageOutputColumns), outputs.slice(lineageOutputColumns)];
    const [topFirst, topLast] = [rows[0][0], rows[0][rows[0].length - 1]];
    const [bottomFirst, bottomLast] = [rows[1][0], rows[1][rows[1].length - 1]];
    if (!source || !versions || !selected || !campaign || !topFirst || !topLast || !bottomFirst || !bottomLast) return null;

    // The tail stays inside the final slot.
    const gap = Math.max(16, Math.min(48, width / 24));

    const dots: LineageDot[] = [
        { ...source.exit, node: 0, visibleStage: 0, role: 'exit' },
        { ...versions.entry, node: 1, visibleStage: 1, role: 'entry' },
        { ...versions.exit, node: 1, visibleStage: 1, role: 'exit' },
        { ...selected.entry, node: 2, visibleStage: 2, role: 'entry' },
        { ...selected.exit, node: 2, visibleStage: 2, role: 'exit' },
    ];
    for (const output of outputs) {
        if (!output) continue;
        dots.push(
            { ...output.entry, node: 3, visibleStage: 4, role: 'entry' },
            { ...output.exit, node: 3, visibleStage: 3, role: 'exit' },
        );
    }
    dots.push({ ...campaign.entry, node: 4, visibleStage: 4, role: 'entry' });

    const segments: LineageSegment[] = [
        { d: lineageLinkPath(source.exit, versions.entry), stage: 1, from: 0, to: 1 },
        { d: lineageLinkPath(versions.exit, selected.entry), stage: 2, from: 1, to: 2 },
    ];

    // Branch: selected → split → two output rows.
    const splitX = roundPoint((selected.exit.x + topFirst.entry.x) / 2);
    const topY = topFirst.entry.y;
    const bottomY = bottomFirst.entry.y;
    segments.push(
        { d: `M${selected.exit.x} ${selected.exit.y}H${splitX}V${topY}H${topFirst.entry.x}`, stage: 3, from: 2, to: 3 },
        { d: `M${splitX} ${topY}V${bottomY}`, stage: 3, from: 2, to: 3 },
        { d: `M${splitX} ${topY}H${topLast.exit.x}`, stage: 3, from: 2, to: 3 },
        { d: `M${splitX} ${bottomY}H${bottomLast.exit.x}`, stage: 3, from: 2, to: 3 },
    );

    // Merge: both rows → campaign outputs.
    const rowsExitX = Math.max(topLast.exit.x, bottomLast.exit.x);
    const bendX = roundPoint((rowsExitX + campaign.entry.x) / 2);
    segments.push(
        { d: `M${topLast.exit.x} ${topLast.exit.y}H${bendX}V${campaign.entry.y}H${campaign.entry.x}`, stage: 4, from: 3, to: 4 },
        { d: `M${bottomLast.exit.x} ${bottomLast.exit.y}H${bendX}V${campaign.entry.y}`, stage: 4, from: 3, to: 4 },
    );

    // Tail past the final node: exactly one gap long.
    const tail: LineagePoint = { x: roundPoint(campaign.exit.x + gap), y: campaign.exit.y };
    dots.push({ ...tail, node: 4, visibleStage: 4, role: 'entry' });
    segments.push({ d: `M${campaign.exit.x} ${campaign.exit.y}H${tail.x}`, stage: 4, from: 4, to: 4 });

    const labels: Record<LineageLabelKey, LineagePoint> = {
        source: midpoint(source.exit, versions.entry),
        select: midpoint(versions.exit, selected.entry),
        // center of the vertical spine between the two output rows
        branch: midpoint({ x: splitX, y: topY }, { x: splitX, y: bottomY }),
        deliver: midpoint(campaign.exit, tail),
    };

    return {
        width,
        height,
        positions,
        dots,
        segments,
        labels,
        selectedScale,
    };
}

export function ProductionLineage({ stage, transitionStage, scrollDirection, labels = true, compact = false }: {
    stage: number;
    transitionStage: OverviewTransitionStage;
    scrollDirection: 'up' | 'down';
    labels?: boolean;
    compact?: boolean;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const lastLayoutKeyRef = useRef('');
    const [lineageLayout, setLineageLayout] = useState<LineageLayout | null>(null);
    const {
        dots: lineageDots,
        segments: lineageSegments,
        width: trackWidth,
        height: trackHeight,
        positions,
        selectedScale,
    } = lineageLayout ?? emptyLineageLayout;

    // Only commits when something actually changed, so observer bursts don't cause re-render churn.
    const measure = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const next = measureLineageLayout(track, stage);
        if (!next) return;
        const key = JSON.stringify(next);
        if (key === lastLayoutKeyRef.current) return;
        lastLayoutKeyRef.current = key;
        setLineageLayout(next);
    }, [stage]);

    // Layout effect: measured before first paint, so dots and lines never pop in late.
    // ResizeObserver batches all observed elements into one callback per frame.
    useIsoLayoutEffect(() => {
        const track = trackRef.current;
        if (!track) return undefined;

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(track);
        track.querySelectorAll('img').forEach((image) => observer.observe(image));

        return () => observer.disconnect();
    }, [measure]);

    // Scaling the tilted print does not resize its layout box; re-measure its visible edge once.
    useIsoLayoutEffect(() => {
        measure();
    }, [measure, selectedScale]);

    // Nodes slide between slots; sample their rendered positions until the slide settles
    // so the SVG connectors and dots stay attached throughout the move.
    useEffect(() => {
        if (!trackRef.current) return undefined;
        const start = performance.now();
        let frame = 0;
        const follow = () => {
            measure();
            if (performance.now() - start < blurEnterDurationMs + 200) frame = requestAnimationFrame(follow);
        };
        frame = requestAnimationFrame(follow);
        return () => cancelAnimationFrame(frame);
    }, [measure]);

    if (compact) {
        const image = compactLineageImages[stage];
        return (
            <div className="production-lineage-compact" role="group" aria-label={`Production lineage stage ${stage + 1}`}>
                {image ? <img src={image.src} alt={image.alt} /> : (
                    <div className="compact-output-grid" aria-label="Six campaign variations">
                        {lineageOutputs.map((output) => <img key={output.src} src={output.src} alt={output.label} />)}
                    </div>
                )}
                <style jsx>{`
                    .production-lineage-compact { width: 100%; height: 100%; min-height: 0; display: grid; place-items: center; overflow: hidden; }
                    .production-lineage-compact > img { display: block; width: 100%; height: 100%; object-fit: contain; }
                    .compact-output-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 3px; width: 100%; height: 100%; align-items: stretch; }
                    .compact-output-grid img { width: 100%; height: 100%; min-height: 0; object-fit: cover; border: 2px solid #f5ebe0; }
                `}</style>
            </div>
        );
    }

    const connectorVisible = (step: number) => step === stage && transitionStage !== 'hidden' && transitionStage !== 'exiting';
    const visibleNodes = visibleLineageNodes(stage, typeof window === 'undefined' ? 1440 : window.innerWidth);
    const lineageNodeVisible = (node: number) => visibleNodes.includes(node);
    const nodePosition = (node: number): CSSProperties => ({
        left: positions[node] ?? 0,
        transitionProperty: 'left, opacity, filter, transform',
    });
    const motionStyle = (step: number): CSSProperties => {
        if (step === stage && transitionStage !== 'hidden' && transitionStage !== 'exiting') {
            return overviewMotionStyle(stage, step, transitionStage, scrollDirection, 2);
        }
        if (step === stage - 1 || (step === stage && transitionStage === 'exiting')) {
            return {
                ...overviewMotionStyle(stage, stage, 'idle', scrollDirection, 2),
                transitionDelay: '0ms',
                pointerEvents: 'none',
            };
        }
        return overviewMotionStyle(
            stage,
            step,
            step === stage ? transitionStage : 'idle',
            scrollDirection,
            2,
        );
    };
    const nodeMotionStyle = (node: number): CSSProperties => ({
        ...motionStyle(node),
        ...nodePosition(node),
        ...(lineageNodeVisible(node) && (node !== stage || (transitionStage !== 'hidden' && transitionStage !== 'exiting'))
            ? { opacity: 1, filter: 'blur(0px)' }
            : { opacity: 0, filter: 'blur(10px)', pointerEvents: 'none' }),
    });
    const connectorMotionStyle = (step: number): CSSProperties => connectorVisible(step)
        ? overviewMotionStyle(stage, step, transitionStage, scrollDirection, 2)
        : {
            opacity: 0,
            filter: 'blur(10px)',
            transform: 'translateX(1px)',
            pointerEvents: 'none',
            transitionProperty: 'opacity, filter, transform, stroke-dashoffset',
            transitionDuration: `${blurExitDurationMs}ms`,
            transitionTimingFunction: blurExitEasing,
            transitionDelay: '0ms',
        };
    // Labels are centered (via CSS translate) on the midpoint of their segment.
    const edgeLabelStyle = (step: number, key: LineageLabelKey): CSSProperties => {
        const point = lineageLayout?.labels?.[key];
        const retained = step < stage && lineageNodeVisible(step - 1) && lineageNodeVisible(step);
        return {
            ...(retained
                ? { ...overviewMotionStyle(stage, stage, 'idle', scrollDirection, 2), transitionDelay: '0ms' }
                : connectorMotionStyle(step)),
            ...(point ? { left: `${point.x}px`, top: `${point.y}px` } : { visibility: 'hidden' as const }),
        };
    };
    // Holds the label back until the tail line has finished drawing in, so the line
    // leads and the label follows it rather than fading in alongside.
    const deliverLabelMotionStyle = (): CSSProperties => ({
        ...edgeLabelStyle(4, 'deliver'),
        transitionDelay: connectorVisible(4) ? `${blurEnterDurationMs}ms` : '0ms',
    });
    const dotMotionStyle = (dot: LineageDot): CSSProperties => {
        if (!lineageNodeVisible(dot.node) || dot.visibleStage > stage) return connectorMotionStyle(-1);
        return dot.node === stage
            ? connectorMotionStyle(stage)
            : { ...overviewMotionStyle(stage, stage, 'idle', scrollDirection, 2), transitionDelay: '0ms' };
    };
    const segmentMotionStyle = (segment: LineageSegment): CSSProperties => {
        if (!lineageNodeVisible(segment.to) || !lineageNodeVisible(segment.from)) return connectorMotionStyle(-1);
        if (segment.stage === stage) return connectorMotionStyle(stage);
        return {
            opacity: 1,
            filter: 'blur(0px)',
            transform: 'translateX(0px)',
            pointerEvents: 'none',
            transitionProperty: 'opacity, filter, transform, stroke-dashoffset',
            transitionDuration: `${blurEnterDurationMs}ms`,
            transitionTimingFunction: blurEnterEasing,
            transitionDelay: '0ms',
        };
    };

    return (
        <div className="production-lineage" data-labels={labels ? 'on' : 'off'} data-stage={stage} role="group" aria-label="Creative production path from approved source through version history to campaign outputs">
            <div className="production-lineage-track" ref={trackRef}>
                {/* viewBox is the track's real pixel size, so path coordinates map 1:1 to the DOM. */}
                <svg viewBox={`0 0 ${trackWidth || 1} ${trackHeight || 1}`} className="production-lineage-lines" aria-hidden="true">
                    {lineageSegments.map((segment, index) => (
                        <path
                            key={index}
                            className={segment.stage < stage ? 'is-past' : ''}
                            d={segment.d}
                            pathLength="1"
                            strokeDasharray="1"
                            style={{
                                ...segmentMotionStyle(segment),
                                transitionProperty: 'opacity, filter, transform, stroke-dashoffset',
                                strokeDashoffset: segmentMotionStyle(segment).opacity === 1 ? 0 : 1,
                            }}
                        />
                    ))}
                </svg>

                <div className={`lineage-node lineage-source ${0 < stage ? 'is-past' : ''}`} data-node="source" style={nodeMotionStyle(0)} aria-hidden={!lineageNodeVisible(0)}>
                    <img src="/images/vcs/components/selected-version-sleeve.png" alt="Approved campaign portrait held in a clear archival sleeve" className='border-[8px] border-[#f5ebe0] rounded-[1.5px]' />
                    {labels && <span className="lineage-node-label">approved source</span>}
                </div>
                <div className={`lineage-node lineage-stack ${1 < stage ? 'is-past' : ''}`} data-node="versions" style={nodeMotionStyle(1)} aria-hidden={!lineageNodeVisible(1)}>
                    <img src="/images/vcs/components/three-model-photo-stack.png" alt="Stack of campaign photo versions" />
                    {labels && <span className="lineage-node-label">version history</span>}
                </div>
                <div
                    className={`lineage-node lineage-selected ${2 < stage ? 'is-past' : ''}`}
                    data-node="selected"
                    style={nodeMotionStyle(2)}
                    aria-hidden={!lineageNodeVisible(2)}
                >
                    <img
                        src="/images/vcs/components/front-photo-print.png"
                        alt="Selected approved campaign portrait on a bordered photo print"
                        style={{ transform: `rotate(${selectedRotationDeg}deg) scale(${selectedScale})` }}
                    />
                    {labels && <span className="lineage-node-label">selected version</span>}
                    {labels && (
                        <div className="lineage-provenance">
                            <span className="lineage-provenance-label">
                                <span className="lineage-provenance-path">aqualab/character/elize</span>
                                <span className="lineage-provenance-meta">revision: 4</span>
                                <span className="lineage-provenance-meta">model: gpt-image-2</span>
                                <span className="lineage-provenance-prompt">prompt: cream skin-toned woman with dark windswept hair...</span>
                            </span>
                        </div>
                    )}
                </div>

                {labels && (
                    <>
                        <span className={`lineage-edge-label lineage-edge-source ${1 < stage ? 'is-past' : ''}`} style={edgeLabelStyle(1, 'source')}>new version</span>
                        <span className={`lineage-edge-label lineage-edge-select ${2 < stage ? 'is-past' : ''}`} style={edgeLabelStyle(2, 'select')}>select approved</span>
                        <span className={`lineage-edge-label lineage-edge-branch ${3 < stage ? 'is-past' : ''}`} style={edgeLabelStyle(3, 'branch')}>branch from source</span>
                        <span className={`lineage-edge-label lineage-edge-deliver ${4 < stage ? 'is-past' : ''}`} style={deliverLabelMotionStyle()}>deliver outputs</span>
                    </>
                )}

                <div className={`lineage-output-grid ${3 < stage ? 'is-past' : ''}`} data-node="outputs" style={nodeMotionStyle(3)} aria-hidden={!lineageNodeVisible(3)}>
                    {lineageOutputRows.map((row, rowIndex) => (
                        <div className="lineage-output-row" key={rowIndex}>
                            {row.map((output) => (
                                <div className="lineage-output" key={output.label}>
                                    <img src={output.src} alt={`${output.label} from the same campaign model`} />
                                    {labels && <span className="lineage-output-label">{output.label}</span>}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="production-lineage-dots" aria-hidden="true">
                    {lineageDots.map((dot, index) => (
                        <span
                            key={`${dot.node}-${dot.role}-${index}`}
                            data-dot-role={dot.role}
                            data-node-stage={dot.node}
                            className="lineage-dot"
                            style={{
                                left: `${dot.x}px`,
                                top: `${dot.y}px`,
                                ...dotMotionStyle(dot),
                            }}
                        />
                    ))}
                </div>
                <div className={`lineage-node lineage-campaign-outputs ${4 < stage ? 'is-past' : ''}`} data-node="campaign-outputs" style={nodeMotionStyle(4)} aria-hidden={!lineageNodeVisible(4)}>
                    <img src="/images/vcs/components/version-stack.png" alt="Campaign output versions arranged as an archival photo stack" />
                    {labels && <span className="lineage-node-label">campaign outputs</span>}
                </div>
            </div>

            <style jsx>{`
        .production-lineage {
          /* The one static distance between images. Shrinks only when the viewport is narrow. */
          --lineage-gap: min(72px, 8vw);
          --lineage-inner-gap: calc(var(--lineage-gap) / 3);
          position: relative;
          width: 100%;
          height: clamp(0px, calc(40svh - 120px), 300px);
          /* Overview copy owns the viewport budget; imagery uses only the height left over. */
          max-height: 100%;
          min-height: 0;
          flex: 0 1 auto;
          color: white;
          overflow: hidden;
          margin: auto;
        }
        /* Nodes occupy measured slots; the SVG uses the same pixel coordinates. */
        .production-lineage-track {
          position: absolute; inset: 0; width: 100%; height: 100%;
        }
        @media (min-width: 64rem) and (max-width: 79.99rem) {
          .production-lineage { height: clamp(0px, calc(30svh - 100px), 240px); }
          .production-lineage[data-stage='4'] .lineage-selected {
            opacity: 1 !important; filter: blur(0) !important;
            transform: translateX(0) !important; translate: 0 0 !important;
          }
        }
        .production-lineage-lines {
          position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; overflow: visible;
          fill: none; stroke: rgba(255,255,255,.8); stroke-width: 2;
        }
        .production-lineage-lines path { stroke-dashoffset: 1; }
        .production-lineage-dots { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
        .lineage-dot {
          position: absolute; width: 8px; height: 8px; border-radius: 50%;
          background: white; translate: -50% -50%;
        }
        .lineage-node {
          position: absolute; top: 0; width: max-content; height: 100%;
          display: flex; align-items: center; justify-content: center;
        }
        /* Height-driven: the box is exactly the artwork, so box edge === visible edge. */
        .lineage-node img {
          display: block; flex: none; box-sizing: border-box;
          height: 100%; width: auto; max-width: none;
        }
        .lineage-node-label, .lineage-edge-label, .lineage-output-label {
          position: absolute; z-index: 2; white-space: nowrap;
          border: 0; border-radius: 10px; background: rgba(255,255,255,.1);
          padding: 4px 6px; color: white; backdrop-filter: blur(20px);
          font-family: var(--font-die-grotesk-b); font-size: clamp(6px, .65vw, 9px); font-weight: 400; line-height: 1.05;
        }
        .lineage-node-label { bottom: 6px; left: 50%; translate: -50% 0; }
        /* translate, not transform: the inline motion style sets transform, which
           would otherwise win and drop the label off its connector. left/top are inline
           and measured: the exact midpoint of the segment. */
        .lineage-edge-label { translate: -50% -50%; }
        /* Two centered rows; each image scales to its row height, uncropped. */
        .lineage-output-grid {
          position: absolute; top: 0; width: max-content; height: 100%;
          display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
          row-gap: var(--lineage-inner-gap);
        }
        .lineage-output-row {
          display: flex; align-items: center; column-gap: var(--lineage-inner-gap);
          height: calc((100% - var(--lineage-inner-gap)) / 2); min-height: 0;
        }
        .lineage-output { position: relative; flex: none; height: 100%; overflow: hidden; background: #07121d; }
        .lineage-output img {
          display: block; box-sizing: border-box;
          height: 100%; width: auto; max-width: none;
          border: 6px solid #f5ebe0;
          border-radius: 1.5px;
          box-shadow: 0 3px 10px rgba(0,0,0,.3);
        }
        .lineage-output-label { left: 50%; bottom: 0; translate: -50% 0; }
        @media (min-width: 64rem) and (max-height: 760px) {
          .production-lineage { height: clamp(0px, calc(21svh - 120px), 120px); }
        }
        .lineage-provenance {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 3;
        }
        .lineage-provenance-label {
          display: flex;
          flex-direction: column;
          gap: 1px;
          padding: 4px 6px;
          background: rgba(255,255,255,.1);
          border: 0;
          border-radius: 10px;
          backdrop-filter: blur(20px);
          color: white;
          font-family: var(--font-die-grotesk-b);
          font-size: clamp(6px, .65vw, 9px);
          font-weight: 400;
          line-height: 1.05;
          white-space: nowrap;
          text-align: right;
        }
        /* After the base rule (it previously came before it and lost). */
        @media (max-width: 63.99rem) {
          .lineage-provenance { display: none; }
        }
        .production-lineage[data-labels='off'] .lineage-node-label,
        .production-lineage[data-labels='off'] .lineage-edge-label,
        .production-lineage[data-labels='off'] .lineage-output-label,
        .production-lineage[data-labels='off'] .lineage-provenance { display: none; }
      `}</style>
        </div>
    );
}
