# Short-lived Auth / Lore / PX release

## Contract implemented in source

- Auth access JWTs default to 900 seconds. `AUTH_ACCESS_TOKEN_TTL_SECONDS`
  accepts integer values 60–3600; startup rejects everything else. Repository
  authorization JWTs retain their five-minute lifetime.
- Browser and API-key exchanges issue rotating refresh credentials. Migration
  `007_bound_refresh_sessions.sql` adds a nullable originating API-key reference;
  old browser rows remain compatible. Existing API-key clients must log in once
  after upgrading to obtain a refresh credential.
- Refresh families expire no later than 30 days from initial issuance. Successor
  credentials retain the earliest family expiry, including preexisting families.
  API-key families are additionally capped at the originating key's expiry.
- Refresh checks the active principal and originating key's expiry, revocation,
  and rotation overlap. Replacement keys do not inherit old refresh sessions.
  Replay revokes the family; PostgreSQL advisory locks serialize family rotation.
- Refreshed service-account JWTs retain their service-account classification.
  New service-account JWTs carry the optional `originating_key_id` claim, also
  retained in derived repository JWTs. Online Auth authorization exchanges check
  that key's current eligibility. Existing JWTs without this claim remain
  compatible during their expiration window; offline verification is unchanged.
  Storage failures return unavailable rather than pretending credentials are bad.
  Issuance, refresh success, rejection, and replay produce credential-free audit
  events. Rejection events intentionally omit an untrusted subject.
- Lore's shared repository/custom-resource authentication path renews within
  60 seconds of expiry. It takes a per-endpoint/identity cross-process lock,
  rereads credentials, bounds lock waiting at 15 seconds and refresh at 10 seconds,
  checks the returned identity/recipient/expiry, and saves the encrypted pair in
  one locked, atomic file replacement. No original API key is retained.
- Authentication rejection removes the local identity and its scoped credentials;
  transient failure retains them. An uncertain refresh request is not retried
  automatically. A persistent SHA-256 attempt marker blocks replay even after
  process restart. Known pre-dispatch connection failures clear the marker and
  remain retryable; uncertain responses/timeouts retain it and may require a new
  login. Refresh providers have a default-conservative Rust outcome method;
  the gRPC provider distinguishes connection establishment from request dispatch.
- Automatic identity selection fails closed when multiple identities are stored;
  select `lore --identity SUBJECT ...` or log out of unrelated accounts. Renewal must
  never silently switch accounts. Logout clears locally even if remote family
  revocation fails, but reports that remote failure.
- A fresh client with no token-map file has an empty identity store, not a
  storage failure. Malformed, unreadable, or non-regular stores still fail;
  renewal must not disguise damaged credentials as a logged-out session.

The current Lore JWT verification policy still applies; this work does not
introduce instantaneous revocation of every offline-verified access JWT.
Previously issued eight-hour JWTs retain their original expiration. Key rotation
and API-key rotation are different mechanisms; test both independently.

## PX compatibility

PX delegates login/logout to Lore and uses `PXLORE_CLI` to select its binary.
No second token store or refresh implementation is added to PX. The reviewed
HTTP path performs authenticated repository/manifest operations before selecting
a repository-, identity-, domain-, and expiry-scoped token from Lore's cache.
Existing PX CLI delegation and HTTP token-selection unit tests pass on the
proposed 0.9.8 source. PR #2 pins the verified Lore `.11` client/server release,
adds a regression test for rejecting Lore `.9`, and isolates the local-provider
test from host-installed Lore binaries. PR #2 merged to `main` as
`b0cf80bb6d32596b3c9b6dde1c6e36ba2f11fe44`; post-merge CI is green. The PX
`v0.9.8` release tag and signed artifacts are the remaining PX release steps.

Lore must advertise `LORE__ENVIRONMENT__ENDPOINT__AUTH_URL` as
`ucs-auth://auth.portals.works` for this production deployment. The template and
release validator enforce discovery, not just JWKS verification. An external
test must confirm the actual environment response; a configured line alone does
not prove the service loaded it. Normal clients must reach certificate-valid
hostnames without manual grpcurl-only SNI overrides.

## Verification and deployment gates

