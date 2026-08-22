# Portals Cloud / Lore threat model

Last reviewed: 2026-08-11. Scope: the AWS Lore data plane, Auth Gateway,
retired legacy control plane, Nap client, identity/signing path, and
S3/DynamoDB/RDS stores.

## Assets

- Repository fragments, branch pointers, locks, relationships, and audit logs.
- User sessions, short-lived JWTs, service-account API keys, peppers, and KMS keys.
- AWS roles, database credentials, backups, image digests, and deployment state.
- Availability and integrity of repository creation, sharing, synchronization,
  publication, deletion, and restoration.

## Actors

- Repository owners and collaborators.
- CI service accounts.
- Platform operators and security responders.
- Anonymous internet attackers, malicious users/collaborators, compromised
  clients/runners, dependency or image suppliers, and compromised AWS principals.

## Trust boundaries

1. Internet to ALB/WAF on TLS `443`.
   Cloudflare is the authoritative DNS provider for the public hostnames; ACM
   proves control through DNS validation records before the ALB can use them.
2. ALB to private Lore task over h2c.
3. Cognito to Auth Gateway authorization-code/PKCE processing.
4. Gateway to KMS, its private ReBAC/API-key services, and token issuance. The
   legacy control plane is absent from production.
5. ECS task roles to S3, DynamoDB, RDS, Secrets Manager, and KMS.
6. Nap OS process to OS keyring and optional isolated-development token file.
7. Build system to ECR digest, SBOM, signature, and deployment promotion.

## Primary abuse paths and controls

| Abuse path | Impact | Controls |
|---|---|---|
| Anonymous data/admin RPC | Total loss or disclosure | One TLS endpoint, mandatory JWT, AdminService disabled, negative external scan |
| Algorithm confusion or forged JWT | Cross-tenant access | RS256 pin, known `kid`, exact issuer/audience/env/exp validation |
| Repository wildcard/scope confusion | Cross-repository access | Exactly one concrete `urc-*` resource, wildcard rejection, indexed ReBAC |
| `evilportals.sh` recipient suffix | Credential exfiltration | Parsed hostnames and DNS-label-boundary matching |
| Caller-selected subject/permissions | Privilege escalation | Private control plane; gateway derives subject and permissions server-side |
| Stolen API key/token | Replay | Five-minute authz tokens, 90-day API-key cap, revocation, rate limiting, keyring |
| Database/storage credential theft | Bulk data access | ECS task roles, scoped IAM, no static keys, rotation and logging |
| Malicious or unverified image promotion | Code execution | Immutable ECR, exact index/platform digest receipts, two independent vulnerability scans, SBOM/provenance checks, signature gate, staged promotion |
| Destructive operator/RPC action | Irrecoverable loss | Admin RPC unavailable, two-person audited workflow, backups/versioning/PITR |
| Partial repository provisioning/deletion | Orphan or stale authorization | Storage-first idempotent owner repair; two-phase deletion confirmation; no caller existence flags |
| JWKS outage or compromised signer | Outage/forgery | Publish-before-use, 60s refresh, 10m stale cap, retained retired keys, emergency restart |
| Network observer on ALB-task hop | Content/token disclosure | Isolated VPC and SGs now; mTLS/service mesh trigger before boundary expansion |
| Compromised collaborator | Malicious writes | Repository scoping and audit; owners alone manage sharing/deletion |
| Backup failure/ransomware | Permanent loss | RDS backups, S3 versioning, Dynamo PITR, isolated restore rehearsals |
| Compromised deployment identity | Account-wide resource compromise | Short-lived SSO/OIDC role, scoped temporary bootstrap, CloudTrail, removal of legacy broad IAM user policy |
| DNS-account takeover or validation-record tampering | Certificate issuance or traffic redirection | Cloudflare MFA/least privilege, exact-name ACM certificates, DNS audit, certificate-transparency monitoring |

## Security assumptions

- AWS IAM/KMS/Cognito and TLS primitives behave as documented.
- Platform operators protect Pulumi state and use individual audited identities.
- The VPC remains isolated until h2c is replaced.
- Clients validate `lore.portals.works` certificates and do not enable insecure TLS.
- Auth Gateway completes PKCE verification and never trusts caller-supplied claims.

## Residual risks

- ALB-to-Lore h2c lacks cryptographic confidentiality/integrity inside the VPC.
- PostgreSQL uses `verify-full` with a checksum-pinned, region-scoped AWS RDS
  CA bundle; CA rotation requires a reviewed image/bundle checksum update.
- Service HTTPS egress is still broad pending VPC endpoints plus an egress
  proxy/firewall allowlist; task roles limit AWS API authorization, not network reach.
- A compromised owner can intentionally grant collaborators or request deletion.
- Stale JWKS may accept a revoked signing key for up to ten minutes unless tasks restart.
- Endpoint and credential controls cannot repair a malicious dependency; supply-chain
  scanning, signatures, and review reduce but do not eliminate that risk.
- ECR basic scanning and Trivy can disagree or miss newly disclosed issues. Receipts
  bind evidence to a digest but do not make old evidence permanently current; release
  automation must rescan before deployment and periodically after deployment.
- Until the deployer is migrated, its long-lived access key and legacy broad
  managed policy remain a high-impact administrative credential.
- DNS control remains an external administrative trust boundary. A Cloudflare
  compromise can redirect the public names or authorize replacement
  certificates even though it cannot directly access private application tasks.

## Mandatory reassessment triggers

Revisit this model before VPC peering/shared networking, regulated data,
cross-provider service calls, new public endpoints, new token audiences,
external identity providers, service meshes, destructive workflows, or changes
to repository ownership semantics.
