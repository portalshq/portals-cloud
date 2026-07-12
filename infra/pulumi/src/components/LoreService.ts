import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import { LoreServiceArgs } from "../interfaces";

/**
 * LoreService Component
 * 
 * Creates an ECS Fargate service for Lore with:
 * - Docker image build and push to ECR
 * - ECS task definition with EFS volume
 * - ECS service with ALB and NLB integration
 * - Security groups
 */
export class LoreService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly dockerImage: docker.Image;
  public readonly securityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: LoreServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:LoreService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create security group for Lore service
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

    // Allow ingress from ALB security group
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-alb-ingress`, {
      type: "ingress",
      fromPort: 41339,
      toPort: 41339,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.albSecurityGroupId,
    }, { parent: this });

    // Allow ingress from NLB security group
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-lore-nlb-ingress`, {
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

    // Get ECR credentials
    const ecrCredentials = aws.ecr.getCredentials({ registryId: args.ecrRepositoryUrl.apply(url => url.split(".")[0]) });
    const ecrAuth = ecrCredentials.then(creds => {
      const decoded = Buffer.from(creds.authorizationToken, "base64").toString("utf-8");
      const [username, password] = decoded.split(":");
      return { username, password, server: creds.proxyEndpoint };
    });

    // Build and push Docker image to ECR
    this.dockerImage = new docker.Image(`${resourcePrefix}-lore-image`, {
      build: {
        context: args.dockerPath,
      },
      imageName: pulumi.interpolate`${args.ecrRepositoryUrl}:latest`,
      registry: ecrAuth,
    }, { parent: this });

    // Create ECS task definition with EFS volume
    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-lore-task`, {
      family: `${resourcePrefix}-lore`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn: pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity({}).then(identity => identity.accountId)}:role/${args.projectName}-${args.environment}-ecs-task-execution-role`,
      containerDefinitions: pulumi.interpolate`[
        {
          "name": "lore",
          "image": "${this.dockerImage.imageName}",
          "cpu": ${args.cpu},
          "memory": ${args.memory},
          "essential": true,
          "portMappings": [
            {
              "containerPort": 41339,
              "protocol": "tcp"
            },
            {
              "containerPort": 41337,
              "protocol": "tcp"
            }
          ],
          "environment": [
            {
              "name": "DATABASE_URL",
              "value": "${args.databaseUrl}"
            }
          ],
          "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
              "awslogs-group": "/ecs/${resourcePrefix}",
              "awslogs-region": "${aws.config.region}",
              "awslogs-stream-prefix": "lore"
            }
          },
          "mountPoints": [
            {
              "sourceVolume": "efs-volume",
              "containerPath": "/data/locks",
              "readOnly": false
            }
          ]
        }
      ]`,
      volumes: [
        {
          name: "efs-volume",
          efsVolumeConfiguration: {
            fileSystemId: args.efsFileSystemId,
            rootDirectory: "/",
            transitEncryption: "ENABLED",
          },
        },
      ],
      tags: {
        Name: `${resourcePrefix}-lore-task`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Create ECS service
    this.service = new aws.ecs.Service(`${resourcePrefix}-lore-service`, {
      cluster: args.clusterArn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      launchType: "FARGATE",
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