Run Auth unit tests and the ignored PostgreSQL tests against a **disposable**
database only. The latter mutate fixtures and apply migrations; never point
`AUTH_GATEWAY_TEST_DATABASE_URL` at production. They cover 90-day issuance and
rotation, refresh replay/expiry, unchanged family expiry, key binding, expiry,
revocation, rotation overlap/replacement, and disabled accounts.

Lore credential/transport unit tests and the `auth_exchange` integration target
must pass. Its ignored `renewal_serializes_and_preserves_identity` test requires
a dedicated `LORE_AUTH_PATH` containing `portals-renewal-test` and explicit
nonproduction fallback settings. That mock-provider regression is not permission
to enable fallback in staging or production. Production acceptance uses the
secure keychain and strict security mode.

Use the [network acceptance suite](probes/NETWORK-AUTH.md) with both browser-user
and service-account fixtures. Run two 60-second cycles on isolated staging and
then two 900-second cycles on the intended production configuration. Also prove
remote revocation, replay, signing-key overlap, gRPC/QUIC expiry/reconnect,
Auth outages, all required repository RPC denials, and recovery drills. None is
satisfied by mock results, health probes, or merely waiting for time to pass.

Release order:

1. Stage the additive Auth migration and new server behavior with new clients.
2. Publish new immutable signed/scanned Auth and Lore artifacts through their
   existing release gates. Do not reuse the current Lore tag or edit protected
   verification receipts manually. Keep a migration-compatible rollback image.
3. Promote verified artifacts and complete client/network acceptance. The old
   running Auth image does not implement the new TTL setting or bound refresh.
4. Roll out required clients and Auth together, configure 900 seconds, and have
   existing API-key clients log in once. Keep DNS unchanged until routing passes.
5. Monitor refresh rejection/replay and unavailable errors. Never automatically
   revert to eight-hour JWTs to conceal renewal failures.

Source implementation and local regressions do **not** mean these new artifacts
have been published, migrations applied to production, or live acceptance passed.

## Follow-up — October 15, 2026

- The signed Lore CLI/server release `.11` passed its source build, tests, and
  six platform builds. Release evidence is recorded above in
  `RELEASE-20261014.md`.
