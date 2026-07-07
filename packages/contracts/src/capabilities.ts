/**
 * The capability contract. A way for a unit of platform functionality
 * (chat, polls, lobby presence, a video player, a VR render target, a
 * game-rules engine -- built or not-yet-built) to declare itself, and a
 * way for a channel to compose the capabilities it needs.
 *
 * Design principle enforced here: a platform that silently no-ops an
 * unbuilt or misconfigured capability is more dangerous than one that
 * refuses to resolve. `CapabilityRegistry.resolve()` fails loud, with a
 * specific error per problem, never a silent partial result. The same
 * principle extends to tenancy below: a manifest cannot assert its own
 * trust level -- that comes from a trusted lookup the caller provides,
 * never from the (potentially untrusted) manifest itself.
 */

import type { TenantContext } from "./tenancy.js";

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export interface CapabilityContext<TConfig = unknown> {
  channelId: string;
  tenant: TenantContext;
  config: TConfig;
}

export interface CapabilityModule<TConfig = unknown> {
  /** Globally unique, namespaced, e.g. "platform.chat", "platform.video.mux". */
  id: string;
  /** Semver. Used for compatibility checks once external developers ship modules. */
  version: string;
  displayName: string;
  /** Other capability ids this one requires to function, resolved per-channel. */
  dependsOn?: string[];
  /**
   * Validate a channel's config for this capability. Must not throw for
   * ordinary invalid input -- return a ValidationResult so the registry can
   * collect every problem in one pass instead of failing on the first.
   */
  validateConfig(config: unknown): ValidationResult;
  /** Called once when a channel using this capability is first resolved. */
  onChannelRegistered?(ctx: CapabilityContext<TConfig>): Promise<void>;
  /** Called when the channel is torn down or the capability is removed. */
  onChannelUnregistered?(ctx: CapabilityContext<TConfig>): Promise<void>;
}

// ── Channel manifests ────────────────────────────────────────────────────

export interface CapabilityUsage {
  capabilityId: string;
  config: unknown;
}

export interface ChannelManifest {
  channelId: string;
  /** Declared owner. Verified against the trusted TenantContext passed into
   *  `resolve()`, not taken on faith -- see the mismatch check below. */
  tenantId: string;
  displayName: string;
  capabilities: CapabilityUsage[];
}

export interface ResolvedCapability {
  module: CapabilityModule;
  config: unknown;
}

export type ResolvedChannel =
  | { ok: true; channelId: string; tenant: TenantContext; capabilities: ResolvedCapability[] }
  | { ok: false; channelId: string; errors: string[] };

// ── Registry ─────────────────────────────────────────────────────────────

export class CapabilityRegistry {
  private modules = new Map<string, CapabilityModule>();

  register(module: CapabilityModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Capability "${module.id}" is already registered.`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): CapabilityModule | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  list(): CapabilityModule[] {
    return [...this.modules.values()];
  }

  /**
   * Resolves a manifest against currently-registered modules, for a given
   * (trustworthily-sourced) tenant. Collects EVERY problem in a single pass
   * rather than stopping at the first, so a developer sees the whole
   * picture at once. `tenant` must come from your own tenant lookup (e.g.
   * the control plane's database), never from the manifest itself -- a
   * manifest declaring its own trust level would let any tenant grant
   * themselves unlimited quota.
   */
  resolve(manifest: ChannelManifest, tenant: TenantContext): ResolvedChannel {
    if (tenant.tenantId !== manifest.tenantId) {
      return {
        ok: false,
        channelId: manifest.channelId,
        errors: [
          `Tenant mismatch: manifest declares tenant "${manifest.tenantId}" but ` +
            `resolution was requested for tenant "${tenant.tenantId}".`,
        ],
      };
    }

    const errors: string[] = [];
    const resolved: ResolvedCapability[] = [];
    const declaredIds = new Set(manifest.capabilities.map((u) => u.capabilityId));

    for (const usage of manifest.capabilities) {
      const module = this.modules.get(usage.capabilityId);
      if (!module) {
        errors.push(
          `Channel "${manifest.channelId}" declares capability "${usage.capabilityId}", ` +
            `which is not registered on this platform instance.`,
        );
        continue;
      }

      for (const dep of module.dependsOn ?? []) {
        if (!declaredIds.has(dep)) {
          errors.push(
            `Capability "${module.id}" requires "${dep}", which channel ` +
              `"${manifest.channelId}" does not declare.`,
          );
        }
      }

      const validation = module.validateConfig(usage.config);
      if (!validation.ok) {
        const detail = validation.errors?.join("; ") ?? "invalid config";
        errors.push(`Invalid config for capability "${module.id}": ${detail}`);
        continue;
      }

      resolved.push({ module, config: usage.config });
    }

    if (errors.length > 0) {
      return { ok: false, channelId: manifest.channelId, errors };
    }
    return { ok: true, channelId: manifest.channelId, tenant, capabilities: resolved };
  }

  /** Runs onChannelRegistered for every resolved capability, in declaration order. */
  async activate(resolved: Extract<ResolvedChannel, { ok: true }>): Promise<void> {
    for (const { module, config } of resolved.capabilities) {
      await module.onChannelRegistered?.({
        channelId: resolved.channelId,
        tenant: resolved.tenant,
        config,
      });
    }
  }

  /** Runs onChannelUnregistered for every resolved capability, in reverse order. */
  async deactivate(resolved: Extract<ResolvedChannel, { ok: true }>): Promise<void> {
    for (const { module, config } of [...resolved.capabilities].reverse()) {
      await module.onChannelUnregistered?.({
        channelId: resolved.channelId,
        tenant: resolved.tenant,
        config,
      });
    }
  }
}
