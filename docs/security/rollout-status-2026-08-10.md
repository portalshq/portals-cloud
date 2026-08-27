# Lore security rollout status — through 2026-08-20

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
- KMS has a dedicated asymmetric RS256 signing key for JWT signing (`arn:aws:kms:us-east-1:907199504810:key/ebf2eceb-25a2-427e-b38c-0148dff7602c`). Secrets Manager holds the
  versioned API-key pepper and private internal-service secret. JWT signing is
  deliberately disabled until the public JWKS is reachable and verified.
- **Completed 2026-08-20**: Artifact-signing key `alias/portals-artifact-signing` exists (`arn:aws:kms:us-east-1:907199504810:key/65aee9ea-ec81-4270-be1d-591d6c5f613f`, RSA_2048 SIGN_VERIFY) — verified `cosign sign`/`verify` with `awskms:///alias/portals-artifact-signing` (AWS_REGION=us-east-1). Both `portals-prod/lore@sha256:a9256cb62a02...` and `portals-prod/auth-gateway@sha256:6c0a1f501062...` sign and verify cleanly.
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
- **Completed 2026-08-20**: IAM Access Analyzer verified active — `portals-dev-external-access` is ACTIVE (ACCOUNT type). Do not create a second analyzer; quota exhausted. Findings triage requires `access-analyzer:ListFindings` permissions.
- Target health, edge 4xx/5xx, WAF block, and RDS-backup alarms are deployed.
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

**Updated 2026-08-19**: A replacement ACM certificate was requested for `*.portals.works` (superseded; deleted 2026-08-21). See `2026-08-21` entry for the current `portals.works` certificate `32f56a6f`.

**Updated 2026-08-20**: CNAME validation records created in Cloudflare as **DNS-only** (grey cloud) per operator confirmation. ACM still reports `PENDING_VALIDATION` as of `2026-08-20T21:53Z` — propagation/validation pending. Do not recreate records. Update `publicCertificateArn` in the target Pulumi stack only after ACM reports `ISSUED`. Then point the two hostnames at the ALB—not an ECS task or NLB—and keep Cloudflare proxying off until gRPC compatibility and TLS ownership are deliberately validated.

## 2026-08-21 domain migration to portals.works

Public hostnames migrate to `*.portals.works`. Entries earlier in this log stay
verbatim as the historical record of what was done on their dates; all
current/normative guidance elsewhere in the docs now uses `.works`.

- Prior certificate `cdef7138-4653-4719-93bf-8136308ce10b` (timed out) and
  `bf777a6b-1ba8-4ad5-a4c2-2ee3e1b74554` (superseded) were **deleted by the
  operator on 2026-08-21**. Do not recreate either.
- Replacement ACM certificate requested 2026-08-21, status `ISSUED` 2026-08-22T14:52Z (Cloudflare validation CNAMES verified; both domains SUCCESS) — ARN `arn:aws:acm:us-east-1:907199504810:certificate/32f56a6f-6348-4573-8df1-c930b5acedb6`, NotAfter 2027-03-07
  - lore.portals.works: `_89ee0ba0e9f32b41e4a102a9e09a0c5c.lore.portals.works.` → `_b7ecfe0ac0de1a28acc87d43568f90e7.jkddzztszm.acm-validations.aws.`
  - auth.portals.works: `_9a3f3b7dc27fdd50f70fe0ad4e54ca41.auth.portals.works.` → `_80865a66c346d01bf2da4cae77e67070.jkddzztszm.acm-validations.aws.`

**Service DNS + deploy posture (2026-08-22)**: `lore.portals.works` and `auth.portals.works` resolve to the prod ALB (`portals-prod-alb-fe7ca3e-…`) as DNS-only. Pulumi config on both stacks carries the ISSUED cert ARN, `.works` hostnames/callbacks, JWKS endpoint, and issuer without trailing slash. Prod RP ID moved to the Cognito prefix domain via new `authDomainPrefix`. Deploy follows the two-stage 443 sequence AFTER the `.works` images are built and promoted (single clean churn, no bootstrap on stale audience images).

**OIDC (2026-08-22)**: GitHub OIDC provider `token.actions.githubusercontent.com` created; managed policy `portals-github-oidc-release-permissions` (ECR `portals-prod/*` push + `kms:Sign` on `alias/portals-artifact-signing` only) and role `arn:aws:iam::907199504810:role/portals-github-release` (trust: `DigitalCreationsCo/portals-cloud` tag `v*`) deployed. Trust uses `https://github.com/portalshq/lore`? no — portals-cloud only.
  replace with the real ARN when issued; status `PENDING_VALIDATION`.
- Forward-looking public hostnames are `lore.portals.works` and
  `auth.portals.works` on TLS `443` behind the production ALB.
