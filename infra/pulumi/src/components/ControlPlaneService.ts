import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ControlPlaneServiceArgs } from "../interfaces";

/**
 * ControlPlaneService Component
 *
 * Creates an ECS Fargate service for the Lore Cloud Control Plane with:
 * - Pre-built Docker image (built/pushed by control-plane/scripts/publish-image.sh,
 *   pinned in infra/lore/versions.yaml — Pulumi does NOT build images)
 * - ECS task definition with health check
 * - Private ECS service with no internet-facing listener
 * - Environment variables matching the Rust AppConfig (clap env parser)
 *
 * Required Rust env vars (no default):
 *   DATABASE_URL, ED25519_SIGNING_KEY
 *
 * SQS event bus is omitted for MVP — events degrade gracefully without delivery.
 */
export class ControlPlaneService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly taskRole: aws.iam.Role;

  constructor(name: string, args: ControlPlaneServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:ControlPlaneService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── Security Group ───────────────────────────────────────────────────
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-controlplane-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Control Plane service (Axum on port 8083)",
      tags: {
        Name: `${resourcePrefix}-controlplane-sg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // Intentionally no ingress. A future Auth Gateway must use an explicit
    // security-group reference; this service is never an ALB target.

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-https-egress`, {
      type: "egress",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
      description: "AWS APIs over TLS",
    }, { parent: this });
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-postgres-egress`, {
      type: "egress",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: [args.vpcCidr],
      description: "Private PostgreSQL",
    }, { parent: this });
    for (const protocol of ["tcp", "udp"]) {
      new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-dns-${protocol}`, {
        type: "egress",
        fromPort: 53,
        toPort: 53,
        protocol,
        securityGroupId: this.securityGroup.id,
        cidrBlocks: [args.vpcCidr],
        description: "VPC DNS resolution",
      }, { parent: this });
    }

    this.taskRole = new aws.iam.Role(`${resourcePrefix}-controlplane-task-role`, {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
        }],
      }),
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });

    new aws.iam.RolePolicy(`${resourcePrefix}-controlplane-s3-policy`, {
      role: this.taskRole.id,
      policy: pulumi.output(args.s3BucketArn).apply(bucketArn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"],
          Resource: [bucketArn, `${bucketArn}/*`],
        }],
      })),
    }, { parent: this });

    // ── ECS Task Definition ──────────────────────────────────────────────
    const executionRoleArn = args.taskExecutionRoleArn;

    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-controlplane-task`, {
      family: `${resourcePrefix}-controlplane`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      runtimePlatform: { cpuArchitecture: args.cpuArchitecture, operatingSystemFamily: "LINUX" },
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn,
      taskRoleArn: this.taskRole.arn,
      containerDefinitions: pulumi.all([
        args.controlPlaneImageUri,
        args.databaseUrl,
        args.ed25519SigningKey,
        args.s3BucketName,
      ]).apply(([
        image,
        databaseUrl,
        ed25519SigningKey,
        s3BucketName,
      ]) => JSON.stringify([{
        name: "control-plane",
        image,
        cpu: parseInt(args.cpu),
        memory: parseInt(args.memory),
        essential: true,
        portMappings: [
          {
            containerPort: 8083,
            protocol: "tcp",
          },
        ],
        environment: [
          // ── Required (no default) ──
          { name: "DATABASE_URL", value: databaseUrl },
          { name: "ED25519_SIGNING_KEY", value: ed25519SigningKey },
          // ── Networking ──
          { name: "LISTEN_ADDR", value: "0.0.0.0:8083" },
          // ── S3 (Control Plane writes repo chunks to the lore-chunks bucket) ──
          // Empty endpoint/credentials select the standard AWS endpoint and
          // ECS task-role credential chain in the official SDK.
          { name: "S3_REGION", value: args.s3Region },
          { name: "S3_ENDPOINT", value: "" },
          { name: "S3_BUCKET_CHUNKS", value: s3BucketName },
          // ── SQS: omitted for MVP (graceful degradation) ──
          { name: "SQS_QUEUE_URL", value: "" },
          // ── Feature flags ──
          { name: "PROVIDER_TYPE", value: args.providerType ?? "aws" },
          { name: "JWT_AUTH_ENABLED", value: args.jwtAuthEnabled ?? "true" },
          { name: "IDEMPOTENCY_ENABLED", value: args.idempotencyEnabled ?? "true" },
          { name: "METRICS_ENABLED", value: args.metricsEnabled ?? "true" },
          { name: "DP_TOKEN_EXPIRY_SECS", value: args.dpTokenExpirySecs ?? "300" },
          { name: "CORS_ALLOWED_ORIGINS", value: args.corsAllowedOrigins ?? "https://auth.portals.works" },
          // ── Observability ──
          { name: "RUST_LOG", value: args.rustLog ?? "info,lorecloud_control_plane=debug,sqlx=warn" },
          // ── Optional infra ──
          { name: "REDIS_URL", value: args.redisUrl ?? "" },
        ],
        healthCheck: {
          command: ["CMD-SHELL", "wget -qO- http://localhost:8083/healthz || exit 1"],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 40,
        },
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${resourcePrefix}`,
            "awslogs-region": args.s3Region,
            "awslogs-stream-prefix": "control-plane",
          },
        },
      }])),
      tags: {
        Name: `${resourcePrefix}-controlplane-task`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // ── ECS Service ──────────────────────────────────────────────────────
    this.service = new aws.ecs.Service(`${resourcePrefix}-controlplane-service`, {
      cluster: args.clusterArn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      launchType: "FARGATE",
      networkConfiguration: {
        subnets: args.privateSubnetIds,
        securityGroups: [this.securityGroup.id, args.taskSecurityGroupId],
        assignPublicIp: false,
      },
      tags: {
        Name: `${resourcePrefix}-controlplane-service`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    this.registerOutputs();
  }
}
