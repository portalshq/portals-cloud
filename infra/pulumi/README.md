# Secure Lore AWS deployment

This Pulumi program is fail-closed infrastructure for Lore. The canonical
security and incident runbook is
[docs/security/lore-production-security.md](../../docs/security/lore-production-security.md).
The operator-facing release sequence is
[docs/security/production-release-procedure.md](../../docs/security/production-release-procedure.md).

## Topology

The ALB is the only internet-facing application resource and has no ingress or
listener by default. When all release assertions are satisfied, it exposes
only HTTPS/gRPC `443` for `lore.portals.sh`, protected by WAF. There is no NLB,
public control plane, public health port, or direct QUIC/gRPC listener.

Lore and the Auth Gateway run in private subnets without public IPs. Lore
accepts `41337` and store-aware `41339` checks only from the ALB security group;
the container also checks `41339` locally.
The unfinished legacy control-plane issuer is production-disabled and Pulumi
rejects a nonzero desired count. Tasks use scoped IAM roles for S3 and DynamoDB.
RDS is private. Cognito is a user pool only and the asymmetric JWT signer is in
KMS.

The stack owns immutable, scan-on-push ECR repositories for Lore and the Auth
Gateway (the active control-plane runtime). The legacy control-plane repository
is retained only for migration history and is never deployed. The stack also forces PostgreSQL TLS and writes ALB,
WAF, CloudTrail, and VPC-flow audit data when security controls are enabled.

## Safety gates

Defaults keep Lore and the legacy control plane at zero and public ingress off.
The Auth Gateway can be bootstrapped privately without an ALB attachment. A service cannot
start without an ECR `@sha256` image reference. Lore also requires an HTTPS
JWKS URL and issuer. Public ingress additionally requires all of:

```text
authGatewayReady=true
securityControlsEnabled=true
securityReviewDate=YYYY-MM-DD
releaseGateApproved=true
publicIngressEnabled=true
```

`threatDetectionEnabled=true` adds paid GuardDuty/Security Hub and is optional
when the mandatory compensating baseline is deployed. Public ingress requires a
real `securityReviewDate` within the last 90 days. Set release assertions only
after their checks are evidenced and set public ingress last. The stack rejects
plaintext or certificate-less public ingress.
`jwtSigningEnabled` is a separate publish-before-use switch. Deploy the gateway
privately with it false, then use `jwksPublicationEnabled=true` to expose only
JWKS and health on TLS 443. In that bootstrap mode the callback, Auth gRPC, and
Lore listener rules do not exist. After the live `kid` is verified, disable
bootstrap mode and enable signing. The full public edge is rejected while
signing is false. This current combination cannot support the intended
long-running private Lore signed-token test; complete the JWKS-only signed-edge
change documented in the production release procedure before public release.

`credentialRotationEpoch` deliberately rotates the generated database password
and service-account API-key pepper. Change it only during an approved rollout
that updates consumers atomically.

`databaseBackupRetentionDays` is `1` in the current AWS free-plan stack because
AWS rejects a larger value. The low-cost bridge sets
`lowCostRdsSnapshotsEnabled=true` and retains seven daily native manual
snapshots using one 128 MB ARM Lambda plus EventBridge Scheduler. Public ingress
with under seven days of automated PITR is rejected unless this bridge is
enabled. Set automated retention to `35` when the account permits it. Deletion
protection, final snapshots, S3 versioning, and DynamoDB PITR remain enabled
regardless of that account-plan limit.

## Bootstrap permissions

Use a short-lived, individually attributed deployment role. Bootstrap needs
permission to manage VPC/ALB/WAF, ECS/ECR, IAM roles/policies, Cognito user
pools, KMS keys/aliases, RDS, S3, DynamoDB, CloudWatch, and security logging.
Runtime task roles are narrower and must never inherit deployment permissions.
Protect Pulumi state and never put secrets or private keys in YAML or git.
The least-privilege policy template is
[`policies/deployer-security-bootstrap.json`](policies/deployer-security-bootstrap.json).
The Access Analyzer and low-cost recovery additions are split into
[`policies/deployer-recovery-bootstrap.json`](policies/deployer-recovery-bootstrap.json)
to stay below AWS's managed-policy size limit.
The maximum-permission guardrail is
[`policies/deployer-permissions-boundary.json`](policies/deployer-permissions-boundary.json).
Attaching it changes persistent account authorization and therefore requires a
separate reviewed approval; never auto-attach it from a deployment script.
The role/OIDC/permissions-boundary migration is specified in
[`docs/security/aws-deployment-identity.md`](../../docs/security/aws-deployment-identity.md).

