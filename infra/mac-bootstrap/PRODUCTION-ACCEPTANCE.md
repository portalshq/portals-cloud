# Production acceptance suite

Status reviewed: 2026-10-18. This is the repeatable release gate for the Mac-
hosted Lore/Auth services and the Vercel/Neon product paths. It combines the
existing focused tests with the live provider drills that cannot be replaced by
mock tests. No gate is considered passed merely because its configuration
exists or its service health endpoint responds.

## Architecture boundaries the tests must follow

- **Lore identity and repository authorization:** Auth Gateway issues the
  credentials; Lore enforces the repository/partition boundary; PX and Lore
  CLI are the actual client interfaces. The application-account magic-link
  session is a separate identity system from Lore/Auth OIDC.
- **Customer invitations:** `frontend/app/api/invitations/route.ts` accepts
  `team_member` and `pilot_room` separately. Today it calls the server-only
  bridge in `frontend/src/lib/backend-api.server.ts`, which requires HTTPS
  `BACKEND_API_URL` and `BACKEND_API_SHARED_SECRET`. The backend checks the
  active actor and target authorization and stores invitations using
  `LEADS_DATABASE_URL` (Neon). The deployed BackendService is an AWS service
  with Cognito/SES permissions; this is not currently a Vercel-only invitation
  path. The route's older comment saying “AWS re-checks” is consistent with
  that deployed boundary, but not proof that the AWS endpoint is configured or
  live.
- **Pilot-room reviewer invitations:** the pilot-room UI also has a separate
  route in `frontend/app/api/pilot/[id]/route.ts` that calls the frontend
  application-account and email code. Test this path if it remains a supported
  customer workflow; do not mistake it for the backend `pilot_room` invitation
  endpoint.
- **Leads and CRM:** the active frontend intake code persists to Neon and
  processes its `lead_outbox`/`crm_outbox`; the Vercel daily cron calls
  `/api/internal/leads/retry`. Separately, `services/backend-service` has a
  `backend_lead_outbox` and a 60-second in-process poll. Its Pulumi component
  is also independently deployable. The `submitLeadToBackend` helper exists,
  but the checked-in frontend route does not call it. Before testing CRM,
  verify which backend and outbox are actually deployed; do not count the
  Vercel daily job and the backend minute poll as the same scheduler.

These are public integration seams: the deployed Auth/Lore protocols and
approved PX binary; the Next.js invitation and lead routes; the backend HTTP
API; the Neon database; the AWS Lore stores; and provider-native backup/restore
interfaces. Unit tests around internal helpers are useful but cannot pass a
live gate.

## Existing tests and what they prove

| Existing check | What it covers | What it does not prove |
| --- | --- | --- |
| `infra/mac-bootstrap/scripts/check-release.mjs` and `check-images.sh` | Local release configuration, image receipts/digests, architecture, and exposed-port constraints | Provider connectivity, successful browser login, live authorization, or restore |
| `scripts/test-auth-key-lifecycle.mjs` | Live API-key issuance, signed JWT/JWKS verification, API-key overlap/rotation/revocation, and cleanup against the local Auth API | ZITADEL browser OIDC, customer PX renewal, or the production 900-second token unless run there with that expectation |
| `scripts/test-oidc-provider.mjs` | OIDC discovery/JWKS contract; optionally Auth `StartAuthSession` PKCE/callback-state smoke | A successful interactive browser login, token claims/lifetime, refresh/replay, key rotation, or audit verification |
| `scripts/test-oidc-browser-acceptance.mjs` | With a dedicated non-admin test user, a real browser callback followed by verified Auth JWT, refresh rotation, replay rejection, and refresh-family revocation | Audit database records, signing-key overlap, PX/Lore network renewal, or repository isolation |
| `scripts/test-network-auth.mjs` plus `probes/auth-profile.example.json` | PX and Lore login, exact subjects, positive reads, reciprocal denial, optional token renewal, and—when enabled—live QUIC endpoint advertisement plus authenticated clone/content-hash evidence | Every Lore RPC, provider-native restore, or OIDC negative callback cases |
| `scripts/test-network-auth-runner.mjs` | Regression tests for test-runner identity isolation, denial classification, and renewal evidence | Any real service; it uses mock clients |
| PX `scripts/test-production-pinggy-px.sh` and `docs/production-pinggy-px-acceptance.md` in `../px` | Temporary resolver/forwarder, TLS/SNI, approved PX login, one allowed repository/entity and selected cross-tenant denials, then cleanup | QUIC, browser OIDC/refresh, all repository RPCs, restore; it has not been run successfully against these production fixtures |
| `frontend` `test:leads`, route, account-auth, processor, and CRM tests | In-process lead/pilot/account behavior, invitation-related helpers, outbox logic, and mocked CRM calls | Production Neon migrations, the deployed `/api/invitations` → BackendService bridge, real email, real Apollo, or the Vercel cron delivery |
| `services/backend-service` `npm test` | TypeScript build, mocked CRM request construction, and a local health endpoint | Live Neon, Cognito, SES, Apollo, invitation authorization, or the deployed scheduler |
| Lore Rust tests and `lore-integration-tests` | Lore implementation tests; the integration README uses local MinIO and DynamoDB-Local | The actual AWS account, its IAM principal/policies, its production resources, or recovery from those resources |
| `scripts/check-external.sh` | Dispatches configured authenticated Auth gRPC, Lore gRPC, QUIC, and tenant-denial commands after TLS checks | The supplied probe commands themselves; a generic health result is not an auth/QUIC result |
| `scripts/backup.sh` and `scripts/recover.sh` | Encrypts recovery-manifest files and validates an isolated recovery target | They do **not** back up or restore Neon rows, Lore S3 objects, DynamoDB tables, or the Auth database/key material |
| `scripts/run-production-regressions.mjs` | One-command execution of the safe local regression set and JSON report | It intentionally does not claim or run the live provider gates |

