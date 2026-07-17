# Portals Platform Infrastructure

Production-grade Pulumi AWS infrastructure stack for the Portals platform.

## Architecture Overview

```
                            Internet
                               │
                    ┌──────────┴──────────┐
                    │   ALB (public)       │
                    │  :80  Frontend       │
                    │  :8083 Control Plane │
                    │  :41339 Lore (HTTP)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────┴──────┐ ┌──────┴──────┐ ┌───────┴──────┐
       │   Frontend  │ │Control Plane│ │     Lore     │
       │  (React)    │ │(Rust/Axum) │ │   (VCS)      │
       │  port 80    │ │ port 8083  │ │ port 41339   │
       └─────────────┘ └──────┬─────┘ └──────┬───────┘
                              │               │
              ┌───────────────┼───────┬───────┤
              │               │       │       │
       ┌──────┴──────┐ ┌─────┴───┐ ┌─┴────┐ ┌┴───────┐
       │  Aurora PG  │ │SQS (DLQ)│ │ EFS  │ │  ECR   │
       │  (RDS)      │ │Event Bus│ │locks │ │images  │
       └─────────────┘ └─────────┘ └──────┘ └────────┘

                    NLB (public)
                    │  :41337 Lore (QUIC/TCP)
                    └───────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **PlatformNetwork** | VPC with 3 public + 3 private subnets, Internet Gateway, NAT Gateway |
| **PlatformCluster** | ECS Fargate cluster, CloudWatch log group, task execution IAM role |
| **PlatformDataStore** | Aurora PostgreSQL 15.4 RDS cluster with encrypted storage |
| **PlatformStorage** | ECR repos (lore, server, frontend, control-plane) + EFS for persistent locks |
| **PlatformEventBus** | SQS main queue + dead-letter queue with IAM policy for ECS tasks |
| **LoadBalancers** | ALB (HTTP :80/:8083/:41339) + NLB (QUIC/TCP :41337) |
| **LoreService** | ECS Fargate with EFS mount, ALB + NLB integration |
| **ServerService** | ECS Fargate with ALB integration |
| **FrontendService** | ECS Fargate with ALB integration |
| **ControlPlaneService** | ECS Fargate with ALB integration, SQS event bus, health checks |

### Services and Ports

| Service | Container Port | ALB Listener | Protocol | Health Check |
|---------|---------------|-------------|----------|-------------|
| Frontend | 80 | :80 | HTTP | / |
| Control Plane | 8083 | :8083 | HTTP | /healthz |
| Lore | 41339 | :41339 | HTTP | — |
| Lore (QUIC) | 41337 | :41337 (NLB) | TCP_UDP | — |

## Prerequisites

- Node.js 18+
- Pulumi CLI (`brew install pulumi`)
- AWS CLI configured with appropriate credentials (`aws configure`)
- Docker (for building images)

## Installation

```bash
cd infra/pulumi
npm install
```

## Configuration

### Stack Initialization

```bash
# Create or select a stack
pulumi stack init dev      # development
pulumi stack init prod     # production
```

### Required Configuration

```bash
# AWS
pulumi config set aws:region us-east-1

# Project
pulumi config set projectName portals
pulumi config set environment dev        # or prod

# Network
pulumi config set vpcCidr "10.0.0.0/16"
pulumi config set publicSubnetCidrs "10.0.1.0/24,10.0.2.0/24,10.0.3.0/24"
pulumi config set privateSubnetCidrs "10.0.10.0/24,10.0.11.0/24,10.0.12.0/24"

# Database
pulumi config set databaseInstanceClass "db.r6g.xlarge"
pulumi config set databaseVersion "15.4"
pulumi config set databaseAllocatedStorage "100"

# ECS
pulumi config set ecsFargateCpu "2048"
pulumi config set ecsFargateMemory "4096"

# Service desired counts
pulumi config set loreServiceDesiredCount "2"
pulumi config set serverServiceDesiredCount "2"
pulumi config set frontendServiceDesiredCount "2"
pulumi config set controlPlaneDesiredCount "2"

# Docker build contexts (relative to infra/pulumi/)
pulumi config set loreServerDockerPath "../../apps/lore-server"
pulumi config set serverDockerPath "../../apps/server"
pulumi config set frontendDockerPath "../../apps/frontend"
pulumi config set controlPlaneDockerPath "../.."  # repo root for multi-stage Dockerfile
```

### Secrets (mark with `--secret`)

```bash
# Ed25519 signing key for data plane JWT tokens
pulumi config set --secret ed25519SigningKey "$(openssl rand -base64 32)"

