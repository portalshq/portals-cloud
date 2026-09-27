# @portalshq/resolver

**Reusable agent module:** [integration guide](../../docs/package-agents/resolver.md)

Target interface for resolving PX addresses without coupling a capability to PX v0 internals.

```ts
import type { PxResolver } from "@portalshq/resolver";

async function loadWorld(resolver: PxResolver, address: string) {
  return resolver.resolve(address);
}
```

## Exported shape

- `NarrativeObject`: PX address, kind (`narrative`, `world`, `asset`, or `identity`), optional lineage, and payload.
- `PxResolver`: `resolve(pxAddress)` and `exists(pxAddress)`.
- `PxResolverAdapter`: intended implementation boundary.

## Status: stub

`PxResolverAdapter` has no PX v0 client and both methods always throw. Depend on the `PxResolver` interface and inject your own implementation until the v0 client is extracted and wired here.
