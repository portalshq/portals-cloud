# Lore security rollout status — through 2026-08-14

This is an execution record, not an authorization to reopen production. The
canonical requirements remain in
[Lore production security](lore-production-security.md). Production is
intentionally fail-closed while the release blockers below remain.

## Containment and recovery applied

- Pulumi removed the public NLB, direct service listeners, public Lore,
  control-plane ports, obsolete static S3 IAM user/access key, and public task
  ingress. The unfinished legacy control plane is now code-gated to a desired
  count of zero and cannot be deployed by this stack.
- The ALB has no listener or ingress while contained. Repeated external probes
  show `443`, `8083`, `41337`, and `41339` closed. There is no NLB.
- The RDS password and Secrets Manager database URL were rotated. RDS forces
  TLS, is encrypted, has deletion protection, and retains a final snapshot.
  The account's free-plan limit permits one day of automated retention; a
  daily Lambda/Scheduler bridge retains seven encrypted manual snapshots and
  alarms on failure or missed invocation. Smoke snapshot
  `portals-dev-scheduled-20260814` completed and is restorable.
- S3 blocks public access, requires TLS, uses encryption and versioning, and
  does not use `forceDestroy`. All Lore DynamoDB tables have encryption and
  point-in-time recovery.
- The tracked development TLS private key was removed from deployment use and
  the build context. All old bearer tokens are invalid by design.

## Live private foundation

- Cognito user pool: `us-east-1_dY5D7gzRP`; client:
  `2oo9529t7kcavcq0rd83ucgb4i`. It uses authorization code with PKCE,
  invitation-only administration, passkeys on the actual Cognito managed-login
  relying-party domain, and TOTP recovery. It is a user pool only and grants no
  AWS credentials or application-network access.
- KMS has a dedicated asymmetric RS256 signing key. Secrets Manager holds the
  versioned API-key pepper and private internal-service secret. JWT signing is
  deliberately disabled until the public JWKS is reachable and verified.
- The private Auth Gateway is running one healthy Fargate task with no public
  IP, no ALB attachment, no inbound ALB rule, scoped task/execution roles, and
  store-aware readiness. The task uses the immutable image
  `907199504810.dkr.ecr.us-east-1.amazonaws.com/portals-dev/auth-gateway@sha256:aa7945dacf559884fc7b526701621da7972b48b1a60846a63c2436588a2cd4db`.
  Its ARM64 child is `5b795470...`; ECS reports the replacement task/container
  healthy and the prior task drained. ECR and Trivy both report zero
  critical/high findings.
- The first `verify-full` candidate `ecb22c34...` failed live readiness because
  its root-owned CA bundle was unreadable by the nonroot process. ECS preserved
  the prior healthy task. The corrected image installs the checksum-pinned CA
  bundle as UID/GID 65532 with mode `0444`; store-aware readiness now passes.
- Gateway JWT signing remains `false`; database and internal-service values are
  injected from Secrets Manager; the health check invokes the binary directly
  without a shell.
- CloudTrail is actively logging with digest validation. The VPC flow log is
  `ACTIVE` with successful delivery and records accepted and rejected traffic.
  ALB access logging, deletion protection, invalid-header dropping, CloudWatch
  alarms, and the audit bucket are enabled.
- The account-level external-access IAM Access Analyzer is `ACTIVE`. Target
  health, edge 4xx/5xx, WAF block, and RDS-backup alarms are deployed.
- The current AWS account rejected both GuardDuty detector creation and
  Security Hub enrollment with `SubscriptionRequiredException`. They remain
  optional paid enhancements; the documented free/low-cost baseline and a
  review date no older than 90 days are the compensating release gate.
- The time-boxed `portals-security-bootstrap-20260810` IAM policy was recreated
  and attached to the active `portals-pulumi-deployer` user on 2026-08-13.
  There is no `portals-deployer` IAM user. Remove the bootstrap policy after
  the remaining security reconciliation and replace the long-lived user with
  short-lived SSO/OIDC deployment sessions. Its normalized live document
  matches `infra/pulumi/policies/deployer-security-bootstrap.json` exactly.
- The narrow `portals-recovery-bootstrap-20260814` extension is also attached
  temporarily because the combined document exceeds AWS's managed-policy size
  limit. Only reviewed `v4` remains; it is represented by
  `infra/pulumi/policies/deployer-recovery-bootstrap.json`.

## Certificate and DNS state

The prior exact-name ACM certificate
`arn:aws:acm:us-east-1:907199504810:certificate/cdef7138-4653-4719-93bf-8136308ce10b`
was rechecked on 2026-08-14 and is `VALIDATION_TIMED_OUT`. It cannot be used
for production. Its old CNAME validation records are obsolete; do not recreate
or rely on them.

Request a replacement ACM certificate for `lore.portals.sh` and
`auth.portals.sh`, then create the replacement certificate's two ACM-generated
CNAMEs in Cloudflare as **DNS-only** records. Update `publicCertificateArn` in
the target Pulumi stack only after ACM reports `ISSUED`. Then point the two
hostnames at the ALB—not an ECS task or NLB—and keep Cloudflare proxying off
until gRPC compatibility and TLS ownership are deliberately validated.

## Implemented code and verification

- The Auth Gateway implements Cognito/PKCE login, KMS-backed RS256 signing and
  JWKS, eight-hour authentication tokens, five-minute single-repository tokens,
  persistent indexed ReBAC, idempotent repository reconciliation, owner-only
  sharing/deletion, and HMAC-peppered service-account API keys with revocation,
  rate limiting, bounded lifetime, and 24-hour rotation overlap.
