# PX production-tunnel acceptance gate

Use this gate to test the approved PX and Lore clients against the running
Auth/Lore services on `andresb` through an active Pinggy raw-TCP tunnel. It is
staging/release verification, not a substitute for unit tests and not an
unattended CI job.

## Why this fixture is needed

PX's provider config supplies the initial Lore RPC address. Lore's environment
response advertises dependent endpoints such as Auth. Therefore PX must first
reach Lore before it can discover which Auth endpoint to use.

Production routing and the wildcard certificate use `lore.portals.works` and
`auth.portals.works`. The Pinggy TCP address has a Pinggy-owned hostname and a
temporary high port. Using that hostname directly causes the client to send the
wrong TLS server name; the certificate and Caddy route expect the Portals
hostname. A DNS name override alone is also insufficient because DNS does not
translate ports. The PX client needs a temporary local resolver override and a
raw-TCP forwarder from its loopback port 443 to the current Pinggy
hostname/port. TLS bytes and SNI pass through unchanged to Caddy; certificate
verification remains enabled.

## Canonical test fixture

The executable fixture and full operator procedure live in the PX repository:

- [`scripts/test-production-pinggy-px.sh`](https://github.com/portalshq/px/blob/main/scripts/test-production-pinggy-px.sh)
- [`docs/production-pinggy-px-acceptance.md`](https://github.com/portalshq/px/blob/main/docs/production-pinggy-px-acceptance.md)

It creates an isolated temporary PX directory and Lore auth-token directory,
adds a marked `/etc/hosts` mapping for only the duration of the test, forwards
loopback TCP `443` to the current Pinggy endpoint with a temporary Node.js
forwarder, and removes those local
changes at exit. It runs distinct suites for (1) Auth JWKS and Lore
`/health_check` TLS/transport, (2) PX API-key authentication through the
`portals-cloud` provider and expected identity, (3) allowed repository/entity reads and
cross-tenant denial for both repository listing and entity resolution, and
(4) logout/cleanup. It does not alter public DNS or
the regular PX provider configuration. The resolver override affects all
applications on the PX client Mac while active; avoid normal production use
from that Mac until the script cleans up. Never bypass TLS verification.

The operator must provide the current Pinggy endpoint and version pins from
the approved BOM (currently PX `0.9.8`, Lore `0.8.4-portals.11`), plus a dedicated production-test identity, a known-readable fixture
repository and entity URI, and a separately known existing repository and
entity URI in another tenant. Use a disposable API key; do not place it in
command arguments, chat, a log, or the repository. The script also requires the explicit
`PX_TEST_CONFIRM_LIVE_PRODUCTION=yes` guard. Revoke the key after the run,
including when the script reports a cleanup warning. The fixture removes its
temporary client-side map and forwarder; stop the host-side Pinggy session
separately after evidence capture because it is operator-managed, not created
by the PX client fixture.

No key is pre-created by this deployment. An Auth administrator issues a
one-day key through the internal-only `127.0.0.1:8086/v1/api-keys` endpoint
using `INTERNAL_ADMIN_TOKEN` from the protected Auth configuration. The JSON
request is `{ "service_account_id": "px-acceptance-<unique-id>",
"display_name": "PX live acceptance", "lifetime_days": 1 }`. The response's
`api_key` is returned once; keep it only in the private PX test environment
file, never in this repository, logs, or chat. The service currently has no
read-only relationship: `collaborator` grants read and write. Use a disposable
non-customer repository, get its existing owner to authorize the fixture
principal, and grant no relationship to the known-existing denied repository.
After testing, revoke the key and disable the principal using the internal
Auth API. Port 8086 must never be forwarded through Pinggy.

## Required order in the deployment cycle

1. Start or update Auth, Caddy, and Lore locally, then verify their local
   health, Caddy routes, and certificate.
2. Start the Pinggy raw-TCP mapping to Caddy's TLS listener and record the
   currently assigned public hostname and port. The Mac-to-Pinggy client must
   still use the pinned Pinggy SSH host key and
   `StrictHostKeyChecking=yes`.
3. From the actual PX client machine, run the PX fixture using the approved PX
   and Lore versions and the dedicated production-test identity.
4. Require a zero exit status and every `PASS` marker, including the exact
   expected identity, authorized read, cross-tenant denial, and logout.
   Preserve only non-secret evidence (UTC time, PX/Lore release IDs, result,
   and fixture identifiers).
5. Revoke the disposable API key and confirm its refresh family is no longer
   usable. Remove the test tunnel and verify the temporary host override was
   cleaned up.
6. Only then mark PX authentication/repository acceptance complete. QUIC,
   browser OIDC, refresh/key rotation, writes, backup/restore, and recovery
   remain separate gates; this TCP test does not certify them.

The script has not yet been run against production staging with a known test
identity and reciprocal repository fixtures. Its addition is test
infrastructure—not evidence that PX authentication, tenant denial, or the
production deployment has passed.

For the full Auth/Lore/PX suite including authenticated Lore QUIC cloning, use
the Cloud repository's [combined temporary client route](PRODUCTION-ACCEPTANCE.md#4-quic-through-pinggy)
and `scripts/test-network-auth.mjs`. The PX repository fixture above remains a
smaller TCP-only smoke test. The combined route uses a separate UDP relay and
is the appropriate choice when the Pinggy UDP hostname/port differs from the
TCP mapping. It does not change public DNS and does not disable TLS checks.

## Current transport evidence — October 17, 2026

The temporary Pinggy TCP route passed certificate-valid Auth JWKS and Lore
`/health` HTTPS probes (HTTP 200, TLS verification result 0). Using the
production TLS authorities, Auth `epic_urc.UrcAuthApi/HealthCheck` returned
`status: ok` and Lore's standard gRPC health RPC returned `SERVING`. Lore's
external `EnvironmentGet` also returned the expected Auth discovery URL
`ucs-auth://auth.portals.works`. The current endpoint supplied by the operator
passed all of these checks with normal certificate verification; its assigned
Pinggy hostname and port are ephemeral and intentionally not stored here.
These results establish current tunnel, TLS/SNI, route, discovery, and basic
health only; they do not satisfy the PX fixture above.

The PX MCP provider check still reports `local` (`lore://127.0.0.1:41337`)
with an expired cached identity. The installed PX CLI is `0.9.6`. There is
also a release-pin gap: the production release branch BOM records Lore
`0.8.4-portals.11`, but still records PX `0.8.19` and says that release does
not satisfy `lore-auth-v1`. The PX source checkout has tag `v0.9.8` and pins
Lore `.11`, but that source tag alone does not prove a signed, published
binary or complete the cloud BOM update. The installed PX `0.9.6` is not the
expected candidate. Verify/promote the PX artifact and reconcile the release
BOM before declaring the test versions approved. No disposable production-test
key or known-existing
allowed/denied repository-and-entity fixtures are configured in this execution
environment. The actual PX acceptance suite remains incomplete; do not infer
login or tenant-isolation success from health probes or mock-runner tests.
