/**
 * IMPORTANT: this does not reimplement PX. It wraps the existing PX v0
 * client (already running in studio-app and 25thChapter) so that any
 * capability in this repo can resolve a PX address through one stable
 * interface, without depending on the v0 client's internal API surface
 * directly. If/when PX moves past v0, only this adapter should need to
 * change — not every capability that consumes it.
 *
 * TODO(integration): replace the placeholder import below with the actual
 * PX v0 client package once it's extracted from studio-app into its own
 * package. Until then this adapter defines the target interface so other
 * packages can be built against it in parallel.
 */

// import { PxClientV0 } from "@portalshq/protocol-v0"; // <-- existing v0 client, once extracted

export interface NarrativeObject {
  pxAddress: string;
  kind: "narrative" | "world" | "asset" | "identity";
  lineage?: string[];   // provenance chain — see docs ADR on remixing/attribution
  payload: unknown;
}

export interface PxResolver {
  resolve(pxAddress: string): Promise<NarrativeObject>;
  exists(pxAddress: string): Promise<boolean>;
}

export class PxResolverAdapter implements PxResolver {
  constructor(/* private client: PxClientV0 */) {}

  async resolve(pxAddress: string): Promise<NarrativeObject> {
    // return this.client.resolve(pxAddress);
    throw new Error("PxResolverAdapter.resolve: wire up to PX v0 client — see TODO above");
  }

  async exists(pxAddress: string): Promise<boolean> {
    throw new Error("PxResolverAdapter.exists: wire up to PX v0 client — see TODO above");
  }
}
