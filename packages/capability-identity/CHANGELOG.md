# @portalshq/capability-identity

## 0.6.0

### Minor Changes

- d1f3933: Add same-tab sign-in and user-chosen display names to the auth-gateway client.

  - `startAuthSession` accepts an optional `postLoginRedirectUri`: when the gateway's `AUTH_LOGIN_REDIRECT_ALLOWLIST` covers its origin, the hosted login sends the browser back to that URI with `session_code`/`state` handoff params instead of an interstitial HTML page, so apps can sign in without a popup or polling loop.
  - `setUserDisplayName(userToken, displayName)` sets the caller's chat-visible name. Cosmetic only: the gateway rejects email-shaped values and account names, and allows setting it exactly once. IdP-derived names (profile name, email, login name) are no longer written as display names.

## 0.5.1

### Patch Changes

- Republish 0.5.0 guest identity primitives; prior 0.5.0 publish was left staged on the registry and could not be completed.

## 0.5.0

### Minor Changes

- 7d2b24d: Add guest trial support: `guest-token.ts` (HMAC `gt1.` token mint/verify/header extraction), `GuestUsageStore` (durable per-app vote/reaction caps and upgrade claims), `SignupBonusStore` (once-ever welcome-bonus claims), and `IdentityProvider.resolveActor` returning a user-or-guest discriminated union.

## 0.4.0

- Expose the hosted sign-in session RPCs on `createAuthGatewayClient`:
  `startAuthSession` returns the `loginUrl` and `sessionCode` to poll,
  `getAuthSession` resolves `null` while sign-in is pending and the minted
  `AuthSessionTokens` (user token, expiry, rotating `refreshToken`) once the
  viewer completes it, `refreshAuthSession` rotates the refresh credential for
  a new user token, and `revokeAuthSession` ends the session family. Refresh
  and revoke carry the credential in `authorization` metadata per the RPC
  contract. No auth-gateway changes are required — the service already
  implements these methods.

## 0.3.0

### Minor Changes

- 31b4bb6: Promote identity from stub to usable: verified access-token resolution, PostgreSQL-backed cross-channel interaction history stamped with the transaction clock, and bounded identifiers and reads.

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
