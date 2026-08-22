# Production release procedure

This is the short, operator-facing procedure for releasing Lore. It complements
the detailed [production security guide](lore-production-security.md) and does
not contain credentials, private keys, account passwords, or mutable image
tags.

For detailed build instructions including local and cloud build options, see the [Build Guide](BUILD_GUIDE.md).

## First: what needs a new release?

Yes: build a new **Lore server image** and a new **Auth Gateway image**. The
existing candidates were useful for contained testing, but were built from
uncommitted source and live in the development repository namespace. They are
not reproducible production artifacts.

No: do not build an image for the retired legacy control plane. It remains at
desired count zero. The Auth Gateway is the active control-plane runtime.

Yes: publish a new **Lore CLI** release from `portalshq/lore`, then a new
**Nap** binary release that embeds/references that exact Lore CLI release. Nap
is a signed downloadable binary, not a container image.

`infra/lore/versions.yaml` is the one release bill of materials. It records
the approved Lore CLI, Lore server image, Auth Gateway image, and Nap binary as
one compatible set. Never hand-edit a digest after publishing; use the
verification scripts below.

## Create the contained production foundation first

The existing `dev` stack is a contained candidate, not the production stack.
Create a separate `prod` Pulumi stack before building production images: its
`ImageRepositories` component creates the `portals-prod/lore` and
`portals-prod/auth-gateway` repositories that the production publishers use.

**Verification step**: Confirm production ECR repositories exist after stack creation:
```bash
aws ecr describe-repositories --repository-names portals-prod/lore portals-prod/auth-gateway --region us-east-1
```

**Current status (2026-08-20 23:30Z)**: Production ECR repositories `portals-prod/lore` + `portals-prod/auth-gateway` exist (`IMMUTABLE`, `scanOnPush`). The `prod` Pulumi stack **is deployed contained** (102 resources, VPC `vpc-087e23a245117cfd5` `10.1.0.0/16` non-overlapping with `dev` `10.0.0.0/16`, all desired counts `0`, `authFoundationEnabled=true`, `securityControlsEnabled=true`, no public listener). **Fixes applied 2026-08-20**: `aws:region=us-east-1`, `PATH` for `pulumi-language-nodejs`, `LoadBalancers.ts` explicit `name` for TargetGroups (≤28 chars), `SecurityControls` skip second Access Analyzer (quota 1 → reuse `portals-dev-external-access`), `PlatformCluster` skip duplicate `AWSServiceRoleForECS`, import of pre-existing ECR repos, correct subnet CIDRs `10.1.1-3.0/24` + `10.1.10-12.0/24`, `db.t4g.micro`/`20GB`/`15.18` for free tier, `lowCostRdsSnapshotsEnabled=true` with 7-day retention. `pulumi up` succeeded — ALB `portals-prod-alb-fe7ca3e-289037285.us-east-1.elb.amazonaws.com` created, `prod` Cognito `us-east-1_IpSPOHKSW`, KMS JWT key `33e68d77...`, RDS `portals-prod-db`, DynamoDB, S3, Lambda/Scheduler backups deployed. ACM CNAME records created 2026-08-20 (DNS-only, `PENDING_VALIDATION` as of 21:53Z, awaiting `ISSUED`); new Nap release available (pending promotion into `versions.yaml` via `verify-and-promote-*`). All cosign fixes landed (`awskms:///` + `AWS_REGION`); both prod images `portals-prod/lore@sha256:a9256cb...` + `portals-prod/auth-gateway@sha256:6c0a1f50...` sign/verify.

Use non-overlapping production network ranges and leave all public/service
switches closed for this first apply:

```bash
cd infra/pulumi
pulumi stack init prod
pulumi config set environment prod
pulumi config set vpcCidr <non-overlapping-production-cidr>
pulumi config set publicIngressEnabled false
pulumi config set loreServiceDesiredCount 0
pulumi config set controlPlaneDesiredCount 0
pulumi config set authGatewayDesiredCount 0
pulumi config set authFoundationEnabled true
pulumi config set securityControlsEnabled true
pulumi config set recoveryControlsEnabled true
pulumi preview --diff
```

Review the preview before `pulumi up`. It must create only new production
resources and must not modify or destroy the contained `dev` stack. This is a
material AWS provisioning step (RDS, networking, ALB, and NAT can incur cost),
so choose the production database and network capacity deliberately instead of
copying development defaults blindly. The first apply creates no public
listener because `publicIngressEnabled=false`.

## How much manual work?

The first release has five human checkpoints. Everything else is scripted or
can be moved into GitHub Actions later.