- Lore strict mode requires HTTPS JWKS, an exact issuer/environment/audience,
  RS256, a known `kid`, expiration and one repository scope. It bounds JWKS
  refresh/staleness, rejects wildcard/lookalike recipients, and returns
  `UNIMPLEMENTED` from disabled AdminService methods including `Obliterate`.
- The unreleased Nap worktree contains source-generated `auth login/status/logout`, standard
  `grpcs://lore.portals.sh` routing, noninteractive repository operations,
  actionable authentication errors, automatic repository-token exchange, and
  stdin-only service-account API-key exchange. A second doc generation wrote
  zero files; `docs-check` currently reports the intended uncommitted generated
  diff and will pass on a clean checkout after source and generated files are
  committed together. Released Nap `v0.5.8` predates this security contract and
  is therefore recorded as `legacy` in `versions.yaml`; it cannot approve a
  public deployment.
- Pulumi TypeScript builds. All 25 Pulumi/policy tests and the publisher
  pipeline pass. `npm audit --omit=dev` reports zero vulnerabilities. Auth
  Gateway unit tests pass (7 pass, 1 real-PostgreSQL test ignored in that local
  invocation; the same PostgreSQL lifecycle test has also passed separately).
  Lore formatting passes. The repository credential scan reports no deployable
  key. CI now includes RustSec audits and CodeQL security-extended analysis for
  Rust and TypeScript.
- The superseded Lore base and runtime OCI indexes `c7c66d43...` and
  `08401f58...` resolve to runnable ARM64
  manifests that both fail ECR basic scanning with four critical and fourteen
  high findings. Their large Debian layers confirm that these immutable
  artifacts predate the current distroless Dockerfile; changing the Dockerfile
  did not retroactively change the published digests. They were not deployed.
- The Auth Gateway image at index digest `aa7945da...` resolves to ARM64
  digest `5b795470...`. ECR and Trivy 0.73.0 both report zero critical/high
  findings, and its BuildKit SBOM and provenance decode successfully. Its
  verification receipt is bound to those exact digests. It is not yet signed,
  so the public-ingress gate still rejects it.
- The replacement Lore image is a shell-free nonroot distroless runtime at
  index digest `69d4bf5f...`, resolving to ARM64 digest `5521c5da...` with
  BuildKit SBOM/provenance. ECR and Trivy both report zero critical/high
  findings. It is pinned and receipt-bound but remains scaled to zero and
  unsigned.
- Publishers now push first, resolve the runnable platform digest, require
  successful ECR and Trivy scans, decode SBOM/provenance, and only then update
  `versions.yaml` plus `verified-images.json`. Pulumi rejects a running service
  whose pin lacks a matching receipt and additionally requires verified image
  signatures before public ingress. The currently scanned Lore and Auth
  Gateway candidates were built from uncommitted source, so their existing
  receipts are explicitly marked `sourceTreeClean: false`. They remain useful
  for contained private testing but are not production release artifacts.

## Remaining release blockers

1. Commit the Lore security changes, control-plane/Auth Gateway changes, and
   packaging files; rebuild from those clean commits; then scan, sign, and
   promote the new images. Do not sign the dirty-source candidates or reuse the
   JWT signing key for artifact signing.
2. Add the Cloudflare ACM-validation records above, wait for certificate
   issuance, create the two ALB DNS records, and verify the live certificate.
3. Deploy and verify the compensating detection baseline: CloudTrail with
   validation, account external-access analyzer, ALB/WAF/VPC logs, targeted
   alarms, ECR/Trivy evidence, and a documented security review no more than 90
   days old. GuardDuty and Security Hub remain optional paid enhancements.
4. Correct the JWKS bootstrap edge: it currently forbids signing while it is
   the only public JWKS route. Retain JWKS/health-only TLS routing while KMS
   signing is enabled, without opening Lore, callback, or Auth Gateway gRPC
   routes. Then publish and verify the live JWKS, deploy Lore privately, and
   confirm all store-aware health gates.
5. Publish a new Nap release with signed checksums and the exact secured
   `portalshq/lore` client pin. First publish signed Lore binary checksums and
   record their digest/bundle in Nap; the Nap release workflow now refuses to
   publish without them. Promote the resulting Nap release into `versions.yaml`, then run
   authenticated staging E2E: login, create, clone, commit,
   push, pull, sync, publish, lock acquire/release, logout/expiry denial, and CI
   API-key exchange. This must exercise real S3/Dynamo serialization and the
   actual lock service.
6. Upgrade RDS retention to 35 days, run and record an isolated restore
   rehearsal, wire alarm notifications/on-call contacts, migrate deployment
   from the long-lived IAM user to short-lived SSO/OIDC, and rotate that legacy
   credential afterward.
7. Narrow general HTTPS egress with VPC endpoints or an egress allowlist, or
   record explicit time-bounded risk acceptance. The accepted plaintext
   ALB-to-Lore and ALB-to-Auth-Gateway target-hop risk does not cover broad
   egress.
8. Re-run dependency/SAST/secret/IaC/container/SBOM/signature gates and the
   external scan. Reopen only TLS `443`; legacy ports must remain closed.

Until every item is evidenced, keep `publicIngressEnabled`,
`jwksPublicationEnabled`, `jwtSigningEnabled`, `authGatewayReady`, and
`releaseGateApproved` false; keep Lore and the legacy control plane at zero.

The 2026-08-13 containment scan resolved both `lore.portals.sh` and
`auth.portals.sh` externally and found TCP `443`, `8083`, `41337`, and `41339`
closed on both names, as expected before release.
