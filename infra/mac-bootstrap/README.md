# Portals Mac production bootstrap

This module runs only the Mac services. Next.js stays on Vercel. The current
host is Intel, so the deployment needs `linux/amd64`. Auth Gateway now has a
multi-architecture Docker Hub build; ARM64 is available for a future host, but
does not replace release verification for the Intel image.

For the current release/BOM reconciliation, production test coverage, QUIC
requirements, provider checks, and remaining recovery gates, use the canonical
[PRODUCTION-ACCEPTANCE.md](PRODUCTION-ACCEPTANCE.md). The dated status below is
historical; later host and tunnel evidence is recorded in that acceptance log.

The [acceptance access handoff](ACCEPTANCE-ACCESS.md) lists the one-time host,
provider and fixture access needed to finish the live tests independently.
The [PX/Lore BOM CI procedure](../../docs/security/px-lore-bom-promotion.md)
explains dispatch, waiting, PR validation and the shared release commit.

## Current deployment status — 2026-10-02

- **Done:** Auth Gateway image pushed to Docker Hub as
  `portalshq/auth-gateway:0.2.0-build-20261002-retry6-0906980`. The OCI index
  digest is `sha256:5d2381bd323a92191e5cbb67001558500a5ded84187753202f170da87ba194b1`;
  its manifest contains `linux/amd64` and `linux/arm64`. BuildKit generated
  SBOM and provenance.
- **Not yet a deployable release:** this direct push has no verified GitHub
  signature/Trivy receipt and is not pinned in the BOM. The BOM still points
  `control-plane.image` at ECR and records Auth source `2b492c82…` and protocol
  `ed901a04…`; this Docker Hub build uses Auth source `0906980e…` and protocol
  `f717f97c…`. Do not deploy it or change the BOM until the mismatch is
  reviewed and a verified receipt is produced.
- **Operator-reported:** AWS storage resources have been created; Pinggy and
  ZITADEL are being configured. Resource schemas, credentials, connectivity,
  tunnel behavior, and OIDC login are still unverified here.
- **Still blocking deployment:** verified Auth release promotion; exact Lore
  storage configuration and restore test; Vercel/Neon migration and live cron
  check; custom DNS and certificates; Pinggy TCP+UDP confirmation; host Docker
  access for `portals-svc` and reboot behavior; release checks and external
  acceptance/recovery drills.

## Runtime boundary

The Mac runs Auth Gateway, Lore, and Caddy. Pinggy supplies the persistent
TCP/TLS and UDP mappings:

```text
Auth Gateway → Lore → Caddy → Pinggy
```

Lore uses TCP/gRPC and UDP/QUIC on `41337`; its health port (`41339`) remains
loopback-only. Caddy terminates public TLS and routes Auth HTTP/gRPC and Lore
gRPC. It never proxies Lore QUIC or the Vercel application.

The Pinggy runner accepts `tcp` or `udp` to start only that mapping. With no
argument it starts both and stops the pair if either child exits so launchd can
restart them together. Use the no-argument form for normal service operation;
the single-mapping modes are for targeted tunnel checks:

```sh
scripts/run-pinggy.sh       # TCP and UDP
scripts/run-pinggy.sh tcp   # TCP/TLS only
scripts/run-pinggy.sh udp   # UDP/QUIC only
```

## Remote operations access boundary

The Mac's remote-operations gate is intentionally restricted to fixed actions.
It consists of:

- A forced-command SSH key in `portals-svc`'s `authorized_keys`, restricted to
  `/Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh`.
  The key has OpenSSH's `restrict` option, so it cannot open a shell, forward
  ports, or allocate a TTY. The helper accepts only `status`, `preflight`, and
  the fixed-purpose `repair-lore-auth-discovery` action.
- `/private/etc/sudoers.d/portals-remote-ops-gate`, which lets `andresb` run
  exactly those three helper invocations as `portals-svc` without a password.
  It grants no general sudo or root command.

### Durable acceptance operations as the service account