| Human action | Why it cannot be safely automatic |
|---|---|
| Review and commit the security changes | A script cannot decide whether unrelated work belongs in a security release. |
| Create the Cloudflare certificate-validation records | Cloudflare controls the DNS zone and its credentials are intentionally not in this repository. |
| Create and authorize the dedicated artifact-signing key once | The key is a production trust root and needs an intentional KMS policy. |
| Approve use of the dedicated artifact-signing key | A signature is a human/software supply-chain assertion, not merely a build result. |
| Review the final Pulumi preview and E2E evidence | This is the deliberate decision to expose a public data plane. |

Once GitHub OIDC release automation is in place, the routine release path is:
commit/tag, CI builds/scans/signs, reviewer approves promotion, Pulumi applies
the reviewed digest. No one should manually copy an image digest or handle a
private signing key.

## Why build, scan, sign, and promote?

These are separate protections for different failures:

**Pre-requisites**: 
- Artifact-signing key `alias/portals-artifact-signing` must exist
- Production ECR repositories must be created
- Clean source commits must be available

| Gate | Stops | If omitted |
|---|---|---|
| Clean committed source | A release that cannot be reproduced or audited | The image may contain unreviewed local changes. |
| Immutable digest | A tag being overwritten after review | A later `latest`/nightly replacement can run different code. |
| ECR and Trivy scans | Known critical/high operating-system or library vulnerabilities | Known exploitable software reaches production. |
| SBOM and provenance | Untraceable build inputs and source | You cannot show what was deployed or reliably respond to a vulnerability. |
| Cosign signature | An unapproved actor publishing a usable image to ECR | ECR write access alone can become production-code execution. |

The artifact-signing key is separate from the JWT-signing key because they make
different promises. The JWT key signs short-lived user credentials; the
artifact key approves deployable software. Compromise or rotation of one must
not automatically compromise the other.

### One-time artifact-signing-key bootstrap

**Critical**: This key must be created before any production image signing can proceed. The key `alias/portals-artifact-signing` does not exist by default.

Create one KMS asymmetric signing key for container artifacts and give only the
release identity permission to use `kms:Sign`, `kms:GetPublicKey`, and
`kms:DescribeKey` on that key. Name it `alias/portals-artifact-signing`. Do not
grant the Auth Gateway task role access to it, and do not grant this key access
to the JWT signer. Record the key ARN in the release-role policy, not in source
code. The CLI example below refers to the alias only; it does not require a
private-key file.

**Verification step**: Confirm the key exists before proceeding:
```bash
aws kms describe-key --key-id alias/portals-artifact-signing --region us-east-1
```

## Build, scan, sign, and promote production images

Perform this only from clean, reviewed commits. The scripts refuse dirty source
for the files they package.

### Build tag strategy

Each build generates a unique intermediate tag to avoid ECR immutable tag conflicts:
- Format: `{release-version}-build-{timestamp}-{git-sha}`
- Example: `0.8.4-portals.6-build-20250822-143022-cc9bdfd`
- Production references use only immutable `@sha256:...` digests
- No convenience release tags are created; digests are the sole production references

This ensures:
- Multiple build attempts don't pollute the release namespace
- Clear audit trail of which build artifacts were tested
- Failed builds can be debugged without consuming release numbers
- Rollback to specific build artifacts if needed

1. Release the Lore CLI from the `portalshq/lore` fork. Verify and record it:

   ```bash
   infra/pulumi/scripts/verify-and-promote-lore-client-release.sh vX.Y.Z
   ```

2. Configure non-secret shell identifiers. The signing-key reference is an ARN
   or KMS URI; never put key material in the shell, repository, or Pulumi YAML.

   ```bash
   export AWS_PROFILE=portals-pulumi-deployer
   export AWS_REGION=us-east-1
   export ECR_REGISTRY='<account-id>.dkr.ecr.us-east-1.amazonaws.com'
   export ENVIRONMENT=prod
   export REQUIRE_SIGNATURE=true
   export COSIGN_KEY='awskms:///alias/portals-artifact-signing'
   ```

3. Build and promote the Lore server. This pushes a unique build tag, resolves its
   immutable digest, signs that digest, scans it, checks SBOM/provenance, and
   writes the verified digest/receipt only if all checks pass.

   ```bash
   infra/lore/scripts/docker-buildx-lore.sh vX.Y.Z
   ```

   Note: BUILD_ID is automatically generated per build attempt to prevent ECR tag
   conflicts during retry logic. Each build attempt (including retries) gets a
   unique identifier.

4. Build and promote the Auth Gateway, which is the active control-plane
   runtime:

   ```bash
   control-plane/scripts/publish-auth-gateway.sh
   ```

   The script automatically extracts the release version from `versions.yaml`
   and generates a unique build tag.

