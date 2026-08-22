# ADR 0006: Lore production security boundary

- Status: Accepted
- Date: 2026-08-10
- Owners: Platform and Security

## Context

Lore previously exposed HTTP `41339`, gRPC/QUIC `41337`, and control-plane
HTTP `8083` through internet-facing load balancers. The running server had no
JWT verifier, including for the destructive `AdminService.Obliterate` RPC.
Health checks did not prove the backing stores or an authenticated data path.

## Decision

The only public socket is ALB/WAF TLS `443`: `lore.portals.works` routes gRPC to
Lore, while `auth.portals.works` routes the Auth gRPC protocol, OAuth callback,
health, and JWKS paths to the gateway. The NLB and direct listeners are removed. Lore, the Auth
Gateway and ReBAC mutations run in private subnets without public IPs. The
legacy control-plane issuer is retired and absent from production; any future
successor must be private and admit only named upstream security groups.

The Auth Gateway owns authentication and token exchange. It uses an
invitation-only Cognito user pool with authorization code plus PKCE, passkeys
preferred and TOTP available. No Cognito identity pool exists, so a Cognito
user receives neither AWS credentials nor application-network access.
The WebAuthn RP ID is the actual Cognito managed-login domain. The gateway's
`auth.portals.works` hostname is not reused as a Cognito domain; a future branded
login domain must be distinct and migrated together with the RP ID.

Lore independently treats the JWT verifier as authoritative. Production
startup fails unless an HTTPS JWKS endpoint, exact HTTPS issuer, audiences
`lore` and `portals.works`, deployment environment, expiration, known `kid`, and
RS256 are enforced. Authorization tokens contain exactly one concrete
repository. Wildcards are rejected.

Authorization is represented by indexed `resource_relationships`. `owner` and
`collaborator` may perform ordinary repository operations; only `owner` may
share or request deletion. Relationship mutation is private. Repository and
owner-relationship creation use idempotent storage-first retry reconciliation;
deletion uses an owner-authorized request followed by an idempotent confirmation.
The database prevents multiple roles for one subject/repository and prevents
the gateway from removing or downgrading the final owner.

KMS holds an asymmetric RSA signing key. A new public key must be published in
JWKS before signing begins. Lore refreshes every 60 seconds, permits at most 10
minutes of bounded stale-key use, and retired public keys remain for the
longest token lifetime plus that cache window.

`AdminService`, including `Obliterate`, is disabled in production and returns
gRPC `UNIMPLEMENTED`. Destructive maintenance requires a separate, audited,
two-person workflow with explicit repository targeting and recovery checks.

Images must reside in ECR and be selected by `@sha256` digest. ECS task roles
replace static AWS credentials. RDS deletion protection/backups, S3 versioning,
DynamoDB PITR, forced PostgreSQL TLS, logs, detection, and restoration tests are
release requirements.

`infra/lore/versions.yaml` is the release bill of materials. It separately
binds the Lore client to the `portalshq/lore` fork commit and pinned Epic
upstream commit, binds the Lore server and active Auth Gateway/control-plane
images to verified clean source commits, and binds Nap to the exact signed Lore
client release it installs. All four declare the same security contract. The
retired legacy issuer is a distinct empty entry so it cannot be confused with
the active control plane.

## Residual risk: plaintext ALB-to-Fargate target hops

TLS terminates at the ALB. The next connection (a "hop") from the ALB to Lore
uses HTTP/2 cleartext on `41337`; the ALB-to-Auth-Gateway connections also use
plaintext HTTP/2 on `8084` and HTTP/1 on `8085`. The Lore hop carries
five-minute repository tokens and repository data. The gateway hops can carry
eight-hour authentication tokens, service-account API keys, issued repository
tokens, and PKCE-bound OAuth callback data.

This is accepted only while the VPC is single-purpose, unpeered, and carries no
regulated data; tasks have no public IPs; service ingress is security-group
referenced; and the acceptance is reviewed at least every 90 days. Backend TLS
is the next hardening step. Authenticated workload mTLS or a maintained service
mesh is mandatory before a shared VPC, peering, regulated-data processing, or
cross-provider connectivity. AWS authenticates this VPC target traffic at the
packet layer, so an ordinary workload cannot promiscuously sniff it. The
remaining confidentiality risk requires compromise or privileged observation
of an endpoint, routing/inspection component, or AWS network-control path.
Security groups and packet-level isolation reduce that likelihood but do not
encrypt the application payload.

The no-recurring-CA-cost re-encryption step is a short-lived self-signed
certificate generated inside each task at startup plus `HTTPS` ALB target
groups. ALB does not validate target certificates, so this closes passive
inspection without claiming workload identity. Reusable image-baked private
keys are prohibited. Strong identity remains the mTLS/service-mesh phase.

## Consequences

- Production remains fail-closed until three independent Pulumi release
  assertions are enabled: gateway readiness, security controls, and manual
  release-gate approval.
- Existing tokens, static AWS keys, database credentials, signing keys, and
  the tracked development TLS key are considered compromised and invalidated.
- Development uses the same auth, routing, and authorization contract by
  default. `dev-local` is the explicitly insecure isolated profile.
- Availability can be reduced during JWKS or gateway incidents; bounded stale
  JWKS use avoids an immediate outage without allowing indefinite trust.

## Rejected alternatives

- Public unauthenticated Lore or IP allowlists alone: no identity or repository
  authorization and unsafe for roaming users/CI.
- Public control-plane token minting: allows claim-selection and expands the
  public attack surface.
- Long-lived bearer tokens: high replay and exfiltration impact.
- NLB pass-through on `41337`: bypasses the authenticated TLS/WAF edge.