There is no existing single end-to-end suite for OIDC + AWS + Neon invitations/CRM
and provider restores. This document is the standard suite/run order for those
gaps. The live restore and browser steps stay operator-driven because they
require real accounts and an explicitly isolated target.

`scripts/run-production-regressions.mjs` now runs the safe local regression
subset and emits a machine-readable JSON report. It deliberately removes
provider credentials from its child environment, does not change DNS or
production services, and always reports `productionGatePassed: false`; the eight live
provider gates remain separate and must be evidenced as described below. A
passing local report is not production-readiness approval.

The one-time host/provider inputs for these tests are in
[ACCEPTANCE-ACCESS.md](ACCEPTANCE-ACCESS.md). The complete CI promotion/waiting
procedure and its current limitations are in
[PX/Lore BOM promotion](../../docs/security/px-lore-bom-promotion.md).

### Requested suite status

| Area | Existing executable suite | State now | Production pass requires |
| --- | --- | --- | --- |
| OIDC | `scripts/test-oidc-provider.mjs` plus browser callback | Discovery/JWKS and Auth session-start/invalid-state smoke passed; no successful browser callback | Browser PKCE login, issued token claims and 900-second TTL, refresh rotation + replay rejection, key overlap and audit evidence |
| AWS Lore storage | AWS identity/description checks plus PX/Lore repository test | Workload identity, configured bucket and table descriptions passed read-only | Lore content write/read after restart, explicit unrelated-resource denial, IAM scope review and isolated restore/readback |
| Neon/invitations | `frontend` lead/account-auth tests; deployed Vercel/API route | 244 local tests pass; no live Neon/API invitation flow | Applied migrations on a disposable Neon branch; separate account-team and pilot invitation acceptance, expiry/replay and cross-account denial through the deployed route |
| CRM | Frontend outbox tests and backend `npm test` | Local logic and mocked Apollo contract/health tests pass; no live job | Vercel cron run, Neon outbox completion, one idempotent Apollo projection, retry recovery, and scheduler ownership decision |
| Recovery | `scripts/backup.sh` / `scripts/recover.sh` | Manifest helper only; no provider restore or host-loss drill | Verified Neon/Lore/Auth restore plus host rebuild, reboot/tunnel reconnection, DNS/certificate recovery, and measured RPO/RTO |
| PX + partition security | PX Pinggy acceptance script + `scripts/test-network-auth.mjs` | Mock orchestration passes; PX MCP points to unhealthy local Lore with expired local auth; no production PX run | Exact BOM-approved PX/Lore binaries, two isolated identities/repositories, positive reads, all scoped denials, renewal and cleanup |
| QUIC | `scripts/test-network-auth.mjs` when `quic.required=true` | User supplied UDP host/port, but Lore `EnvironmentGet` has no `storageUrl`; no QUIC request ran | Live UDP route, advertised endpoint, matching SAN, authenticated PX QUIC read/hash and cross-repository denial |

## Release/BOM gate — must pass before client acceptance

The production release branch BOM at commit `3c708d76` records Lore client
`0.8.4-portals.11` but still records PX `0.8.19` and a PX-to-Lore client pin of
`.9`. The September 13 checkpoint (`c3d4ab4b`) promoted PX `0.8.19` with Lore
`.9`; the October 15 Lore release advanced the independent Lore client entry
to `.11`, but no matching PX artifact promotion updated the Cloud BOM. The PX
checkout contains tag `v0.9.8` at `b0cf80bb…`, whose release subject says it
pins Lore `.11`. PX released in its own repository; it does **not** update the
Cloud BOM automatically. Therefore the production BOM is stale and does not
identify a verified PX/Lore pair. The Cloud promotion verifier has not run, so
signed artifact, checksum, and provenance validation remain required. The BOM
comments that still describe v0.5.8 are stale too.

