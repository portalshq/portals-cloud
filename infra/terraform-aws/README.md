# Portals Cloud — Terraform AWS Deployment

Deploys the portals-cloud stack to AWS ECS Fargate with three services:

| Service   | Description                | Protocol         | Port(s)      |
|-----------|----------------------------|------------------|--------------|
| Frontend  | Vite/React SPA via nginx   | HTTP (ALB)       | 80           |
| Server    | Express API                | HTTP (ALB)       | 8899         |
| Lore      | portalshq/lore-server      | HTTP/WS (ALB)    | 41339        |
|           |                            | gRPC (NLB TCP)   | 41337        |
|           |                            | QUIC (NLB UDP)   | 41337        |

## Architecture

```
                              ┌────────────────────────────┐
                              │      Route53 (optional)     │
                              │  app.example.com → ALB     │
                              │  lore.example.com → NLB    │
                              └────────────┬───────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼──────┐        ┌──────▼──────┐        ┌─────▼──────┐
              │   ALB      │        │    NLB      │        │   ACM      │
              │  HTTP/443  │        │  TCP/UDP    │        │  *.domain  │
              └──┬──┬──┬───┘        └──────┬───────┘        └────────────┘
                 │  │  │                   │
        ┌────────┘  │  └────────┐  ┌───────┘
        ▼           ▼          ▼  ▼
  ┌─────────┐ ┌─────────┐ ┌──────────┐
  │ Frontend│ │  Server │ │   Lore   │
  │  nginx  │ │ Express │ │ lore-srv │
  │  port80 │ │ port8899│ │ 41337/9  │
  └─────────┘ └─────────┘ └────┬─────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
               ┌────────┐ ┌────────┐ ┌────────┐
               │  EFS   │ │  S3    │ │DynamoDB│
               │ /data  │ │fragments││index+md│
               └────────┘ └────────┘ └────────┘

  Data Stores:
    RDS (PostgreSQL 16) — Server API relational data
    EFS               — Lore persistent storage (locks, certs)
    S3                — Lore immutable fragment payloads
    DynamoDB          — Lore fragment index + metadata

  Secrets Manager:
    JWT private/public keys (ECDSA P-256)
    Database connection URL
    HMAC key for presigned URLs
    JWKS public key set
    Aggregated app secrets (JSON)
```

## Prerequisites

- **AWS Account** with appropriate permissions (EC2, ECS, RDS, S3, DynamoDB, EFS, Secrets Manager, Route53, ACM, CloudWatch)
- **Terraform** >= 1.5.0
- **Python 3** + **OpenSSL** (for JWKS computation during `terraform apply`)
- **Docker** (for building and pushing images)
- **AWS CLI** configured with credentials (`aws configure`)

## Directory Structure

```
infra/terraform-aws/
├── environments/
│   └── production/
│       ├── main.tf                # Root module — composes all infrastructure
│       ├── variables.tf           # All input variables
│       ├── outputs.tf             # Deployment outputs
│       ├── versions.tf            # Terraform & provider versions
│       └── terraform.tfvars.example  # Example variable values
└── modules/
    ├── vpc/         # VPC + subnets + NAT Gateway
    ├── rds/         # PostgreSQL 16
    ├── s3/          # Lore fragment store
    ├── dynamodb/    # Lore fragment index + metadata
    ├── efs/         # Lore persistent filesystem
    ├── ecr/         # Container image repositories
    ├── ecs/         # Fargate cluster
    ├── cloudwatch/  # Log groups
    ├── route53/     # ACM certificate + DNS validation
    ├── secrets/     # Secrets Manager (JWT, DB, HMAC, JWKS)
    ├── alb/         # Application Load Balancer
    ├── nlb/         # Network Load Balancer
    ├── frontend/    # Frontend ECS service (nginx)
    ├── server/      # Server API ECS service
    └── lore/        # Lore Server ECS service
```

## Deployment

### 1. Build and Push Docker Images

```bash
# Login to ECR (run once)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# After `terraform apply`, get the ECR repo URLs from output:
#   terraform output ecr_repository_urls

# Build & push Frontend
docker build -f docker/frontend/Dockerfile -t ${ECR_REPO_FRONTEND}:latest .
docker push ${ECR_REPO_FRONTEND}:latest

# Build & push Server
docker build -f docker/server/Dockerfile -t ${ECR_REPO_SERVER}:latest .
docker push ${ECR_REPO_SERVER}:latest

# Pull & push Lore Server (from Docker Hub)
docker pull portalshq/lore-server:latest
docker tag portalshq/lore-server:latest ${ECR_REPO_LORE}:latest
docker push ${ECR_REPO_LORE}:latest
```

### 2. Configure Variables

