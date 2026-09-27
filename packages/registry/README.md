# @portalshq/registry

**Reusable agent module:** [integration guide](../../docs/package-agents/registry.md)

In-memory registry for `Capability` implementations from `@portalshq/contracts`.

```ts
import { CapabilityRegistry } from "@portalshq/registry";

const registry = new CapabilityRegistry();
registry.register(capability);
const resolved = registry.resolve(capability.contract.id, capability.contract.version);
```

## API

- `register(capability)`: validates the capability contract and stores it by `id` + `version`. Re-registering the same pair replaces it.
- `resolve(id, version?)`: returns a registered implementation or throws.
- `list()`: returns all registered contracts.

## Limits

- State is process-local and non-durable. Do not use it as a distributed service registry.
- Omit `version` only when insertion order is acceptable: `latest()` currently returns the last registered version, **not** the highest semver version.
- This registry is distinct from the configuration-level `CapabilityRegistry` exported by `@portalshq/contracts`; use this package for runtime `Capability` instances.
