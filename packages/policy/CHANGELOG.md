# @portalshq/policy

## 0.0.5

### Patch Changes

- Renamed from `@portalshq/billing-marketplace` and made standalone rather than a
  subpath of the monetization package, so the invoicing side can read the same
  rate table without depending on the money package.
  See
  [ADR 0009](../../docs/architecture-decision-records/0009-billing-package-boundaries.md).
- Moved `StripeConnectClient` to `@portalshq/monetization`, leaving this package
  pure: no I/O, no Stripe transport.
- Exported `PLATFORM_RAKE_RATES` so `@portalshq/platform-billing` can report a
  tenant's rake liability against the same rates the payout side charges.
- Dropped the unused `@portalshq/contracts` dependency; it was declared but never
  imported.

## 0.0.4

### Patch Changes

- 749ad63: Standardize public npm publishing and repository metadata for releases through
  GitHub Actions trusted publishing. Remove recursive publish lifecycle hooks.
