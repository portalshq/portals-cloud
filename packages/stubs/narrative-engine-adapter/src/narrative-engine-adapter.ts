/**
 * Wraps the existing Narrative Engine v0 (alpha) so it becomes a proper
 * capability-contract-compliant building block, consumable by any channel
 * through the registry — not just through studio-app/25thChapter's direct,
 * bespoke integration.
 *
 * TODO(integration): same pattern as @portals/resolver — replace the
 * placeholder import once the v0 engine is extracted into its own
 * publishable package. Do not change the v0 engine's existing API surface
 * to fit this adapter; the adapter conforms to it, not the reverse, so
 * studio-app and 25thChapter keep working unmodified during the
 * extraction. See docs/architecture-decision-records/0003-*.md.
 */

// import { NarrativeEngineV0 } from "@portals/narrative-engine-v0"; // <-- existing engine, once extracted

export interface NarrativeBranch {
  branchId: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: Record<string, unknown>;
}

export interface NarrativeState {
  narrativeRef: string;       // NAP address
  currentNodeId: string;
  availableBranches: NarrativeBranch[];
}

export class NarrativeEngineAdapter {
  constructor(/* private engine: NarrativeEngineV0 */) {}

  async getState(narrativeRef: string, sessionId: string): Promise<NarrativeState> {
    throw new Error("NarrativeEngineAdapter.getState: wire up to Narrative Engine v0 — see TODO above");
  }

  async advance(narrativeRef: string, sessionId: string, branchId: string): Promise<NarrativeState> {
    throw new Error("NarrativeEngineAdapter.advance: wire up to Narrative Engine v0 — see TODO above");
  }
}