The restricted gate cannot yet run deployment, fixtures and tunnel management.
On 2026-10-18, direct SSH to `portals-svc` accepted the existing authorized key,
then the Mac closed the connection before completing authentication. A new key
alone would not address that account-level failure. The staged fixed-action
extension adds exact sudoers entries for release plans, Auth/Lore changeovers,
and the isolated Auth key-lifecycle fixture. It accepts no arbitrary shell text,
paths, image names or secret values. Its executable is root-owned under
`/private/etc/portals-ops`; it verifies the installed action script checksums
before running them as `portals-svc`. Root sudo remains password-protected.

The local source is
[`scripts/remote-acceptance-gate.sh`](scripts/remote-acceptance-gate.sh) and
[`scripts/install-remote-acceptance-gate.sh`](scripts/install-remote-acceptance-gate.sh).
Both were staged and syntax-checked on `andresb` with these SHA-256 values:

```text
808898b370cb6259dc5b8c9fa8f0282d928d74d22544181cd1f3b8fa6fce01ff  /Users/Shared/portals-remote-acceptance-gate-20261018.sh
f7ea37d7e6100510563e14c47436be42e78743c13934d7acd3fb630a1b62f96e  /Users/Shared/portals-install-remote-acceptance-gate-20261018.sh
```

One Mac administrator password entry is required to install the root-owned
gate and its exact sudoers rule. Cached noninteractive sudo was checked and is
not currently available. From the client Mac:

```sh
ssh -tt andresb 'test "$(LC_ALL=C shasum -a 256 /Users/Shared/portals-install-remote-acceptance-gate-20261018.sh | awk "{print \$1}")" = "f7ea37d7e6100510563e14c47436be42e78743c13934d7acd3fb630a1b62f96e" && sudo -v && sudo /bin/sh /Users/Shared/portals-install-remote-acceptance-gate-20261018.sh'
```

After `REMOTE_ACCEPTANCE_GATE_INSTALLED`, test the read-only deployment plan:

```sh
ssh -T -o BatchMode=yes andresb 'sudo -n -u portals-svc /private/etc/portals-ops/remote-acceptance-gate.sh deploy-auth-plan'
```

Allowed actions are `deploy-auth-plan`, `deploy-lore-plan`, `deploy-auth`,
`deploy-lore` and `auth-fixture-test`. The fixture action creates a disposable
Auth principal and keys, checks issuance/rotation/revocation, and disables the
principal; audit records remain. Deployment actions use the approved BOM and
verified image receipts, check health and restore the prior image on failure.
The gate is pinned to the installed deployer and Auth test script hashes;
future changes to those scripts require a reviewed gate update. This extension
does not yet manage Pinggy tunnels, PX fixtures, provider restores, or client
DNS routing. Record every SSH action and its sanitized result in the ignored
`ssh-activity.log`.

The status, preflight, and repair actions were verified on the Mac on
2026-10-17. Status reports container state, preflight validates the release
manifest, and the repair action only sets Lore's Auth discovery endpoint to
the fixed production hostname, verifies the pinned Lore image, preserves the
prior config if a change is required, recreates Lore, and checks health and
live `EnvironmentGet`. The gate cannot update DNS or run authenticated PX
acceptance. Any additional deployment-capable extension must be an explicitly
reviewed fixed-purpose operation with strict validation and rollback; it must
not accept arbitrary shell text, secret values, image names, or filesystem
paths. Installing a new extension requires Mac administrator authorization.

The repository and Mac host now contain the installed
`repair-lore-auth-discovery` operation.
It only sets `LORE__ENVIRONMENT__ENDPOINT__AUTH_URL` to the fixed production
Auth name, verifies the pinned Lore image, preserves the prior config, runs
release validation, recreates Lore, and requires both container health and a
successful live `EnvironmentGet`. It accepts no arguments. The EnvironmentGet
proto is bundled at
[`probes/environment-v1.proto`](probes/environment-v1.proto), byte-for-byte
matching the checked-out Lore source. The installer stages and validates this
file itself; it does not depend on the Mac Lore submodule containing the proto.
If the checkout has no probes/ directory, the installer creates that exact
directory after rejecting symlinks and conflicting paths.

