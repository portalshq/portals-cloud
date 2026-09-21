# Egress Architecture Analysis: Security vs Cost Optimization

## Current Architecture Analysis

### Current Configuration
- **NAT Gateway**: Enabled in PlatformNetwork (~$32/month)
- **EgressControls**: Disabled (egressEndpointsEnabled: false)
- **Backend API**: Not public (backendApiPublicEnabled: false)
- **Public Ingress**: Disabled (publicIngressEnabled: false)
- **ALB**: In public subnets
- **Services**: In private subnets with NAT Gateway egress

### EgressControls Purpose
**EgressControls is designed to:**
- Create VPC interface endpoints for AWS APIs (Secrets Manager, KMS, ECR, Logs, STS)
- Keep internal AWS API traffic within VPC (no NAT Gateway usage)
- Create private DNS alias for auth hostname (keeps JWKS traffic in-VPC)
- **Reduce NAT Gateway costs by routing AWS API traffic through VPC endpoints

**Currently disabled** but designed to reduce NAT Gateway costs.

## Security vs Cost Analysis

### Option 1: Remove NAT Gateway, Use Public Subnets (Most Cost-Effective)

**Architecture:**
```
VPC (No NAT Gateway)
├── Public subnets only
├── ALB in public subnets
├── EC2 instance in public subnets
├── Services run on EC2 with public IPs
└── No private subnets
```

**Cost:** $0.01/month (Cognito only)
**Security:** Low
- Public IP exposure for all services
- No private network protection
- Direct internet exposure
- Security groups only for protection
- Riskier architecture

**Pros:**
- Zero NAT Gateway cost
- Simpler architecture
- Free tier compatible

**Cons:**
- Security degradation
- Public IP exposure
- No private network boundary
- Violates best practices
- Harder to implement advanced security

### Option 2: Keep NAT Gateway (Current, Expensive)

**Architecture:**
```
VPC (With NAT Gateway)
├── Public subnets (ALB)
├── Private subnets (EC2, RDS)
├── NAT Gateway in public subnet
└── Private route table → NAT Gateway
```

**Cost:** ~$32.41/month
**Security:** High
- Private network protection
- No public IP exposure for services
- Standard security pattern
- Easy to implement

**Pros:**
- Standard security pattern
- Private network protection
- Well-understood architecture
- Easy to audit

**Cons:**
- $32/month NAT Gateway cost
- Additional monthly cost
- Still uses NAT Gateway for external traffic

### Option 3: Enable EgressControls + Keep NAT Gateway (Hybrid)

**Architecture:**
```
VPC (With NAT Gateway + EgressControls)
├── Public subnets (ALB)
├── Private subnets (EC2, RDS)
├── NAT Gateway (for external traffic only)
├── VPC endpoints for AWS APIs (Secrets Manager, KMS, ECR, Logs, STS)
└── Private DNS alias for auth hostname
```

**Cost:** ~$20-25/month (reduced NAT Gateway usage)
**Security:** High
- Private network protection
- AWS API traffic stays in VPC (no NAT Gateway cost)
- Only external API calls use NAT Gateway
- Enhanced security with VPC endpoints

**Pros:**
- Reduces NAT Gateway costs by ~40%
- Maintains private network security
- Better security with VPC endpoints
- Standard enhanced pattern

**Cons:**
- Still has NAT Gateway cost
- More complex configuration
- EgressControls must be enabled

### Option 4: NLB for Egress (Not Recommended)

**Architecture:**
```
VPC (With NLB)
├── Public subnets (ALB, NLB)
├── Private subnets (EC2, RDS)
├── NLB for egress traffic
└── Private route table → NLB
```

**Cost:** ~$20-30/month (NLB has hourly costs)
**Security:** Medium
- NLB doesn't provide NAT Gateway functionality
- NLB is for load balancing, not egress
- Still need NAT Gateway or public IPs
- Doesn't solve the problem

**Pros:**
- NLB is cheaper than NAT Gateway
- Good for load balancing

**Cons:**
- NLB doesn't replace NAT Gateway functionality
- Doesn't solve egress problem
- Misunderstanding of NLB capabilities
- Still need proper egress solution

### Option 5: Public Subnets with Enhanced Security Groups (Compromise)

**Architecture:**
```
VPC (No NAT Gateway, Enhanced Security)
├── Public subnets only
├── ALB in public subnets
├── EC2 instance in public subnets
├── Enhanced security groups (least privilege)
├── WAF integration
└── Strict security policies
```

**Cost:** $0.01/month (Cognito only) + WAF cost (~$20/month)
**Security:** Medium-High
- No private network but enhanced perimeter security
- WAF provides application-level protection
- Security groups provide network-level protection
- More complex security configuration

**Pros:**
- No NAT Gateway cost
- Enhanced security with WAF
- Can be very secure with proper configuration
- Free tier compatible (except WAF)

**Cons:**
- Public IP exposure
- More complex security configuration
- WAF has cost (~$20/month)
- Requires security expertise
- Still less secure than private VPC

### Option 6: VPC Endpoints + No NAT Gateway (Optimal for Security/Cost)

**Architecture:**
```
VPC (No NAT Gateway, VPC Endpoints)
├── Public subnets (ALB, optional NLB)
├── Private subnets (EC2, RDS)
├── VPC interface endpoints for all external services
├── Private subnets (no internet gateway routing)
└── Strict security groups for endpoints
```