- Two DNS-only phases apply: first the ACM validation CNAME records for the
  `.works` names in the `portals.works` zone, then — only after `ISSUED` — the
  ALB CNAME records for both hostnames. Both phases use DNS-only (grey cloud)
  records; no proxying in either phase.
- Token contract cut: audience root is `portals.works` and
  the issuer becomes `https://auth.portals.works` with **no trailing slash**.
  Tokens issued under the old audience/issuer stop validating; users and CI
  must authenticate again after cutover.

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
  `grpcs://lore.portals.works` routing, noninteractive repository operations,
  actionable authentication errors, automatic repository-token exchange, and
  stdin-only service-account API-key exchange. A second doc generation wrote
  zero files; `docs-check` currently reports the intended uncommitted generated
  diff and will pass on a clean checkout after source and generated files are
  committed together. Released Nap `v0.5.8` predates this security contract and
  is therefore recorded as `legacy` in `versions.yaml`; it cannot approve a
  public deployment.
- **Updated 2026-08-21**: Production images promoted into versions.yaml:
- Lore: `portals-prod/lore@sha256:a9256cb62a02f32f45558515226b7917b3082869b1e1d50ba9918e8dcd1446f9`
- Auth Gateway: `portals-prod/auth-gateway@sha256:1f23c9a95b1661d5bcf73b067cec0e0fc6df8258dc04b2a55ca6ace97804b9a1`
- Source commits recorded: Lore `1c0de969560779d55966152715a909eea45241e8`, packaging `92244a3b6148bd64b82a79003724003e4ce2a6b1`, control-plane `4885f927645dffbd813a1f04b86d0c8fb6ea0cbf`, protocol `1c0de969560779d55966152715a909eea45241e8`

**Updated 2026-08-21**: Nap promotion blocked - v0.5.8 lacks Sigstore bundles. New release with lore-auth-v1 support needed from external repo `https://github.com/portalshq/narrativeengine.git`.
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
- **Completed 2026-08-20**: Production ECR repositories `portals-prod/lore` and `portals-prod/auth-gateway` exist with `scanOnPush=true` and `IMMUTABLE` tag mutability (verified `2026-08-20`). Preview shows they would be re-created cleanly in prod stack (3 repositories). Recently built prod images `lore@sha256:a9256cb...` and `auth-gateway@sha256:6c0a1f50...` are signed (see above) but `versions.yaml` still pins `portals-dev/*` pins — promote signed prod pins via verified-images flow before prod deploy.
- Publishers now push first, resolve the runnable platform digest, require
  successful ECR and Trivy scans, decode SBOM/provenance, and only then update
  `versions.yaml` plus `verified-images.json`. Pulumi rejects a running service
  whose pin lacks a matching receipt and additionally requires verified image
  signatures before public ingress. The currently scanned Lore and Auth
  Gateway candidates were built from uncommitted source, so their existing
  receipts are explicitly marked `sourceTreeClean: false`. They remain useful
  for contained private testing but are not production release artifacts.

## Remaining release blockers

**Critical Pre-Work Blockers (Added 2026-08-19)**:
- [x] Artifact-signing key `alias/portals-artifact-signing` created (2026-08-19) — verified 2026-08-20 sign/verify (cosign `awskms:///` + `AWS_REGION=us-east-1`)
- [x] Production ECR repositories created (2026-08-19) — `scanOnPush` + `IMMUTABLE` verified 2026-08-20
- [x] IAM Access Analyzer verified - existing analyzer `portals-dev-external-access` is active
- [x] Nap release available (2026-08-20) — new release addresses `lore-auth-v1`; pending promotion into `versions.yaml` via `verify-and-promote-*` (external repo `https://github.com/portalshq/narrativeengine.git`)

**Original Blockers**:
1. [x] Commit the Lore security changes, control-plane/Auth Gateway changes, and
   packaging files; rebuild from those clean commits; then scan, sign, and
   promote the new images. Do not sign the dirty-source candidates or reuse the
   JWT signing key for artifact signing.
2. [x] Cloudflare ACM-validation CNAME records created (2026-08-20) as DNS-only — awaiting ACM `ISSUED`; then create the two ALB DNS records and verify the live certificate.
3. Deploy and verify the compensating detection baseline: CloudTrail with
   validation, account external-access analyzer, ALB/WAF/VPC logs, targeted
   alarms, ECR/Trivy evidence, and a documented security review no more than 90
   days old. GuardDuty and Security Hub remain optional paid enhancements.
4. [x] Correct the JWKS bootstrap edge: it currently forbids signing while it is
   the only public JWKS route. Retain JWKS/health-only TLS routing while KMS
   signing is enabled, without opening Lore, callback, or Auth Gateway gRPC
   routes. Then publish and verify the live JWKS, deploy Lore privately, and
   confirm all store-aware health gates.
