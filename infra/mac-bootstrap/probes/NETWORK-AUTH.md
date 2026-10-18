# Standard Lore and PX network authentication acceptance

Run this release gate from a customer-like machine, not inside the server's
Docker network. Health checks and unauthenticated gRPC probes are prerequisites,
not substitutes for this suite.

## Configure once per environment

Copy `auth-profile.example.json` to a private location. Replace every marker;
set absolute paths to the approved PX and Lore binaries and their exact release
versions. The example versions are release references, not automatic downloads.
Use a reachable, certificate-valid remote URL. Never disable TLS verification.
For the full production profile, also set `quic.required` and replace the
`expectedStorageUrl` marker with the exact `quics://` URL returned by
`EnvironmentGet` for the active UDP mapping. `environmentTarget` must use the
normal Lore TLS hostname and TCP route; `grpcurl` must perform its default TLS
verification (no `-insecure` or manual SNI override). Create the content marker
file in each disposable fixture repository and enter its SHA-256 digest.

Provide at least two distinct, dedicated test principals with their own existing Lore
repositories and existing PX manifests. Each principal must be allowed its own
fixture and denied the other's. Set `expectedSubject` to the actual Auth subject,
not an email address. The fixture owner must pass its positive read in the same
run before a denial against that fixture can pass. This suite does not create or
grant access to fixtures.

Supply each API key through the environment variable named by its profile entry
(normally `PORTALS_TEST_OWNER_A_KEY` and `PORTALS_TEST_OWNER_B_KEY`), or use a
private JSON file through `PORTALS_NETWORK_AUTH_KEYS_FILE`. The latter must be
a regular, non-symlink file with mode 0600 or stricter; its keys are environment
variable names and its values are the corresponding API keys. The runner never
passes the file path or the other identity's key to client subprocesses.
Do not put keys in the profile, command arguments, source control, or reports.

On the Auth host, `scripts/manage-network-auth-fixtures.mjs` can create two
unique one-day service-account keys from the protected Auth configuration.
Port 8086 remains host-local; the helper refuses a non-loopback internal URL.
Run it as the service user through the authorized fixed-action gate or service
shell, with an absolute new private directory:

```sh
node scripts/manage-network-auth-fixtures.mjs create \
  /Users/portals-svc/acceptance-evidence/network-auth-<run-id> --isolated-fixtures
```

It writes mode-0600 `manifest.json` (subjects and key IDs, no keys) and
`keys.json` (the keys). The returned subjects are the exact
`expectedSubject` values for the private acceptance profile. These keys do
**not** create Lore repositories or grant repository access. Each test owner
must create its own dedicated Lore/PX repository and known content marker,
then prove its positive read before the other identity's denial can pass.
Never test on customer repositories. Keep the key file only on an authorized
client and delete any temporary transfer copy after the test.

After deleting the two disposable repositories while their owners still have
valid credentials, revoke the identities from the Auth host:

```sh
node scripts/manage-network-auth-fixtures.mjs revoke \
  /Users/portals-svc/acceptance-evidence/network-auth-<run-id> --isolated-fixtures
```

The helper disables both service accounts, which revokes their keys and refresh
families, then removes `keys.json`. If revocation cannot be confirmed, it
retains the private keys and manifest for retry; never label that run clean.
If repository cleanup fails, retain the keys until an authorized owner can
delete the fixtures, or use an approved recovery procedure. The Auth issuer
remains `POST http://127.0.0.1:8086/v1/api-keys`, guarded by
`INTERNAL_ADMIN_TOKEN`; never forward that port.

Current repository roles do not provide read-only access: `collaborator` means
read/write and `owner` adds share/delete. Use dedicated disposable test
repositories, never customer repositories, for the live auth suite. The
repository owner must authorize each fixture identity; do not grant the denied
identity a relationship to the other fixture.

For a real browser-user fixture set `loginMode` to `browser` and omit
`apiKeyEnv`. The suite opens the usual Lore and PX login flows interactively;
complete ZITADEL login as that fixture user. Every identity still requires an
exact expected subject and its own reciprocal repository fixtures. Include both
browser and service-account fixtures in full acceptance.

## Run

From `infra/mac-bootstrap`, with either the private API-key variables or the
private key-file path set:

```sh
node scripts/test-network-auth.mjs /absolute/private/auth-profile.json /absolute/private/new-auth-report.json
```

Choose a new report filename for each run: existing evidence is never
overwritten. The JSON report is mode 0600 and records only check status and
sanitized reasons, not raw client output or keys. A failed or blocked check
returns a nonzero exit status. Keep reports outside the repository.

The suite checks pinned binary versions, invalid-key rejection, direct Lore
API-key login and subject, logout, PX API-key login and subject, positive Lore
repository/PX reads, reciprocal cross-repository denial, and logout cache
removal. When QUIC is required, it first checks the advertised storage URL,
then clones each allowed repository and verifies the known content hash; it
also requires an explicit denial for each other identity's already-proven
repository. The positive hash is the evidence that QUIC storage—not just a
health endpoint—was exercised. Each identity has an isolated temporary PX workspace and Lore auth
path; the normal secure credential backend remains enabled. Other configured
identities' API-key variables are removed from child environments.

The example enables two renewal cycles. Set `renewal.accessTokenTtlSeconds`
to **60 only against isolated staging configured with that exact TTL**, and
900 for the production-default test. The runner waits TTL+2 seconds per cycle,
then launches fresh Lore/PX processes without API-key variables, checking own
reads, unchanged identity, and cross-repository denial again. A passing run with
the `renewal` section omitted is baseline login evidence, not renewal evidence.
Browser login requires an operator; remaining commands stay noninteractive.
The runner inspects cached JWT metadata in memory to require the actual issued
TTL to match the profile, confirm the previous token expired, and confirm a new
token with a later expiration was stored. Tokens and fingerprints are never
written to its report. This metadata check is not a replacement for the separate
live JWKS/signature-verification gate.

## Separate required gates

The suite can cover browser login as well: configure a dedicated OIDC identity
with `loginMode: "browser"` and no API-key variable; complete the ZITADEL flow
in the opened browser and require the exact configured subject. This verifies
the real login path but does not by itself exercise malformed/replayed callback
negative cases, JWKS key overlap, or refresh replay; those stay separate Auth
gates.

This still does not prove every repository RPC, provider restore, or ZITADEL
callback validation. Browser OIDC and refresh/replay, signing-key rotation,
API-key rotation/revocation, the complete repository RPC matrix, writes, and
provider recovery remain separate gates. Logout here proves removal of the
client's cached identity, not revocation of an already-issued JWT.

Normal PX login discovers Auth from Lore's advertised environment endpoint.
Verify that discovery returns the intended reachable Auth URL before running.
The fork supports `ucs-auth://auth.portals.works` (HTTPS gRPC underneath).
A successful grpcurl call with a manual SNI override does not prove PX can use
a temporary Pinggy hostname. Use routing and certificates supported by the real
clients; do not add insecure bypasses to make acceptance pass.

## Runner regression tests

```sh
node scripts/test-network-auth-runner.mjs
```

These use mock clients to test the runner's isolation and failure handling.
They are not live production acceptance evidence.
