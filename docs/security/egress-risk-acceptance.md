# Egress Risk Acceptance

## Current State

The production deployment allows broad HTTPS egress from ECS tasks to the internet. This is a documented risk acceptance with explicit time bounds.

## Risk Assessment

### Current Egress Scope
- **Allowed**: HTTPS (TCP 443) to any external endpoint
- **Denied**: Direct external access to ECS tasks (private subnets, no public IPs)
- **Mitigations**:
  - ALB-to-target hops are plaintext (accepted residual risk, explicitly documented)
  - Tasks use scoped IAM roles with least-privilege permissions
  - No plaintext credentials in environment variables (use Secrets Manager)
  - KMS operations for signing are encrypted and audited via CloudTrail

### Accepted Risks
1. **Task-level outbound HTTPS**: ECS tasks can initiate HTTPS connections to any external endpoint
   - **Impact**: Compromised task could exfiltrate data or reach unexpected services
   - **Likelihood**: Low (tasks run in private subnets with no public IPs, require IAM role compromise)
   - **Mitigation**: IAM role policies are scoped to specific AWS services only

2. **ALB-to-target plaintext**: The hop from ALB to ECS tasks is not encrypted (internal VPC traffic)
   - **Impact**: Network-level compromise could observe traffic between ALB and tasks
   - **Likelihood**: Low (requires VPC-level compromise, traffic stays within AWS infrastructure)
   - **Mitigation**: VPC is isolated, no direct internet routing to task network

### Not Accepted Risks
- **Task-level plaintext HTTP**: HTTP is not used for external communication
- **Direct task internet access**: Tasks have no public IPs, no NAT gateway to public internet
- **Credential exposure**: No credentials in environment variables, all secrets via Secrets Manager

## Time-Bound Acceptance

**Acceptance Period**: 90 days from 2026-08-21 (expires 2026-11-19)

**Acceptance Criteria**:
- Must implement VPC endpoints for critical AWS services OR
- Must implement egress allowlist with security groups OR
- Must re-evaluate and document extended acceptance before expiration

**Services for VPC Endpoints (Priority Order)**:
1. ECR (for image pulls)
2. Secrets Manager (for runtime secrets)
3. CloudWatch (for logging/metrics)
4. KMS (for signing operations)
5. S3 (for object storage)
6. DynamoDB (for state storage)

## Implementation Path

### Option 1: VPC Endpoints (Recommended)
Create interface VPC endpoints for AWS services:
- Private DNS enabled for service resolution
- Security groups restrict endpoint access
- Removes need for NAT gateway for AWS service traffic

### Option 2: Egress Allowlist
Configure security group egress rules:
- Allow specific CIDR ranges for required external services
- Block all other egress
- Requires regular maintenance as external services change

### Option 3: Extended Acceptance
If 90-day period expires without implementation:
- Re-assess risk landscape
- Document any changes in threat model
- Obtain explicit re-approval with updated timeline
- Consider accelerated implementation if risk posture degrades

## Monitoring

### CloudTrail Events
Monitor for unexpected egress patterns:
- AWS API calls from unexpected principals
- Unusual data transfer patterns
- KMS key usage from unexpected sources

### VPC Flow Logs
Review VPC flow logs for:
- Unexpected external IP addresses
- Unusual port usage (non-443)
- Large data transfers to unexpected destinations

## Approval

**Approved By**: Infrastructure team
**Approval Date**: 2026-08-21
**Review Date**: 2026-11-19 (90 days)
**Reviewer**: [TBD]

## References

- AWS VPC endpoints: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-endpoints.html
- Egress control best practices: https://docs.aws.amazon.com/whitepapers/latest/aws-eks-best-practices/security-networking.html
- Current security guide: lore-production-security.md
