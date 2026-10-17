# @portalshq/capability-identity

## 0.2.1

- Implement typed explicit auth-gateway sync with subject matching and clear unsupported-store errors.
- Refresh existing application profiles without inventing required private identity fields;
  provision central profiles while preserving existing suspension, issuer, email, and preferences.
- Bundle the canonical proto in the built package, add configurable proto paths and RPC deadlines,
  preserve gRPC status errors, and close connections idempotently.
- Ship atomic, concurrency-serialized central provisioning and non-destructive legacy upgrades.
  Align preference reads and history conflict keys with the actual central schema.
- Add real gRPC transport, isolated PostgreSQL, sync/error, migration upgrade/rollback, and
  public-export tests. Enforce 95% runtime-source coverage thresholds.
- Document deployment, migrations, the full interface, troubleshooting, and custom-store ownership.
  No bears-live-app migration is performed.

## 0.2.0

### Minor Changes

- bacf537: Promote identity from stub to usable: verified access-token resolution, PostgreSQL-backed cross-channel interaction history stamped with the transaction clock, and bounded identifiers and reads.

## 0.1.3

### Patch Changes

- 749ad63: Standardize public npm publishing and repository metadata for releases through
  GitHub Actions trusted publishing. Remove recursive publish lifecycle hooks.
- Updated dependencies [749ad63]
  - @portalshq/contracts@0.0.5

## 0.1.2

### Patch Changes

- aff6c1d: Standardize public npm publishing and repository metadata for releases through
  GitHub Actions trusted publishing. Remove recursive publish lifecycle hooks.
- Updated dependencies [aff6c1d]
  - @portalshq/contracts@0.0.4

## 0.1.1

### Patch Changes

- 8884dd5: feat: add ESM build infrastructure to all packages
- Updated dependencies [8884dd5]
  - @portalshq/contracts@0.0.3
