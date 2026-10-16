# Mac-hosted Portals production implementation plan

Status: **not deployable yet**. This bootstrap preserves Lore's native
protocol, but it does not promise permanent zero cost: Pinggy is paid and
Lore's production store uses AWS S3 and DynamoDB.

The image-release workstream is scoped in
[Lore Docker Hub and Mac production release plan](lore-dockerhub-mac-release-plan.md).

## Confirmed decisions and blockers

| Item | Decision | Closure required |
|---|---|---|
| Lore persistence | Dev: LocalStack/MinIO. Prod: AWS S3 **and DynamoDB**. | Lore's AWS configuration requires S3 plus DynamoDB for fragments, metadata, mutable state, and locks. S3-only is invalid. |
| Lore QUIC | Preserve it. | Lore owns UDP/QUIC on 41337; an HTTP proxy cannot replace it. A trusted certificate and public UDP mapping are required. |
| Pinggy | Do not approve the $2.50 plan yet. | UDP is beta, persistent UDP ports are Pro, mixed types are undefined, and TCP/UDP domain forwarding is unsupported. Obtain written allocation confirmation and pass the test matrix. |
| Caddy | Required. | One local TLS/HTTP/2 entrypoint for Next, Auth HTTP/gRPC, and Lore gRPC. It does not proxy QUIC. |
| Auth Gateway | Keep it, but repair Mac-production configuration. | It owns Lore/PX tokens, refresh-family rotation, API keys, and ReBAC state. Current `prod` validation requires Cognito, KMS, and Secrets Manager. |
| Auth data | Dedicated least-privilege Neon schema/database and role. | `SecurityStore` persists identities, relationships, refresh sessions, and API-key state. It is not stateless. |
| Repository access | Release blocker. | `grpc/server.rs` calls the repository authn-only interceptor a placeholder. A tenant-A token must not access tenant-B resources. |
| Delivery workflow | Owned by ProductCharacters.com, not Portals. | No Portals delivery-job schema, Stripe delivery webhook, or CRM worker schedule is required here. |

