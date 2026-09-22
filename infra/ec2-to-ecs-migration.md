# EC2 → ECS Migration Path

## Phase 1: EC2 Free Tier Setup (Current State)

### Minimal EC2 Configuration
```
AWS Free Tier Stack:
├── EC2 t3.micro (750 hours free tier)
│   ├── Docker (run containers directly)
│   ├── Docker Compose (multi-container orchestration)
│   └── CloudWatch agent (logging/monitoring)
├── Existing RDS PostgreSQL (750 hours free tier)
├── Existing ALB (750 hours free tier)
├── Existing Cognito ($0.01/month)
└── SES (3,000 messages free tier)
```

### EC2 Architecture
- **Container Runtime**: Docker on EC2
- **Deployment**: SSH + Docker Compose, or AWS Systems Manager
- **Process Management**: Docker handles container lifecycle
- **Scaling**: Single instance initially, manual scaling later
- **Monitoring**: CloudWatch agent + logs
- **Health Checks**: ALB HTTP health checks on container ports

### Services on EC2
- **Unified InvitationService**: Team member + pilot room invitations
- **Product API endpoints**: Backend for Vercel product app
- **Auth extensions**: Cognito admin operations

### What's NOT Needed on EC2
- ❌ nginx (ALB handles SSL/routing)
- ❌ PM2 (Docker handles process management)
- ❌ Manual process monitoring (CloudWatch + ALB health checks)

### Estimated Monthly Cost
- **EC2 t3.micro**: $0 (free tier)
- **RDS**: $0 (free tier)
- **ALB**: $0 (free tier)
- **Cognito**: $0.01
- **SES**: $0 (free tier)
- **Total**: $0.01/month

## Phase 2: ECS + EC2 Setup (Recommended Upgrade)

### Why ECS + EC2 Instead of Bare EC2?
- **Container orchestration**: ECS manages container placement, health checks
- **Service discovery**: Automatic DNS for service-to-service communication
- **Auto-scaling**: Add EC2 instances as needed (still using free tier initially)
- **Operational simplicity**: No SSH needed, centralized logging
- **Easy migration path**: Switch to Fargate later without code changes

### ECS + EC2 Free Tier Architecture
```
ECS Cluster (free orchestration)
└── EC2 Launch Type (t3.micro instances, 750 hours free tier)
    ├── Unified InvitationService
    ├── Product API Service
    └── Auth Extension Service
```

### Configuration
- **ECS Cluster**: Already exists in your infrastructure
- **EC2 Instances**: Register existing or new t3.micro instances
- **Task Definitions**: Use existing Dockerfiles
- **Services**: One service per logical application
- **Load Balancing**: ALB with target groups per service

### Benefits Over Bare EC2
- ✅ No SSH management
- ✅ Automatic container restart
- ✅ Rolling deployments
- ✅ Service health monitoring
- ✅ Easy to add/remove instances
- ✅ Cloud-native integration

### Cost
- **ECS orchestration**: $0
- **EC2 instances**: $0 (free tier)
- **ALB**: $0 (free tier)
- **Total**: $0.01/month (same as bare EC2)

## Phase 3: ECS + Fargate (Production Scale)

### When to Migrate to Fargate
- **More than 2-3 services**: ECS management overhead increases
- **Auto-scaling requirements**: Need rapid scale-up/down
- **Team size > 3 developers**: Operations complexity grows
- **Production workloads**: Need better reliability/orchestration

### Fargate Architecture
```
ECS Cluster
└── Fargate Launch Type (serverless containers)
    ├── Unified InvitationService
    ├── Product API Service
    └── Auth Extension Service
```

### Benefits
- ✅ No EC2 instance management
- ✅ Automatic scaling
- ✅ Better isolation
- ✅ Simplified operations
- ✅ Pay per actual usage

### Cost Impact
- **Fargate**: $30-50/month minimum (no free tier)
- **Break-even**: When operational time savings > $30-50/month

## Migration Steps

### Step 1: Container Preparation (Week 1)
**Goal**: Ensure all services are containerized

**Tasks**:
1. Review existing Dockerfiles from ECS setup
2. Test containers locally with Docker Compose
3. Verify environment variables and configuration
4. Test database connections from containers
5. Validate health check endpoints

**No code changes needed** - use existing Dockerfiles.

### Step 2: EC2 Setup (Week 1-2)
**Goal**: Deploy EC2 with Docker

**Tasks**:
1. Launch EC2 t3.micro instance
2. Install Docker and Docker Compose
3. Configure security groups (ALB → EC2)
4. Install CloudWatch agent
5. Set up SSH key or AWS Systems Manager
6. Create Docker Compose file for services
7. Configure environment variables (via Secrets Manager or .env)

**Docker Compose Example**:
```yaml
version: '3.8'
services:
  invitation-service:
    build: ./packages/invitation-service
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
    depends_on:
      - db-check

  api-service:
    build: ./packages/api-service
    ports:
      - "8081:8080"
    environment:
      - DATABASE_URL=${DATABASE_URL}
```