Pulumi must find its language host. If installed in the user directory:

```bash
export PATH="$HOME/.pulumi/bin:$PATH"
```

## Immutable image promotion

Build once and push with BuildKit SBOM/provenance. Production publisher scripts
require `REQUIRE_SIGNATURE=true` and a dedicated `COSIGN_KEY` reference: they
sign the resolved immutable digest first, then require clean ECR and Trivy
critical/high results, decode the attestations, and only then update both
`infra/lore/versions.yaml` and the digest-bound receipt in
`infra/lore/verified-images.json`. Pulumi refuses a running pin without a
matching receipt and refuses public ingress until its cosign signature is
verified. Mutable architecture/nightly tags may aid publishing but are never
accepted by the service-count gate.

CI also runs npm/RustSec dependency audits and CodeQL security-extended
analysis. Those source gates complement, rather than replace, ECR scanning and
signature/SBOM verification of the exact promoted manifest digest.

`infra/lore/versions.yaml` is the sole release bill of materials. It has four
active release entries: the independently signed Lore client, the Lore server
image, the control plane implemented by the Auth Gateway image, and the signed
Nap binary release that references the exact Lore client version. The legacy
issuer is an explicit retired entry with an empty image. Pulumi does not accept a config
override for the Lore image, so `pulumi up` cannot silently deploy a different
artifact than the reviewed manifest.

Publishers reject dirty component source, attach full source/protocol/packaging
commit labels, and require those values in provenance before changing a pin.
Promote the signed Lore CLI first with
`scripts/verify-and-promote-lore-client-release.sh`; it records the fork source
commit and release artifacts while deliberately leaving the Epic upstream pin
and Lore submodule gitlink unchanged. `verify-and-promote-nap-release.sh` then
verifies GitHub-OIDC Sigstore bundles, every Nap artifact checksum, and requires
Nap's Lore dependency to match that independent top-level entry before changing
the Nap entry and its matching `verified-releases.json` receipt. Public
ingress additionally requires `release.status: approved` and one matching
security contract across Nap, Lore, and the control plane.

`lore-client.source_commit` is not synchronized from a dirty or checked-out
submodule. After the patch is committed, tagged, and released from
`portalshq/lore`, run
`scripts/verify-and-promote-lore-client-release.sh vX.Y.Z`; only that verified
promotion updates `source_commit`. The trigger is currently manual; verification
and manifest editing are automated. Update `upstream_commit` and the submodule
gitlink together only when intentionally rebasing to Epic upstream.

## Containment and preview

```bash
pulumi config set loreServiceDesiredCount 0
pulumi config set controlPlaneDesiredCount 0
pulumi config set publicIngressEnabled false
pulumi preview --diff
pulumi up
```

Confirm the preview deletes the NLB/listeners and ports `8083`, `41337`, and
`41339`; inspect every replacement and deletion. Do not apply an unexpected
database, bucket, table, KMS-key, or user-pool deletion.

Record a repeatable external probe (use the ALB DNS name during containment):

```bash
infra/pulumi/scripts/verify-external-surface.sh HOST containment
```

After release, run it with `lore.portals.sh release`; it validates the TLS
hostname/chain and fails unless exactly `443` is reachable.

## Secure deployment

```bash
npm ci
npm test
npm run build

pulumi config set loreJwksEndpoint https://auth.portals.sh/.well-known/jwks.json
pulumi config set loreJwtIssuer https://auth.portals.sh/
pulumi config set publicCertificateArn arn:aws:acm:REGION:ACCOUNT:certificate/ID
pulumi config set loreServiceDesiredCount 1
pulumi preview --diff
pulumi up
```

Do not set an image URI in Pulumi config: deployment reads the reviewed image
digest from `infra/lore/versions.yaml` only.

Leave public ingress false while private readiness and authenticated staging
E2E run. After the full checklist in the security guide passes, set the three
release assertions and enable ingress in one reviewed preview.

## Health gates

ECS and ALB target health invoke Lore's store-aware endpoint. Release also
requires a real authenticated
fragment write/read, branch-pointer update, and LockService acquire/release
against S3/DynamoDB plus the complete Nap workflow.

## Rollback

Close ingress and scale to zero first. Reapply the prior digest and compatible
configuration, or restore RDS/S3/DynamoDB into isolated resources. Never roll
back to an exposed key, mutable tag, static AWS credential, public NLB, or
unauthenticated config. Reopen only after all negative and data-plane gates pass.

## Important outputs

The stack exports the ALB DNS name, private service SGs, store names/ARNs,
Cognito pool/client IDs, and KMS signing-key ARN. It intentionally has no NLB
output and does not output credential material.
