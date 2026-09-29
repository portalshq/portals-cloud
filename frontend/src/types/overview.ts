import { CSSProperties } from "react";

export type OverviewTransitionStage = 'hidden' | 'idle' | 'exiting' | 'entering';
export type OverviewScrollPhase = 'before' | 'viewing' | 'after';

export const blurEnterDurationMs = 1300;
export const blurExitDurationMs = 200;
export const blurEnterEasing = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const blurExitEasing = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)';
export const overviewBlurStaggerMs = 165;
export const overviewLayerCount = 4;
export const overviewExitTotalMs = blurExitDurationMs + overviewBlurStaggerMs * (overviewLayerCount - 1);
export const overviewEnterTotalMs = blurEnterDurationMs + overviewBlurStaggerMs * (overviewLayerCount - 1);

export function overviewMotionStyle(visibleIndex: number, index: number, stage: OverviewTransitionStage, scrollDirection: 'up' | 'down', staggerIndex = 0): CSSProperties {
    const isVisibleLayer = visibleIndex === index;
    const isEnteringOrResting = stage !== 'hidden' && stage !== 'exiting';
    const active = isVisibleLayer && isEnteringOrResting;

    let transform = 'translateX(0px)';

    if (stage === 'entering') {
        transform = scrollDirection === 'up' ? 'translateX(-1px)' : 'translateX(1px)';
    } else if (stage === 'exiting' && isVisibleLayer) {
        transform = scrollDirection === 'up' ? 'translateX(1px)' : 'translateX(-1px)';
    }

    return {
        opacity: active ? 1 : 0,
        filter: active ? 'blur(0px)' : 'blur(10px)',
        transform: active ? 'translateX(0px)' : transform,
        pointerEvents: active ? 'auto' : 'none',
        transitionProperty: 'opacity, filter, transform',
        transitionDuration: `${active ? blurEnterDurationMs : blurExitDurationMs}ms`,
        transitionTimingFunction: active ? blurEnterEasing : blurExitEasing,
        transitionDelay: isVisibleLayer ? `${staggerIndex * overviewBlurStaggerMs}ms` : '0ms',
    };
}

export function overviewColumnMotionStyle(visible: boolean, scrollDirection: 'up' | 'down', delayMs = 0): CSSProperties {
    return {
        opacity: visible ? 1 : 0,
        filter: visible ? 'blur(0px)' : 'blur(10px)',
        transform: visible ? 'translateX(0px)' : `translateX(${scrollDirection === 'up' ? '-1px' : '1px'})`,
        pointerEvents: visible ? 'auto' : 'none',
        transition: `opacity ${visible ? blurEnterDurationMs : blurExitDurationMs}ms ${visible ? blurEnterEasing : blurExitEasing} ${visible ? delayMs : 0}ms, filter ${visible ? blurEnterDurationMs : blurExitDurationMs}ms ${visible ? blurEnterEasing : blurExitEasing} ${visible ? delayMs : 0}ms, transform ${visible ? blurEnterDurationMs : blurExitDurationMs}ms ${visible ? blurEnterEasing : blurExitEasing} ${visible ? delayMs : 0}ms`,
    };
}
