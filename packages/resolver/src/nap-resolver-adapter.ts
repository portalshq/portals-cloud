/**
 * IMPORTANT: this does not reimplement NAP. It wraps the existing NAP v0
 * client (already running in studio-app and 25thChapter) so that any
 * capability in this repo can resolve a NAP address through one stable
 * interface, without depending on the v0 client's internal API surface
 * directly. If/when NAP moves past v0, only this adapter should need to
 * change — not every capability that consumes it.
 *
 * TODO(integration): replace the placeholder import below with the actual
 * NAP v0 client package once it's extracted from studio-app into its own
 * package. Until then this adapter defines the target interface so other
 * packages can be built against it in parallel.
 */

// import { NapClientV0 } from "@portals/protocol-v0"; // <-- existing v0 client, once extracted

export interface NarrativeObject {
  napAddress: string;
  kind: "narrative" | "world" | "asset" | "identity";
  lineage?: string[];   // provenance chain — see docs ADR on remixing/attribution
  payload: unknown;
}

export interface NapResolver {
  resolve(napAddress: string): Promise<NarrativeObject>;
  exists(napAddress: string): Promise<boolean>;
}

export class NapResolverAdapter implements NapResolver {
  constructor(/* private client: NapClientV0 */) {}

  async resolve(napAddress: string): Promise<NarrativeObject> {
    // return this.client.resolve(napAddress);
    throw new Error("NapResolverAdapter.resolve: wire up to NAP v0 client — see TODO above");
  }

  async exists(napAddress: string): Promise<boolean> {
    throw new Error("NapResolverAdapter.exists: wire up to NAP v0 client — see TODO above");
  }
}
