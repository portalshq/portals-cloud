import { useEffect, useRef, useState } from "react";
import { ProgramOpeningSequence, type ProgramOpeningPhase } from "./program-opening.js";

/** Observe a schedule and playback without replaying the opening on a mid-session join. */
export function useProgramOpening(live: boolean | null, startsAt?: string | null): ProgramOpeningPhase {
  const [phase, setPhase] = useState<ProgramOpeningPhase>("idle");
  const sequence = useRef<ProgramOpeningSequence | null>(null);
  useEffect(() => {
    const controller = new ProgramOpeningSequence({ onPhaseChange: setPhase });
    sequence.current = controller;
    return () => { controller.dispose(); sequence.current = null; };
  }, []);
  useEffect(() => { if (live !== null) sequence.current?.update(live, startsAt); }, [live, startsAt]);
  return phase;
}