The earlier installer attempts stopped safely before modifying the host:
first because they incorrectly required the proto in the Mac Lore submodule,
then because the Mac checkout lacked the probes directory. The corrected
installer bundles the proto and creates the directory safely. Its pinned
non-secret inputs must be staged in
`/Users/Shared` on `andresb`. One-time installation requires a Mac
administrator password. Verify the installer hash and then run:

```sh
ssh -tt andresb 'test "$(shasum -a 256 /Users/Shared/install-lore-discovery-gate-20261017.sh | awk "{print \$1}")" = "363d068b6ea65787f7062f623b6f5f4f0e434ea5e8730f650340da9af923e0b5" && sudo -v && sudo /bin/sh /Users/Shared/install-lore-discovery-gate-20261017.sh'
```

After it reports `LORE_DISCOVERY_GATE_INSTALLED`, the fixed operation is
invoked without a password through the new exact sudoers entry:

```sh
ssh -tt andresb 'sudo -n -u portals-svc /Users/portals-svc/portals/infra/mac-bootstrap/scripts/remote-ops-gate.sh repair-lore-auth-discovery'
```

It reports `LORE_AUTH_DISCOVERY_REPAIR=PASS` only after release validation,
same-digest Lore recreation, container health, and live Auth discovery all
pass. On 2026-10-17 the installer completed and the repair returned
`changed=no backup=not-needed`: the configured Auth discovery value already
matched `ucs-auth://auth.portals.works`. Lore was still recreated on the pinned
digest and its live `EnvironmentGet` was verified. A follow-up status showed
Lore and Auth healthy, Caddy running, and release preflight passing. This
verifies service discovery and container readiness, not external PX, QUIC,
OIDC, or recovery acceptance.

The ProductCharacters delivery worker is outside Portals' MVP and runs no
container here. Portals retains its Vercel CRM cron; no Mac CRM scheduler,
worker wake endpoint, or legacy one-minute timer is required.
ProductCharacters has a separate gated deployment path in
[`productcharacters-delivery-worker-deployment.md`](../../docs/deployment/productcharacters-delivery-worker-deployment.md);
it does not block or join the Portals runtime.

## Required release inputs

Create a private environment file outside the repository. Use immutable
digests and service-owned, read-only environment files:

```text
AUTH_GATEWAY_IMAGE_DIGEST=portalshq/auth-gateway@sha256:<64 hex chars>
LORE_IMAGE_DIGEST=portalshq/lore@sha256:<64 hex chars>
CADDY_IMAGE_DIGEST=caddy@sha256:<64 hex chars>
AUTH_ENV_FILE=/private/path/auth.env
AUTH_SECRET_DIR=/private/path/auth-secrets
LORE_ENV_FILE=/private/path/lore.env
CADDY_ENV_FILE=/private/path/caddy.env
CADDY_CERT_DIR=/private/path/dns01-issued-caddy-certs
LORE_QUIC_CERT_DIR=/private/path/dns01-issued-lore-quic-certs
```

The Caddy environment defines `AUTH_DOMAIN` and `LORE_DOMAIN`; production
hostnames are never hard-coded in the template.

Auth production uses sealed files, not embedded secrets:

```text
JWT_SIGNING_PROVIDER=sealed-file
JWT_LOCAL_PRIVATE_KEY_PATH=/run/secrets/auth/signing-key
API_KEY_PEPPER_PROVIDER=sealed-file
API_KEY_PEPPER_FILE_PATH=/run/secrets/auth/api-key-pepper
```

`AUTH_SECRET_DIR` is mounted read-only at `/run/secrets/auth` and must contain
only `signing-key` and `api-key-pepper`, owned by `portals-svc` with mode `0700`
on the directory and `0400` on each file. The release file itself is also
owned by `portals-svc` and mode `0600`; `bootstrap.sh` and `deploy.sh` load it
through `MAC_RELEASE_ENV`. It is data-only shell assignments, never a checked-in
file.

