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
 * - ECS service with ALB integration on port 8083
 * - Security groups (ingress from ALB only)
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

    // Allow ingress from ALB security group on port 8083
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-alb-ingress`, {
      type: "ingress",
      fromPort: 8083,
      toPort: 8083,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.albSecurityGroupId,
    }, { parent: this });

    // Allow egress to anywhere (AWS APIs, database, S3)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-egress`, {
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // ── ECS Task Definition ──────────────────────────────────────────────
    const callerIdentity = aws.getCallerIdentity({});
    const executionRoleArn = pulumi.interpolate`arn:aws:iam::${callerIdentity.then(i => i.accountId)}:role/${args.projectName}-${args.environment}-ecs-task-execution-role`;

    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-controlplane-task`, {
      family: `${resourcePrefix}-controlplane`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn,
      containerDefinitions: pulumi.all([
        args.controlPlaneImageUri,
        args.databaseUrl,
        args.ed25519SigningKey,
      ]).apply(([
        image,
        databaseUrl,
        ed25519SigningKey,
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
          { name: "AWS_REGION", value: args.s3Region },
          // ── SQS: omitted for MVP (graceful degradation) ──
          { name: "SQS_QUEUE_URL", value: "" },
          // ── Feature flags ──
          { name: "PROVIDER_TYPE", value: args.providerType ?? "aws" },
          { name: "JWT_AUTH_ENABLED", value: args.jwtAuthEnabled ?? "false" },
          { name: "IDEMPOTENCY_ENABLED", value: args.idempotencyEnabled ?? "true" },
          { name: "METRICS_ENABLED", value: args.metricsEnabled ?? "true" },
          { name: "DP_TOKEN_EXPIRY_SECS", value: args.dpTokenExpirySecs ?? "3600" },
          { name: "CORS_ALLOWED_ORIGINS", value: args.corsAllowedOrigins ?? "*" },
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
      healthCheckGracePeriodSeconds: 60,
      networkConfiguration: {
        subnets: args.privateSubnetIds,
        securityGroups: [this.securityGroup.id, args.taskSecurityGroupId],
        assignPublicIp: false,
      },
      loadBalancers: [
        {
          targetGroupArn: args.albTargetGroupArn,
          containerName: "control-plane",
          containerPort: 8083,
        },
      ],
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