**Recommended solution: pin both products, not one instead of the other.** PX
is the customer-facing binary and its exact behavior/provider support is part
of the test contract. Lore is a separately installed binary dependency and PX
enforces an exact Lore version at runtime. A Lore-only pin cannot identify
which PX binary was tested; a PX-only pin cannot identify its installed Lore
dependency. Pinning a semver minor range is less reproducible and does not
prove which signed artifacts customers received.

The release BOM must therefore contain, for **each** product, the exact
version, source commit, immutable release tag, signed artifact-manifest URL and
digest, signature identity, and per-platform artifact checksums. It must also
assert that `px-client.lore_client_version == lore-client.version` and that the
PX source's `PINNED_LORE_VERSION` equals that same exact Lore version. For the
candidate currently visible in the PX source checkout, the intended pair is
PX `0.9.8` + Lore `0.8.4-portals.11`; do not promote that pair as approved
until the published PX binary's signature/checksum/provenance is verified and
the exact downloaded binary passes this suite. A source tag alone is not
release-artifact evidence. Keep prior verified image digests for rollback,
and promote the client pair atomically in `versions.yaml` after artifact gates
pass.

The current feature-branch checkout of `infra/lore/versions.yaml` is older
again (Lore `.10`, PX `.8.19`, and the old PX source repository name). Its
schema-3 migration embeds the old separate PX receipt in that same YAML file,
marked as historical; because it verifies Lore `.9`, it is deliberately not
valid evidence for the selected `.10` pin. Do not use this feature-branch BOM
as production approval. The release branch and deployed host evidence must be
reconciled before the next promotion.

This is not just a documentation convention: Pulumi's
`assertPublicReleaseApproved` rejects a mismatch between
`px-client.lore_client_version` and `lore-client.version`, and the deployment
entrypoint calls that assertion. The versioning unit test now explicitly
locks this rejection in. The correct release fix is to publish and verify the
PX artifact built with Lore `.11`, then update both exact BOM entries and the
embedded verification evidence atomically; do not change only the Lore pin to make the
manifest appear consistent.

Yes: CI should generate the BOM change, but the PX publisher should not blindly
write to the Cloud release branch. Trusted Cloud CI should independently
verify the published PX artifact and Lore pin, then open a reviewable PR that
changes the BOM and embedded verification evidence together. After review and merge, pull
that merged release branch locally. CI is the repeatable candidate source; it
is not a substitute for review or production approval.

The local `.github/workflows/promote-px-release.yml` is a single central Cloud
workflow that supports manual `workflow_dispatch` and automatic dispatch from
PX's existing signed `cli-release` workflow. PX contains only a short-lived,
single-repository GitHub App dispatch-and-wait step; there is no duplicate BOM
verification workflow in PX. The central workflow verifies artifacts and
opens a review PR; it never auto-merges. YAML parsing and the workflow contract
test pass locally, but these changes are not merged or active in GitHub
Actions, so no automatic dispatch or BOM PR has occurred. Activation requires
merging the central workflow to Cloud's default branch and the intended
release branch, merging the dispatch step to PX's default branch, installing
the scoped App, and setting the documented secrets and release-ref variable.
Do not hand-edit the feature-branch BOM or treat a PX release as a Cloud BOM
update until that activated path succeeds.

## What is ready, and what is not

### Verified in this run (2026-10-18 UTC)

- A fresh restricted status check on `andresb` reported Lore
  `be13e8252160` healthy for 15 hours, Auth Gateway `96a4f5dffb40` healthy for
  23 hours, and Caddy `13b7fbadd017` running for four days. Release preflight
  passed. This verifies service health/pins at that time, not product workflows.
- Through a local SSH-forwarded probe, Auth JWKS and Lore `/health` returned
  HTTP 200 with TLS verification successful; Auth gRPC health was `ok`, and
  Lore gRPC health was `SERVING`.
- ZITADEL discovery/JWKS validation passed (issuer binding, PKCE S256, RS256,
  and unique key IDs). Auth `StartAuthSession` generated the expected client,
  callback, state, nonce, and PKCE challenge; an unknown callback state was
  rejected with HTTP 400. **This is only an OIDC setup smoke test:** no browser
  login or successful callback/token exchange was completed. One isolated
  pending login row was left to expire.
- A prior read-only AWS check using Lore's credentials identified account
  `168692731058` and principal `PortalsLoreServiceUser`; `HeadBucket` and
  `DescribeTable` succeeded for the configured Lore bucket/tables. No object
  write/read/delete, DynamoDB item mutation, least-privilege denial, or restore
  was performed. `AWSOrganizationsReadOnlyAccess` is not needed for Lore
  storage operations and should be removed from that user.
- The local regression runner passed all nine groups at
  `2026-10-18T11:58:20Z`, including 244/244 frontend tests and backend CRM
  contract/health tests. Its report explicitly sets `productionGatePassed`
  false; local fixtures/mocks are not provider evidence.