Lore QUIC requires persistent DNS-01 certificates mounted read-only:

```text
LORE__SERVER__QUIC__ENABLED=true
LORE__SERVER__QUIC__VERIFY_CLIENT_CERTS=false
LORE__SERVER__QUIC__CERTIFICATE__CERT_FILE=/run/secrets/lore-quic/fullchain.pem
LORE__SERVER__QUIC__CERTIFICATE__PKEY_FILE=/run/secrets/lore-quic/privkey.pem
```

The certificate must match the Pinggy QUIC hostname. `/data` is disposable
cache/workspace only; S3 and the exact DynamoDB tables required by the pinned
Lore release are the production source of truth.

## Deployment sequence

Do these in order. A failed step is a release stop, not something to work
around by exposing a port or switching to mutable images.

### 1. Confirm the CRM scheduler

Keep the single Vercel cron: `frontend/vercel.json` invokes
`/api/internal/leads/retry` daily at `00:00 UTC`. It is the durable fallback
for the Neon lead/CRM outbox. The Next request paths also make an opportunistic
in-process attempt after verified work, but neither a Mac scheduler nor the
retired one-minute backend timer may be enabled. If Portals later leaves
Vercel, replace this with exactly one authenticated daily scheduler before
turning off Vercel cron.

### 2. Configure Vercel and migrate Neon

In the production Vercel project, configure `CRON_SECRET`, `LEADS_DATABASE_URL`,
the CRM credentials required by the selected connector, and the verified lead
webhook secret. Deploy them only through Vercel's encrypted project settings;
never place them in Mac files.

Run migrations only against a disposable Neon branch created from the intended
production branch. Do not point the current migration runner at production:
`frontend/scripts/migrate-leads.ts` replays every SQL file on every invocation,
has no applied-migration ledger, and at least
`frontend/migrations/014_rename_kickoff_to_launch.sql` is not repeatable. The
file ordering also includes duplicate `006_` and `013_` prefixes. First add a
tracked, transactional migration runner and prove it against a fresh branch
and a branch that already has the current schema. Until then, migration
completion and production readiness are unverified.

Once that runner is fixed, set the local `LEADS_DATABASE_URL` to the disposable
branch only, then run and record:

```bash
npm ci
npm run migrate:leads
npm run test:leads
```

Verify migration ledger state, required tables and constraints on the test
branch, then exercise invitation and CRM behavior there. A Vercel cron test
also needs a production-like deployment environment; do not use the production
cron endpoint with test writes unless it is explicitly configured for isolated
test data.

### 3. Prepare identity and Auth Gateway

Configure a ZITADEL Web application for authorization-code flow with PKCE/S256
(public client; Auth Gateway sends no client secret). Register the exact
production callback `https://<auth-domain>/callback`. Record the discovery
issuer, client ID, and redirect URI in `AUTH_ENV_FILE`; verify the discovery
document reports that exact issuer. The Auth database URL (`DATABASE_URL`) is
a separate least-privilege PostgreSQL credential in `AUTH_ENV_FILE`, with TLS
and a restore path; do not reuse the Vercel leads/CRM database role. Also set
`PUBLIC_BASE_URL=https://<auth-domain>`, `JWT_ISSUER=https://<auth-domain>`,
`JWT_KID`, `JWT_SIGNING_ENABLED=true`, `LORE_ENV=prod`, and a unique
`INTERNAL_ADMIN_TOKEN` (at least 32 bytes). Keep the signing key and API-key
pepper as separate sealed files in
`AUTH_SECRET_DIR`; do not set AWS KMS, Secrets Manager, or Cognito variables for
this Mac release. Test real login, token refresh rotation/reuse rejection,
JWKS publication, and signing-key rotation before public exposure.

Set `LORE_REBAC_URL=http://auth-gateway:8087` in `LORE_ENV_FILE`: Docker service
DNS is the Mac deployment's local-neighbor address. Other environments supply
their own private peer URL through the same variable; no source change is
needed when moving the services.

