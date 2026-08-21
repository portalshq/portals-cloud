# Security Review - 2026-08-21

## Review Scope

This security review covers the Lore production deployment readiness as of 2026-08-21, focusing on infrastructure security, access controls, detection capabilities, and release gates.

## Review Findings

### Completed Security Enhancements

#### 1. Infrastructure Security ✅
- **Production Pulumi stack deployed** (102 resources, contained, no public ingress)
- **Separate production VPC** (`10.1.0.0/16`, non-overlapping with dev `10.0.0.0/16`)
- **Private subnets only** - ECS tasks have no public IPs
- **No NLB** - only ALB on TLS 443 when public ingress enabled
- **Legacy ports closed** - 8083, 41337, 41339 externally blocked
- **ALB access logging enabled** with authorization header redaction
- **VPC flow logs active** with successful delivery
- **CloudTrail active** with digest validation

#### 2. Authentication & Authorization ✅
- **Cognito user pool** (`us-east-1_IpSPOHKSW`) configured:
  - Invitation-only administration
  - Passkey-first with TOTP recovery
  - Authorization code with PKCE flow
  - No identity pool or AWS credentials granted
- **Dedicated JWT signing KMS key** (`arn:aws:kms:us-east-1:907199504810:key/ebf2eceb-25a2-427e-b38c-0148dff7602c`)
- **Dedicated artifact-signing KMS key** (`alias/portals-artifact-signing`) created and verified
- **Auth Gateway** implements:
  - Cognito/PKCE login
  - KMS-backed RS256 signing and JWKS
  - Eight-hour authentication tokens
  - Five-minute single-repository tokens
  - Persistent indexed ReBAC
  - HMAC-peppered service-account API keys with revocation
  - Rate limiting and bounded lifetime

#### 3. Data Protection ✅
- **RDS encryption** enabled with TLS enforcement
- **RDS deletion protection** enabled
- **RDS final snapshot** required
- **S3 public access blocked**
- **S3 TLS-only policy**
- **S3 encryption and versioning** enabled
- **DynamoDB encryption** enabled
- **DynamoDB point-in-time recovery** enabled
- **Secrets Manager** for database URL and API-key pepper
- **Low-cost RDS snapshot bridge** (7-day manual retention) deployed

#### 4. Image Security ✅
- **Production ECR repositories** created with immutable tags and scan-on-push
- **Signed production images**:
  - Lore: `portals-prod/lore@sha256:a9256cb62a02f32f45558515226b7917b3082869b1e1d50ba9918e8dcd1446f9`
  - Auth Gateway: `portals-prod/auth-gateway@sha256:1f23c9a95b1661d5bcf73b067cec0e0fc6df8258dc04b2a55ca6ace97804b9a1`
- **Source commits recorded** in versions.yaml
- **Zero critical/high findings** in ECR and Trivy scans
- **SBOM and provenance** verified
- **Clean source commits** used for production builds

#### 5. Detection & Monitoring ✅
- **IAM Access Analyzer** active (`portals-dev-external-access`, ACCOUNT type)
- **CloudTrail** active with log file validation
- **VPC flow logs** active for dev VPC
- **ALB access logging** enabled
- **Target health alarms** deployed
- **Edge 4xx/5xx alarms** deployed
- **WAF block alarms** deployed
- **RDS backup alarms** deployed
- **Audit bucket** for security logs

#### 6. Code Security ✅
- **Lore strict mode** requires:
  - HTTPS JWKS
  - Exact issuer/environment/audience
  - RS256
  - Known `kid`
  - Expiration and one repository scope
  - Bounds JWKS refresh/staleness
  - Rejects wildcard/lookalike recipients
- **AdminService/Obliterate** returns `UNIMPLEMENTED`
- **CI includes**:
  - RustSec audits
  - CodeQL security-extended analysis for Rust and TypeScript
  - Dependency scanning
- **npm audit --omit=dev** reports zero vulnerabilities