- PX workspace pin update is on
  [PR #2](https://github.com/portalshq/px/pull/2), branch
  `codex/lore-client-0-8-4-portals-11`, PX version `0.9.8`. Full applicable Rust
  workspace tests, formatting, Clippy, and repository pre-commit checks passed
  locally. GitHub CI was still running when this note was written. Merge and
  signed PX release are required before production PX clients can be updated.
- Lore Docker server image `.11` build/sign/scan/promotion is running as
  [workflow run 38734756141](https://github.com/portalshq/portals-cloud/actions/runs/38734756141).
  The BOM image digest remains `.10` until the workflow completes and its
  verified receipt is promoted.
- Tag `v0.8.4-portals.11` also matched the legacy ECR image-release workflow.
  That run was canceled while AWS credential configuration was still pending;
  no AWS image-publish step ran and no services were deployed. A workflow guard
  was committed and pushed to the release branch to skip ECR for future
  `*-portals.*` tags. The already-created `.11` tag points to the prior guarded
  commit, so it was canceled manually. Docker Hub remains the intended image
  registry.
- No running Mac service has been updated. Live token refresh, PX login/renewal,
  cross-repository denial, QUIC, and recovery acceptance remain outstanding.

## Live deployment check — October 15, 2026

- Read-only SSH inventory confirms three healthy containers: Auth Gateway,
  Caddy, and Lore. Lore currently runs image digest
  `sha256:d204cee28f0966017f9622822b235e5630bdd6163ffbbc9d70c1bed2ff8fe4e4`
  and reports `0.8.4-portals.10`; Auth runs
  `sha256:7d1c6a95654679990d609f3979710267f7270fec8b2634e626cdadbb2cebd6a2`.
  This Auth image predates the promoted 15-minute-token image
  `sha256:96a4f5dffb40e22192043ad091e4414a0791408c2f435b98c41ef427f719b162`.
- The Lore `.11` Docker Hub image is now verified and promoted in the BOM as
  `portalshq/lore@sha256:be13e82521606050a5dcfaaef2a550af89994ae02d98907b7a7b7f95cff3d9bf`.
  Its signed workflow run `38734756141` binds source `55c7ae4` and packaging
  commit `3c708d7`; its AMD64 image has SBOM/provenance and Trivy 0.76.0 reports
  zero HIGH/CRITICAL findings. The GitHub artifact hash matched its published
  digest before the generated BOM/receipt were imported.
- PX PR #2 merged as `b0cf80bb6d32596b3c9b6dde1c6e36ba2f11fe44`; its post-merge
  CI passed. I created and pushed annotated tag `v0.9.8` on that exact commit.
  The signed multi-platform release workflow is running. One separate TypeScript
  package-publish job failed because it attempted to republish existing version
  `0.9.6`; this does not fail the CLI binary workflow, which remains a required
  release gate.
- No service was changed. Auth and Lore must be upgraded together with the
  matching client release to avoid introducing short-lived access tokens before
  clients can renew them. SSH command, output, and exit status are in ignored
  `ssh-activity.log`.

## Promotion evidence — October 15, 2026

- Lore server image release: workflow `38734756141` succeeded. Image digest
  `sha256:be13e82521606050a5dcfaaef2a550af89994ae02d98907b7a7b7f95cff3d9bf`
  is for Linux/AMD64; platform digest is
  `sha256:caef2a571801a1aee233870ec943e9703f282d3d283d568de6771d300eaf32cd`.
  The workflow verified the GitHub OIDC signature/transparency record and
  source-bound provenance, attached SBOM/provenance, ran Trivy 0.76.0 with zero
  HIGH/CRITICAL findings, and confirmed the server reports the expected `.11`
  version. The uploaded artifact ZIP SHA-256
  `4c9ca0b39f4cb652e49317efe02aaaeb13c9d11d986339a07530a79092d28e26` matched
  GitHub's artifact digest. The repository BOM and image receipt now contain
  this workflow-generated evidence.
- Auth image remains promoted at
  `portalshq/auth-gateway@sha256:96a4f5dffb40e22192043ad091e4414a0791408c2f435b98c41ef427f719b162`,
  from source `f099892b`; it contains the configurable 900-second access-token
  default and refresh-key changes. It is **not yet deployed** on the Mac.
- PX tag `v0.9.8` points to merged commit
  `b0cf80bb6d32596b3c9b6dde1c6e36ba2f11fe44`. CLI release workflow
  `38740565092` and its five-platform builds must all succeed before client
  binaries are treated as published. Auxiliary npm package publication is a
  separate workflow; the failed TypeScript publish of already-existing `0.9.6`
  is not evidence that CLI binaries failed.
- Promotion tooling dependency audit during the Lore workflow reported five
  HIGH advisories in transitive `infra/pulumi` npm packages; `npm audit --omit=dev`
  confirms fixes are available. These packages are not in the Lore image, whose
  Trivy scan is clean, but the workflow toolchain should be updated and its
  release path revalidated before treating supply-chain hygiene as fully clear.

## Safe production change process

This rollout changes Auth token behavior and the client/server version contract.
Do not deploy Auth's 900-second token setting ahead of token-renewal-capable
clients. Existing eight-hour tokens remain valid only until their own expiry;
that is not evidence of renewal. The rollout is a short, controlled maintenance
window, not a zero-downtime promise for a single Mac host.

### Before changing production

1. Freeze and record the exact current image digests, container health, listener
   routes, Auth database identity, Auth migration version, and current backup
   point. Confirm a restorable Neon backup/branch for the dedicated Auth DB and
   a tested rollback of the current Compose file and private release settings.
   Never print database URLs, private keys, API-key peppers, or credentials.
2. Promote only immutable digests from successful signed workflows. Verify each
   source commit, workflow identity, platform, provenance/SBOM, vulnerability
   scan, and release checksum; then update the checked-in BOM using the existing
   promotion tooling. Keep the previous image digests and additive database
   migration in place for rollback. Do not rotate signing keys in this rollout.
3. In isolated staging, deploy the exact Auth, Lore, and PX releases with a
   disposable Auth database branch and `AUTH_ACCESS_TOKEN_TTL_SECONDS=60`.
   Pass browser login, API-key login/re-login, two refresh cycles, process
   restart, concurrent renewal, replay rejection, disabled/revoked identity,
   Auth outage, gRPC/QUIC reconnect, and reciprocal repository-denial checks.
   Confirm logs/evidence contain no credentials. A health check or mock renewal
   test is not this gate.
4. Confirm the supported PX `.9.8` package is published and available to the
   operator/customer cohort; inventory older PX/Lore clients and arrange a
   maintenance window plus re-login instructions for API-key clients. Do not
   promise uninterrupted use to clients that cannot be updated or re-authenticated.

### Production change window

1. Announce the brief interruption; stop new client onboarding and freeze DNS,
   Pinggy mappings, database credentials, signing keys, and unrelated deploys.
   Record baseline health and the selected rollback digests.
2. Take and verify the Auth database recovery point. Apply only the additive
   Auth migration through the new Auth release; verify the expected migration
   version and Auth DB connection before routing traffic. Do not restore or
   migrate application/lead data as part of this change.
3. Deploy Lore server `.11` by digest while Auth still uses the old token
   lifetime. Verify Lore health, advertised Auth endpoint, storage access,
   gRPC/QUIC, and host volume mounts. Confirm PX `.9.8` can use it before
   continuing. Keep the previous `.10` image available for rollback.
4. Deploy the verified Auth image by digest with the configured 900-second
   lifetime only after staging and client readiness gates pass. Verify JWKS,
   login, actual `exp - iat = 900`, refresh and refresh-token rotation, family
   replay revocation, audit events, and database health. Existing API-key
   clients must log in once to obtain key-bound refresh credentials.
5. Run the full external acceptance suite from a separate client: browser and
   PX service identities, two renewal cycles, process restart, concurrent
   operations, expired/revoked/disabled identity denial, cross-repository
   denial on every protected RPC, gRPC and QUIC reconnect, Auth outage, public
   TLS/SNI, and recovery probes. Capture sanitized machine-readable evidence.
6. Hold the release for observation. Recheck container restarts, Auth refresh
   rejection/replay/unavailable events, database connections, and client
   identity consistency before onboarding or widening access.

### Abort and rollback

- If a preflight, migration, image signature/scan, health check, or positive and
  negative authorization test fails, do not switch traffic or continue. Keep the
  old service set live where possible and preserve diagnostics without secrets.
- If the new service fails after cutover, return traffic to the last known-good
  route and image only after confirming that the rollback client/server/Auth
  combination is compatible. Keep the additive migration; do not reverse it or
  restore the database merely to roll back application code.
- Never silently restore eight-hour token issuance to mask refresh failures.
  Prefer pausing onboarding and requiring affected clients to log in again. Any
  temporary lifetime adjustment must remain within the Auth-supported
  60–3600-second range and be a deliberate, recorded operator decision.
- Do not declare completion until production evidence proves both successful
  renewal and cross-repository denial. If the single Mac or tunnel is lost,
  follow the separate host-recovery runbook; this change does not make the host
  highly available.

## Safe production change process

This rollout changes Auth token behavior and the client/server version contract.
Do not deploy Auth's 900-second token setting ahead of token-renewal-capable
clients. Existing eight-hour tokens remain valid only until their own expiry;
that is not evidence of renewal. The rollout is a short, controlled maintenance
window, not a zero-downtime promise for a single Mac host.

### Before changing production

1. Freeze and record the exact current image digests, container health, listener
   routes, Auth database identity, Auth migration version, and current backup
   point. Confirm a restorable Neon backup/branch for the dedicated Auth DB and
   a tested rollback of the current Compose file and private release settings.
   Never print database URLs, private keys, API-key peppers, or credentials.
2. Promote only immutable digests from successful signed workflows. Verify each
   source commit, workflow identity, platform, provenance/SBOM, vulnerability
   scan, and release checksum; then update the checked-in BOM using the existing
   promotion tooling. Keep the previous image digests and additive database
   migration in place for rollback. Do not rotate signing keys in this rollout.
3. In isolated staging, deploy the exact Auth, Lore, and PX releases with a
   disposable Auth database branch and `AUTH_ACCESS_TOKEN_TTL_SECONDS=60`.
   Pass browser login, API-key login/re-login, two refresh cycles, process
   restart, concurrent renewal, replay rejection, disabled/revoked identity,
   Auth outage, gRPC/QUIC reconnect, and reciprocal repository-denial checks.
   Confirm logs/evidence contain no credentials. A health check or mock renewal
   test is not this gate.
4. Confirm the supported PX `.9.8` package is published and available to the
   operator/customer cohort; inventory older PX/Lore clients and arrange a
   maintenance window plus re-login instructions for API-key clients. Do not
   promise uninterrupted use to clients that cannot be updated or re-authenticated.

### Production change window

1. Announce the brief interruption; stop new client onboarding and freeze DNS,
   Pinggy mappings, database credentials, signing keys, and unrelated deploys.
   Record baseline health and the selected rollback digests.
2. Take and verify the Auth database recovery point. Apply only the additive
   Auth migration through the new Auth release; verify the expected migration
   version and Auth DB connection before routing traffic. Do not restore or
   migrate application/lead data as part of this change.
3. Deploy Lore server `.11` by digest while Auth still uses the old token
   lifetime. Verify Lore health, advertised Auth endpoint, storage access,
   gRPC/QUIC, and host volume mounts. Confirm PX `.9.8` can use it before
   continuing. Keep the previous `.10` image available for rollback.
4. Deploy the verified Auth image by digest with the configured 900-second
   lifetime only after staging and client readiness gates pass. Verify JWKS,
   login, actual `exp - iat = 900`, refresh and refresh-token rotation, family
   replay revocation, audit events, and database health. Existing API-key
   clients must log in once to obtain key-bound refresh credentials.
5. Run the full external acceptance suite from a separate client: browser and
   PX service identities, two renewal cycles, process restart, concurrent
   operations, expired/revoked/disabled identity denial, cross-repository
   denial on every protected RPC, gRPC and QUIC reconnect, Auth outage, public
   TLS/SNI, and recovery probes. Capture sanitized machine-readable evidence.
6. Hold the release for observation. Recheck container restarts, Auth refresh
   rejection/replay/unavailable events, database connections, and client
   identity consistency before onboarding or widening access.

### Abort and rollback

- If a preflight, migration, image signature/scan, health check, or positive and
  negative authorization test fails, do not switch traffic or continue. Keep the
  old service set live where possible and preserve diagnostics without secrets.
- If the new service fails after cutover, return traffic to the last known-good
  route and image only after confirming that the rollback client/server/Auth
  combination is compatible. Keep the additive migration; do not reverse it or
  restore the database merely to roll back application code.
- Never silently restore eight-hour token issuance to mask refresh failures.
  Prefer pausing onboarding and requiring affected clients to log in again. Any
  temporary lifetime adjustment must remain within the Auth-supported
  60–3600-second range and be a deliberate, recorded operator decision.
- Do not declare completion until production evidence proves both successful
  renewal and cross-repository denial. If the single Mac or tunnel is lost,
  follow the separate host-recovery runbook; this change does not make the host
  highly available.

## Implementation verification — October 14, 2026

- Complete Auth test suite: 13 passed, including all three real PostgreSQL
  integration tests on an isolated disposable database; none skipped in that run.
- Lore credential/transport unit suites: 17 and 21 passed; journal reopen/replay
  protection is tested. Bounded lock tests pass, including child-process
  exclusion and release. The mock-provider renewal integration exercises
  concurrent callers, recipient boundaries, rejection, retained credentials,
  malformed/missing refresh responses, timeout handling, unsent retry, and
  prevention of replay after an uncertain outcome. All nine integration-target
  tests passed in the final isolated run.
- PX source 0.9.7: three CLI delegation tests and the scoped HTTP-credential
  selection regression passed. No PX source or release pins were changed.
- Deployment contracts and network-suite runner regression tests passed. The
  runner rejects renewal evidence without matching actual JWT lifetime metadata.
- A Lore CLI development build check passed; it is not a signed release build.
  Protected Lore receipts and all promoted image pins remain unchanged.
- No production migration, image rollout, DNS cutover, or live browser/QUIC
  renewal acceptance was performed. The prescribed Lore release gate requires
  a clean release checkout and at least 12 GiB free. Verification temporarily
  reduced free space; removing only generated Lore debug artifacts recovered
  13.7 GiB and left about 14 GiB free. Source and release artifacts were not
  removed. New verified releases and real network fixture/provider evidence
  remain release blockers.
