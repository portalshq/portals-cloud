import { Capability, CapabilityContract, CapabilityContractSchema } from "@portals/contracts";

/**
 * Control-plane component. Channels never reference a capability
 * implementation directly — they reference a capabilityId + version in
 * their manifest, and the runtime asks the registry to resolve it at
 * session-start. This is what makes capabilities independently
 * deployable/replaceable, the same reason a Kubernetes controller doesn't
 * hardcode which Pod backs a Service.
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, Map<string, Capability>>(); // id -> version -> impl

  register(capability: Capability): void {
    const parsed = CapabilityContractSchema.safeParse(capability.contract);
    if (!parsed.success) {
      throw new Error(
        `Capability "${capability.contract?.id}" failed contract validation: ${parsed.error.message}`
      );
    }
    const { id, version } = capability.contract;
    if (!this.capabilities.has(id)) this.capabilities.set(id, new Map());
    this.capabilities.get(id)!.set(version, capability);
  }

  resolve(id: string, version?: string): Capability {
    const versions = this.capabilities.get(id);
    if (!versions) throw new Error(`No capability registered for id "${id}"`);
    const resolved = version ? versions.get(version) : this.latest(versions);
    if (!resolved) throw new Error(`Capability "${id}" has no version "${version}"`);
    return resolved;
  }

  list(): CapabilityContract[] {
    return [...this.capabilities.values()].flatMap((versions) =>
      [...versions.values()].map((c) => c.contract)
    );
  }

  private latest(versions: Map<string, Capability>): Capability {
    // TODO: real semver comparison — placeholder takes insertion order
    return [...versions.values()].at(-1)!;
  }
}
