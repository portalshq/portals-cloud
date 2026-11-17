/** Presentation phases for a program's scheduled opening. Applications own the visuals. */
export type ProgramOpeningPhase = "idle" | "fade-out" | "title" | "fade-in";

export interface ProgramOpeningOptions {
  onPhaseChange(phase: ProgramOpeningPhase): void;
  fadeMs?: number;
  titleMs?: number;
}

/** Runs once for an observed upcoming start, or for an observed off-air to live transition. */
export class ProgramOpeningSequence {
  private readonly fadeMs: number;
  private readonly titleMs: number;
  private scheduleTimer: ReturnType<typeof setTimeout> | undefined;
  private phaseTimers: Array<ReturnType<typeof setTimeout>> = [];
  private scheduledStart: number | null = null;
  private previousLive: boolean | null = null;
  private lastOpeningAt = -Infinity;
  private running = false;

  constructor(private readonly options: ProgramOpeningOptions) {
    this.fadeMs = options.fadeMs ?? 1000;
    this.titleMs = options.titleMs ?? 2500;
  }

  update(live: boolean, startsAt?: string | null): void {
    const parsed = startsAt ? Date.parse(startsAt) : NaN;
    const upcoming = Number.isFinite(parsed) && parsed > Date.now() ? parsed : null;
    if (upcoming !== this.scheduledStart) {
      if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
      this.scheduleTimer = undefined;
      this.scheduledStart = upcoming;
      if (upcoming !== null && upcoming > this.lastOpeningAt) {
        this.scheduleTimer = setTimeout(() => {
          this.scheduleTimer = undefined;
          if (Date.now() - upcoming < 60_000) this.open(upcoming);
        }, Math.max(0, upcoming - Date.now() - this.fadeMs));
      }
    }
    if (this.previousLive === false && live && upcoming === null && Date.now() - this.lastOpeningAt > 60_000) {
      this.open(Date.now());
    }
    this.previousLive = live;
  }

  private open(start: number): void {
    if (this.running) return;
    this.running = true;
    this.lastOpeningAt = start;
    this.options.onPhaseChange("fade-out");
    this.phaseTimers.push(setTimeout(() => this.options.onPhaseChange("title"), this.fadeMs));
    this.phaseTimers.push(setTimeout(() => this.options.onPhaseChange("fade-in"), this.fadeMs + this.titleMs));
    this.phaseTimers.push(setTimeout(() => {
      this.running = false;
      this.phaseTimers = [];
      this.options.onPhaseChange("idle");
    }, this.fadeMs * 2 + this.titleMs));
  }

  dispose(): void {
    if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
    for (const timer of this.phaseTimers) clearTimeout(timer);
    this.phaseTimers = [];
  }
}
