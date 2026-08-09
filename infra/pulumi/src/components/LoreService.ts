import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoreServiceArgs } from "../interfaces";

/**
 * LoreService Component
 *
 * Creates an ECS Fargate service for Lore VCS with:
 * - External Docker image (from portalshq/lore-server registry)
 * - ECS task definition with S3 + DynamoDB plugin configuration
 * - ECS service with ALB (HTTP) and NLB (QUIC) integration
 * - Security groups
 * - IAM task role for S3 and DynamoDB access
 */
export class LoreService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly taskRole: aws.iam.Role;

  constructor(name: string, args: LoreServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoreService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── Security Group ───────────────────────────────────────────────────
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-lore-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Lore service",
      tags: {
        Name: `${resourcePrefix}-lore-sg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Allow ingress from ALB (HTTP on port 41339)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-alb-ingress`, {
      type: "ingress",
      fromPort: 41339,
      toPort: 41339,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.albSecurityGroupId,
    }, { parent: this });

    // Allow ingress from NLB (QUIC/UDP on port 41337)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-nlb-ingress-udp`, {
      type: "ingress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "udp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.nlbSecurityGroupId,
    }, { parent: this });

    // Allow ingress from NLB (gRPC/TCP on port 41337)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-nlb-ingress-tcp`, {
      type: "ingress",
      fromPort: 41337,
      toPort: 41337,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.nlbSecurityGroupId,
    }, { parent: this });

    // Allow egress from Lore service
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-egress`, {
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

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

    // DynamoDB access for mutable store + lock store
    const dynamoDbPolicy = pulumi.all([args.dynamoDbTableName]).apply(([tableName]) => JSON.stringify({
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
            `arn:aws:dynamodb:*:*:table/${tableName}`,
            `arn:aws:dynamodb:*:*:table/${tableName}/index/*`,
          ],
        },
      ],
    }));

    new aws.iam.RolePolicy(`${resourcePrefix}-lore-dynamodb-policy`, {
      role: this.taskRole.id,
      policy: dynamoDbPolicy,
    }, { parent: this });

    // ── ECS Task Definition ──────────────────────────────────────────────
    const callerIdentity = aws.getCallerIdentity({});
    const executionRoleArn = pulumi.interpolate`arn:aws:iam::${callerIdentity.then(i => i.accountId)}:role/${resourcePrefix}-ecs-task-execution-role`;

    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-lore-task`, {
      family: `${resourcePrefix}-lore`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn,
      taskRoleArn: this.taskRole.arn,
      containerDefinitions: pulumi.all([
        args.s3BucketName,
        args.dynamoDbTableName,
      ]).apply(([s3BucketName, dynamoDbTableName]) => JSON.stringify([{
        name: "lore",
        image: args.loreServerImageUri,
        cpu: parseInt(args.cpu),
        memory: parseInt(args.memory),
        essential: true,
        portMappings: [
          { containerPort: 41339, protocol: "tcp" },
          { containerPort: 41337, protocol: "udp" },
          { containerPort: 41337, protocol: "tcp" },
        ],
        environment: [
          { name: "LORE_ENV", value: "prod" },
          // Immutable store: S3
          { name: "LORE__IMMUTABLE_STORE__MODE", value: "aws" },
          // Mutable store: DynamoDB
          { name: "LORE__MUTABLE_STORE__MODE", value: "aws" },
          // Lock store: DynamoDB
          { name: "LORE__LOCK_STORE__MODE", value: "aws" },
          // AWS plugin configuration
          { name: "LORE__PLUGINS__AWS__S3_BUCKET", value: s3BucketName },
          { name: "LORE__PLUGINS__AWS__DYNAMODB_TABLE", value: dynamoDbTableName },
          { name: "LORE__PLUGINS__AWS__REGION", value: args.awsRegion },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${resourcePrefix}`,
            "awslogs-region": args.awsRegion,
            "awslogs-stream-prefix": "lore",
          },
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
          containerName: "lore",
          containerPort: 41339,
        },
        {
          targetGroupArn: args.nlbTargetGroupArn,
          containerName: "lore",
          containerPort: 41337,
        },
      ],
      tags: {
        Name: `${resourcePrefix}-lore-service`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    this.registerOutputs();
  }
}
