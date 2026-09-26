# Portals npm packages

Public packages under this directory release through GitHub Actions using npm
trusted publishing. Run these commands from the repository root.

One-time setup (Node 24, npm 11.15.0 or newer, npm maintainer access and 2FA):

```sh
npm login
npm run release:trust
npm run release:trust -- --apply
```

For each release, run `npm run changeset` and commit the changeset with your
code. After merging to `main`, review and merge the generated release PR.
GitHub Actions builds, tests, checks tarballs, and publishes the new versions.

Check locally without publishing:

```sh
npm run release:build && npm run release:check
```

See [the release guide](../docs/npm-package-releases.md) for exact trust values,
new package setup, manual retries, and troubleshooting.

## Package inventory

Status is judged on **implemented code**, not on whether a package is used inside
this repository — these ship to external developers, so internal import count
says nothing about whether a package is real or complete.

| Package | Ver | Src | Test | Status | Purpose |
|---|---|---|---|---|---|
| `@portalshq/monetization` | 0.2.0 | 1176 | 421 | full | Audience-to-creator money: Connect destination charges, ledger, outbox, tenant-configured entitlements |
| `@portalshq/policy` | 0.0.5 | 151 | 0 | full | Rake rates and lineage royalty splits. Pure, zero dependencies |
| `@portalshq/platform-billing` | 0.0.5 | 546 | 0 | full | Tenant infrastructure billing: OpenMeter emit → Lago pricing |
| `@portalshq/contracts` | 0.0.5 | 393 | 0 | full | Zod schemas, tenancy and capability types, `CapabilityRegistry` |
| `@portalshq/capability-video-delivery` | 0.1.8 | 1305 | 703 | full | HLS live delivery, playback controller, captions, programming pipeline |
| `@portalshq/capability-queue-broadcast` | 0.1.9 | 782 | 395 | full | Queue Broadcast client, content pipeline, RTMP streamer |
| `@portalshq/capability-realtime-fanout` | 0.1.8 | 444 | 312 | one gap | Chat, polls, lobby on an in-memory bus. `Polls.close()` throws — see gaps below |
| `@portalshq/runtime-core` | 0.0.9 | 396 | 113 | full | Lazy-start `RealtimeEngine` per channel, `TimeCounter` tick context |
| `@portalshq/capabilities-redirect` | 0.0.5 | 69 | 0 | full, undocumented | Express 302 middleware to the live channel |
| `@portalshq/registry` | 0.0.5 | 45 | 0 | incomplete | In-memory capability registry. `latest()` is insertion order, not semver |
| `@portalshq/sdk` | 0.0.5 | 48 | 0 | **partial** | `px` CLI. `channel validate` works; `init` and `deploy` are `console.log("TODO")` |
| `@portalshq/capability-identity` | 0.1.3 | 30 | 0 | **stub** | Cross-channel `IdentityProvider`. All three methods throw |
| `@portalshq/capability-text-image-delivery` | 0.1.3 | 25 | 0 | **stub** | `ChapterFeed` interface. Both methods throw |
| `@portalshq/capability-narrative-engine-adapter` | 0.1.3 | 41 | 0 | **stub** | Narrative Engine v0 adapter. Every method throws |
| `@portalshq/resolver` | 0.0.5 | 41 | 0 | **stub** | PX v0 client interface. Every method throws |

## Stubs

A stub exports an interface whose methods throw. It typechecks, so an
application can compile against it and discover at runtime that nothing works.
Do not build against a stub without checking its source.

The four stubs above are all 0.1.x or 0.0.5, publishable, and carry descriptions
that read as delivered capabilities rather than placeholders. `sdk` is partial in
the same way: two of its three commands are `console.log` calls.

## Known gaps

- `realtime-fanout` — `Polls.close()` throws `"tally aggregation not yet
  implemented"`. Voting works; closing a poll and persisting its tally does not.
- `registry` — `latest()` takes insertion order with an explicit
  `TODO: real semver comparison`, so `resolve(id)` without an explicit version
  does not return the highest version. A second, incompatible
  `CapabilityRegistry` also exists in `contracts/src/capabilities.ts`.
- `resolver` — `dist/` holds an orphaned `nap-resolver-adapter.{js,d.ts}` with no
  corresponding `src/` file and no export from `src/index.ts`. Its build script
  lacks the `rm -rf dist` the other packages use, so the stale artifact
  persists.
- `policy` — `LineageEntry` has no producer. `contracts` has no lineage model and
  `stripeAccountId` is not yet a `CapabilityContract` field, so royalty splits
  cannot run end to end.
- `platform-billing` — no tests. `BillingSync` hardcodes its meter list and the
  `px-developer-base` subscription id, and its OpenMeter call is unauthenticated.
- `policy`, `contracts`, `registry`, `capabilities-redirect`, `sdk` — no tests.

## Naming and versioning

`0.0.5` marks a package with no test coverage. Every package at `0.1.x` has real
tests. The billing packages were reorganised in 0.2.0 / 0.0.5; see
[ADR 0009](../docs/architecture-decision-records/0009-billing-package-boundaries.md).
