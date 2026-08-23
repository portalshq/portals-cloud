# Portals release cycle runbook

This is the canonical, reusable runbook for cutting, promoting, and opening a
Portals/Lore release on the `portals.works` domain. It consolidates the
operator sequence from the [production release procedure](production-release-procedure.md),
the security contract from [Lore production security](lore-production-security.md),
and decisions recorded in the 2026-08-21 [security review](security-review-2026-08-21.md).
It contains no credentials, private keys, account passwords, or mutable image
tags.


## 0. Execution status — live snapshot

_Updated 2026-08-22. This section is rewritten as the cycle progresses; the
issues log below is append-only._

| Workstream | State |
|---|---|
| ACM `.works` certificate | **ISSUED** 2026-08-22T14:52Z (`32f56a6f…`, NotAfter 2027-03-07); both validation domains SUCCESS |
| Service DNS | `lore`/`auth.portals.works` → prod ALB, DNS-only, live |
| Source migration | Complete in all three repos (gateway audience const, lore strict-gate/TOMLs/tests, Nap routing incl. auth/api URLs); compile+tests green |
| Receipt ledger | **v2 shipped** (digest-keyed, append-only) + legacy-compat shim; currently `schemaVersion:2, receipts:{}` awaiting real promotions — previews fail-closed by design until then |
| OIDC | Provider + `portals-github-release` role (publication-only) + managed policy live; `.github/workflows/image-release.yml` wired (tag-triggered) |
| Egress hardening (#7) | `EgressControls` coded (6 interface endpoints + SG + private-zone alias auth→ALB), flag on prod; preview +33/−0 |
| Alarm contacts | SNS topic + `eng@portals.works` sub wired to all 7 alarms (confirm inbox after first apply) |
| Pulumi config | Both stacks: cert ARN, `.works` hostnames/callbacks, JWKS endpoint, issuer no-trailing-slash; prod also `authDomainPrefix`, `egressEndpointsEnabled=true` |
| Builds | Operator re-cutting with immutable build-identity fixes; earlier today-digests non-canonical |
| Next gates | promotions → BOM trio commit → `up dev` → stage-1 JWKS bootstrap → stage-2 private Lore → checklist §8 → checkpoint #5 opening window |

## 1. Normal release cycle overview

Every release follows the same loop:

1. **Commit** — source changes land as clean, reviewed commits. Production
   publishers refuse dirty source trees.
2. **Build** — images are built once from those commits (Lore server, Auth
   Gateway), or signed binary releases are cut (Lore CLI tag, Nap pipeline).
3. **Scan & sign** — ECR/Trivy scans, SBOM/provenance attestations, and cosign
   signatures over the resolved immutable digest
   (`REQUIRE_SIGNATURE=true`, `COSIGN_KEY=awskms:///alias/portals-artifact-signing`).
4. **Promote** — only `verify-and-promote-*` scripts may change pins. They
   verify scans/attestations/signatures/Sigstore bundles first, then
   atomically update `infra/lore/versions.yaml` plus its receipts.
5. **Gated deploy** — `pulumi preview --diff` review, then `pulumi up`, with
   all release assertions false until their evidence exists; assertions are
   enabled only in the fixed order of §5.
6. **Verify** — store-aware readiness, authenticated E2E matrix, external
   surface probe (`verify-external-surface.sh`), alarm and backup checks.

**Never hand-edit** `infra/lore/versions.yaml`, `infra/lore/verified-images.json`,
or `infra/lore/verified-releases.json`. These files are written exclusively by
the promotion scripts; a manual digest edit bypasses scan/sign/receipt binding,
and Pulumi will either refuse the pin or trust an unverified one. Hand-editing
them is a release-gate bypass, not a convenience.

## 2. Build tag strategy

Each build generates a unique intermediate tag to avoid ECR immutable tag conflicts and support multiple build attempts:

### Tag format
- Intermediate build tags: `{release-version}-build-{timestamp}-{git-sha}`
- Examples: `0.8.4-portals.6-build-20250822-143022-cc9bdfd`, `0.2.0-portals.6-build-20250822-150145-1a2b3c4`
- Production references: Only immutable `@sha256:...` digests in `versions.yaml`

### Benefits
- **No release number pollution**: Failed builds don't consume release versions
- **Clear audit trail**: Each build attempt is uniquely identifiable
- **Debuggability**: Failed builds can be inspected without namespace conflicts
- **Rollback support**: Specific build artifacts can be redeployed if needed
- **ECR compatibility**: Works with immutable tag policies

### Build ID generation
- Format: `YYYYMMDD-HHMMSS-git-short-sha`
- Can be set externally via `BUILD_ID` environment variable for coordinated builds
- Automatically generated if not provided
- Shared across coordinated multi-service builds via `build-prod-images.sh`

### Production references
- **No convenience release tags**: Only immutable digests are used in production
- `versions.yaml` contains only `@sha256:...` references
- Intermediate build tags are for organization and debugging only
- ECR lifecycle policies can clean up old build tags while preserving digests

## 4. Phase-by-phase procedure

Each phase: owner, command(s), typical duration, dependency, verification.
Do not start a phase until its dependency's verification has passed.

| # | Phase | Owner | Command(s) | Typical duration | Depends on | Verification |
|---|---|---|---|---|---|---|
| 1 | Source change | Engineer | normal dev workflow | varies | approved change/ticket | PR review approved |
| 2 | Clean-tree commit | Release engineer | commit on reviewed branch; confirm `git status` clean | minutes | Phase 1 | `git status` clean; commits pushed to remote |
| 3 | Lore CLI tag cut | Lore CLI maintainer (`portalshq/lore`) | `infra/lore/lore/scripts/bump-release.sh vX.Y.Z` then `infra/lore/lore/scripts/release-local.sh vX.Y.Z` (tag + GitHub-OIDC signed release) | 5–10 m | Phase 2 | GitHub release exists with `SHA256SUMS` + Sigstore bundle |
| 4a | Lore server image build + publish | Release engineer | export non-secret env (below); `infra/lore/scripts/docker-buildx-lore.sh vX.Y.Z` | 5–15 m | Phases 1–2; artifact-signing key exists | script writes verified digest/receipt; ECR + Trivy zero critical/high; SBOM/provenance decode; `cosign verify` passes; unique build tag generated (format: `{version}-build-{timestamp}-{git-sha}`) |
| 4b | Auth Gateway image build + publish | Release engineer | same env exports; `control-plane/scripts/publish-auth-gateway.sh` | 5–15 m | Phases 1–2; artifact-signing key exists | same as 4a; release version auto-extracted from `versions.yaml`; unique build tag generated |
| 5a | Promote Lore CLI release | Release engineer | `infra/pulumi/scripts/verify-and-promote-lore-client-release.sh vX.Y.Z` | 3–8 m | Phase 3 | `versions.yaml` `lore-client` entry updated by script; checksums verified; submodule gitlink untouched |
| 5b | Promote server images ×2 | Release engineer | `infra/pulumi/scripts/verify-and-promote-image.sh` for `lore`, then for `auth-gateway` (service, digest, platform, expected source/protocol/packaging commits) | 3–8 m each | Phases 4a–4b | `verified-images.json` receipts bound to exact index + platform digests |
| 5c | Promote Nap release | Release engineer | `infra/pulumi/scripts/verify-and-promote-nap-release.sh vX.Y.Z` (Nap CI pipeline itself runs 15–30 m before this) | 15–30 m total | Phase 5a (Nap dependency must match promoted lore client) | Sigstore bundles + all checksums verified; `versions.yaml` `nap-client` entry + `verified-releases.json` receipt written |
| 6 | Commit release BOM | Release engineer | `git add infra/lore/versions.yaml infra/lore/verified-images.json infra/lore/verified-releases.json && git commit` | minutes | Phases 5a–5c | diff contains only script-written pins/releases; committed with release source |
| 7 | Pulumi config/up (contained deploy) | Platform operator | `cd infra/pulumi`; set desired counts and switches (below); `pulumi preview --diff`; `pulumi up` | 5–15 m | Phase 6 | preview creates/enables nothing public; private tasks healthy; no `dev` stack destruction |
| 8 | JWKS bootstrap | Platform operator | see JWKS bootstrap ordering below | 15–45 m incl. applies | Phase 7 | live JWKS at `https://auth.portals.works/.well-known/jwks.json` contains expected `kid`; private Lore fetched that `kid` |
| 9 | Release gates set | Reviewer + platform operator | `pulumi config set authGatewayReady true`; `pulumi config set securityReviewDate YYYY-MM-DD` (≤90 d old); `pulumi config set releaseGateApproved true`; confirm `release.status: approved` in BOM | review-dependent | Phase 8 + E2E matrix passed + §8 checklist | every assertion evidenced in the change record; date backed by a real review |
| 10 | Final preview review checkpoint | Human approver (cannot be automated) | read `pulumi preview --diff` end-to-end | 10–20 m | Phase 9 | preview touches only the public TLS `443` edge; no NLB, public IP, or new listeners |
| 11 | Opening window (`publicIngressEnabled=true`) | Operator pair, supervised | `pulumi config set publicIngressEnabled true && pulumi preview --diff && pulumi up`; then immediately run E2E matrix + external probe | ~45 m supervised window | Phase 10 approval | E2E matrix passes and `infra/pulumi/scripts/verify-external-surface.sh lore.portals.works release` passes; otherwise execute §9 rollback immediately |
| 12 | Rollback / containment drill | On-call + platform | walk §9 tabletop; optionally rehearse containment against a contained stack | 30–60 m | Phase 11 | drill recorded in issue/change record with findings |
| 13 | OIDC path & deployer retirement | Platform + security | create GitHub-OIDC release role; short-session human role; test contained preview/deploy/rollback/snapshot + CloudTrail attribution through them; deactivate + delete access key; detach temporary policies; delete `portals-pulumi-deployer` | multi-day program | steady-state releases running via new roles | one successful full cycle via new roles; legacy user/key gone; CloudTrail + Access Analyzer reviewed afterward |

Non-secret shell identifiers for build phases 4a–4b (never put key material in
shell history, repository, or YAML):

```bash
export AWS_PROFILE=portals-pulumi-deployer
export AWS_REGION=us-east-1
export ECR_REGISTRY='<account-id>.dkr.ecr.us-east-1.amazonaws.com'
export ENVIRONMENT=prod
export REQUIRE_SIGNATURE=true
export COSIGN_KEY='awskms:///alias/portals-artifact-signing'
```

With `ENVIRONMENT=prod`, both publishers hard-require `REQUIRE_SIGNATURE=true`
and fail rather than write an unsigned production pin. Never use the JWT KMS
key as `COSIGN_KEY`.

Contained-deploy config for phase 8 (all closed by default):

```bash
pulumi config set environment prod
pulumi config set loreServiceDesiredCount 0
pulumi config set controlPlaneDesiredCount 0
pulumi config set authGatewayDesiredCount 0
pulumi config set publicIngressEnabled false
```

### JWKS bootstrap ordering (phase 9)

Publish-before-use, never sign-before-publish:

1. Deploy the Auth Gateway privately and pass store-aware readiness.
2. Set `jwksPublicationEnabled=true`: publish JWKS/health only on
   `auth.portals.works:443`. The callback, Auth gRPC, and Lore routes remain
   absent in bootstrap mode.
3. Fetch the live JWKS and verify the expected `kid` is present.
4. Set `jwtSigningEnabled=true`, deploy Lore privately, and verify Lore
   fetched that `kid`.
5. Run data-plane and negative tests before exposing Lore gRPC.

During later key rotations, publish the new JWK alongside the still-active old
key; retain retired public keys for eight hours plus ten minutes.

## 5. Special notes A — domain migration `.sh` → `.works`

- **Audience cut invalidates tokens.** The recipient-protection audience root
  moves `portals.sh` → `portals.works`, and the issuer becomes
  `https://auth.portals.works`. Every token issued under the old audience stops
  validating at cutover: users re-run `nap auth login`; CI exchanges a newly
  created service-account API key. No legacy token is grandfathered.
- **Two DNS phases, both DNS-only (grey cloud):**
  1. *Validation*: copy the exact ACM validation CNAME name/value pairs for
     `lore.portals.works` / `auth.portals.works` into the `portals.works`
     Cloudflare zone. Wait for ACM `ISSUED`. Do not create listeners first and
     do not reuse records from superseded certificates.
  2. *Service*: only after `ISSUED`, create CNAME records pointing both
     hostnames at the production ALB DNS name. Never point them at an ECS task
     or NLB; keep proxying off until gRPC compatibility and TLS ownership are
     deliberately validated.
- **Issuer trailing-slash trap.** Lore compares the JWT `iss` claim
  byte-for-byte. Configure `loreJwtIssuer https://auth.portals.works` with **no
  trailing slash**, identically at issuance and verification;
  `https://auth.portals.works/` mismatches and fails closed on every request.
- Superseded certificates must not be retried: see the dated migration entry
  in [rollout-status-2026-08-10.md](rollout-status-2026-08-10.md).

## 6. Special notes B — contained → public first release

The first opening exposes TCP `443` in two stages, never as one big-bang flip:

- **Stage 1 (bootstrap `443`)**: `jwksPublicationEnabled=true` exposes JWKS and
  health routes only. The callback, Auth gRPC, and Lore listener rules do not
  exist yet. Verify the live `kid` before anything else.
- **Stage 2 (full `443`)**: after stage-1 verification and private Lore
  signed-token tests, enable `jwtSigningEnabled`, pass every gate, then open
  the complete edge in one reviewed preview.

Assertion order is fixed; each step needs evidence before the next:
`authGatewayReady` → `securityControlsEnabled` (+ `securityReviewDate` ≤ 90 d)
→ `releaseGateApproved` (+ `release.status: approved`) → `publicIngressEnabled`
last. The stack rejects the full public edge while signing is disabled, and
rejects public ingress with under-seven-days automated PITR unless the
low-cost snapshot bridge (`lowCostRdsSnapshotsEnabled=true`) is enabled.

## 7. Decisions ledger — recorded 2026-08-21

| Decision | Choice | Consequence / rationale |
|---|---|---|
| RDS 35-day automated PITR | **Declined** for now | Keep the account-capped 1-day automated retention plus the 7-day manual snapshot bridge (`lowCostRdsSnapshotsEnabled`). Revisit deliberately when paid PITR fits budget; never silently stop backups. |
| Alarm notification contacts | **Approved** | Wire SNS topics/on-call contacts for target-health, edge 4xx/5xx, WAF-block, and RDS-backup alarms. |
| General HTTPS egress narrowing | **Implement controls — not risk acceptance** | Deploy VPC interface endpoints for critical AWS services, add a private hosted zone alias `auth.portals.works → ALB`, and tighten task security groups. Replaces the earlier broad-egress acceptance. |
| Receipt-ledger format | **v2 adopted** | Promotion receipts bind source/protocol/packaging commits, exact index + platform digests, scan results, and signature state under the v2 schema. |
| Restore rehearsal cadence | **Quarterly manual drill** | Free-tier-compatible: restore quarterly into an isolated account/VPC, validate hashes and branch pointers, acquire/release a lock, destroy the test restore, record evidence. |

## 8. Gate checklist + E2E matrix

### Build/release gates

| Gate | Stops | If omitted |
|---|---|---|
| Clean committed source | A release that cannot be reproduced or audited | Image may contain unreviewed local changes. |
| Immutable digest | A tag being overwritten after review | A later `latest`/nightly replacement can run different code. |
| ECR and Trivy scans | Known critical/high OS/library vulnerabilities | Known exploitable software reaches production. |
| SBOM and provenance | Untraceable build inputs and source | You cannot show what was deployed or respond reliably to vulnerabilities. |
| Cosign signature | An unapproved actor publishing a usable image to ECR | ECR write access alone becomes production-code execution. |

### Pre-ingress checklist (evidence required per item)

- [ ] Previously exposed signing, S3, database, TLS, and runtime credentials rotated.
- [ ] Only digest-pinned ECR images configured; SBOM and signature verified.
- [ ] Image receipts match clean committed source/protocol/packaging revisions.
- [ ] Signed Nap release and pinned `portalshq/lore` client share one security contract in `versions.yaml`.
- [ ] Lore refuses missing/wrong issuer, audience, environment, algorithm, expiration, `kid`, repository, permission, wildcard, and revoked tokens.
- [ ] AdminService/Obliterate returns `UNIMPLEMENTED`.
- [ ] Store-aware readiness healthy on every task.
- [ ] Fragment S3/Dynamo serialization and lock round trips pass.
- [ ] Dependency, SAST, secret/IaC/container scans clear of unresolved critical/high findings.
- [ ] Backup evidence current (bridge snapshots healthy while automated PITR < 7 days).
- [ ] Access Analyzer findings triaged; `securityReviewDate` within 90 days.
- [ ] Assertions set in order: `authGatewayReady` → `securityControlsEnabled` → `releaseGateApproved`; `publicIngressEnabled` last.

### E2E matrix

Pre-check IAM Access Analyzer is active: `aws accessanalyzer list-analyzers --type ACCOUNT`.
Run against the production candidate before public Lore gRPC opens; rerun the
full matrix immediately after the opening window. Record command output,
digests, tags, timestamp, and operator — never tokens, API keys, or database URLs.

| Test | Expected result |
|---|---|
| `nap auth login`, `nap auth status`, `nap auth logout` | Login interactive; status identifies subject; logout removes protected credential. |
| Missing, expired, wrong issuer/audience/repository, wildcard, revoked tokens | Every request denied. |
| Repository create, clone, commit/push, pull, sync, publish | Caller receives a five-minute token for exactly one authorized repository. |
| Fragment write/read and branch-pointer update | Real S3/DynamoDB serialization round-trips succeed. |
| Lock acquire/release | LockService round trip succeeds; conflicting locks denied. |
| Service-account API-key exchange | Scoped unrevoked key works; revoked/expired/wrong-repository keys fail. |
| `AdminService` / `Obliterate` | RPC returns `UNIMPLEMENTED`; no destructive action occurs. |
| ECS/ALB readiness | All target groups healthy; Lore readiness proves its stores. |
| External scan | Only TCP `443` reachable; `8083`, `41337`, `41339` closed. |

External assertion after the release edge exists:

```bash
infra/pulumi/scripts/verify-external-surface.sh lore.portals.works release
```

First execution is operator-supervised; promote it to staging CI afterwards.

## 9. Rollback & containment

Rollback order — if any post-open test fails, stop and contain before
investigating:

1. `publicIngressEnabled=false` and scale Lore/Auth-Gateway desired counts to
   zero.
2. Revoke public SG ingress immediately.
3. Preview/apply deletion of listeners and ports; preserve logs and snapshot
   state.
4. Inventory and invalidate all possibly-exposed tokens/secrets.
5. Restore the last known-good digest/config — promote the prior digest, never
   rebuild between environments; restore state only if a migration is
   incompatible.
6. Rerun the complete negative + data-plane matrix before reopening. Never roll
   back to an exposed key, mutable tag, static AWS credential, public NLB, or
   unauthenticated configuration.

Emergency signer revocation: remove the JWK, restart Lore tasks to flush the
cache, revoke sessions/API keys, keep ingress closed until fresh credentials
pass E2E. The ten-minute stale-key window is an availability concession;
restart gives immediate invalidation. Set retired KMS key ARNs in
`jwtRetiredKmsKeyArns` before activating the new key.

## 10. Timeline estimates

Fill the **Actual** column during execution.

| Step | Estimate | Actual |
|---|---|---|
| ACM certificate request (`.works` SANs) | ~2 m | |
| ACM `ISSUED` after validation CNAMEs | 5 m – several hours post-CNAME | |
| Lore server image build + publish | 5–15 m | |
| Auth Gateway image build + publish | 5–15 m | |
| Each `verify-and-promote-*` promotion | 3–8 m each | |
| Nap pipeline (CI build/sign + promotion) | 15–30 m | |
| `pulumi up` (contained foundation or gated apply) | 5–15 m | |
| JWKS bootstrap + private Lore verification | 15–45 m | |
| Opening window (preview → up → immediate E2E + probe) | ~45 m supervised | |
| Rollback / containment drill walkthrough | 30–60 m | |

## 11. Issues & deviations log

| # | Time (2026-08-21) | Issue | Resolution |
|---|---|---|---|
| 1 | Wave 1A | `AWS_PROFILE=portals-pulumi-deployer` absent from agent shell | Default profile resolves to the deployer identity; dropped explicit profile |
| 2 | Wave 1A | `RequestCertificate` rejected idempotency token with hyphens (`\w+` constraint) | Retried with `portalsworks20260821` |
| 3 | Wave 1A | First request denied — policy requires `aws:RequestTag/Project=portals` | Re-requested with tag; issued `32f56a6f` |
| 4 | Wave 1A | `acm:DeleteCertificate` not granted to deployer role | Operator deleted both stale certs via console |
| 5 | Waves 1C/D | Parallel subagent runs interrupted mid-flight; lore track died 3x | Operator completed gateway+nap migrations concurrently; agent work verified complete post-mortem; ledger v2 applied directly |
| 8 | Wave 2 | Prod Cognito RP ID fell back to authHostname (authDomainPrefix unset in prod) | Set `portals-prod-auth-907199504810`; preview now creates hosted domain + keeps RP ID on Cognito prefix (passkeys safe) |
| 9 | Wave 2 | Dev blocked on legacy v1 receipts after v2 gate landed | Added transitional v1-read compat (image-match enforced); full v2 receipts regenerate at promotion |
| 10 | Wave 2 | `pulumi-language-nodejs` missing from PATH | Prepend `/Users/vibrantceo/.pulumi/bin` — documented for future runs |
| 14 | Wave 3 | ECR repos flicker in/out of API visibility during concurrent operator pulumi churn; lifecycle-policy put hit transient RepositoryNotFound + spurious schema-validation failure on canonical JSON | Deferred lifecycle policies (untagged>14d expiry) until APIs settle; ledger confirmed noise-free by construction; retry after builds settle |
| 14 | Wave 4 | Alarm contacts wired: `SecurityControls` now provisions SNS topic+email sub when `alarmNotificationEndpoint` set; topic ARN threaded into all 7 alarm actions (5 edge/target, 2 RDS-backup). Set `eng@portals.works` both stacks — inbox confirmation required after first apply | Component reorder (securityControls above cluster) to satisfy declaration order; tsc clean |
| 22 | Wave 5 | Route53 private zone (~$0.50/mo, outside free tier) | Operator accepted pending post-deploy assessment; revisit at first security review |
| 23 | Wave 6 | SNS subscription for eng@portals.works **confirmed by operator** — alarm email delivery live |
| 24 | Wave 7 | E2E identity `e2e-prod@portals.works` policy: disable (not delete) after matrix passes; reversible, no usable credential while disabled |
| 25 | Future | Deployer-user retirement deferred until one real release runs through GitHub OIDC CI; then deactivate key → observe cycle → delete key/policies/user + CloudTrail review (procedure §Finish the identity revision) |
| 21 | Wave 4 | Ignorefile passed as a host temp path to the containerized Trivy → silently unapplied (container cannot see host files); incremental patches had also left promote script structurally broken (functions after use, dangling elif, duplicate scan blocks) | Full deterministic reconstruction of `verify-and-promote-image.sh`: helpers before use, single scan block, client-side exception policy (JSON output → jq filter mirroring ECR recount), fail-closed empty allowlist, `-s` guard on scanner JSON, `date +%Y-%m-%d` (BSD-safe), shred fallback. Unit tests: suppression ✓, unknown-CVE passthrough ✓, bash-3.2 audit clean |
| 20 | Wave 4 | Trivy HIGH `CVE-2026-14456` (OpenSSL QUIC-server DoS, `libssl3t64`) — Debian status `fix_deferred`, no fixed version → both gates correctly refused promotion | Implemented reviewed-exception mechanism (`trivy-exceptions.json`): ID+expiry enforced on Trivy via generated ignorefile and on ECR by recounting findings minus active IDs; expired/unknown CVEs still fail closed. Exception approved for this CVE, expires **2026-11-22** (re-review trigger), rationale recorded in-file: no OpenSSL QUIC server runs (Lore quic disabled, TLS at ALB/rustls); libssl is a distroless cc runtime dep |
| 19 | Wave 4 | Rerun still hit `~/.aws` mount error: build launched with pre-hardening scripts (40-min lore compile overlapped the fix commit); wrapper also exported TRIVY_BIN as an entire docker command string, and gateway attempt-3 hit ECR StartImageScan LimitExceeded (scanOnPush already scans) | Wrapper export removed; promote script now tolerates quota/already-scanning by polling findings; committed a1c5209 — next rerun is cache-fast |
| 18 | Wave 4 | Trivy container step bind-mounted `~/.aws` — impossible on remote builders (`mkdir /host_mnt/... permission denied`) | Hardened `verify-and-promote-image.sh`: docker-trivy is now the default (no host install, per policy); creds resolve on the invoking host (`export-credentials` or session env), fail-fast when absent; injected via 0600 temp env-file shredded post-run; plaintext tcp:// endpoints refused (transit guard). argv/logging exposure: none |
| 17 | Wave 4 | Root cause of `no linux/arm64 runnable manifest`: prod-mode single-arch branch omitted `--platform`, so amd64 remote-builder stamped arm64 binaries as amd64; promotion gate refused (fail-closed ✓) | Fixed properly: `$BUILDPLATFORM` guards on builder stages, `$TARGETPLATFORM` on runtime stages, explicit per-arch `--platform` in single mode, fail-fast guard against non-arm64 targets in both Dockerfiles, regression greps updated (incl. stale pre-existing PLATFORMS assertion). Works on any builder incl. amd64 CI — zero QEMU |
| 16 | Wave 4 | Builds re-cut in progress — operator correcting immutable build-identity issues before promotion; earlier today-digests treated as non-canonical intermediates | Agent standing down from ECR fingerprinting; canonical selection rule unchanged (newest index-with-attestation per repo once operator signals done). Nap repo committed (routing `.works`) |
| 15 | Wave 4 | Concurrent publisher run triggered v1→v2 ledger migration, leaving `{schemaVersion:2, receipts:{}}` empty when its promote step did not complete → previews/tests correctly fail-closed on missing receipts | Expected transitional state; real receipts land as each `verify-and-promote-image.sh` succeeds. Ops serialization in effect |
| 13 | Wave 3 | Image publishing had no CI consumer for the new OIDC role | Added `.github/workflows/image-release.yml` (tag v* → assume portals-github-release → same publisher scripts); first live proof deferred to Wave-7 contained run |
| 12 | Wave 3 | Egress hardening (#7) implemented in code as `EgressControls` (6 interface endpoints + endpoints SG + private zone alias auth→ALB), flag `egressEndpointsEnabled` default false, enabled on prod | Prod preview +10 create / 0 delete; dev untouched; SG tightening deferred until endpoints verified |
| 11 | Wave 3 | Path decision: single clean deploy after .works images land (no bootstrap-on-old-image) | Operator chose standardized no-shortcut path; stage-1 JWKS apply deferred until promotions complete |

| 7 | Wave 1H | Console policy error "Has prohibited field Principal" — trust JSON pasted into permissions slot | Swapped: trust is assume-role policy, permissions is managed policy; posted both via IAM (provider+role 2026-08-22) |
| 6 | Wave 1E | v2 lookup initially failed tests — legacy `receipt?.image === image` clause survived refactor | Clause removed (key equality supersedes); security.test.ts prod.toml assertion updated to `.works` |
Live log — append rows during execution; never delete entries.

| Date/time (UTC) | Phase | Issue / deviation | Owner | Resolution / link |
|---|---|---|---|---|

## 12. Sign-off

Human checkpoints — approval cannot be delegated to automation:

| Checkpoint | Approver | Date (UTC) | Evidence link |
|---|---|---|---|
| 1. Security changes reviewed & committed (clean source) | | | |
| 2. Certificate-validation records created (DNS-only, `.works` zone) | | | |
| 3. Artifact-signing key created & authorized (one-time KMS policy) | | | |
| 4. Artifact-signing key use approved | | | |
| 5. Final Pulumi preview + E2E evidence reviewed | | | |

Deployer retirement approval (separate sign-off, after the OIDC path is proven):

- [ ] GitHub-OIDC release role created and tested (signed publication, exact ECS rollouts, read-only health/log inspection).
- [ ] Short-session human infrastructure role tested; uses federation, not an access key.
- [ ] One contained preview, deployment, rollback, snapshot operation, and CloudTrail attribution observed through the new roles.
- [ ] Legacy access key deactivated; one successful deployment cycle observed; key deleted.
- [ ] Temporary policies detached; `portals-pulumi-deployer` deleted; CloudTrail + Access Analyzer reviewed afterward.

Approved by: ____________________ Date: ____________