Prove OIDC discovery, PKCE, state, nonce, issuer, audience, token refresh
rotation, refresh reuse detection, JWKS publication, and signing-key rotation
before publishing a tunnel.

### 4. Prepare the host

Complete [HOST_PREP.md](HOST_PREP.md): verify the installed Docker runtime,
FileVault with escrowed recovery key, dedicated non-admin `portals-svc`,
firewall, stable power/network, at least 100 GiB free disk, Docker usable by
the service account, Pinggy, `grpcurl`, `jq`, `openssl`, and Node.js 22+ if
using the npm Pinggy CLI. Caddy runs as its digest-pinned container, not as a
host binary. Also configure the required DNS, Neon, ZITADEL, AWS, and backup
credentials. The standalone Pinggy binary may replace its npm CLI.

### 5. Promote and pin release images

The Auth Gateway image is now pushed as the tag and OCI index digest recorded
above, with both `linux/amd64` and `linux/arm64` manifests plus BuildKit SBOM
and provenance. This is only a build artifact: it is not yet approved by the
existing release gate. The current BOM still names the ECR image and different
Auth/protocol source commits. The repo currently has an Auth ECR image-release
workflow but no Auth Docker Hub signing/promotion workflow. Add or adapt that
workflow to verify the exact source/protocol commits, scan the image with
Trivy (zero critical/high findings), sign it using GitHub OIDC, and write the
receipt consumed by `check-release.mjs`. Then review/promote the Docker Hub
digest and matching source/protocol pins in `infra/lore/versions.yaml` and
rerun the release checks. Keep the multi-architecture index digest; the Intel
Mac will pull its `linux/amd64` manifest. Do not pin the mutable build tag or
treat SBOM/provenance alone as a signature or vulnerability scan.

Lore already has an immutable Docker Hub BOM pin and receipt; verify the
currently pinned digest still passes the release gate. Select and pin an
immutable Caddy image digest too. Do not substitute QEMU emulation for an
architecture-specific release artifact.

### 6. Verify Lore storage and configure the network edge

Before starting containers, prove:

- Neon TLS, least-privilege role, migrations, allowance, and restore evidence.
- ZITADEL discovery, client, redirect URI, and issuer/audience settings.
- the exact pinned `portalshq/lore` release's S3 **and** all four DynamoDB
  resources, exact schemas/indexes, IAM actions, versioning, retention/PITR,
  and an isolated restore. AWS resources being created is not proof that Lore
  is configured to use them. Obtain actual bucket/table names from AWS or the
  Pulumi outputs; Pulumi names are `${project}-${environment}-lore-` plus
  `fragments`, `metadata`, `mutable`, and `locks`.
- Configure the Lore AWS plugin in the private `LORE_ENV_FILE`; copy actual
  resource names (not these placeholders) from AWS/Pulumi:

  ```text
  LORE__IMMUTABLE_STORE__MODE=aws
  LORE__MUTABLE_STORE__MODE=aws
  LORE__LOCK_STORE__MODE=aws
  LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_BUCKET=<bucket-name>
  LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_REGION=<aws-region>
  LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_FRAGMENTS_TABLE=<fragments-table>
  LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_METADATA_TABLE=<metadata-table>
  LORE__PLUGINS__AWS__MUTABLE_STORE__DYNAMODB_TABLE=<mutable-table>
  LORE__PLUGINS__AWS__LOCK_STORE__DYNAMODB_TABLE=<locks-table>
  AWS_REGION=<aws-region>
  ```

  Table/bucket names and region must exactly match the created resources.
  Lore's AWS plugin checks that configured resources exist; it does not
  provision them.
- Use a dedicated Lore-only AWS identity scoped to this bucket and these four
  tables/indexes; deny unrelated resources and account-wide administration.
  Put credentials only in the owner-only `LORE_ENV_FILE`, never in the image,
  release manifest, or repository. Prove Lore reads/writes these stores and
  cannot access unrelated AWS resources.