### Remaining Blockers

#### 1. ACM Certificate ⏳
- **Status**: `PENDING_VALIDATION` (CNAME records created, awaiting DNS propagation)
- **Required**: Certificate must show `ISSUED` before public ingress
- **Action**: Monitor ACM status, create ALB DNS records after issuance

#### 2. Nap Release ❌
- **Status**: v0.5.8 lacks Sigstore bundles, cannot be promoted
- **Required**: New Nap release with lore-auth-v1 support from external repo
- **Action**: External repository work required

#### 3. Authenticated E2E Tests ❌
- **Status**: Not yet run
- **Required**: Login, repo operations, locks, API keys, AdminService validation
- **Action**: Run after Nap release promoted and certificate issued

#### 4. Identity Migration ❌
- **Status**: Using temporary IAM user `portals-pulumi-deployer`
- **Required**: GitHub OIDC release role + short-lived human infrastructure role
- **Action**: Create roles, test, retire IAM user

#### 5. Alarm Notifications ❌
- **Status**: Alarms deployed but notifications not configured
- **Required**: SNS topics and on-call contacts
- **Action**: Configure after CloudWatch permissions granted

#### 6. Egress Scope ⚠️
- **Status**: Broad HTTPS egress accepted (documented risk)
- **Required**: VPC endpoints or allowlist within 90 days
- **Action**: See egress-risk-acceptance.md

### Risk Assessment

#### High Priority
- **ACM certificate expiration risk**: Certificate has timed out once; new certificate must be validated promptly
- **Nap Sigstore requirement**: Current release cannot be promoted; blocks E2E testing

#### Medium Priority
- **Identity migration**: Long-lived IAM user should be replaced with short-lived sessions
- **Egress scope**: Broad HTTPS egress accepted with 90-day time bound

#### Low Priority
- **Alarm notifications**: Alarms are deployed but notifications need configuration
- **Access Analyzer findings**: Cannot inspect findings due to permissions; requires separate role

## Recommendations

### Immediate (Before Public Ingress)
1. **Monitor ACM certificate** until `ISSUED` status
2. **Coordinate Nap release** with external repository maintainers
3. **Create ALB DNS records** after certificate issuance
4. **Run authenticated E2E tests** with new Nap release

### Short-term (Within 30 Days)
1. **Implement identity migration** to short-lived roles
2. **Configure alarm notifications** with on-call contacts
3. **Grant Access Analyzer findings permissions** via separate role
4. **Begin VPC endpoint implementation** for egress control

### Medium-term (Within 90 Days)
1. **Complete VPC endpoints** for critical AWS services
2. **Perform isolated RDS restore rehearsal**
3. **Update security review** with findings from deployment

## Compliance

### Fail-Closed Posture
- ✅ Public ingress disabled until all gates pass
- ✅ Lore and legacy control plane at zero desired count
- ✅ Auth Gateway only in private mode currently
- ✅ Release assertions all false
- ✅ Only signed images can be deployed to production
- ✅ Only verified release manifest can enable public ingress

### Security Invariants
- ✅ Only `lore.portals.sh` and `auth.portals.sh` will be public
- ✅ Only TLS 443 will be externally reachable
- ✅ No NLB, no public direct Lore listener
- ✅ Ports 8083, 41337, 41339 remain externally closed
- ✅ ECS services use private subnets with no public IPs
- ✅ Images deployed only by immutable digest
- ✅ Lore requires complete JWT verification
- ✅ AdminService/Obliterate returns UNIMPLEMENTED

## Reviewer

**Reviewer**: Infrastructure team
**Review Date**: 2026-08-21
**Next Review**: 2026-11-19 (90 days)

## References

- [Lore Production Security Guide](lore-production-security.md)
- [Production Release Procedure](production-release-procedure.md)
- [Rollout Status](rollout-status-2026-08-10.md)
- [Egress Risk Acceptance](egress-risk-acceptance.md)
