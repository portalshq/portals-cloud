# Portals Mac production bootstrap

This module runs only the Mac services. Next.js stays on Vercel. The current
host is Intel, so the deployment needs `linux/amd64`. Auth Gateway now has a
multi-architecture Docker Hub build; ARM64 is available for a future host, but
does not replace release verification for the Intel image.

## Current deployment status — 2026-10-02

- **Released and pinned:** Auth Gateway Docker Hub index
  `portalshq/auth-gateway@sha256:7d1c6a95654679990d609f3979710267f7270fec8b2634e626cdadbb2cebd6a2`.
  The successful GitHub release below tested, built, signed, and verified both
  `linux/amd64` and `linux/arm64`, with SBOM/provenance and zero HIGH/CRITICAL
  Trivy findings. Its exact CI evidence is now in the BOM and receipt ledger;
  protected Lore release entries are unchanged. Earlier direct-push and
  failed-scan candidates are not approved for deployment.
- **Operator-reported:** AWS storage resources have been created; Pinggy and
  ZITADEL are being configured. Resource schemas, credentials, connectivity,
  tunnel behavior, and OIDC login are still unverified here.
- **Still blocking deployment:** exact Lore
  storage configuration and restore test; Vercel/Neon migration and live cron
  check; custom DNS and certificates; Pinggy TCP+UDP confirmation; host Docker
  access for `portals-svc` and reboot behavior; release checks and external
  acceptance/recovery drills.
- **Prepared in source:** Auth Docker Hub release workflow with unit/Postgres
  tests and both-architecture scan/signature gates; sealed-file public-key
  overlap support; placeholder configuration examples; read-only storage
  schema probe; corrected HTTPS/JWKS startup order and Lore health endpoint;
  paired Pinggy restart supervision. These are implemented code paths, not
  evidence that the production host or external providers have passed.
- **Latest connectivity check:** four SSH attempts on 2026-10-02 failed before
  remote commands ran. The direct route to `192.168.0.27:22` timed out. Tool
  installation/runtime configuration cannot be claimed complete until the host
  is reachable again; all attempts are in ignored `ssh-activity.log`.
- **Verified locally:** Auth's eight unit tests and two disposable-Postgres
  integration tests pass; deployment/placeholder/Pinggy restart contracts and
  storage-schema self-tests pass. Caddy `2.11.6-alpine` index
  `sha256:13b7fbadd017b042956fddbceedeeea12bb1e560534f9b3df281269dbcc61813`
  passed actual configuration validation with test-only certificates and an
  AMD64 HIGH/CRITICAL scan with zero findings. This does not validate live DNS,
  issued certificates, public traffic, or host permissions.
- **Frontend verification:** all 246 lead/CRM/account/pilot tests and TypeScript
  checks pass. The test command now preloads isolated fixture settings before
  static imports. Membership resolution retains multiple SQL roles, consistently
  prefers signer over approver, and keeps account-membership denial intact.
  Accepting a lower-role magic link no longer demotes an existing owner/admin;
  the regression also verifies single-use consumption.
  These are local tests, not evidence that production Neon migrations ran.
- **Invitation limitation:** the pilot-room invitation path uses Next.js and
  Neon, but the legacy `/api/invitations` route still calls the old AWS Backend
  through `backend-api.server.ts`. No current frontend caller was found for
  its exported browser helpers. Do not configure a dummy backend URL or claim
  team invitations migrated: the legacy contract needs a tested Next.js
  replacement (including acceptance, expiry, authorization, and mail delivery)
  before exposing that feature. It is not a reason to deploy another Mac service.
- **AWS access:** the local default AWS credential failed STS validation with
  `InvalidClientTokenId`. This is a credential failure, not proof of account
  suspension. Use a valid operator profile before inspecting the reported new
  storage; its settings remain unverified.
