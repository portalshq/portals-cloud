import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import { ControlPlaneServiceArgs } from "../interfaces";

/**
 * ControlPlaneService Component
 *
 * Creates an ECS Fargate service for the Lore Cloud Control Plane with:
 * - Docker image build and push to ECR (multi-stage Rust build)
 * - ECS task definition with health check
 * - ECS service with ALB integration on port 8083
 * - Security groups (ingress from ALB only)
 * - Environment variables matching the Rust AppConfig (clap env parser)
 *
 * Required Rust env vars (no default):
 *   DATABASE_URL, S3_ACCESS_KEY, S3_SECRET_KEY, ED25519_SIGNING_KEY
 *
 * The SQS_QUEUE_URL env var enables the outbox relay for event delivery.
 * When empty, events are marked published without delivery (graceful degradation).
 */
export class ControlPlaneService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly dockerImage: docker.Image;
  public readonly securityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: ControlPlaneServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:ControlPlaneService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── Security Group ──────────────────────────────────────────────────────
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

    // Allow egress to anywhere (AWS APIs, database, SQS, S3)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-egress`, {
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    // ── Docker Image ────────────────────────────────────────────────────────
    // Build the multi-stage Rust Dockerfile and push to ECR
    const ecrRepositoryUrlOutput = pulumi.output(args.ecrRepositoryUrl);
    const ecrCredentials = aws.ecr.getCredentialsOutput({
      registryId: ecrRepositoryUrlOutput.apply(url => url.split(".")[0]),
    });
    const ecrAuth = ecrCredentials.apply(creds => {
      const decoded = Buffer.from(creds.authorizationToken, "base64").toString("utf-8");
      const [username, password] = decoded.split(":");
      return { username, password, server: creds.proxyEndpoint };
    });

    this.dockerImage = new docker.Image(`${resourcePrefix}-controlplane-image`, {
      build: {
        context: args.dockerPath,
        dockerfile: "docker/control-plane/Dockerfile",
      },
      imageName: pulumi.interpolate`${args.ecrRepositoryUrl}:${args.imageTag ?? "latest"}`,
      registry: ecrAuth,
    }, { parent: this });

    // ── ECS Task Definition ─────────────────────────────────────────────────
    // Resolve the task execution role ARN from the cluster component
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
        this.dockerImage.imageName,
        args.databaseUrl,
        args.eventQueueUrl,
        args.ed25519SigningKey,
        args.s3AccessKey,
        args.s3SecretKey,
      ]).apply(([
        image,
        databaseUrl,
        sqsQueueUrl,
        ed25519SigningKey,
        s3AccessKey,
        s3SecretKey,
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
          { name: "S3_ACCESS_KEY", value: s3AccessKey },
          { name: "S3_SECRET_KEY", value: s3SecretKey },
          { name: "ED25519_SIGNING_KEY", value: ed25519SigningKey },
          // ── Networking ──
          { name: "LISTEN_ADDR", value: "0.0.0.0:8083" },
          { name: "AWS_REGION", value: args.s3Region },
          // ── Event bus (SQS) ──
          { name: "SQS_QUEUE_URL", value: sqsQueueUrl },
          // ── S3 storage ──
          { name: "S3_ENDPOINT", value: args.s3Endpoint },
          { name: "S3_BUCKET_CHUNKS", value: args.s3BucketChunks },
          { name: "S3_REGION", value: args.s3Region },
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

    // ── ECS Service ─────────────────────────────────────────────────────────
    this.service = new aws.ecs.Service(`${resourcePrefix}-controlplane-service`, {
      cluster: args.clusterArn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      launchType: "FARGATE",
      healthCheckGracePeriodSeconds: 60,
      networkConfiguration: {
        subnets: args.privateSubnetIds,
        securityGroups: [this.securityGroup.id],
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