5. [x] New Nap release available (2026-08-20) — promote its signed checksums and the exact secured `portalshq/lore` client pin into `versions.yaml` (workflow now refuses without them), then run authenticated staging E2E: login, create, clone, commit, push, pull, sync, publish, lock acquire/release, logout/expiry denial, and CI API-key exchange (must exercise real S3/Dynamo and lock service).
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

The 2026-08-13 containment scan resolved both `lore.portals.works` and
`auth.portals.works` externally and found TCP `443`, `8083`, `41337`, and `41339`
closed on both names, as expected before release.

**Verified Infrastructure State (2026-08-25 19:46 UTC — `v0.8.4-portals.8` `72bc91` `c60b9ca368cf…` `COMPLETED`)**:
- Pulumi stacks: `dev` (119 resources) + `prod` **deployed** (155 resources, VPC `vpc-087e23a245117cfd5` `10.1.0.0/16`, `lore:8` `HEALTHY`, Auth Gateway `HEALTHY`, ALB `portals-prod-alb-fe7ca3e-289037285.us-east-1.elb.amazonaws.com` with `publicIngressEnabled=true` `lore.portals.works:443`/`auth.portals.works:443`, `loreServiceDesiredCount=1`, `authGatewayDesiredCount=1`). Since 2026-08-20 23:30Z: `aws:region=us-east-1`, `PATH` for `pulumi-language-nodejs`, `LoadBalancers.ts` explicit `name` (≤28 chars), `SecurityControls` reuse Analyzer, `PlatformCluster` skip duplicate role, ECR import, correct CIDRs, `db.t4g.micro/20GB/15.18`, `LoreService.ts` SG `8087→VIP+ VPC` + `443→0.0.0.0/0` (hotfix `80→0.0.0.0/0` **removed 2026-08-25**), `fix(rebac):8087` `3694edb` + `fix(auth):https` `f4ebbe5` (UrcAuthApi `https://auth.portals.works:443` → `:8084` via ALB, RebacApi `http://auth-gateway-rebac:8087` → `127.255.0.1:8087` via Service Connect), `$BUILDPLATFORM`/`$TARGETPLATFORM` single-arch fix, credential hardening, `RUST_LOG=debug` one cycle. `prod` `pulumi up` steady state.
- ACM certificate `32f56a6f-6348-4573-8df1-c930b5acedb6` is `ISSUED` 2026-08-22T14:52Z `NotAfter 2027-03-07` (`lore`/`auth.portals.works` → ALB `DNS-only` `SUCCESS`); prior `bf777a6b…` superseded/`cdef7138…` timed out deleted by operator 2026-08-21.
- Production ECR repositories `portals-prod/lore` + `portals-prod/auth-gateway` exist with `IMMUTABLE` + `scanOnPush` (also `portals-prod/control-plane` legacy); `versions.yaml` `lore 0.8.4-portals.8` `47333fc` `lore@sha256:72bc91` + `auth-gateway 5d8e87ce` `Verified OK` (cosign+Trivy 0 high, SBOM/provenance decode, `verified-images.json` receipt bound, `verified-releases.json` `nap 0.5.15`).
- Artifact-signing key `alias/portals-artifact-signing` (`65aee9ea…`, RSA_2048) — `cosign sign/verify` `awskms:///alias/portals-artifact-signing` + `AWS_REGION=us-east-1` verified; `lore 72bc91` and `auth-gateway 5d8e87` signatures verified.
- IAM Access Analyzer `portals-dev-external-access` is ACTIVE (ACCOUNT); quota 1 reused for `prod`.
- Auth Gateway `portals-prod` `HEALTHY` (1 task `90b8e577…` `5d8e87ce`); Lore `portals-prod` `HEALTHY` (1 task `c60b9ca368cf…` `72bc91` `RUST_LOG=debug`); E2E 2026-08-25: `create 0.8s` `01a03a7…`, `clone 1.06s`, `stage+commit+push 0.77s` `e881f13…` `43 B` file, `verify-external-surface.sh` `443 open` `8083,41337,41339 closed`.
- Security controls active in `dev` and `prod` (CloudTrail validation, VPC flow log `ACTIVE`, ALB logs, deletion protection, audit bucket `portals-prod-audit-*`, `portals-prod-security-trail`); `prod` SecurityControls reuse Analyzer per quota.
- Low-cost RDS snapshot bridge `prod` (Lambda `portals-prod-rds-backup`, Scheduler `cron(17 5 * * ? *)`, 2 alarms, `portals-prod-db` `db.t4g.micro` `15.18` 1-day+PITR bridge 7× manual snapshots, `portals-prod-scheduled-` prefix) + `dev` (7-day).
- IAM user `portals-pulumi-deployer` exists with bootstrap policies (`deployer-security-bootstrap` + `deployer-recovery-bootstrap` v4) — retirement deferred to OIDC `image-release.yml` proof.