# S3 storage credentials
pulumi config set --secret s3AccessKey "<your-aws-access-key>"
pulumi config set --secret s3SecretKey "<your-aws-secret-key>"
```

### Optional Configuration

```bash
# S3 storage
pulumi config set s3Endpoint ""              # empty = real AWS S3
pulumi config set s3BucketChunks "lore-chunks"
pulumi config set s3Region "us-east-1"
```

## Deployment

### Preview Changes

```bash
pulumi preview
```

### Deploy Infrastructure

```bash
pulumi up
```

### Destroy Infrastructure

```bash
pulumi destroy
```

## Outputs

After deployment, the following outputs are available:

| Output | Description |
|--------|-------------|
| `databaseUrl` | PostgreSQL connection string (secret) |
| `albDnsName` | Application Load Balancer DNS name |
| `nlbDnsName` | Network Load Balancer DNS name |
| `vpcId` | VPC ID |
| `clusterArn` | ECS Cluster ARN |
| `loreEcrRepositoryUrl` | ECR repository URL for Lore service |
| `serverEcrRepositoryUrl` | ECR repository URL for Server service |
| `frontendEcrRepositoryUrl` | ECR repository URL for Frontend service |
| `controlPlaneEcrRepositoryUrl` | ECR repository URL for Control Plane service |
| `efsFileSystemId` | EFS file system ID |
| `eventQueueUrl` | SQS event queue URL |
| `eventQueueArn` | SQS event queue ARN |
| `deadLetterQueueUrl` | SQS dead-letter queue URL |
| `deadLetterQueueArn` | SQS dead-letter queue ARN |

## Control Plane Service

The Control Plane is the Lore Cloud reconciliation engine — a Rust/Axum service that manages repositories, organizations, sessions, and capabilities through declarative controller loops.

### Environment Variables

The Rust binary uses `clap` with `env` attributes. All values can be set via environment variables or CLI flags.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `ED25519_SIGNING_KEY` | **yes** | — | Base64-encoded Ed25519 key for data plane JWTs |
| `S3_ACCESS_KEY` | **yes** | — | S3/MinIO access key |
| `S3_SECRET_KEY` | **yes** | — | S3/MinIO secret key |
| `LISTEN_ADDR` | no | `0.0.0.0:8083` | HTTP listen address |
| `SQS_QUEUE_URL` | no | `""` | SQS queue URL (enables outbox relay) |
| `S3_ENDPOINT` | no | `http://localhost:9002` | S3 endpoint URL |
| `S3_BUCKET_CHUNKS` | no | `lore-chunks` | S3 bucket for repository chunks |
| `S3_REGION` | no | `us-east-1` | AWS region for S3 |
| `PROVIDER_TYPE` | no | `aws` | `aws` or `mock` |
| `RUST_LOG` | no | `info,lorecloud_control_plane=debug,sqlx=warn` | Log filter |
| `REDIS_URL` | no | `""` | Redis for idempotency cache |
| `JWT_AUTH_ENABLED` | no | `false` | Enable JWT authentication |
| `IDEMPOTENCY_ENABLED` | no | `true` | Enable idempotency checks |
| `METRICS_ENABLED` | no | `true` | Enable Prometheus metrics |
| `CORS_ALLOWED_ORIGINS` | no | `*` | Comma-separated CORS origins |
| `DP_TOKEN_EXPIRY_SECS` | no | `3600` | Data plane token TTL |

### Health Check

The control plane exposes `GET /healthz` on port 8083. Both the container health check (wget) and ALB target group health check probe this endpoint.

### Event Bus Integration

When `SQS_QUEUE_URL` is set, the control plane runs an outbox relay that polls the `outbox` table and delivers events to SQS. When empty, events are marked published without delivery (graceful degradation).

## Docker Integration

The ECS services automatically build Docker images from the configured local paths and push to ECR during `pulumi up`.

### Control Plane Dockerfile

The control plane uses a multi-stage Rust build:

1. **Builder stage** (`rust:1.97-slim-bookworm`): Compiles the workspace with dependency caching
2. **Runtime stage** (`debian:bookworm-slim`): Minimal image with the compiled binary

Build context is the repo root (`../..`) because the Dockerfile copies from `control-plane/` and needs access to the full workspace.

```bash
# Manual build (for testing)
docker build -f docker/control-plane/Dockerfile -t lorecloud-control-plane .
```

## Network Topology

- **Public Subnets** (3x /24): Internet Gateway access, ALB/NLB placement
- **Private Subnets** (3x /24): NAT Gateway access, ECS tasks, RDS, EFS
- **NAT Gateway**: Single cost-optimized gateway in first public subnet
- **ALB**: Application Load Balancer for HTTP traffic (Frontend :80, Control Plane :8083, Lore :41339)
- **NLB**: Network Load Balancer for TCP/UDP QUIC traffic (Lore :41337)

## Security

- All resources tagged with `Project` and `Environment` labels
- Database credentials auto-generated and stored as Pulumi secrets
- EFS and RDS storage encrypted at rest
- Security groups follow least-privilege (ingress only from ALB, egress to anywhere)
- ECS tasks run in private subnets with no public IP
- Sensitive config values (`ed25519SigningKey`, `s3AccessKey`, `s3SecretKey`) encrypted in Pulumi state
- Container health checks prevent routing to unhealthy instances

## Lore Service Specifics

- EFS volume mounted at `/data/locks` for persistent lock storage
- ALB listener on port 41339 for HTTP traffic
- NLB listener on port 41337 for TCP/UDP QUIC traffic
- Database URL injected as environment variable

## Development

### Build TypeScript

```bash
npm run build
```

### Lint Code

```bash
npm run lint
```

### Preview Infrastructure

```bash
pulumi preview --diff
```

## Notes

- This is platform infrastructure only. No tenant-specific resources are created.
- The infrastructure follows AWS best practices for high availability and security.
- All components are modular and can be reused or extended as needed.
- The control plane Docker build context is the repo root — ensure the full `control-plane/` workspace is accessible.
