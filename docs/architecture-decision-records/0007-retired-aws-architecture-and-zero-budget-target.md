# ADR 0007: Retire the AWS service architecture; prepare a zero-budget target

- Status: Proposed — blocked on the validation gates below
- Date: 2026-08-30
- Owners: Product and Platform

## Context

The prior production architecture was designed for a protected AWS data plane.
It used an internet-facing ALB/WAF, private ECS tasks, Service Connect, RDS,
KMS, Secrets Manager, CloudWatch, S3, DynamoDB, Route 53, and Cognito.  Its
security boundary is documented in [ADR 0006](0006-lore-production-security-boundary.md).

The AWS account is suspended.  It is not a dependency of the new deployment
target, and this record does not authorize its revival, modification, or
teardown.  This document preserves the old design and its lessons so the
replacement does not repeat its cost and operational mistakes.

## Historical AWS architecture — retired reference

| Component | Previous responsibility | Lesson retained |
|---|---|---|
| ALB + WAF + ACM | TLS termination, host/path routing, public-edge filtering | A public edge needs explicit routing, TLS, health checks, request limits, and audit logs.  Do not recreate an always-on managed edge solely for convenience. |
| ECS Fargate / ECS EC2 | Ran Lore, Auth Gateway, and Backend as separately deployed tasks | Service isolation is useful, but three permanently allocated tasks and their networking dependencies were disproportionate to MVP traffic. |
| Service Connect / Envoy | Service discovery and task-to-task networking | A single host does not need a mesh.  Localhost is simpler and has no proxy memory cost. |
| RDS | Control-plane and application data | Do not split application records across databases without a clear ownership boundary and a tested migration/restore path. |
| Cognito | Hosted browser login and OIDC identity | Hosted identity is a capability, not a reason to place the application backend inside a VPC. |
| KMS + Secrets Manager | Auth Gateway signing key and API-key pepper | Signing-key custody and rotation are mandatory even when a managed KMS is removed. |
| S3 + DynamoDB | Lore distributed stores, locks, metadata, and fragments | Lore storage and lock behavior must be preserved; a single-node deployment may use its supported local store only while exactly one Lore process owns it. |
| CloudWatch, SNS, Flow Logs, CloudTrail | Logs, alarms, and incident evidence | A lower-cost host still requires measurable health, bounded local log retention, alert delivery, and recovery evidence. |

## Decision

The target is a single, low-traffic, single-host deployment with no AWS service
dependency.  It preserves Lore's native gRPC and QUIC protocols and treats
zero cost as a budget ceiling with explicit usage gates, not a reliability or
capacity promise.

### Target service placement

| Capability | Target placement | Notes |
|---|---|---|
| Lore server | OCI Always Free A1 canary, then one production host if validated | Runs as one supervised process or host-network container.  Its local persistent store is on a separately mounted volume.  gRPC and QUIC remain unchanged. |
| Auth Gateway | Same host, separate supervised process | It remains the Lore protocol and authorization boundary: OIDC callback broker, repository-token issuer/JWKS publisher, `UrcAuthApi`, ReBAC API, and API-key authority.  It is not required to be an AWS service or a separate VM. |
| Primary identity provider | Self-hosted Keycloak candidate on the same host, backed by Neon project B | Keycloak is selected for a compatibility spike because it is a standards-compliant OIDC provider with discovery, authorization-code, token, and JWKS endpoints.  Its memory use and ARM image must be measured before acceptance.  Neon Auth is not a replacement until it is proven to supply the exact authorization-code/OIDC/JWKS interface the gateway needs. |
| Product BFF / leads / CRM / billing / invitations | Existing Next.js Node process on the same host | Retire the standalone BackendService after its behavior is moved and tested here.  It has no public internal port; Caddy exposes only application routes on HTTPS. |
| CRM delivery | One-shot worker invoked by a `systemd` timer on the same host | Replace the one-minute poll with a 30-minute recovery sweep, plus event-first immediate attempts.  The actual CRM delivery SLA must accept the maximum sweep delay. |
| Data | Two Neon projects in the same account | Project A: leads, CRM, integration state and outbox.  Project B: users, accounts, pilots, memberships, invitations, billing, consent, audit, Auth Gateway security store, and identity-provider data.  No cross-project foreign keys. |
| TLS and HTTP routing | Caddy on the host | `app` and `auth` use HTTPS on 443.  Caddy proxies Auth gRPC to loopback h2c and Auth HTTP to loopback HTTP. |
| Lore public transport | Lore directly on `41337/TCP` and `41337/UDP` | Lore health `41339` is loopback-only.  Direct Lore TLS/certificate handling and public UDP exposure are deliberate accepted trade-offs. |
| DNS and email | Cloudflare DNS and Resend, subject to account validation | DNS-only routing is required for Lore's direct UDP endpoint.  The domain registrar, external CRM, payment processor, and any usage overage remain outside the zero-budget claim. |

## Why Auth Gateway remains

Auth Gateway is required **as a capability**, not because it is an AWS
component.  Lore depends on its private ReBAC service at `127.0.0.1:8087` and
on its public authorization/token contract.  Moving those responsibilities
into Lore would change the product source and trust boundary; moving them into
the Next BFF would require reproducing gRPC APIs, scoped-token signing, JWKS,
and ReBAC semantics in another runtime.