- **Auth release history:** dedicated branch `release/mac-bootstrap-20261002`,
  [GitHub run 37072019542](https://github.com/portalshq/portals-cloud/actions/runs/37072019542).
  Its CI Auth/unit/Postgres tests, multi-architecture publication, and GitHub
  signature verification passed; promotion stopped on three HIGH OpenSSL
  findings in the old runtime base. No BOM promotion occurred. The Dockerfile
  now pins replacement distroless index `sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2`,
  whose AMD64 base scan has zero HIGH/CRITICAL findings.
  Replacement release [run 37073376806](https://github.com/portalshq/portals-cloud/actions/runs/37073376806)
  succeeded, source `fa6c3a949c4fcbff9a45fb645be388e932593369`, protocol
  `f717f97c7efffb53674d6c10cae94bd994b0c7e9`. Both full-image architecture scans
  passed, not just the replacement base scan.

## Runtime boundary

The Mac runs Auth Gateway, Lore, and Caddy. Pinggy supplies the persistent
TCP/TLS and UDP mappings:

```text
Auth Gateway → Caddy HTTPS/JWKS → Lore → Pinggy
```

Lore uses TCP/gRPC and UDP/QUIC on `41337`; its health port (`41339`) remains
loopback-only. Caddy terminates public TLS and routes Auth HTTP/gRPC and Lore
gRPC. It never proxies Lore QUIC or the Vercel application.

The ProductCharacters delivery worker is outside Portals' MVP and runs no
container here. Portals retains its Vercel CRM cron; no Mac CRM scheduler,
worker wake endpoint, or legacy one-minute timer is required.
ProductCharacters has a separate gated deployment path in
[`productcharacters-delivery-worker-deployment.md`](../../docs/deployment/productcharacters-delivery-worker-deployment.md);
it does not block or join the Portals runtime.

## Required release inputs

Create a private environment file outside the repository. Use immutable
digests and service-owned, read-only environment files:

Start from `templates/release.env.example`, `templates/auth.env.example`,
`templates/lore.env.example`, and `templates/caddy.env.example`. Copy them
outside the checkout; replace every `__REPLACE_*__` marker. Live checks reject
placeholders. They are preparation files, not permission to deploy incomplete
provider settings. The release file also defines `AUTH_DOMAIN` and
`LORE_DOMAIN`, matching Caddy's environment exactly.

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
`signing-key` and `api-key-pepper` (plus public `retired-jwks.json` during
rotation), owned by `portals-svc` with mode `0700`
on the directory and `0400` on each file. The release file itself is also
owned by `portals-svc` and mode `0600`; `bootstrap.sh` and `deploy.sh` load it
through `MAC_RELEASE_ENV`. It is data-only shell assignments, never a checked-in
file.

The distroless Auth and Lore images run as Linux UID `65532`, not macOS UID
`502`. `bootstrap.sh` now performs a read-only, network-disabled bind-mount
readability probe under UID `65532` before starting services. If the selected
runtime does not translate ownership safely, stop and configure its UID mapping
or a private managed-secret volume; never make signing/private keys world
readable. This host's effective mount access remains to be tested.

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

From `frontend`, set a temporary local `LEADS_DATABASE_URL` pointing to the
production Neon database, then run and record:

```bash
npm ci
npm run migrate:leads
npm run test:leads
```

This migration script applies every ordered SQL file idempotently. Verify the
tables in Neon and a real, authenticated cron request before proceeding.

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

Once SSH works, first inventory existing binaries; install only missing tools.
As the Homebrew-owning maintenance account, use `brew install jq grpcurl` if
needed. As `portals-svc`, install user-local CLIs without sudo:

```bash
npm install --global --prefix "$HOME/.local" pinggy@0.6.0 vercel@62.2.0
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
pinggy --help
vercel --version
grpcurl --version
jq --version
```

These npm versions were resolved on 2026-10-02. The npm [Pinggy CLI is official](https://pinggy.io/docs/cli/).
Use the dashboard-generated persistent commands, not a guessed free-tunnel
command. If Homebrew is absent or the maintenance account does not own its
prefix, stop and install tools through the supported admin path; do not grant
the service account broad write access to `/usr/local` or passwordless sudo.

### 5. Promote and pin release images

The Auth Gateway image is now pushed as the tag and OCI index digest recorded
above, with both `linux/amd64` and `linux/arm64` manifests plus BuildKit SBOM
and provenance. This is only a build artifact: it is not yet approved by the
existing release gate. The current BOM still names the ECR image and different
Auth/protocol source commits. Dispatch `auth-dockerhub-release.yml` to verify
the exact source/protocol commits, scan the image with
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
- Run the read-only schema/security probe using an operator AWS identity with
  configuration-inspection permissions (not the narrower Lore workload key):

  ```bash
  set -a
  . /private/path/lore.env
  set +a
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  export AWS_PROFILE=__REPLACE_OPERATOR_INSPECTION_PROFILE__
  node scripts/check-storage.mjs
  ```

  The probe checks binary primary keys, all three lock indexes, active tables,
  bucket public-access blocking, versioning, and encryption. It reports PITR
  and billing mode; it neither enables paid features nor proves a free tier.
  It does not prove application write access, account-wide public-denial policy,
  backup consistency, or restoration. `templates/lore-iam-policy.json.example`
  is a resource-scoped workload-policy starting point, not an operator policy.
  Replace all names/region/account IDs before applying it. If the bucket uses
  customer KMS encryption, review the exact KMS permissions separately; do not
  add wildcard KMS/admin access. Retain the bucket's deny-insecure-transport
  policy and prove no public grants through bucket/IAM/access-point policy.
  [DynamoDB transaction permissions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)
  use the underlying item actions, not invented `Transact*` IAM actions.
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

1. Auth HTTP `/healthz` and local JWKS availability.
2. Caddy TLS and HTTPS JWKS, verified with the production hostname against
   loopback. Caddy carries a Docker-network alias for `AUTH_DOMAIN`, so Lore's
   trusted HTTPS JWKS request stays local and does not need Pinggy to start.
3. Lore `/health_check` readiness. The container healthcheck additionally
   checks ReBAC; authenticated gRPC, OIDC, and storage read/write behavior
   still require the acceptance tests below. Never substitute `/health`.
4. Start the foreground-supervised Pinggy TLS and UDP mappings only after Caddy
   is healthy. Their commands belong in the service-owned release file and
   must use the persistent mappings validated in step 6.

### 9. Execute external acceptance and recovery drills

```bash
set -a
. /private/path/portals-release.env
set +a
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
in the `portals-svc` user domain—not as root daemons. They gate Auth → Caddy
HTTPS/JWKS → Lore → Pinggy, use restart throttling, and write logs under
`~/Library/Logs/portals-*`. Standard Docker Desktop may require an interactive
user session after a reboot; prove it does not for this host, or select a
headless-capable runtime. Never enable automatic macOS login as a workaround.
Record image manifest, migrations, health, certificate, tunnel, authorization,
and external-test evidence.

Do not assume the launchd user domain exists before login. After FileVault
unlock, prove both the `portals-svc` jobs and their selected container runtime
start without logging into a service desktop session. This requirement remains
unverified; the existing Docker Desktop socket belongs to `andresb`.

### Auth Docker Hub publication

`.github/workflows/auth-dockerhub-release.yml` builds fresh clean source for
AMD64 and ARM64, includes SBOM/provenance, signs the immutable index with
GitHub OIDC, verifies registry signatures and image source/protocol labels,
and scans both architectures for HIGH/CRITICAL vulnerabilities. It uploads
`auth-dockerhub-evidence` containing the proposed BOM and receipt ledger.
It does **not** change the checked-in release pin automatically. Review the
artifact diff, preserving existing Lore receipts, and commit the verified Auth
pin and receipt together. Set GitHub Actions secrets `DOCKERHUB_USERNAME`
and `DOCKERHUB_TOKEN` before dispatch. Do not use Auth JWT keys for image signing.
The workflow also runs on source/release-tool changes pushed to a dedicated
`release/mac-bootstrap-*` branch, allowing verified preparation before merging
the workflow into the default branch. It does not publish from arbitrary
feature-branch pushes.

The earlier directly pushed Auth index is still unpromoted. A fresh workflow
release can have a different source hash and digest; adopt only its matching
verified evidence. If the scanner fails, fix and rebuild rather than writing
a passing receipt or relaxing the gate.

Sealed-file rotation uses optional `JWT_LOCAL_RETIRED_JWKS_PATH` containing
public-only JWKS for retired keys, mounted in the private Auth secret directory.
Before replacing the active RSA PKCS#8 key, save its public JWKS, generate a new
key and unique `JWT_KID`, and publish both public keys while signing only with
the new key. Retain the old public key for at least nine hours (Auth tokens last
eight hours; repository authorization tokens five minutes), then remove it and
restart Auth. Verify old/new tokens during overlap and old-token denial after
retirement. Back up active signing keys/pepper off-Mac; never publish private
keys in JWKS. Compromise revocation is a separate drill: Lore may cache JWKS for
up to its configured stale window, so restart/invalidate affected verifiers.
Pepper rotation is not the same procedure: existing API keys depend on that
pepper, so preserve it or explicitly revoke/reissue their keys.

### 11. Backup and recovery drills

```bash
scripts/backup.sh
```

Backups contain only encrypted recovery manifests and a SHA-256 sidecar; never
copy service env files or secret directories. Before onboarding customers,
prove clean reboot, Pinggy reconnect, host rebuild, isolated Lore restore,
Neon restore, DNS/ACME recovery, and Auth key rotation.
Use `scripts/recover.sh` only with explicit isolated restore inputs.

New recovery bundles use authenticated AES-256-GCM with a random salt/nonce and
scrypt-derived key, not unauthenticated CBC. Store a random backup key (at least
32 bytes, owner-only file) in the off-Mac vault separately from the bundle.
Use a new destination per backup: existing files are not overwritten. Tar must
finish successfully before encryption, and decryption authenticates the entire
bundle before writing plaintext. The SHA-256 sidecar is for transfer checking;
it is not the tamper protection. Restore manifests into a private isolation
directory, never the live runtime:

```bash
node scripts/backup-crypto.mjs decrypt /private/path/recovery.bundle /private/isolation/recovery.tar.gz /private/path/backup-key
tar -tzf /private/isolation/recovery.tar.gz
# Review archive paths before extracting into the empty private isolation directory.
```

Do not treat this manifest round-trip as the Lore/Neon/provider restore drill.
Historical CBC bundles, if any exist, require their original OpenSSL decrypt
procedure; the new utility deliberately rejects that unauthenticated format.

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
