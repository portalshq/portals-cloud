# Portals Platform Infrastructure

Pulumi AWS infrastructure stack for the Portals platform — the Lore VCS
service and the Lore Cloud Control Plane.

## Architecture

```
                              Internet
                                 │
                  ┌──────────────┴──────────────┐
                  │  ALB (public)               │
                  │  :8083  Control Plane (HTTP)│
                  │  :41339 Lore (HTTP)         │
                  └──────────────┬──────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │        ECS Fargate          │
                  │  ┌─────────┐  ┌──────────┐  │
                  │  │ Control │  │  Lore    │  │
                  │  │  Plane  │  │  VCS     │  │
                  │  │ :8083   │  │ :41339   │  │
                  │  └────┬────┘  └────┬─────┘  │
                  └───────┼───────────┼─────────┘
                          │           │
        ┌─────────────────┼───────────┼──────────────┐
        │                 │           │              │
   ┌────┴─────┐    ┌──────┴─────┐ ┌───┴──────┐ ┌─────┴─────┐
   │  RDS     │    │ DynamoDB   │ │  S3      │ │ Docker Hub│
   │PostgreSQL│    │ (lore      │ │ (lore    │ │ (control- │
   │ (control │    │  mutable + │ │  chunks) │ │  plane    │
   │  plane)  │    │  lock)     │ │          │ │  image)   │
   └──────────┘    └────────────┘ └──────────┘ └───────────┘

                  NLB (public)
                  │  :41337 Lore (QUIC/TCP)
                  └───────────────┘
```

## Components

