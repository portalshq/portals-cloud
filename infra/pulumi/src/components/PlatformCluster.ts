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
  public readonly serviceConnectNamespace?: aws.servicediscovery.HttpNamespace;

  constructor(name: string, args: PlatformClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Cluster", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── ECS Service-Linked Role ────────────────────────────────────────────
    // Auto-created by AWS on first console use, but must be explicit for
    // fully-API-managed accounts (CreateService requires it).
    new aws.iam.ServiceLinkedRole(`${resourcePrefix}-ecs-slr`, {
      awsServiceName: "ecs.amazonaws.com",
      description: "Service-linked role for Amazon ECS",
    }, { parent: this });

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
    this.serviceConnectNamespace = args.serviceConnectEnabled ? new aws.servicediscovery.HttpNamespace(`${resourcePrefix}-services`, {
      name: `${resourcePrefix}-services`,
      description: "Private ECS Service Connect discovery namespace",
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this }) : undefined;
    this.cluster = new aws.ecs.Cluster(`${resourcePrefix}-cluster`, {
      serviceConnectDefaults: this.serviceConnectNamespace ? { namespace: this.serviceConnectNamespace.arn } : undefined,
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

    // No shared egress. Each service group declares the minimum protocols it
    // needs. Secrets Manager permissions are likewise added only for specific
    // secret ARNs by the service that consumes them.

    this.registerOutputs();
  }
}
