export interface TimeCounterClock {
  now(): number;
  monotonicNow(): number;
}

export interface CountdownSnapshot {
  observedAt: Date;
  startsAt?: Date;
  endsAt: Date;
  totalMs?: number;
  elapsedMs?: number;
  remainingMs: number;
  remainingSeconds: number;
  progress?: number;
  expired: boolean;
}

export interface TickContext {
  sequence: number;
  now: Date;
  startedAt: Date;
  previousTickAt?: Date;
  elapsedMs: number;
  deltaMs: number;
  intervalMs: number;
  countdown(endsAt: Date, startsAt?: Date): CountdownSnapshot;
}

export interface TimeCounterOptions {
  intervalMs: number;
  clock?: TimeCounterClock;
  startedAt?: Date;
}

const systemClock: TimeCounterClock = {
  now: () => Date.now(),
  monotonicNow: () => globalThis.performance?.now?.() ?? Date.now(),
};

/** Per-activation clock used by realtime loops and their deadline events. */
export class TimeCounter {
  private readonly clock: TimeCounterClock;
  private readonly startedWallMs: number;
  private readonly startedMonotonicMs: number;
  private previousWallMs: number | undefined;
  private previousMonotonicMs: number | undefined;
  private sequence = 0;

  constructor(private readonly options: TimeCounterOptions) {
    if (!Number.isInteger(options.intervalMs) || options.intervalMs < 1) {
      throw new TypeError("intervalMs must be a positive integer");
    }
    this.clock = options.clock ?? systemClock;
    this.startedWallMs = options.startedAt?.getTime() ?? this.clock.now();
    this.startedMonotonicMs = this.clock.monotonicNow();
  }

  snapshot(): TickContext {
    return this.createContext(false);
  }

  next(): TickContext {
    return this.createContext(true);
  }

  private createContext(advance: boolean): TickContext {
    const wallMs = this.clock.now();
    const monotonicMs = this.clock.monotonicNow();
    if (advance) this.sequence += 1;
    const sequence = this.sequence;
    const previousTickAt = this.previousWallMs === undefined ? undefined : new Date(this.previousWallMs);
    const deltaMs = this.previousMonotonicMs === undefined
      ? Math.max(0, monotonicMs - this.startedMonotonicMs)
      : Math.max(0, monotonicMs - this.previousMonotonicMs);
    const elapsedMs = Math.max(0, monotonicMs - this.startedMonotonicMs);
    if (advance) {
      this.previousWallMs = wallMs;
      this.previousMonotonicMs = monotonicMs;
    }
    const observedAt = new Date(wallMs);
    return {
      sequence,
      now: observedAt,
      startedAt: new Date(this.startedWallMs),
      ...(previousTickAt ? { previousTickAt } : {}),
      elapsedMs,
      deltaMs,
      intervalMs: this.options.intervalMs,
      countdown: (endsAt, startsAt) => countdownAt(observedAt, endsAt, startsAt),
    };
  }
}

export function countdownAt(observedAt: Date, endsAt: Date, startsAt?: Date): CountdownSnapshot {
  const nowMs = validDate(observedAt, "observedAt");
  const endMs = validDate(endsAt, "endsAt");
  const remainingMs = Math.max(0, endMs - nowMs);
  const result: CountdownSnapshot = {
    observedAt: new Date(nowMs),
    endsAt: new Date(endMs),
    remainingMs,
    remainingSeconds: remainingMs === 0 ? 0 : Math.ceil(remainingMs / 1_000),
    expired: remainingMs === 0,
  };
  if (startsAt) {
    const startMs = validDate(startsAt, "startsAt");
    const totalMs = Math.max(0, endMs - startMs);
    const elapsedMs = Math.min(totalMs, Math.max(0, nowMs - startMs));
    result.startsAt = new Date(startMs);
    result.totalMs = totalMs;
    result.elapsedMs = elapsedMs;
    result.progress = totalMs === 0 ? (nowMs >= endMs ? 1 : 0) : elapsedMs / totalMs;
  }
  return result;
}

function validDate(value: Date, name: string): number {
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new TypeError(`${name} must be a valid Date`);
  return time;
}