- Auth image
  `portalshq/auth-gateway@sha256:96a4f5dffb40e22192043ad091e4414a0791408c2f435b98c41ef427f719b162`
  and Lore image
  `portalshq/lore@sha256:be13e82521606050a5dcfaaef2a550af89994ae02d98907b7a7b7f95cff3d9bf`
  are running. The staged Auth candidate passed API-key issue/rotate/revoke
  tests at 60-second TTL. Production reports `AUTH_TTL_CONFIG=900`, but no
  production-issued token lifetime has been measured.

### Still unproven / release-blocking

- **QUIC tunnel/discovery:** the user-entered hostname had a likely typo:
  `...run.pinggy-free-link` does not resolve, while
  `...run.pinggy-free.link` resolves to Pinggy's relay. That DNS result does
  not prove an active UDP mapping or a QUIC handshake. Lore's live
  `EnvironmentGet` has `authUrl` but no `storageUrl`, despite
  `LORE__SERVER__QUIC__ENABLED=true`; PX cannot discover the QUIC endpoint.
  No local DNS override was applied. There is no current TCP Pinggy mapping,
  so the supplied UDP route cannot test browser OIDC or PX gRPC. Public
  `auth.portals.works` and `lore.portals.works` still point at the old ALB name,
  which has no usable address response.
- **PX:** no approved signed PX binary artifact has been reconciled with the
-  artifact verification/BOM promotion and the exact downloaded PX binary has
  not been run against production. PX MCP is configured for local Lore with an
  expired local auth cache; it is not currently a production PX client.
- **OIDC:** no complete browser login, successful callback/token exchange,
  measured 900-second production JWT, refresh rotation/replay rejection,
  signing-key overlap, or audit proof.
- **AWS:** only identity/resource-description checks passed. Still needed:
  real Lore write/read/restart persistence, unrelated-resource denial,
  effective least-privilege review, and isolated S3/DynamoDB restore/readback.
- **Neon/invitations:** local tests pass, but migrations and either invitation
  contract have not been tested on a disposable Neon branch with a controlled
  mailbox. Account-team invitations (`/api/invitations` → BackendService →
  Neon/email) and pilot-room invitations are different paths.
- **CRM:** local frontend and backend mocked tests pass. Still needed: live
  Vercel cron invocation, Neon outbox completion, Apollo idempotency/retry, and
  confirmation of the separate BackendService 60-second poll's ownership.
- **Recovery:** no evidenced Neon, Lore AWS, or Auth DB/key restore; host-loss
  rebuild; reboot/reconnect; or DNS/certificate recovery drill. `backup.sh`
  only stores recovery manifests.
- **DNS override:** I did not edit the client machine's resolver/hosts file.
  There is no current TCP mapping, and changing the shared
  `lore.portals.works` name before separating TCP and QUIC can send both
  protocols to the same relay and disrupt the working route. DNS cannot fix
  Lore's missing advertised `storageUrl` or supply a port. The earlier SSH
  failure used `/bin/sh` before the helper, outside the exact sudoers rule.
  On the next check, executing the helper directly made both `status` and
  `preflight` pass noninteractively. Lore was healthy for 16 hours, Auth for
  24 hours and Caddy running for four days. The fixed gate permits only named
  operations; additional acceptance/deployment commands still need a broader
  service-user execution arrangement as documented in `ACCEPTANCE-ACCESS.md`.

## Standard execution order

Run stages in order and preserve a non-secret evidence packet. Use isolated
test users, a disposable service account/API key, a dedicated customer account
and pilot, two existing test Lore partitions, a Neon branch, and test CRM/email
targets. Never use a customer repository or write test data into a customer's
account. Keep keys, access/refresh tokens, database URLs, signing material,
email links, and provider secrets out of logs and evidence. A failed cleanup is
a failure; revoke the fixture identity and remove local tunnel/resolver state
before retrying.

### 0. Pin the exact release pair

1. Reconcile the release BOM with the signed PX and Lore artifact manifests.
2. Verify PX's published version, Lore dependency version, source commits,
   artifact checksums, signature identity, and platform assets. Test the exact
   downloaded binaries, not only a cargo build or local checkout.
3. Verify `px --version`, `lore --version`, and `loreserver --version` against
   that pair. Archive the sanitized version/digest output.

**Pass:** BOM pair and installed pair are exact; the PX-to-Lore pin agrees.
Otherwise stop before client acceptance or customer onboarding.

### 1. Static, local, and service-readiness checks

From the repository, run the consolidated local-only suite:

```sh
node infra/mac-bootstrap/scripts/run-production-regressions.mjs
```

It emits a JSON report to stdout, runs nine isolated regression groups with
test-only values, and must remain `productionGatePassed: false` until the live
provider tests below each have separate evidence. In this workspace it passed
all nine groups, including 244 frontend tests and backend CRM-contract/health
tests. It does not access provider credentials, alter DNS, or start production
services.

Run Auth Gateway Rust tests and Lore's normal Rust suite from their respective
source directories. Run Lore's documented MinIO/DynamoDB-Local integration
suite separately; label it emulator coverage, never AWS coverage. Then run the
service-account bootstrap/release preflight and verify container digests,
healthy status, Auth discovery, and loopback-only internal ports.

