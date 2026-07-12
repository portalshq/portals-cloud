# Portals Platform Infrastructure

Production-grade Pulumi AWS infrastructure stack for the Portals platform.

## Architecture Overview

This infrastructure deploys a modular, production-ready AWS platform using Pulumi Components:

### Components

- **PlatformNetwork**: VPC with 3 public subnets, 3 private subnets, Internet Gateway, and cost-optimized NAT Gateway
- **PlatformCluster**: ECS Fargate cluster with CloudWatch logging and task execution roles
- **PlatformDataStore**: Aurora PostgreSQL RDS cluster with encrypted storage
- **PlatformStorage**: ECR repositories for Docker images and EFS file system for persistent storage
- **LoadBalancers**: Application Load Balancer (ALB) for HTTP traffic and Network Load Balancer (NLB) for TCP/UDP QUIC traffic
- **LoreService**: ECS Fargate service with EFS volume attachment, ALB (port 41339) and NLB (port 41337) integration
- **ServerService**: ECS Fargate service with ALB integration
- **FrontendService**: ECS Fargate service with ALB integration

## Prerequisites

- Node.js 18+
- Pulumi CLI
- AWS CLI configured with appropriate credentials
- Docker (for building images)

## Installation

```bash
cd pulumi
npm install
```

## Configuration

Configure the stack by setting the required configuration values:

```bash
pulumi config set aws:region us-east-1
pulumi config set projectName portals
pulumi config set environment dev
pulumi config set vpcCidr "10.0.0.0/16"
pulumi config set publicSubnetCidrs "10.0.1.0/24,10.0.2.0/24,10.0.3.0/24"
pulumi config set privateSubnetCidrs "10.0.10.0/24,10.0.11.0/24,10.0.12.0/24"
pulumi config set databaseInstanceClass "db.r6g.xlarge"
pulumi config set databaseVersion "15.4"
pulumi config set databaseAllocatedStorage "100"
pulumi config set ecsFargateCpu "2048"
pulumi config set ecsFargateMemory "4096"
pulumi config set loreServiceDesiredCount "2"
pulumi config set serverServiceDesiredCount "2"
pulumi config set frontendServiceDesiredCount "2"
pulumi config set loreServerDockerPath "../../apps/lore-server"
pulumi config set serverDockerPath "../../apps/server"
pulumi config set frontendDockerPath "../../apps/frontend"
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

- `databaseUrl`: PostgreSQL connection string (marked as secret)
- `albDnsName`: Application Load Balancer DNS name
- `nlbDnsName`: Network Load Balancer DNS name
- `vpcId`: VPC ID
- `clusterArn`: ECS Cluster ARN
- `loreEcrRepositoryUrl`: ECR repository URL for Lore service
- `serverEcrRepositoryUrl`: ECR repository URL for Server service
- `frontendEcrRepositoryUrl`: ECR repository URL for Frontend service
- `efsFileSystemId`: EFS file system ID

## Docker Integration

The ECS services automatically build Docker images from the configured local paths and push them to ECR during `pulumi up`. Ensure your Docker contexts are properly configured at the specified paths.

## Network Topology

- **Public Subnets**: 3 subnets across availability zones with Internet Gateway access
- **Private Subnets**: 3 subnets across availability zones with NAT Gateway access
- **NAT Gateway**: Single cost-optimized NAT Gateway in the first public subnet
- **Load Balancers**: ALB and NLB in public subnets for external access

## Security

- All resources are tagged with project and environment labels
- Database credentials are auto-generated and marked as secrets
- EFS and RDS storage are encrypted
- Security groups follow least-privilege principles
- ECS tasks run in private subnets without public IP addresses

## Lore Service Specifics

The Lore service includes:
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

## Notes

- This is platform infrastructure only. No tenant-specific resources are created.
- The infrastructure follows AWS best practices for high availability and security.
- All components are modular and can be reused or extended as needed.