| Component | What it creates |
|-----------|-----------------|
| **PlatformNetwork** | VPC, 3 public + 3 private subnets, Internet Gateway, NAT Gateway |
| **PlatformCluster** | ECS Fargate cluster, CloudWatch log group, task execution role, task role, shared task security group |
| **PlatformDataStore** | RDS PostgreSQL 15 instance (Control Plane), DynamoDB table (Lore mutable + lock store) |
| **PlatformStorage** | S3 bucket for Lore chunks (immutable store), bucket encryption + lifecycle rules |
| **LoadBalancers** | ALB for HTTP (Control Plane :8083, Lore :41339), NLB for QUIC/TCP (Lore :41337) |
| **LoreService** | ECS Fargate service pulling the stock Lore server image from the external registry; S3 + DynamoDB stores via IAM task role |
| **ControlPlaneService** | ECS Fargate service running the pre-built Control Plane image (see [Image versioning](#image-versioning)) |

There is no Frontend/Server service, no SQS event bus, and no EFS in this
stack. SQS is wired as an empty env var placeholder (events degrade
gracefully without delivery for the MVP).

## Services and ports

| Service | Container port | Load balancer | Protocol | Health check |
|---------|---------------|---------------|----------|--------------|
| Control Plane | 8083 | ALB :8083 | HTTP | `/healthz` |
| Lore | 41339 | ALB :41339 | HTTP | — |
| Lore | 41337 | NLB :41337 | TCP/UDP (QUIC) | — |

## Image versioning

Pulumi does **not** build Docker images. Deployment follows a
"build & push, then pin, then deploy" flow where
[`infra/lore/versions.yaml`](../lore/versions.yaml) is the single source of
truth for what is deployed:

1. **Build & push** — `control-plane/scripts/publish-image.sh`
   builds the Control Plane image, pushes it to Docker Hub under a unique
   `<git-short-sha>-<timestamp>` tag, and records the image URI in
   `versions.yaml` under `control-plane.image`.
2. **Deploy** — `pulumi up` reads the pinned image from `versions.yaml` and
   registers a new ECS task definition that points at it.
3. **Verify** — `control-plane/scripts/verify-and-update-versions.sh`
   compares the image actually running in ECS against `versions.yaml` and can
   correct the pin after manual deploys (`--write`).

If `control-plane.image` is empty or missing, `pulumi up` prints a warning and
skips the Control Plane service so a fresh stack and `pulumi destroy` still
work. Publish the image, then run `pulumi up` again to add the service.

## Prerequisites

- Node.js 18+
- Pulumi CLI (`brew install pulumi`)
- AWS CLI configured with credentials (`aws configure`)
- Docker + `docker login` to Docker Hub (only for the build script)

## Setup

```bash
cd infra/pulumi
npm install
pulumi stack init dev     # or per-environment stack
```

### Required configuration

```bash
# AWS
pulumi config set aws:region us-east-1

# Project
pulumi config set projectName portals
pulumi config set environment dev

# Network
pulumi config set vpcCidr "10.0.0.0/16"
pulumi config set publicSubnetCidrs "10.0.1.0/24,10.0.2.0/24,10.0.3.0/24"
pulumi config set privateSubnetCidrs "10.0.10.0/24,10.0.11.0/24,10.0.12.0/24"

# Database
pulumi config set databaseInstanceClass "db.t4g.micro"
pulumi config set databaseVersion "15.18"
pulumi config set databaseAllocatedStorage "20"

# ECS
pulumi config set ecsFargateCpu "1024"
pulumi config set ecsFargateMemory "2048"

# Service counts
pulumi config set loreServiceDesiredCount "1"
pulumi config set controlPlaneDesiredCount "1"

# Lore server external image
pulumi config set loreServerImageUri "portalshq/lore-server:latest-amd64"

# Control Plane signing key (secret)
pulumi config set --secret ed25519SigningKey "$(openssl rand -base64 32)"
```

Defaults for all of these live in [`Pulumi.yaml`](Pulumi.yaml) — only the
secrets and any overrides need to be set per stack.

## Deploy

```bash
# 1. Build, push, and pin the Control Plane image
../../control-plane/scripts/publish-image.sh

# 2. Preview and apply
pulumi preview
pulumi up
```

For a fresh stack, publish the image first (or run `pulumi up` once to create
the infrastructure with the Control Plane service skipped, then publish and
`pulumi up` again to add it).

## Outputs

| Output | Description |
|--------|-------------|
| `databaseUrl` | PostgreSQL connection string (secret) |
| `albDnsName` | Application Load Balancer DNS name |
| `nlbDnsName` | Network Load Balancer DNS name |
| `vpcId` | VPC ID |
| `clusterArn` | ECS cluster ARN |
| `controlPlaneImageUri` | Control Plane image URI pinned in `versions.yaml` |
| `loreChunksBucketName` | S3 bucket for Lore chunks (immutable store) |
| `loreChunksBucketArn` | ARN of the Lore chunks bucket |
| `loreDynamoDbTableName` | DynamoDB table for Lore mutable + lock store |
| `loreDynamoDbTableArn` | ARN of the Lore DynamoDB table |
| `loreServiceSecurityGroupArn` | ARN of the Lore service security group |
| `controlPlaneServiceSecurityGroupArn` | ARN of the Control Plane security group (`""` until the image is pinned) |

## Control Plane service

The Control Plane is the Lore Cloud reconciliation engine — a Rust/Axum
service that manages repositories, organizations, sessions, and capabilities
through declarative controller loops.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `ED25519_SIGNING_KEY` | yes | — | Base64-encoded Ed25519 key for data plane JWTs |
| `LISTEN_ADDR` | no | `0.0.0.0:8083` | HTTP listen address |
| `AWS_REGION` | no | (config) | AWS region for S3 |
| `SQS_QUEUE_URL` | no | `""` | SQS queue URL (outbox relay; empty = degraded) |
| `PROVIDER_TYPE` | no | `aws` | `aws` or `mock` |
| `JWT_AUTH_ENABLED` | no | `false` | Enable JWT authentication |
| `IDEMPOTENCY_ENABLED` | no | `true` | Enable idempotency checks |
| `METRICS_ENABLED` | no | `true` | Enable Prometheus metrics |
| `DP_TOKEN_EXPIRY_SECS` | no | `3600` | Data plane token TTL |
| `CORS_ALLOWED_ORIGINS` | no | `*` | Comma-separated CORS origins |
| `RUST_LOG` | no | `info,lorecloud_control_plane=debug,sqlx=warn` | Log filter |
| `REDIS_URL` | no | `""` | Redis for idempotency cache (empty = in-memory) |

`GET /healthz` on port 8083 is probed by both the container health check
(`wget`) and the ALB target group.

## Lore service

- Pulls the stock Lore server image from the external registry (`loreServerImageUri`).
- **Immutable store** (fragments/chunks): S3 bucket via the `lore-aws` plugin.
- **Mutable + lock store**: DynamoDB table via the `lore-aws` plugin.
- Access is via an IAM task role scoped to the S3 bucket and DynamoDB table.
- ALB listener :41339 (HTTP) and NLB listener :41337 (TCP/UDP QUIC).

## Network topology

- **Public subnets** (3x /24): Internet Gateway access, ALB/NLB placement.
- **Private subnets** (3x /24): NAT Gateway access; ECS tasks, RDS.
- **ALB**: HTTP — Control Plane :8083, Lore :41339.
- **NLB**: TCP/UDP — Lore :41337 (QUIC).

## Security

- All resources tagged with `Project` and `Environment`.
- Database credentials auto-generated and stored as Pulumi secrets.
- RDS and S3 encrypted at rest; the Lore chunks bucket blocks public access
  and enforces secure transport.
- Security groups follow least privilege (ingress from load balancers only,
  egress to anywhere).
- ECS tasks run in private subnets with no public IP.
- `ed25519SigningKey` is encrypted in Pulumi state; AWS access is via IAM
  roles, not embedded credentials.
- S3 lifecycle rules abort incomplete multipart uploads after 7 days.

## Development

```bash
npm run build      # compile TypeScript
npm run lint       # eslint
pulumi preview     # preview stack changes
```

## Notes

- Platform infrastructure only — no tenant-specific resources.
- This is an MVP stack: no HA multi-AZ replication for Lore, no SQS delivery.