5. Review the resulting changes to `infra/lore/versions.yaml` and
   `infra/lore/verified-images.json`, then commit them with the release source.
   The expected repositories are `portals-prod/lore` and
   `portals-prod/auth-gateway`, each referenced as `@sha256:...`.

For `ENVIRONMENT=prod`, both publishing scripts now require
`REQUIRE_SIGNATURE=true`; they fail rather than write an unsigned production
pin. Do not use the JWT KMS key in `COSIGN_KEY`.

## Cloudflare certificate validation and ALB DNS

ACM creates the TLS certificate; Cloudflare only proves that Portals controls
the DNS names. This is a one-time certificate-validation step, not an
application deployment.

1. In AWS Certificate Manager, open the pending certificate and copy each
   CNAME **name** and **value** exactly as shown.
2. In Cloudflare, open the `portals.works` DNS zone and create a CNAME for each
   ACM record. Use **DNS only** (grey cloud), not proxied.
3. Wait for ACM to show `ISSUED`. Do not create the ALB listener first and do
   not point either hostname at an ECS task or an NLB.
4. After the production ALB exists, create DNS-only CNAME records:

   ```text
   lore.portals.works  -> <production-ALB-DNS-name>
   auth.portals.works  -> <production-ALB-DNS-name>
   ```

5. Verify DNS and certificate ownership before opening service routes:

   ```bash
    openssl s_client -connect lore.portals.works:443 -servername lore.portals.works \
      -verify_hostname lore.portals.works -verify_return_error </dev/null
   ```

The exact currently pending validation records are kept in the dated
[rollout status](rollout-status-2026-08-10.md). If the certificate is replaced,
use the new ACM-generated records rather than reusing old ones.

If ACM reports `VALIDATION_TIMED_OUT`, the old validation records are no longer
usable for that certificate. Request a replacement certificate, update
`publicCertificateArn` in the target Pulumi stack, and create the newly issued
ACM CNAME records before continuing. Do not retry public deployment against a
timed-out certificate.

## How a person logs in with Cognito

Cognito is the browser-facing identity provider. A user does **not** log in to
AWS, the ECS service, or a generic `auth.portals.works` web page. They start in
Nap, which directs the browser to Cognito's managed login page.

After the secured Nap release is installed, the normal command is:

```bash
nap auth login
```

The exact journey is:

1. Nap opens a TLS gRPC connection to the Auth Gateway at
   `https://auth.portals.works` and starts a one-time login session.
2. The gateway returns a unique Cognito managed-login URL of the form
   `https://<cognito-domain>.auth.us-east-1.amazoncognito.com/oauth2/authorize?...`.
   Nap opens that URL in the user's browser, or prints it when browser launch
   is unavailable.
3. The person completes the invitation-only Cognito login with their passkey
   or password/TOTP recovery. This is the only browser sign-in screen.
4. Cognito redirects the browser to
   `https://auth.portals.works/callback?code=...&state=...`. The Auth Gateway
   checks the PKCE-bound response, exchanges the short-lived code with Cognito,
   and records completion of that one-time CLI session.
5. Nap polls the Auth Gateway and receives Portals' eight-hour authentication
   token. It stores the token in the operating-system keyring; it does not
   retain a Cognito refresh token. Later repository operations automatically
   exchange it for a five-minute, single-repository authorization token.

`nap auth status` shows the current Portals identity and `nap auth logout`
removes its local credential. Normal clone/push/pull commands never ask for
interactive browser input; they either use the protected cached credential or
return an actionable login error.

The browser login requires the public Auth Gateway callback route and a valid
certificate. It cannot be tested against the current contained stack until the
certificate replacement is complete.

## JWKS: no separate server

You do **not** deploy a separate JWKS server. The Auth Gateway publishes
`https://auth.portals.works/.well-known/jwks.json`; it obtains the public key from
the dedicated JWT KMS key and signs tokens only when explicitly enabled. Lore
downloads and caches that public key set to verify tokens.

**Current status (2026-08-19)**: The implementation blocker that prohibited `jwtSigningEnabled` when `jwksPublicationEnabled` was true has been corrected. The safe sequence is now:

1. Deploy Auth Gateway privately and pass readiness.
2. Publish JWKS/health only on `auth.portals.works:443`.
3. Verify the expected `kid` is present in the live JWKS.
4. Enable JWT signing, deploy Lore privately, and verify Lore fetched that
   `kid`.
5. Run data-plane and negative tests before exposing Lore gRPC.

## Run the real release tests