- DNS-01 issuance and staged renewal for Caddy and Lore QUIC.
- Pinggy concurrent persistent TLS passthrough and UDP mappings, HTTP/2/SNI,
  custom-domain behavior, and reconnect stability. The TLS mapping must pass
  encrypted traffic to Caddy on `127.0.0.1:8443`; UDP maps directly to Lore on
  `127.0.0.1:41337`. Pinggy documents UDP as beta and says a port changes per
  connection unless a Pro user reserves it. Get written confirmation that one
  paid allocation supports both persistent mappings before treating this as a
  one-seat design.
- Encrypted off-Mac recovery storage.

Use Pinggy custom domains only where its dashboard validates them. Its TLS
tunnel preserves SNI for Caddy; do not assume a raw TCP/UDP endpoint can use
the same custom hostname until Pinggy confirms it and the external QUIC probe
passes. Caddy's certificates use DNS-01 because this host has no inbound port
80; Pinggy-issued certificates are not a substitute for the Caddy TLS tunnel.

Operator-side setup (keep tokens and private keys outside this repository):

1. In ZITADEL, create a production Web/OIDC application using authorization
   code + PKCE/S256. Register exactly `https://<auth-domain>/callback`; place
   the HTTPS issuer and client ID in `AUTH_ENV_FILE`, then test one real login.
2. In Pinggy Pro, reserve a persistent TLS passthrough mapping to
   `127.0.0.1:8443` and a persistent UDP mapping to `127.0.0.1:41337`.
   Confirm both can run concurrently on the paid seat. Save the dashboard's
   actual foreground commands only in the private release file.
3. With Cloudflare authoritative DNS (even if Squarespace is the registrar),
   validate Pinggy's custom-domain DNS records, then issue Caddy and Lore QUIC
   certificates through DNS-01 using a narrowly scoped Cloudflare API token.
   The stock Caddy image has no Cloudflare DNS plugin: use a separate ACME
   client, automate renewal and reload, and prove both TLS and QUIC hostnames.
