# Service Ecosystem Architecture

## Current Infrastructure

### Existing AWS Services
- **ECS Fargate Cluster**: Hosts LoreService and AuthGatewayService
- **RDS PostgreSQL**: Single instance (currently using free tier slot)
- **ALB**: Load balancer with security groups (using free tier)
- **Cognito User Pool**: Admin-only authentication ($0.01/month)
- **DynamoDB Tables**: Lore server mutable/lock store

### Vercel Frontend
- **Marketing Site**: Landing pages, SEO content, lead capture
- **Free Tier**: 100GB bandwidth + unlimited deployments

## Team Invitation Architecture

### Service Communication Flow
```
Vercel Frontend
    ↓ HTTPS
AWS ALB
    ↓ Private VPC
ECS Services
    ├── AuthGatewayService (Cognito OAuth)
    ├── LoreService (existing)
    └── TeamInvitationService (new)
    ↓
Shared RDS PostgreSQL
    ├── Users & tenants
    ├── Team memberships
    └── Invitation tokens
```

### Cognito Integration
- **AuthGatewayService**: Handles OAuth flows, JWT token issuance
- **TeamInvitationService**: Uses Cognito Admin API for team invites
- **Security**: VPC security groups, IAM roles for Cognito access

## Cost Analysis

### Current Monthly Costs
- **ECS Fargate**: $30-50/month (no free tier)
- **RDS PostgreSQL**: $0/month (free tier)
- **ALB**: $0/month (free tier, may exceed with growth)
- **Cognito**: $0.01/month
- **Vercel**: $0/month (free tier)
- **Total**: $30-50/month

### Free Tier Limitations
- **Fargate**: No free tier - major cost center
- **RDS**: Only one instance covered by free tier
- **ALB**: 750 hours + 15GB data/month (may exceed with continuous traffic)
- **EC2**: 750 hours t3.micro free tier (currently unused)

## Migration Options

### Option 1: Use Existing Infrastructure
- **Pros**: No migration needed, services already configured
- **Cons**: Fargate costs unavoidable, free tier exhausted
- **Timeline**: Immediate deployment possible

### Option 2: Migrate to Free Tier Friendly
- **Pros**: Stay within free tier limits, minimal costs
- **Cons**: Migration effort, lose Fargate benefits
- **Timeline**: 1-2 weeks migration work

## Service Configuration Details

### TeamInvitationService (New)
- **Platform**: ECS Fargate on existing cluster
- **Purpose**: Team invitation management, user provisioning
- **Tech Stack**: Node.js/TypeScript
- **Environment Variables**: RDS connection, Cognito credentials
- **IAM Permissions**: Cognito Admin API, RDS access

### AuthGatewayService Extension
- **Current**: OAuth flows, JWT issuance
- **Extension**: Add Cognito Admin API endpoints
- **Security**: VPC security groups, KMS for signing keys

### Database Schema
- **users**: Cognito user mapping, tenant associations
- **invitations**: Invitation tokens, expiration, status
- **tenant_members**: Team membership, roles, permissions

## Scaling Considerations

### Phase 1 (Current)
- Single ECS service for team invitations
- Existing RDS instance
- Cognito Lite tier

### Phase 2 (Growth)
- Separate ECS service for different domains
- Read replicas for RDS
- ElastiCache for session management
- Cognito advanced security features

### Phase 3 (Scale)
- Multi-region deployment
- Database sharding for multi-tenant isolation
- Dedicated load balancers per service category
- Custom Cognito domain for branding

## Security Architecture

### Network Security
- **VPC**: Private subnets for services
- **Security Groups**: ALB → ECS, ECS → RDS
- **IAM Roles**: Scoped permissions per service
- **KMS**: JWT signing key management

### Authentication Flow
1. User invited via email → unique token
2. Token validation → Cognito account creation
3. User login → JWT token issuance
4. Token validation → Service access control

### Tenant Isolation
- **Database**: Row-level security by tenant_id
- **Services**: Tenant context in all operations
- **API Gateway**: Optional for public-facing APIs
- **Cognito**: User pool for platform, tenant groups for access

## Monitoring & Observability

### CloudWatch Metrics
- ECS service CPU/memory utilization
- RDS connection count, query performance
- ALB request count, latency
- Cognito user sign-ups, authentication events

### Logging
- ECS service logs to CloudWatch
- Application-level structured logging
- Audit trail for team invitations
- Error tracking and alerting

## Deployment Strategy

### Continuous Deployment
- **Vercel**: Git push → automatic deployment
- **ECS Services**: CI/CD pipeline → task definition updates
- **Database**: Schema migrations via CI/CD
- **Configuration**: Pulumi infrastructure as code

### Rollback Strategy
- **Vercel**: Instant rollback to previous deployments
- **ECS**: Blue-green deployments with zero downtime
- **Database**: Transactional migrations with rollback scripts
- **Infrastructure**: Pulumi state versioning

## Next Steps

### Immediate Actions
1. Add TeamInvitationService to existing ECS cluster
2. Extend AuthGatewayService for Cognito admin operations
3. Implement database schema for team management
4. Configure security groups for new service access

### Future Enhancements
1. Consider EC2 migration if cost optimization needed
2. Add caching layer for performance
3. Implement API Gateway if public API surface grows
4. Add monitoring dashboards and alerting