Run `scripts/check-external.sh` only with real authenticated probes configured.
It now uses `curl`'s normal CA and hostname verification rather than
`openssl x509 -checkhost`, which is unavailable in some macOS LibreSSL builds.
Its shell regression test checks both success and fail-closed certificate
failure. A local health check does not pass a later auth or repository gate.

### 2. Auth and OIDC

Use `probes/oidc-browser-profile.example.json` as the nonsecret profile for the
live browser step. Set the exact configured ZITADEL issuer, client ID and
dedicated test user's opaque `sub`. The selected Auth URL must have valid TLS
and a working browser callback. For a temporary Pinggy TCP mapping, first run
the reversible client routing fixture so both browser and this runner reach
`auth.portals.works` through that mapping; connecting the runner to a random
Pinggy hostname alone will not route the browser callback. Run from this
directory after `npm ci`:

```sh
node scripts/test-oidc-browser-acceptance.mjs begin \
  /private/test/oidc-profile.json /private/test/oidc-session.json
# Open only the printed one-time login URL in the controlled browser and sign in.
node scripts/test-oidc-browser-acceptance.mjs finish \
  /private/test/oidc-profile.json /private/test/oidc-session.json \
  /private/test/oidc-report.json
```

The session and report paths must be private, new files. The runner creates
them mode 0600, never writes tokens or refresh credentials, and uses verified
TLS for gRPC and JWKS. It deliberately replays the old refresh credential,
which revokes that test session's family. A failed or expired browser login
requires a fresh `begin` with a new session path. Do not use a customer account
for this test. `node scripts/test-oidc-browser-acceptance-validation.mjs`
checks the runner's security assertions without contacting production.

Auth audit rows still require a separate read-only query against Auth's own
database. Match the fixture subject and test time to `token_issued`,
`refresh_rotated`, replay, and logout outcomes, and report only event names,
outcomes, timestamps and opaque fixture identifiers. The checked-out Auth
source currently emits `token_issued`, `refresh_rotated`, and an unscoped
`logout` row, but does not persist a replay audit row. Record that as an audit
gate failure until the deployed image and database prove otherwise. Signing-key
overlap remains a separate controlled rotation test; this runner does not
rotate a production signing key.

Use a dedicated non-admin OIDC user and the registered production/staging
client. First verify the issuer's discovery metadata and exact callback URI.
Complete browser authorization-code + PKCE/S256. Confirm the callback accepts
only the matching state and nonce and the resulting identity has the expected
issuer, subject, audience, and active account. Repeat negative cases with bad
state, replayed callback, wrong issuer/audience, and expired/invalid code; each
must reject without issuing a session.

Then prove actual JWT properties: verify the issued JWT signature against the
published JWKS, confirm `exp - iat` is 900 seconds in production, renew through
Lore/PX after expiry, confirm the subject is unchanged and the refresh secret
rotated, and replay the old refresh secret to prove family revocation. Exercise
signing-key overlap: publish the new key while the old key remains verifiable
for the documented overlap, issue with the new `kid`, then retire the old key
only after old tokens expire. Confirm audit events for login, issuance,
refresh, replay, revocation, and disabled-user rejection without secrets.

For API-key/JWT mechanics, run
`infra/mac-bootstrap/scripts/test-auth-key-lifecycle.mjs` against an isolated
Auth identity. The staged TTL-60 run is a fast staging test; production must
also issue one real token and prove the configured 900-second lifetime. The
script's earlier stage pass does not prove OIDC.

**Pass evidence:** sanitized subject fixture IDs, issuer/client configuration
version, signing `kid`s, actual TTL, rotation/replay outcomes, audit event
names, UTC time, and Auth image digest. Never include a token, key, code, or
email link.

### 3. Lore/PX authentication and tenant isolation

Start with the standard two-identity network profile:

```sh
node infra/mac-bootstrap/scripts/test-network-auth.mjs \
  /private/path/auth-profile.json /private/path/new-auth-report.json
```

The profile describes two dedicated identities with reciprocal allowed and
denied existing repositories/entities. Supply API keys through the profile's
named environment variables (or use the browser mode), not in the JSON or
command arguments. Enable two 900-second renewal cycles for production. The
runner checks the real cached JWT metadata in memory, requires an expired
prior token and a later renewed token, preserves the exact subject, and repeats
the denial after renewal.

For the client-side Pinggy TCP/SNI/provider fixture, follow the canonical
`../px/docs/production-pinggy-px-acceptance.md` procedure and run
`../px/scripts/test-production-pinggy-px.sh` from the actual PX client machine
with the exact approved binary. Use only the dedicated disposable API key,
expected subject, allowed repository/entity, and independently verified
existing denied repository/entity. Require the script's clean resolver,
forwarder, and PX credential cleanup.

