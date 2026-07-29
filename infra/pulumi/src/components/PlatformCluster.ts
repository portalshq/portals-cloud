import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformClusterArgs } from "../interfaces";

/**
 * PlatformCluster Component
 *
 * Creates an ECS Fargate cluster with:
 * - ECS Cluster
 * - CloudWatch Log Group
 * - ECS Task Execution Role (pulls images + secrets)
 * - ECS Task Role (application-level AWS access)
 * - Task Security Group
 */
export class PlatformCluster extends pulumi.ComponentResource {
  public readonly cluster: aws.ecs.Cluster;
  public readonly logGroup: aws.cloudwatch.LogGroup;
  public readonly taskExecutionRole: aws.iam.Role;
  public readonly taskRole: aws.iam.Role;
  public readonly taskSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Cluster", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── CloudWatch Log Group ─────────────────────────────────────────────
    this.logGroup = new aws.cloudwatch.LogGroup(`${resourcePrefix}-ecs-logs`, {
      name: `/ecs/${resourcePrefix}`,
      retentionInDays: 7,
      tags: {
        Name: `${resourcePrefix}-ecs-logs`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // ── ECS Task Execution Role ──────────────────────────────────────────
    // Used by the ECS agent: pull images, pull secrets, push logs.
    this.taskExecutionRole = new aws.iam.Role(`${resourcePrefix}-ecs-task-execution-role`, {
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
        Name: `${resourcePrefix}-ecs-task-execution-role`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Attach AmazonECSTaskExecutionRolePolicy (ECR pull + CloudWatch Logs)
    new aws.iam.RolePolicyAttachment(`${resourcePrefix}-ecs-exec-policy`, {
      role: this.taskExecutionRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    }, { parent: this });

    // Grant SecretsManager read access (for external registry credentials)
    new aws.iam.RolePolicy(`${resourcePrefix}-ecs-exec-secrets-policy`, {
      role: this.taskExecutionRole.id,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "secretsmanager:GetSecretValue",
            ],
            Resource: "*",
          },
        ],
      }),
    }, { parent: this });

    // ── ECS Task Role ────────────────────────────────────────────────────
    // Used by the running application: S3, DynamoDB, etc.
    // Services attach their own granular policies to this role.
    this.taskRole = new aws.iam.Role(`${resourcePrefix}-ecs-task-role`, {
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
        Name: `${resourcePrefix}-ecs-task-role`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // ── ECS Cluster ──────────────────────────────────────────────────────
    this.cluster = new aws.ecs.Cluster(`${resourcePrefix}-cluster`, {
      tags: {
        Name: `${resourcePrefix}-cluster`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // ── Task Security Group ──────────────────────────────────────────────
    this.taskSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-task-sg`, {
      vpcId: args.vpcId,
      description: "Security group for ECS tasks",
      tags: {
        Name: `${resourcePrefix}-task-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow egress from tasks to anywhere (AWS APIs, databases, S3, DynamoDB)
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-task-egress`, {
      type: "egress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: this.taskSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"],
    }, { parent: this });

    this.registerOutputs();
  }
}
