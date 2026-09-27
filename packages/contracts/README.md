# @portalshq/contracts

**Reusable agent module:** [integration guide](../../docs/package-agents/contracts.md)

Shared TypeScript contracts and Zod schemas for Portals channels and capabilities. Import this package to define or validate data; it does not execute capabilities or enforce quotas.

## Use it for

- `ChannelManifestSchema` / `ChannelManifest`: parse `px/v1` channel YAML.
- `CapabilityContractSchema` / `Capability`: describe a runtime capability.
- `CapabilityModule` / `CapabilityRegistry`: validate a channel's configured modules.
- `TenantContext`, `DEFAULT_QUOTAS`, `assignInitialTrust`: model trusted tenant context.
- `ContentDeliveryAdapter`: produce a rated `ContentDescriptor`.

```ts
import { ChannelManifestSchema } from "@portalshq/contracts";

const manifest = ChannelManifestSchema.parse(input);
```

## Important boundaries

- Resolve `TenantContext` from trusted server-side data. Never trust `manifest.tenantId`, trust level, or quotas supplied by a caller.
- `ChannelManifestSchema` validates manifest shape only; it does not resolve capability versions or validate a capability's `config` payload.
- `ContentDescriptor.rating` is required, but legal age-gating and moderation are application responsibilities.
- `DEFAULT_QUOTAS` are starting values, not runtime enforcement.

## Runtime requirements

ESM package; runtime dependency: `zod`.