The existing suites check selected repository/list/entity paths; they do not
prove every Lore RPC. Before declaring partition isolation production-ready,
derive the method list from the pinned Lore Auth/Repository service protos and
exercise every repository-scoped read and write with both identities. For each
denied method, prove the target exists under its real owner, the result is an
authorization denial (not transport failure), there is no state change or
information leak, and the audit event records the denial. Keep destructive
write/lock tests on disposable partitions.

**Pass evidence:** exact PX/Lore versions/digests, expected subject fixture
IDs, positive reads/writes, per-RPC deny matrix, renewal cycles, audit markers,
and cleanup status. Do not report the existing mock runner as a live pass.

### 4. QUIC through Pinggy

The active TCP mapping tests only TLS/TCP. It cannot prove UDP or QUIC.
Pinggy's dedicated UDP page says UDP tunnels use Pinggy CLI (beta), print a
`udp://hostname:port`, and may receive a different public port per connection;
a persistent UDP port is a Pro dashboard feature. Its separate multiple-
forwardings page says tunnel types including UDP can be mixed, but its SSH
example demonstrates HTTP/TCP rather than an actual UDP mapping. Because
these pages describe different command surfaces, do not infer that this
account's SSH command or a single session supports UDP. Use the
dashboard/CLI-generated UDP mapping and require it to print a live
`udp://host:port` before testing. See [Pinggy UDP
tunnels](https://pinggy.io/docs/udp_tunnels/) and [Pinggy multiple
forwardings](https://pinggy.io/docs/http_tunnels/multi_port_forwarding/).

For an end-to-end Lore QUIC test, require all of the following:

1. A live Pinggy UDP mapping forwarding to the Mac's Lore UDP listener on
   `127.0.0.1:41337`, with its actual public UDP hostname and port recorded.
2. Lore `EnvironmentGet` advertises the exact `quics://host:port` target. The
   release preflight now requires
   `LORE__ENVIRONMENT__ENDPOINT__STORAGE_URL=quics://$LORE_QUIC_HOST:$LORE_QUIC_PORT`,
   and the live discovery check can verify it. For the supplied test mapping,
   the client-facing TLS hostname remains `lore.portals.works` while the public
   UDP port is `49735`. Save the prior endpoint and restore the real persistent
   production mapping after testing; never leave the expiring test port in the
   production service configuration.
3. `LORE_QUIC_HOST` is the hostname the Lore client will use, and Lore's
   QUIC certificate SAN covers that exact hostname. The Caddy HTTPS
   certificate only proves the TCP/TLS path; Pinggy does not supply Lore's
   end-to-end QUIC certificate.
4. The client connects to the actual UDP public port. DNS only maps a name to
   an address; it cannot translate the port. If the client cannot configure
   the assigned port, use a temporary client-side UDP forwarder on the expected
   port and verify it forwards to the Pinggy UDP host/port. Do not assume a
   TCP forwarder or a `hosts` entry handles UDP.
5. If using temporary local DNS, map the **QUIC hostname** to the Pinggy UDP
   relay's current IP, not to the Mac. Keep the gRPC/TCP name routed separately
   to the TCP relay; DNS does not choose a different IP based on TCP vs UDP.
   Preserve the QUIC SNI/hostname as `LORE_QUIC_HOST` so certificate
   verification remains enabled.
6. Run an authenticated pinned Lore-client QUIC request, verify response and
   identity, then run a cross-partition denial over QUIC. A UDP socket-open or
   datagram echo check is not sufficient. Remove only the marked temporary DNS
   entry/forwarder and confirm cleanup.

**Answer to the local-DNS question:** yes, a temporary test setup can avoid
changing public DNS. A live UDP Pinggy mapping plus a client-side DNS override
is sufficient for *routing* only when the Lore QUIC hostname resolves to the
Pinggy UDP relay, the client sends to that mapping's actual UDP port (or a
verified local UDP forwarder maps the advertised port), and Lore's QUIC
certificate covers the hostname PX sends. DNS alone cannot supply a port or
turn a TCP tunnel into UDP. The existing PX TCP fixture does not create a UDP
forwarder; this current test also needs a fresh TCP route for Auth and gRPC.

For the full two-identity network suite, use
[`scripts/with-client-tunnel-route.sh`](scripts/with-client-tunnel-route.sh)
on the actual macOS PX client. It maps `auth.portals.works` and
`lore.portals.works` to loopback only while the command runs, relays loopback
TCP `443` to the current Pinggy TCP host/port, and relays loopback UDP at
`LORE_QUIC_PORT` to the current Pinggy UDP host/port. Because both protocols
use separate local sockets, a single temporary hosts entry works even when
the two Pinggy relays have different addresses. The QUIC certificate still
must cover `lore.portals.works`, and Lore must advertise
`quics://lore.portals.works:$LORE_QUIC_PORT`. The wrapper removes its marked
entry and both listeners on exit; its privileged helper also detects owner
process loss and removes the entry. It never changes public DNS.