The current implementation is not portable: it is Cognito-specific and
production validation requires AWS KMS and Secrets Manager.  Before it can
run without AWS it needs two bounded changes:

1. Replace the Cognito-specific OAuth adapter with a generic OIDC
   authorization-code adapter that uses discovery, issuer, JWKS, audience,
   `sub`, email, and nonce validation.
2. Add an explicit self-hosted signing mode that reads the current private key
   and API-key pepper from OCI Vault at boot, publishes current plus retired
   public keys in JWKS, and has an exercised rotation and restore procedure.

This preserves Lore's protocol and source.  It does not make the gateway an
identity provider; Keycloak owns browser sign-in, while Auth Gateway retains
Lore-specific authorization.

## Architecture constraints and budget rules

1. No AWS endpoint, credential, KMS key, Secrets Manager secret, Cognito pool,
   Lambda, or other AWS resource is a runtime dependency.
2. The 30-minute recovery sweep must be the only scheduled Neon query.  Every
   normal lead or CRM write attempts delivery immediately; retry state is
   idempotent in Neon.
3. Neon scale-to-zero is five minutes on Free.  At a 0.25-CU minimum, a
   30-minute sweep consumes roughly 30.4 CU-hours/month before actual traffic.
   A project is stopped from release if measured compute, storage, or transfer
   crosses its agreed warning threshold.
4. Lore, Auth Gateway, Keycloak, Next, and Caddy must run on the selected OCI
   host with measured memory, startup, and end-to-end CLI behavior.  The
   Always Free allocation is not proof of application capacity.
5. All application image digests must be selected explicitly for OCI's actual
   CPU: `linux/arm64` and verified on an OCI A1 host.  A client release
   containing `aarch64-unknown-linux-gnu` does not prove a server container
   runs on OCI A1.  Windows and macOS client artifacts do not belong on the
   server.
6. The new host is single-node and non-HA.  Recovery interruption is accepted
   only after the drills below have passed in an isolated environment.

## Required validation gates

### Source and canary gates

1. Build signed, immutable OCI-A1-compatible images for Lore server and Auth
   Gateway.  Build a Next BFF image only if the BFF is containerized; otherwise
   validate the selected ARM64 Node runtime directly.  Pin and inspect tested
   `linux/arm64` Keycloak and Caddy upstream images rather than treating them
   as custom application builds.  The temporary standalone Backend image must
   also be ARM64 if it remains during migration.
2. Run the generic-OIDC and self-hosted-signing tests: login/callback, issuer
   and audience rejection, nonce/PKCE validation, current and retired JWKS
   verification, API-key pepper rotation, and restart with retrieved secrets.
3. Complete Next invitation routes for create, list, validate, accept, and
   reject.  Acceptance binds a verified OIDC subject to the invitation; it
   must not call Cognito Admin APIs or pre-create accounts by email alone.
4. Test lead writes, CRM immediate delivery, retry idempotency, and the
   30-minute recovery sweep against an isolated Neon branch.

### Recovery drills

1. **Host-loss drill:** terminate only an isolated canary host, create a clean
   replacement, rehydrate secrets and configuration, attach or restore the
   Lore volume, update a staging DNS record if needed, and prove Caddy, OIDC,
   Auth ReBAC, Lore create/clone/push, and the BFF are healthy.  Record RTO.
2. **Lore-volume drill:** restore a snapshot to an isolated volume and prove
   repository identity, revision graph, a known file hash, and authorization
   state are intact.  Record the most recent recoverable point (RPO).
3. **Neon restore/branch drill:** create an isolated branch or restore,
   validate schema, row counts/hashes, invitation and membership flows, and
   least-privilege role access.  Do not write to production data.
4. **DNS-recovery drill:** change a disposable staging record to a replacement
   host, verify TLS and both application and Lore endpoints, and measure
   effective recovery time.  Do not use a production hostname for the drill.

These drills are valuable because local Lore state and host-held credentials
are otherwise only assumed recoverable.  They consume engineering time and
may use provider quota; they are dangerous and misleading if performed on a
production host, so they are deliberately isolated and performed only after a
canary exists.

### Account and usage evidence

Record dated dashboard exports—not statements—for the exact accounts used:

- OCI: A1 allocation, volume/backups, public-address billing treatment, and
  cost explorer showing no chargeable resource.
- Neon A and B: Free plan, compute CU-hours, storage, public transfer, active
  connections, and restore availability.
- Cloudflare: Free DNS plan and the exact DNS records/proxy state.
- Resend: Free plan, verified sender domain, monthly and daily send usage.
- Domain registrar and every product integration: renewal and paid-service
  costs are explicitly outside the infrastructure-zero claim.

This evidence catches account upgrades, expired promotions, quota exhaustion,
and hidden billing before they become an outage or bill.  It is intentionally
manual because provider plans and account eligibility change; it should not be
replaced by assumptions in source code.

## Consequences

- The suspended AWS account is not part of the release path.
- Lore remains the product centerpiece; no HTTP-only fallback or source-level
  replacement is accepted.
- The architecture has fewer managed infrastructure components, but more
  responsibility for host operations, identity-provider administration,
  key custody, backups, and incident recovery.
- The free-tier constraints define an early-MVP operating envelope, not an SLA
  or a promise that future traffic incurs no cost.