AWS storage is not a permanent free service. AWS documents time-limited
new-account S3 credits; DynamoDB has a monthly allowance but bills some
features, including backup/restore. Set a budget before provisioning.
[S3 pricing](https://aws.amazon.com/s3/pricing/) and
[DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/).

## Target topology

```text
browser / PX gRPC -- TLS --+-- Pinggy TLS mapping -- Caddy -- Vercel Next.js
                           |                         |-- Auth :8084/:8085
                           |                         `-- Lore TCP :41337
ProductCharacters-owned webhook -- signed --> [separate, optional, gated worker]
PX QUIC --------- UDP -----+-- Pinggy UDP mapping -- Lore UDP :41337

private: Lore -> Auth ReBAC; optional PC worker -> PC Neon + Lore after its gates; Vercel -> Neon
durable: Lore -> AWS S3 + DynamoDB (fragments, metadata, mutable, locks)
```

Bind application listeners to loopback only. Do not publish health, ReBAC,
Auth internal, Postgres, Docker, SSH, or development ports. The Mac firewall
is default-deny inbound; Pinggy needs outbound connectivity only.

## Pinggy minimum

The protocol minimum is **two concurrent mappings**: one TLS/TCP mapping to
Caddy carrying SNI/HTTP/2 for app/auth/Lore gRPC, plus one UDP mapping for
Lore QUIC. This is not yet a proven Pinggy-plan minimum. If Pinggy cannot
preserve HTTP/2/SNI or attach the custom domain to the TLS mapping, split it
into browser HTTPS and gRPC TLS: **three mappings**. Use independent saved
configs, not a mixed session. [Pinggy CLI](https://pinggy.io/docs/cli/),
[UDP tunnels](https://pinggy.io/docs/udp_tunnels/), and
[usage caveats](https://pinggy.io/docs/usages/).

## Portable service contract

Services must not infer a peer is `localhost`. The deployment supplies peer
URLs: loopback on the Mac, Compose service DNS in development, and private DNS
in a future cloud.

| Contract | Mac | development | cloud |
|---|---|---|---|
| Auth ReBAC | `http://127.0.0.1:8087` | `http://auth-gateway:8087` | private service URL |
| Auth public | `https://auth.<domain>` | dev TLS URL | public TLS URL |
| Lore gRPC | `https://lore.<domain>` | dev TLS URL | public TLS URL |
| Lore QUIC | `quics://host:udp-port` | dev `quics` URL | public `quics` URL |
| database | Neon TLS URL | Neon/test URL | Neon TLS URL |

Dev must run Lore's `aws` immutable, mutable, and lock modes against
MinIO/LocalStack or DynamoDB Local. Production uses those same modes against
real S3/DynamoDB. Reconcile the current dev configurations to this standard
before calling environment parity complete.

## Required source changes before deployment

1. **Auth Gateway:** when generic `OIDC_ISSUER` is set, stop requiring unused
   `COGNITO_*` values and use a provider-neutral redirect URI. The current
   source also stamps issued claims with `idp = "cognito"` on the generic OIDC
   path; derive that value from the configured issuer/provider instead.
   Replace the environment-name rule that bans a local key and Secrets Manager
   with explicit `aws` and `sealed-file` signer/pepper providers. The
   sealed-file option is Mac-only, reads a dedicated service-account secret
   file mounted read-only into Auth, emits no secret logs, and supports
   overlapping `kid` rotation. Preserve
   KMS/Secrets Manager as the cloud provider. Add config tests and a ZITADEL
   discovery/login integration test.
2. **Repository-isolation verification:** Lore's repository partition is the
   assumed authorization boundary: a credential may access its repository's
   full content, revisions, branches, and locks, but not another repository.
   No path-level ACL is part of this MVP contract. Use a valid tenant-A token
   against every tenant-B RepositoryService and legacy repository RPC from a
   clean external client. Expected outcome is `PERMISSION_DENIED` or
   `NOT_FOUND`, no metadata/content/history/lock side effect, and a denial
   audit record. This is a production-readiness test, not a planned Lore source
   change.
3. **Caddy:** replace the old ALB/h2c deployment assumption with a production
   template. The current production file routes only Auth, so it is incomplete.
   Caddy terminates trusted TLS and proxies HTTP/2 gRPC to loopback h2c. It
   routes app to Next, Auth HTTP to :8085, Auth gRPC to :8084, and Lore gRPC
   to :41337/TCP. Lore itself terminates QUIC with a separate certificate/key
   for the Lore hostname. Caddy must not publish Auth internal/ReBAC, Lore
   health, Docker, or database ports.
4. **Audit:** Next already records selected application events, but Auth
   Gateway has no durable audit-event path and Lore tracing is not a complete
   authorization ledger. Add a shared append-only application audit writer in
   Neon for login/token, invitation, membership, webhook, and billing events;
   add Lore allow/deny and lock events with a correlation ID, actor,
   repository, outcome, and reason. Export encrypted, redacted logs off-host.
   Never record bearer, refresh, invitation, API-key, or payment secrets.
5. **State:** document every Lore cache. No durable acknowledgement may rely
   only on an unbacked Mac directory.

## Secrets strategy

Use a dedicated non-admin macOS service account, `portals-svc`; retain a
separate personal administrator account. Enable FileVault before secret
installation. The service account owns a `0700` secret directory and each
secret is `0400`; mount each file read-only only into its owning container.
Root-owned `0400` files are deliberately not used because a non-root service
could not read them. The repository and Pulumi state contain names/paths only,
never values, PEM keys, `.env` files, or tokens. This is FileVault-backed host
protection, not an HSM: host root access is a full compromise and is treated
as such.

| Secret | Owner | Rotation rule |
|---|---|---|
| Auth signing key / API-key pepper | Auth only | versioned `kid`, JWKS overlap, then retire old key |
| Neon URL | owning service | rotate one consumer at a time; verify TLS |
| AWS Lore credential | Lore only | dedicated IAM principal limited to its pinned-release bucket/table set; no root keys |
| Pinggy token | tunnel service | revoke/regenerate, restart named config |
| DNS API token / ACME account | Caddy | DNS-zone scope; stage renewal first |
| ZITADEL, Stripe, CRM, Resend | owning Next/Auth process | provider-specific rotation drill |

Maintain two encrypted off-Mac copies of a secret-recovery bundle and keep its
decryption material separate. Test it on a replacement host. This is a
single-host protection boundary, not an HSM equivalent.

## IaC and bootstrap

Do not pretend Pulumi manages macOS. Add one `infra/mac-bootstrap` module that
generates a non-secret versioned manifest and validates domains, ports, image
digests, ARM64 platforms, and public/private bindings. A small local script
consumes it:

```text
infra/mac-bootstrap/
  Pulumi.yaml, index.ts              # manifest + validation; no secret values
  templates/compose.prod.yaml        # loopback ports, read-only secrets
  templates/Caddyfile                # hostnames only
  scripts/bootstrap.sh               # idempotent preflight/install
  scripts/deploy.sh                  # pull, migrate once, start, smoke test
  scripts/recover.sh                 # explicit restore inputs required
  scripts/check-release.sh           # gates, no mutation
  launchd/com.portals.*.plist        # stack, Caddy, Pinggy watchdog
```

`bootstrap.sh` fails rather than silently fixes missing FileVault, service
account, disk, firewall, verified ARM64 image, secret permissions, certificate,
or endpoint. It must not create a provider account or entitlement implicitly.
`deploy.sh` uses immutable image digests; starts Auth, proves JWKS/gRPC/ReBAC,
then starts Lore and Next; finally starts Pinggy mappings and records the
manifest/migration/health evidence. `launchd` uses `KeepAlive` plus throttling:
container runtime, Caddy, Auth, Lore, and tunnel mappings.

## TLS, reboot, reconnect, backup and recovery

- Obtain `app`, `auth`, and `lore` certificates using DNS-01 ACME; do not rely
  on inbound port 80. Install the matching certificate chain/key in Caddy and
  Lore QUIC. Test staged renewal before reload.
- Do not start Pinggy until local health passes. On reconnect assert the
  expected endpoint, port, and certificate name; alert and do not alter customer
  configuration on mismatch.
- S3 versioning and a bounded retention policy are mandatory. Restore S3 and
  every DynamoDB table required by the pinned Lore release into isolation;
  validate known revision/content hash, metadata, mutable state, lock
  semantics, and cross-repo denial.
- Restore Neon according to the actual purchased plan and validate migrations,
  write/invitation paths, and CRM idempotency. A branch alone is not backup
  proof.

| Drill | Passing evidence |
|---|---|
| clean Mac reboot | no user logged in; ordered services/tunnels return; external browser, gRPC and QUIC pass |
| tunnel disconnect/reconnect | same persistent endpoint/port; no client reconfiguration |
| host loss | replacement built from manifest + independent encrypted recovery material, with timed evidence |
| Lore restore | isolated S3/Dynamo restore matches a known repository and denies cross-tenant access |
| Neon restore | isolated restored database passes migrations and idempotent workflow tests |
| DNS/certificate loss | replace DNS/ACME credential, issue/reload certificate, revoke old credential |
| Auth key rotation | new `kid` works, overlap verifies old tokens as intended, retirement/revocation works |

Run these before customer onboarding, quarterly, and after changes to storage,
tunnels, identity, or certificates.

## Non-negotiable release gates

1. The account owner accepts the AWS S3+DynamoDB cost boundary and budget alert.
2. Pinggy proves concurrent TLS/UDP allocations, persistence, HTTP/2/SNI,
   custom domain, and reconnect behavior from a clean PX client.
3. DNS-01 issuance and renewal work; all unintended local/public ports fail.
4. ZITADEL/sealed-secret Auth mode is implemented and tested; the current
   Cognito/KMS/Secrets Manager-only production path is not used on the Mac.
5. Neon role, TLS, allowance, migration, and restore evidence exist.
6. The exact S3 plus DynamoDB table set required by the pinned
   `portalshq/lore` release exists with least-privilege IAM and restore
   evidence; no public storage access exists. Do not copy an upstream table
   list blindly: recent upstream AWS-store releases change fragment-table
   requirements.
7. Dev LocalStack/MinIO and production storage pass the same repository/lock
   suite.
8. Full external cross-repository denial passes for every repository RPC.
9. Reboot, reconnect, host-loss, Lore, Neon, and DNS recovery drills pass.
10. Provider dashboards confirm actual plan/usage/budget for Pinggy, AWS,
    Neon, ZITADEL, email, DNS, billing, and backup storage.

## Product Characters compatibility boundary

Do not redesign Portals for Product Characters. A separate product can share
Lore/Auth only with its own OIDC client, product/tenant namespace, repository
IDs, role mapping, audit product field, and isolated Neon schema or database.
It must not get a broad Auth database role or rely on names for isolation. The
separate worker path and its current release blockers are documented in
[`productcharacters-delivery-worker-deployment.md`](productcharacters-delivery-worker-deployment.md).