Install the narrowly scoped helper once on the **client Mac**, after reviewing
the checked-out source. `/usr/bin/python3 --version` must succeed. The installed
file and its parent are root owned; the wrapper rejects a symlink or a changed
copy. Run these commands from the Cloud checkout:

```sh
sudo install -o root -g wheel -m 755 \
  infra/mac-bootstrap/scripts/client-tunnel-route.py \
  /Library/PrivilegedHelperTools/com.portals.client-tunnel-route.py
stat -f '%N owner=%Su group=%Sg mode=%Lp' \
  /Library/PrivilegedHelperTools/com.portals.client-tunnel-route.py
```

An administrator can use a cached `sudo -v` timestamp for each run. For a
durable **narrow** grant, edit `/etc/sudoers.d/portals-client-route` with
`visudo` for the exact client account and permit only the root-owned helper:

```sudoers
vibrantceo ALL=(root) NOPASSWD: /usr/bin/python3 -I /Library/PrivilegedHelperTools/com.portals.client-tunnel-route.py *
```

Use the actual client account name if different. The helper accepts only
Pinggy hostnames, numeric ports, and an owner PID; it can bind only loopback
TCP `443` and a specified loopback UDP port, and it can edit only the one
marked Lore/Auth hosts entry. No general root shell or arbitrary script path
is granted. Review the helper again before reinstalling an updated copy.

With the current **live** Pinggy mapping values in a private shell, run:

```sh
export PINGGY_TCP_HOST=__CURRENT_PINGGY_TCP_HOST__
export PINGGY_TCP_PORT=__CURRENT_PINGGY_TCP_PORT__
export PINGGY_UDP_HOST=__CURRENT_PINGGY_UDP_HOST__
export PINGGY_UDP_PORT=__CURRENT_PINGGY_UDP_PORT__
export LORE_QUIC_PORT=__EXACT_PORT_ADVERTISED_BY_LORE__
infra/mac-bootstrap/scripts/with-client-tunnel-route.sh -- \
  node infra/mac-bootstrap/scripts/test-network-auth.mjs \
  /absolute/private/auth-profile.json /absolute/private/new-auth-report.json
```

Set the profile's `remoteUrl` to `grpcs://lore.portals.works`, its
`quic.expectedStorageUrl` to `quics://lore.portals.works:$LORE_QUIC_PORT`
with the actual numeric port, and its `environmentTarget` to
`lore.portals.works:443`. The profile needs real approved binaries, two
existing reciprocal repository fixtures, and disposable credentials supplied
outside arguments and logs. A current TCP/UDP endpoint must remain running
through the suite, including its token-renewal waits. A relay unit test proves
only byte forwarding and cleanup; it does not prove an authenticated QUIC
clone or a denial.

**Current status:** the UDP host and port are known, but relay DNS/reachability,
the advertised storage URL, QUIC certificate SAN, temporary resolver/forwarder,
approved PX/Lore binaries, test identities, and reciprocal fixtures remain
unverified. The gate passes only with an authenticated pinned-client clone,
content checksum, and real denial—not merely an endpoint, DNS entry, or open
UDP socket.

### 5. AWS Lore storage and restore

Use the exact Lore service identity and production resource names from the
deployed config. Do not infer permissions from IAM policy text or from an
AWS console resource listing.

1. Record the non-secret workload principal from `sts:GetCallerIdentity` using
   the same credentials/provider chain the Lore container uses. If this
   cannot be run safely inside the service, run a temporary credential
   inspection container with the same read-only mounted AWS config; do not
   print access keys or session tokens.
2. Verify the effective policy allows only the configured Lore S3 bucket and
   the four exact DynamoDB tables/indexes needed by the pinned release.
   Test an allowed action and an explicit denial against a disposable unrelated
   bucket/table; inspect CloudTrail or the provider's authorization evidence.
   Do not grant Organizations read-only or account administration to Lore.
3. Using Lore itself and a disposable repository, write content, read it back,
   update a branch/metadata value, exercise lock acquire/release, restart Lore,
   and read the same content again. Confirm the expected S3 and DynamoDB
   resources receive the operations and no local `/data` cache is the only
   copy.
4. Restore S3 data and each DynamoDB table into *new isolated resources* using
   versioned objects and the supported DynamoDB backup/PITR/export path. Start
   an isolated Lore instance pointed only at those resources; verify known
   content, revision/branch state, and locks. Destroy only the explicitly
   created isolated resources after the evidence is captured.

**Pass evidence:** principal ARN/account, resource ARNs, allowed/denied action
matrix, Lore read/write IDs, restore timestamp/source point, restored-content
checks, isolation target IDs, and cleanup. No credentials or customer bytes.

### 6. Neon migrations, team invitations, pilot invitations, and CRM

First verify the production Neon database/branch and role without printing its
URL. Apply and verify the ordered `frontend/migrations/*.sql` set using the
documented `frontend` migration command. Prefer a Neon restore/branch for
acceptance; do not test migrations by dropping production tables. Record the
migration filenames and schema checks, not rows containing personal data.

