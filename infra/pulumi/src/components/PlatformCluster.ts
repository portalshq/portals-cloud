import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformClusterArgs } from "../interfaces";

/**
 * PlatformCluster Component
 * 
 * Creates an ECS Fargate cluster with:
 * - ECS Cluster
 * - CloudWatch Log Group
 * - ECS Task Execution Role
 * - Task Security Group
 */
export class PlatformCluster extends pulumi.ComponentResource {
  public readonly cluster: aws.ecs.Cluster;
  public readonly logGroup: aws.cloudwatch.LogGroup;
  public readonly taskExecutionRole: aws.iam.Role;
  public readonly taskExecutionRolePolicyAttachment: aws.iam.RolePolicyAttachment;
  public readonly taskSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformClusterArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Cluster", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create CloudWatch Log Group for ECS tasks
    this.logGroup = new aws.cloudwatch.LogGroup(`${resourcePrefix}-ecs-logs`, {
      name: `/ecs/${resourcePrefix}`,
      retentionInDays: 7,
      tags: {
        Name: `${resourcePrefix}-ecs-logs`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create ECS Task Execution Role
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

    // Attach AmazonECSTaskExecutionRolePolicy to the role
    this.taskExecutionRolePolicyAttachment = new aws.iam.RolePolicyAttachment(
      `${resourcePrefix}-ecs-task-execution-role-policy-attachment`,
      {
        role: this.taskExecutionRole.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      },
      { parent: this }
    );

    // Create ECS Cluster
    this.cluster = new aws.ecs.Cluster(`${resourcePrefix}-cluster`, {
      tags: {
        Name: `${resourcePrefix}-cluster`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Task Security Group
    this.taskSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-task-sg`, {
      vpcId: args.vpcId,
      description: "Security group for ECS tasks",
      tags: {
        Name: `${resourcePrefix}-task-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow egress from tasks to anywhere
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
