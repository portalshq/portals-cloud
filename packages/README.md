# Portals packages

Published ESM packages for Portals. Start with the package README below; each documents its public boundary, safe use, and known limits.

## Reusable agent modules

Each package has a small, standalone module in [`../docs/package-agents/`](../docs/package-agents/) with **Load when**, **Use**, and **Do not assume** sections. Link or load the relevant module when another Markdown document needs package-specific guidance; use the package README for the full API and setup details. These modules intentionally sit outside publishable package folders, because release checks reject unlisted package artifacts.

## Choose a package

| Need | Package | Status |
|---|---|---|
| Channel/capability schemas and tenancy types | [`@portalshq/contracts`](./contracts) | usable |
| Register runtime capability implementations | [`@portalshq/registry`](./registry) | usable; in-memory |
| Live-channel tick lifecycle | [`@portalshq/runtime-core`](./runtime-core) | usable |
| Chat, lobby, polls, WebSocket fanout | [`@portalshq/capability-realtime-fanout`](./realtime-fanout) | usable; single process |
| HLS playback, captions, browser/React player | [`@portalshq/capability-video-delivery`](./video-delivery) | usable |
| Server-side Queue Broadcast producer | [`@portalshq/capability-queue-broadcast`](./queue-broadcast) | usable |
| Redirect visitors to a live channel | [`@portalshq/capabilities-redirect`](./capabilities-redirect) | usable; in-memory registry |
| Audience-to-creator payments and entitlements | [`@portalshq/monetization`](./monetization) | usable; requires PostgreSQL + Stripe setup |
| Tenant metering, invoicing, platform B2B Stripe flows | [`@portalshq/platform-billing`](./platform-billing) | usable with operational gaps |
| Shared rake and royalty calculations | [`@portalshq/policy`](./policy) | calculation-only |
| Validate a channel YAML manifest | [`@portalshq/sdk`](./sdk) | partial: validation only |
| PX address interface | [`@portalshq/resolver`](./resolver) | stub |
| Narrative state interface | [`@portalshq/capability-narrative-engine-adapter`](./narrative-engine-adapter) | stub |
| Text/image chapter interface | [`@portalshq/capability-text-image-delivery`](./text-image-delivery) | stub |
| Audience identity interface | [`@portalshq/capability-identity`](./stubs/identity) | stub |

**Stub means every implementation method throws.** It is safe to depend on the exported interfaces, not on the supplied class at runtime.

## Critical limitations

- `realtime-fanout`: `InMemoryFanoutBus` is non-durable and single-process; `Polls.close()` is unimplemented.
- `registry`: resolving without a version uses registration order, not semver.
- `sdk`: `px channel init` and `px channel deploy` only print TODO messages.
- `platform-billing`: `BillingSync` has fixed meter/subscription conventions, unauthenticated OpenMeter reads, and no tests.
- `policy`: royalty calculation has no lineage producer or payout integration.

## Release

Run from the repository root:

```sh
npm run changeset
npm run release:build && npm run release:check
```

Commit the generated changeset. The release workflow publishes after the generated release PR is merged. See [the release guide](../docs/npm-package-releases.md) for trusted-publishing setup and recovery.