```bash
cd infra/terraform-aws/environments/production
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

Required variables (no defaults):

| Variable         | Description                     |
|------------------|---------------------------------|
| `domain_name`    | Your domain (e.g., portals.example.com) |
| `hosted_zone_id` | Route53 hosted zone ID          |
| `rds_db_password`| PostgreSQL master password      |

Optional but recommended to review:

| Variable               | Default             | Description                  |
|------------------------|---------------------|------------------------------|
| `aws_region`           | `us-east-1`         | AWS region                   |
| `rds_instance_class`   | `db.t4g.micro`      | RDS instance type            |
| `server_desired_count` | `2`                 | Server task count            |
| `frontend_desired_count`| `2`                | Frontend task count          |
| `lore_desired_count`   | `1`                 | Lore task count              |
| `log_retention_days`   | `30`                | CloudWatch log retention     |

### 3. Deploy

```bash
cd infra/terraform-aws/environments/production

# Initialize (with S3 backend — or use local state for first run)
terraform init

# Review the plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan
```

> **First-time deploy** with a domain: the ACM certificate validation can take
> a few minutes. If the plan hangs or fails on certificate validation, run
> `terraform apply` again after the DNS validation records propagate.

### 4. Post-Deploy

After deployment, you'll see outputs like:

```
alb_dns_name        = "my-alb-12345.us-east-1.elb.amazonaws.com"
nlb_dns_name        = "my-nlb-67890.us-east-1.elb.amazonaws.com"
app_url             = "https://app.example.com"  (if domain configured)
api_url             = "https://app.example.com/api"
lore_remote_url     = "lore://my-nlb-67890.us-east-1.elb.amazonaws.com:41337/production"
ecr_repository_urls = {
  "portals-cloud/frontend"    = "..."
  "portals-cloud/server"      = "..."
  "portals-cloud/lore-server" = "..."
}
```

Validate the deployment:

```bash
# Health check
curl http://$(terraform output -raw alb_dns_name)/api/healthz

# Check logs
aws logs get-log-events \
  --log-group-name /portals-cloud/production/server \
  --log-stream-name $(aws logs describe-log-streams \
    --log-group-name /portals-cloud/production/server \
    --query 'logStreams[0].logStreamName' --output text)
```

## Important Notes

### Circular Dependency (Cert → ALB → DNS Records)

The deployment handles Terraform's dependency graph by:
1. Creating the ACM certificate + DNS validation records first (no LB dependency)
2. Creating ALB/NLB with the certificate ARN
3. Creating Route53 A records pointing to ALB/NLB DNS names

This means **two separate modules** handle Route53: `route53_cert` for
certificate only, and inline `aws_route53_record` resources for A records.

### Security Groups

Each ECS service creates its own security group with minimal ingress rules.
RDS ingress is added after service creation via `aws_security_group_rule`
resources. EFS uses VPC CIDR-based ingress (allows NFS access from any
resource within the VPC).

### Secrets Management

- JWT keys are auto-generated on first apply (ECDSA P-256)
- Database password is auto-generated if not provided
- HMAC key is auto-generated for Lore presigned URLs
- JWKS is computed from the ECDSA public key

All secrets are stored in AWS Secrets Manager with 7-day recovery window.

### Cost Optimization

- Fargate only (no FARGATE_SPOT — cost-effective for baseline load)
- Single NAT Gateway (not per-AZ — saves ~$32/month)
- `db.t4g.micro` RDS (burstable, suitable for low-to-medium traffic)
- PAY_PER_REQUEST DynamoDB (no provisioned capacity waste)

### Destroy Warning

```bash
# WARNING: This will destroy ALL resources including data stores
terraform destroy
```

To preserve data on destroy, set:
- `rds_skip_final_snapshot = false` (creates a final snapshot)
- `s3 force_destroy = false` (bucket survives)
- EFS data is preserved if the file system is not deleted

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `terraform plan` hangs | Cert validation in progress | Wait 2-5 min, re-run |
| ECS tasks fail to start | Missing ECR images | Push Docker images to ECR |
| `Connection refused` on /api/healthz | Server not started | Check CloudWatch logs |
| RDS connection timeout | Security group rules | Verify SG ingress rules |
| Lore can't connect to S3 | Missing IAM permissions | Check lore_task role policies |

## CI/CD Integration

For automated deployments:

1. **Build & push images** in CI (GitHub Actions, GitLab CI, etc.)
2. **Update Terraform variables** with new image tags
3. **Run `terraform apply`** (or use Terraform Cloud / Atlantis)

Example GitHub Actions workflow:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/deploy-role

- name: Deploy infrastructure
  run: |
    cd infra/terraform-aws/environments/production
    terraform init
    terraform apply -auto-approve \
      -var="server_image_tag=${{ github.sha }}" \
      -var="frontend_image_tag=${{ github.sha }}"
```