4. In AWS, verify the exact four DynamoDB table schemas/indexes from
   `infra/pulumi/src/components/PlatformDataStore.ts` and the private,
   versioned S3 configuration from `PlatformStorage.ts`. Set Lore's AWS plugin
   names to those actual resources as described above. Provide the off-AWS
   Lore workload a dedicated identity scoped to those resources, never root or
   old ECS credentials. Test real reads/writes and an isolated restore. Check
   billing-plan eligibility, credits, budget alerts, S3 version storage, and
   DynamoDB PITR charges; zero spend is not assumed.
   Auth Gateway, Lore, and Caddy images are pulled from Docker Hub by immutable
   digest. Keep repositories public for anonymous pulls or configure a
   Docker Hub read-only token outside the repository if they are private;
   Docker Hub credentials are not Lore's AWS credentials. Lore's bucket/table
   permissions are a distinct identity and policy. Put
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` for that
   narrowly scoped Lore identity in `LORE_ENV_FILE`; the container uses the
   AWS SDK default credential chain. Keep that file owner-only and rotate the
   key. Never reuse Docker Hub pull credentials for Lore.

### 7. Validate the release

Run the release and image checks before mutating runtime state:

```bash
MAC_RELEASE_ENV=/private/path/portals-release.env scripts/bootstrap.sh
```

They fail closed on mutable tags, missing certificates, wrong image
architecture, missing BOM pins, exposed internal routes, or Next.js in the
Mac stack. Generate the non-secret Pulumi manifest and review it with:

```bash
npm install --ignore-scripts
npm run build
pulumi preview
```

Pulumi emits a manifest only; it does not provision cloud resources or upload
secrets.

### 8. Bootstrap and ordered deployment

```bash
MAC_RELEASE_ENV=/private/path/portals-release.env scripts/deploy.sh
```

`bootstrap.sh` is fail-closed and does not silently repair security state.
`deploy.sh` starts and verifies services in this order:

1. Auth HTTP/gRPC, JWKS, OIDC, and sealed-key readiness.
2. Lore Auth/ReBAC readiness and S3/DynamoDB connectivity.
3. Caddy TLS and routing.
4. Start the foreground-supervised Pinggy TLS and UDP mappings only after Caddy
   is healthy. Their commands belong in the service-owned release file and
   must use the persistent mappings validated in step 6.

### 9. Execute external acceptance and recovery drills

```bash
scripts/check-external.sh
```

Use four pinned-client commands: `AUTH_GRPC_PROBE_COMMAND`,
`LORE_GRPC_PROBE_COMMAND`, `LORE_QUIC_PROBE_COMMAND`, and
`TENANT_DENIAL_PROBE_COMMAND`. These must exercise authenticated public
protocol calls. Generic gRPC reflection and a UDP socket-open check are not
proof that auth or QUIC works.

Treat Lore's partition as the per-repository authorization boundary: users
have full access within their repository, not path-level ACLs. Run the
cross-repository/tenant denial suite for every Lore repository RPC; denials
must have no leakage or side effects and must produce audit events.

The full gate is: external Auth gRPC, Lore gRPC, Lore QUIC, tenant isolation
for every Lore repository RPC, clean reboot, backup/restore, and Pinggy
reconnect. Prove internal health, database, Docker, SSH, ReBAC, and other
internal ports are not public.

### 10. Install supervision and capture evidence

Install the supplied launchd jobs only after the interactive deployment passes,
in the `portals-svc` user domain—not as root daemons. They gate Auth → Lore →
Caddy → Pinggy, use restart throttling, and write logs under
`~/Library/Logs/portals-*`. Standard Docker Desktop may require an interactive
user session after a reboot; prove it does not for this host, or select a
headless-capable runtime. Never enable automatic macOS login as a workaround.
Record image manifest, migrations, health, certificate, tunnel, authorization,
and external-test evidence.

### 11. Backup and recovery drills

```bash
scripts/backup.sh
```

Backups contain only encrypted recovery manifests and a SHA-256 sidecar; never
copy service env files or secret directories. Before onboarding customers,
prove clean reboot, Pinggy reconnect, host rebuild, isolated Lore restore,
Neon restore, DNS/ACME recovery, and Auth key rotation.
Use `scripts/recover.sh` only with explicit isolated restore inputs.

## Customer onboarding gate

Only onboard customers after all eleven steps have dated evidence: exact Lore
release pin and storage restore, Pinggy and DNS recovery, provider-neutral Auth
OIDC and key rotation, all authorization denial tests, off-device backups, and
single-host recovery. This is a small, non-HA bootstrap environment; a Mac
failure causes an outage.

## Useful files

- [HOST_PREP.md](HOST_PREP.md) — host facts and post-wipe checklist.
- [templates/compose.prod.yaml](templates/compose.prod.yaml) — loopback-only
  service bindings and read-only mounts.
- [templates/Caddyfile](templates/Caddyfile) — public routing contract.
- [scripts/check-release.mjs](scripts/check-release.mjs) — fail-closed release
  gate.
- [scripts/check-images.sh](scripts/check-images.sh) — registry architecture
  and digest check.
- [scripts/check-external.sh](scripts/check-external.sh) — public acceptance
  probe.
- [scripts/run-pinggy.sh](scripts/run-pinggy.sh) and
  [scripts/test-run-pinggy.mjs](scripts/test-run-pinggy.mjs) — selectable
  TCP/UDP tunnel modes, default paired supervision, and runner regression test.
- [scripts/test-check-external.mjs](scripts/test-check-external.mjs) — verifies
  the probe dispatcher is TLS-portable on macOS and fails closed.
- [scripts/run-production-regressions.mjs](scripts/run-production-regressions.mjs)
  — runs the safe local regression set and prints a JSON report; it always
  marks production readiness false until the live-provider acceptance gates
  in [PRODUCTION-ACCEPTANCE.md](PRODUCTION-ACCEPTANCE.md) have their own evidence.
