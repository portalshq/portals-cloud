import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoreServiceArgs } from "../interfaces";

/**
 * LoreService Component
 *
 * Creates the host-network ECS service for Lore VCS with:
 * - Immutable ECR image selected by repository digest
 * - ECS task definition with S3 + DynamoDB plugin configuration
 * - ECS service with ALB gRPC integration on the private h2c target port
 * - IAM task role for S3 and DynamoDB access
 */
export class LoreService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly taskRole: aws.iam.Role;

  constructor(name: string, args: LoreServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoreService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── IAM Task Role for S3 + DynamoDB access ───────────────────────────
    this.taskRole = new aws.iam.Role(`${resourcePrefix}-lore-task-role`, {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ecs-tasks.amazonaws.com",
            },
          },
        ],
      }),
      tags: {
        Name: `${resourcePrefix}-lore-task-role`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // S3 access for immutable store (lore chunks)
    const s3Policy = pulumi.all([args.s3BucketArn]).apply(([bucketArn]) => JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket",
            "s3:GetBucketLocation",
          ],
          Resource: [
            bucketArn,
            `${bucketArn}/*`,
          ],
        },
      ],
    }));

    new aws.iam.RolePolicy(`${resourcePrefix}-lore-s3-policy`, {
      role: this.taskRole.id,
      policy: s3Policy,
    }, { parent: this });

    // DynamoDB access for immutable (fragments + metadata), mutable and lock stores
    const dynamoDbPolicy = pulumi.all([
      args.fragmentsTableName,
      args.metadataTableName,
      args.mutableTableName,
      args.locksTableName,
    ]).apply(([fragments, metadata, mutable, locks]) => JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWriteItem",
            "dynamodb:BatchGetItem",
            "dynamodb:TransactWriteItems",
            "dynamodb:TransactGetItems",
            "dynamodb:DescribeTable",
          ],
          Resource: [
            `arn:aws:dynamodb:*:*:table/${fragments}`,
            `arn:aws:dynamodb:*:*:table/${fragments}/index/*`,
            `arn:aws:dynamodb:*:*:table/${metadata}`,
            `arn:aws:dynamodb:*:*:table/${metadata}/index/*`,
            `arn:aws:dynamodb:*:*:table/${mutable}`,
            `arn:aws:dynamodb:*:*:table/${mutable}/index/*`,
            `arn:aws:dynamodb:*:*:table/${locks}`,
            `arn:aws:dynamodb:*:*:table/${locks}/index/*`,
          ],
        },
      ],
    }));

    new aws.iam.RolePolicy(`${resourcePrefix}-lore-dynamodb-policy`, {
      role: this.taskRole.id,
      policy: dynamoDbPolicy,
    }, { parent: this });

    // ── ECS Task Definition ──────────────────────────────────────────────
    const executionRoleArn = args.taskExecutionRoleArn;

    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-lore-task`, {
      family: `${resourcePrefix}-lore`,
      networkMode: "host",
      requiresCompatibilities: ["EC2"],
      runtimePlatform: { cpuArchitecture: args.cpuArchitecture, operatingSystemFamily: "LINUX" },
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn,
      taskRoleArn: this.taskRole.arn,
      containerDefinitions: pulumi.all([
        args.s3BucketName,
        args.fragmentsTableName,
        args.metadataTableName,
        args.mutableTableName,
        args.locksTableName,
      ]).apply(([s3BucketName, fragmentsTableName, metadataTableName, mutableTableName, locksTableName]) => JSON.stringify([{
        name: "lore",
        image: args.loreServerImageUri,
        cpu: parseInt(args.cpu),
        memory: parseInt(args.memory),
        essential: true,
        portMappings: [
          { containerPort: 41337, hostPort: 41337, protocol: "tcp", appProtocol: "grpc" },
          // Health/readiness is loopback-only; the host security group never opens it.
          { containerPort: 41339, hostPort: 41339, protocol: "tcp" },
        ],
        environment: [
          { name: "LORE_ENV", value: args.environment },
          { name: "LORE_SECURITY_MODE", value: "strict" },
          { name: "LORE__SERVER__AUTH__JWK__ENDPOINT", value: args.jwksEndpoint },
          { name: "LORE__SERVER__AUTH__JWT_ISSUER", value: args.jwtIssuer },
          // Advertised to clients via the environment endpoint so `nap auth
          // login` can discover the auth provider and repo URLs.
          { name: "LORE__ENVIRONMENT__ENDPOINT__AUTH_URL", value: args.authEndpointUrl },
          { name: "LORE__ENVIRONMENT__ENDPOINT__REPOSITORY_URL", value: args.repoEndpointUrl },
          { name: "LORE_REBAC_URL", value: args.rebacUrl },
          { name: "LORE_REBAC_CONNECT_MAX_ATTEMPTS", value: "8" },
          { name: "LORE_REBAC_HEALTH_MAX_ATTEMPTS", value: "4" },
          // Immutable store: S3 + DynamoDB (aws plugin)
          { name: "LORE__IMMUTABLE_STORE__MODE", value: "aws" },
          // Mutable store: DynamoDB (aws plugin)
          { name: "LORE__MUTABLE_STORE__MODE", value: "aws" },
          // Lock store: DynamoDB (aws plugin)
          { name: "LORE__LOCK_STORE__MODE", value: "aws" },
          // AWS plugin configuration — the plugin reads store-specific
          // [plugins.aws.<store>] sections, not flat plugin keys.
          { name: "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_BUCKET", value: s3BucketName },
          { name: "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_REGION", value: args.awsRegion },
          { name: "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_FRAGMENTS_TABLE", value: fragmentsTableName },
          { name: "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_METADATA_TABLE", value: metadataTableName },
          { name: "LORE__PLUGINS__AWS__MUTABLE_STORE__DYNAMODB_TABLE", value: mutableTableName },
          { name: "LORE__PLUGINS__AWS__LOCK_STORE__DYNAMODB_TABLE", value: locksTableName },
          { name: "RUST_LOG", value: "debug" },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${resourcePrefix}`,
            "awslogs-region": args.awsRegion,
            "awslogs-stream-prefix": "lore",
          },
        },
        healthCheck: {
          command: ["CMD", "/usr/local/bin/loreserver", "healthcheck"],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 60,
        },
      }])),
      tags: {
        Name: `${resourcePrefix}-lore-task`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // ── ECS Service ──────────────────────────────────────────────────────
    this.service = new aws.ecs.Service(`${resourcePrefix}-lore-service`, {
      cluster: args.clusterArn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      capacityProviderStrategies: [{
        capacityProvider: args.capacityProviderName,
        weight: 1,
        base: 1,
      }],
      enableExecuteCommand: false,
      healthCheckGracePeriodSeconds: 60,
      // Bootstrap mode deploys Lore without ALB registration: the lore gRPC
      // target group gains its listener rule only when public ingress opens.
      loadBalancers: args.publicIngressEnabled ? [
        {
          targetGroupArn: args.albTargetGroupArn,
          containerName: "lore",
          containerPort: 41337,
        },
      ] : [],
      deploymentCircuitBreaker: { enable: true, rollback: true },
      tags: {
        Name: `${resourcePrefix}-lore-service`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    this.registerOutputs({ serviceName: this.service.name });
  }
}
