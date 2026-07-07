import { z } from "zod";

/**
 * A Capability is the smallest unit of composition in the platform.
 * Every capability — realtime-fanout, video-delivery, identity, the
 * narrative-engine-adapter, everything — implements this same contract
 * shape. The runtime never calls a capability directly; it always goes
 * through the registry, which validates against this schema first.
 *
 * Modeled deliberately on Kubernetes CRD + controller semantics, not on
 * a bare RPC interface: declare a resource shape, let the runtime
 * reconcile it. See docs/architecture-decision-records for rationale.
 */

export const PermissionScopeSchema = z.object({
  resource: z.string(),          // e.g. "world:write", "audience:read"
  effect: z.enum(["allow", "deny"]),
});
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const CapabilityContractSchema = z.object({
  id: z.string(),                 // e.g. "realtime-fanout"
  version: z.string(),            // semver
  inputSchema: z.record(z.unknown()),   // JSON schema for capability input
  outputSchema: z.record(z.unknown()),  // JSON schema for capability output
  permissions: z.array(PermissionScopeSchema),
  plane: z.enum(["control", "data"]),   // which plane this capability runs in — see ADR 0001
  lazyStart: z.boolean().default(true), // billed only while an invoking session is active
});
export type CapabilityContract = z.infer<typeof CapabilityContractSchema>;

/**
 * Implemented by every capability package. The registry calls `invoke`
 * after validating `input` against the contract's inputSchema. Capabilities
 * never call each other directly — composition happens at the channel
 * manifest level, mediated by the runtime.
 */
export interface Capability<TInput = unknown, TOutput = unknown> {
  contract: CapabilityContract;
  invoke(input: TInput, ctx: CapabilityContext): Promise<TOutput>;
}

export interface CapabilityContext {
  sessionId: string;
  channelId: string;
  worldId: string;
  /** Resolves a NAP address to a narrative/world resource. See @portals/resolver. */
  resolve: (napAddress: string) => Promise<unknown>;
}