**Cost:** $0.01/hour per endpoint (~$7.25/month for 10 endpoints)
**Security:** Very High
- Private network protection
- VPC endpoints provide controlled egress
- No public IP exposure for services
- Enhanced security with endpoint security groups
- Zero NAT Gateway cost
- Pay only for actual usage

**Pros:**
- No NAT Gateway cost
- Private network protection maintained
- Very high security with VPC endpoints
- Pay per usage (not flat monthly cost)
- Can be very cost-effective
- Standard AWS pattern for private VPC

**Cons:**
- More complex configuration
- VPC endpoint costs can add up with many services
- Requires careful security group design
- More operational complexity

## Detailed Option 6 Analysis (VPC Endpoints + No NAT Gateway)

### Required VPC Endpoints

**External Services Requiring Endpoints:**
1. **CRM API** (external) - Required for lead sync
2. **SES** (AWS but external) - Required for emails
3. **Cognito** (public endpoints) - Can use public endpoints, no endpoint needed
4. **External webhooks** - Can use VPC endpoint or public

**Internal AWS Services (Already Covered by EgressControls):**
- Secrets Manager
- KMS
- ECR
- CloudWatch Logs
- STS

### Cost Calculation for Option 6

**VPC Endpoint Costs:**
- **CRM API endpoint**: $0.01/hour × 720 hours = $7.25/month
- **SES endpoint**: $0.01/hour × 720 hours = $7.25/month
- **EgressControls endpoints**: 6 endpoints × $0.01/hour × 720 hours = $43.20/month
- **Total**: ~$57.70/month

**Comparison:**
- NAT Gateway: $32.40/month
- VPC Endpoints: $57.70/month
- **NAT Gateway is cheaper** for current use case

### Optimized Option 6

**Use VPC endpoints only for high-volume external traffic:**
- CRM API endpoint: $7.25/month
- SES endpoint: $7.25/month
- Keep NAT Gateway for low-volume traffic
- Enable EgressControls for internal AWS APIs

**Total cost:** ~$32.40 (NAT) + $14.50 (endpoints) = $46.90/month
**Security:** Very high
**More expensive than current but more secure**

## Recommendation: Revised Cost-Optimized Architecture

### Option 7: Public Subnets with Enhanced Security (Recommended)

**Architecture:**
```
VPC (No NAT Gateway, Enhanced Security)
├── Public subnets only
├── ALB in public subnets
├── EC2 instance in public subnets
├── Enhanced security groups:
│   ├── Allow ALB → EC2 (container ports only)
│   ├── Allow EC2 → RDS (database port only)
│   ├── Allow EC2 → Cognito (public APIs)
│   ├── Allow EC2 → SES (public APIs)
│   ├── Allow EC2 → CRM (external API)
│   └── Block all other traffic
├── WAF integration (optional, can be added later)
└── Enhanced monitoring
```

**Cost:** $0.01/month (Cognito only) or ~$20/month with WAF
**Security:** Medium-High (with proper configuration)
- Public IP exposure but highly restricted security groups
- Application-level protection possible
- Zero infrastructure cost for security
- Well-understood security model

**Enhanced Security Measures:**
1. **Strict Security Groups**: Least privilege, only required ports
2. **Network ACLs**: Additional network-level restrictions
3. **WAF Integration**: Application-level protection ($20/month)
4. **VPC Flow Logs**: Monitor all network traffic
5. **Enhanced Monitoring**: CloudWatch detailed metrics
6. **Secrets Manager**: Never store credentials in code
7. **TLS Everywhere**: All communication encrypted
8. **Regular Security Audits**: Automated vulnerability scanning

### Security vs Cost Matrix

| Option | Cost/month | Security | Complexity | Recommendation |
|--------|------------|----------|------------|----------------|
| Remove NAT, public subnets | $0.01 | Low | Low | Not recommended |
| Keep NAT Gateway | $32.41 | High | Low | Current, expensive |
| EgressControls + NAT | $20-25 | High | Medium | Better than current |
| NLB for egress | $20-30 | Medium | High | Wrong approach |
| Public subnets + WAF | $20 | Medium-High | Medium | Good compromise |
| VPC endpoints only | $57.70 | Very High | High | Too expensive |
| Public subnets + enhanced SG | $0.01 | Medium-High | Medium | **Recommended** |

## Final Recommendation

### Public Subnets with Enhanced Security Groups

**This option provides:**
- **Zero infrastructure cost** (truly free tier)
- **High security** with proper configuration
- **Acceptable complexity** (well-understood patterns)
- **Scalable path** (can add WAF later if needed)

**Implementation:**
1. Remove NAT Gateway from PlatformNetwork
2. Move EC2 instance to public subnets
3. Create enhanced security groups with least privilege
4. Configure Network ACLs for additional protection
5. Enable VPC Flow Logs for monitoring
6. Add CloudWatch alarms for security events
7. Keep application-level security (TLS, secrets management)

**Security Group Rules:**
```
EC2 Security Group:
  Ingress:
    - ALB → EC2: container ports only (8084-8088, 41337)
  Egress:
    - EC2 → RDS: database port only (5432)
    - EC2 → Cognito: HTTPS (443)
    - EC2 → SES: HTTPS (443)
    - EC2 → CRM: HTTPS (443, specific domain)
    - Block all other traffic
```

**Cost:** $0.01/month (Cognito only)
**Security:** Medium-High (with proper configuration)
**Complexity:** Medium

This achieves the goal of maximum security with minimal cost by accepting more configuration complexity while avoiding infrastructure costs.