Run separate invitation flows because they grant different scope:

1. **Customer account team:** an active account owner invites a disposable
   member to account A. Accept the emailed one-time link and confirm only
   account A membership is granted. A non-member and a member of account B
   must be unable to invite into A. Confirm duplicate pending request behavior,
   expiry/rejection, one-time token use, audit, and no access to a different
   customer account.
2. **Pilot room:** invite a disposable participant/approver/signer to one
   disposable pilot. Accept and confirm only the intended pilot role plus
   required account membership. Test unauthorized inviter, role escalation,
   expired/replayed token, and cross-pilot denial.
3. Exercise the actual public path: browser session → Vercel `/api/invitations`
   → configured HTTPS BackendService → Neon and email. Confirm 401 without a
   session, no browser exposure of the shared secret, target authorization on
   the backend, email delivery to a controlled mailbox, and cleanup/revocation.
   Separately test the pilot-reviewer path in `/api/pilot/[id]` if it remains a
   supported product flow.

For CRM, create one synthetic lead in staging/Neon with a unique idempotency
key and test-company domain. Verify the lead and outbox record, run the
authenticated Vercel daily retry route, and confirm one CRM projection and a
completed outbox state. Re-run the same event and prove idempotency. In staging,
cause a controlled CRM failure, verify bounded retry/backoff and eventual
recovery, and prove no lost or duplicated contact/deal. Verify Vercel's cron
execution record and the request's `CRON_SECRET` behavior (missing/wrong secret
must return 401). Do not use a real customer or live commercial stage.

Finally inspect deployment state for the competing schedulers/outboxes:

- Vercel `lead_outbox` / `crm_outbox` with the once-daily Vercel cron.
- Backend `backend_lead_outbox` with `services/backend-service/src/index.ts`'s
  60-second poll.

Select and document the one intended owner for each data path. If the
BackendService is deployed but its backend outbox is not in use, disable its
poll before claiming “daily CRM only.” If both paths are in use, prove that they
have distinct events, idempotency keys, and no duplicate Apollo effects.

**Pass evidence:** Neon branch/migration state, invitation type and fixture
IDs, authorization/accept/replay results, mail provider delivery ID, CRM
outbox event ID and CRM record ID (non-sensitive), retry/idempotency results,
Vercel cron run ID, scheduler ownership decision, and cleanup.

### 7. Recovery and reboot drills

Do these in a nonproduction environment before customer onboarding. Declare
approved RPO/RTO targets first and measure them; do not invent successful
recovery evidence from a backup-file checksum.

1. **Neon:** restore the Auth database and application database to separate
   isolated branches from a known point. Verify migrations, login/account
   membership, invitation state, and representative lead/outbox records.
2. **Lore:** perform the isolated AWS restore in stage 5 and test the restored
   service from a client.
3. **Auth secrets:** restore the sealed signing key and pepper from the
   off-Mac vault plus the Auth DB backup. Verify JWKS continuity for the
   expected overlap. Prove the operator can rotate to a new key and recover
   without logging secrets.
4. **Host loss:** rebuild a clean Mac/container host from repository + pinned
   image receipts + encrypted recovery material. Re-provision the same
   workload credentials; start Auth → Lore → Caddy → Pinggy; verify health,
   discovery, gRPC, QUIC, and a PX read. Measure outage and data loss against
   the approved RTO/RPO.
5. **Reboot/reconnect:** reboot the host without automatic login, verify
   Docker/launchd service recovery, both Pinggy mappings, unchanged expected
   names/ports, valid certificates, and client reconnection. Test a forced
   tunnel disconnect as well as a host reboot.
6. **DNS/certificate recovery:** simulate DNS-01 renewal in a controlled
   window, validate Caddy and QUIC cert SANs/chain/expiry, reload services, and
   verify both clients. Confirm recovery of the Cloudflare DNS token from the
   off-Mac vault without putting it in the repository.

`infra/mac-bootstrap/scripts/backup.sh` is currently a manifest-backup helper,
not the data backup for steps 1–3. Until provider-native backups and the above
restore drills pass, recovery is not ready for customers.

## Evidence record and release decision

For each run, create a new mode-600 evidence file outside the repository with
UTC time, operator, environment, exact BOM and image/client digests, sanitized
fixture IDs, test case IDs, pass/fail/blocked state, provider restore-point IDs,
RPO/RTO measurements, and cleanup confirmation. Never record API keys, JWTs,
refresh tokens, OAuth codes, database URLs, signing keys, invitation links,
email addresses, or customer content. Preserve failing sanitized diagnostics.

The release gate is complete only when every applicable stage above passes,
all disposable credentials and records are cleaned up/revoked, and every
provider restore drill has a separate verified evidence record. A blocked
provider/account/fixture is **not a pass**. If the deployment intentionally
keeps the AWS BackendService for invitations while moving only Lore/Auth to
the Mac, document that remaining AWS dependency and test it; do not describe
the whole product as Mac + Vercel + Neon only.