**Pre-requisite**: Ensure IAM Access Analyzer is active before running release tests.

Run these against the isolated production candidate before public Lore gRPC is
enabled. Record the command output, image digests, release tags, timestamp, and
operator in the release issue or change record; never record tokens, API keys,
or database URLs.

**Verification step**: Confirm IAM Access Analyzer is active:
```bash
aws accessanalyzer list-analyzers --type ACCOUNT
```

| Test | Expected result |
|---|---|
| `nap auth login`, `nap auth status`, `nap auth logout` | Login is interactive; status identifies the signed-in subject; logout removes the protected credential. |
| Missing, expired, wrong issuer/audience/repository, wildcard, and revoked tokens | Every request is denied. |
| Repository create, clone, commit/push, pull, sync, publish | The caller receives only a five-minute token for the one authorized repository. |
| Fragment write/read and branch-pointer update | Actual S3 and DynamoDB serialization round-trips succeed. |
| Lock acquire/release | The actual Lore LockService round trip succeeds and conflicting locks are denied. |
| Service-account API-key exchange | A scoped, unrevoked key exchanges successfully; revoked/expired/wrong-repository keys fail. |
| `AdminService` / `Obliterate` | RPC returns `UNIMPLEMENTED`; no destructive action occurs. |
| ECS/ALB readiness | All target groups are healthy; Lore readiness includes its stores. |
| External scan | Only TCP `443` is reachable; `8083`, `41337`, and `41339` are closed. |

Run the external assertion after the release edge is present:

```bash
infra/pulumi/scripts/verify-external-surface.sh lore.portals.works release
```

The first execution should be operator-supervised. Turn this table into a
staging CI job once the published Nap release is available.

## Open the public endpoint last

Public release is one reviewed configuration change, not a debugging tool.
Before it, require: signed production images, approved Lore/Nap releases,
successful tests above, certificate validation, healthy backup evidence, and a
security review dated within 90 days.

In the **production** Pulumi stack only:

```bash
pulumi config set loreServiceDesiredCount 1
pulumi config set controlPlaneDesiredCount 0
pulumi config set authGatewayDesiredCount 1
pulumi config set loreJwksEndpoint https://auth.portals.works/.well-known/jwks.json
pulumi config set loreJwtIssuer https://auth.portals.works
pulumi config set jwtSigningEnabled true
pulumi config set authGatewayReady true
pulumi config set securityReviewDate YYYY-MM-DD
pulumi config set releaseGateApproved true
pulumi config set publicIngressEnabled true
pulumi preview --diff
```

**Critical (issuer exact match)**: `loreJwtIssuer` must be `https://auth.portals.works`
with **no trailing slash**. Lore compares the token `iss` claim byte-for-byte
against this value; configuring `https://auth.portals.works/` (trailing slash)
mismatches every issued token and Lore fails closed.

Review the preview. It must create or enable only the public TLS `443` edge and
must not add an NLB, public IP, `8083`, `41337`, or `41339` listener. Apply only
after that review, then immediately rerun the Nap workflow and external-surface
test. If any test fails, set `publicIngressEnabled=false` and scale Lore to zero
before investigating.

## Finish the identity revision

The current Identity Center account instance cannot supply AWS permission sets.
For this rollout, keep `portals-pulumi-deployer` as the temporary human
deployer with MFA and only its three documented rollout policies. Do not add an
IAM group or use the Identity Center Applications page for AWS deployment.

Before declaring the identity work complete:

1. Create a GitHub OIDC release role limited to signed artifact publication,
   exact ECS rollouts, and read-only health/log inspection.
2. Create a short-session human infrastructure role through an AWS
   Organizations Identity Center instance or another reviewed federation
   design. It must not use an access key.
3. Test one contained preview, deployment, rollback, snapshot operation, and
   CloudTrail attribution through those new roles.
4. Deactivate the existing IAM-user access key and observe one successful
   deployment cycle.
5. Delete that key; detach the three temporary policies; delete
   `portals-pulumi-deployer`; review CloudTrail and Access Analyzer afterward.

## Is there a dramatically simpler secure design?

Not without dropping a required protection. A public Lore server behind a
direct NLB, static bearer token, mutable image tag, or unauthenticated admin
RPC is simpler to wire but recreates the original exposure.

The current target is already the smallest defensible shape: one ALB on `443`,
one Auth Gateway, one Lore service, Cognito for user login, KMS for JWT signing,
ECR digests for software, and one release manifest. The initial effort is high
because it establishes trust roots (DNS, signing, source release, and
authorization). After CI/OIDC automation exists, ordinary releases become a
reviewed tag and promotion rather than repeated manual infrastructure work.