### Step 3: Load Balancer Configuration (Week 2)
**Goal**: Route traffic from ALB to EC2

**Tasks**:
1. Add new target group to existing ALB
2. Configure health checks (HTTP /health on port 8080)
3. Update ALB listener rules to route to new target group
4. Configure security groups (ALB → EC2 on container ports)
5. Test end-to-end: Vercel → ALB → EC2

### Step 4: ECS + EC2 Migration (Week 3-4)
**Goal**: Move from Docker Compose to ECS orchestration

**Tasks**:
1. Register EC2 instance with existing ECS cluster
2. Create ECS task definitions (use existing Docker images)
3. Create ECS services (one per application)
4. Update ALB target groups to point to ECS services
5. Configure service auto-scaling (add EC2 instances as needed)
6. Monitor and validate

**Pulumi Changes**:
```typescript
// Add EC2 instances to existing cluster
const ecsInstances = new aws.ec2.Instance(`${prefix}-instance`, {
  // ... instance config
  userData: ecsCluster.user_data,
});

// Register with cluster
new aws.ecs.Instance(`${prefix}-ecs-instance`, {
  clusterName: ecsCluster.name,
  instanceId: ecsInstances.id,
});
```

### Step 5: Testing & Rollout (Week 4)
**Goal**: Validate migration and cutover

**Tasks**:
1. Deploy services to ECS (blue-green alongside EC2)
2. Test all functionality on ECS
3. Monitor metrics (CPU, memory, latency)
4. Switch ALB traffic to ECS
5. Keep EC2 running for rollback window (24-48 hours)
6. Decommission EC2 after validation

### Step 6: Fargate Migration (Future)
**Goal**: Switch to serverless when needed

**Tasks**:
1. Update task definitions for Fargate compatibility
2. Create Fargate launch type services
3. Migrate services one at a time
4. Decommission EC2 instances
5. Update cost monitoring

## Unified InvitationService Architecture

### Combined Functionality
```typescript
type InvitationType = 'team_member' | 'pilot_room'

interface Invitation {
  id: string
  type: InvitationType
  email: string
  tenantId?: string        // For team member invites
  pilotId?: string         // For pilot room invites
  role: string             // owner, reviewer, participant, etc.
  invitedBy: string        // User ID who sent invitation
  expiresAt: Date
  createdAt: Date
  acceptedAt?: Date
}

// Database schema
CREATE TABLE invitations (
  id UUID PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  pilot_id UUID REFERENCES pilots(id),
  role VARCHAR(50) NOT NULL,
  invited_by UUID REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP
);
```

### Service Responsibilities
1. **Create invitations** (team members + pilot rooms)
2. **Send email notifications** (via SES)
3. **Validate invitation tokens**
4. **Process acceptance/rejection**
5. **Manage role assignments**
6. **Handle expiration and cleanup**

### Benefits of Unification
- **Single codebase**: Shared invitation logic, email templates
- **Consistent UX**: Users see unified invitation flow
- **Simplified permissions**: Centralized role/authorization logic
- **Shared database**: Single invitations table with type column
- **Easier maintenance**: One service to monitor and scale

## Rollback Strategy

### Rollback Triggers
- Health check failures > 5%
- Error rate increase > 10%
- Latency increase > 500ms
- Database connection issues
- Authentication failures

### Rollback Steps
1. Switch ALB traffic back to previous stage
2. Revert task definition or EC2 deployment
3. Investigate logs and metrics
4. Fix issue, test, then retry migration

### Monitoring During Migration
- CloudWatch dashboards for each service
- Error and latency alerts
- Database connection metrics
- Authentication success/failure rates
- ALB health check status

## Decision Framework

### Stay on EC2 If:
- < 3 services
- < 3 developers
- MVP/pre-production stage
- Manual scaling acceptable
- Cost optimization critical

### Migrate to ECS + EC2 If:
- 3-5 services
- 3-5 developers
- Need better orchestration
- Want smoother scaling path
- Still cost-conscious

### Migrate to Fargate If:
- > 5 services
- > 5 developers
- Production scale workloads
- Need auto-scaling
- Operational simplicity worth cost

## Cost Comparison

| Stage | Monthly Cost | Notes |
|-------|-------------|-------|
| EC2 Only | $0.01 | Free tier EC2 + Cognito |
| ECS + EC2 | $0.01 | Same as EC2 only |
| ECS + Fargate | $30-50 | No free tier for Fargate |

## Timeline Estimate

- **Phase 1 (EC2 setup)**: 1-2 weeks
- **Phase 2 (ECS + EC2)**: 3-4 weeks total
- **Phase 3 (Fargate)**: Future, as needed

## Next Steps

1. **Choose starting point**: EC2 only or ECS + EC2
2. **Containerize services**: Use existing Dockerfiles
3. **Set up monitoring**: CloudWatch dashboards
4. **Define success metrics**: Health, latency, error rates
5. **Schedule migration window**: Low-traffic period
6. **Execute migration**: Follow steps above
7. **Monitor closely**: First 48 hours critical