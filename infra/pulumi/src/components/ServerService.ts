import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import { ServerServiceArgs } from "../interfaces";

/**
 * ServerService Component
 * 
 * Creates an ECS Fargate service for Server with:
 * - Docker image build and push to ECR
 * - ECS task definition
 * - ECS service with ALB integration
 * - Security groups
 */
export class ServerService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly dockerImage: docker.Image;
  public readonly securityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: ServerServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:ServerService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create security group for Server service
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-server-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Server service",
      tags: {
        Name: `${resourcePrefix}-server-sg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "server",
      },
    }, { parent: this });

    // Allow ingress from ALB security group
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-server-alb-ingress`, {
      type: "ingress",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.albSecurityGroupId,
    }, { parent: this });

    // Allow egress from Server service
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-server-egress`, {
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
    this.dockerImage = new docker.Image(`${resourcePrefix}-server-image`, {
      build: {
        context: args.dockerPath,
      },
      imageName: pulumi.interpolate`${args.ecrRepositoryUrl}:latest`,
      registry: ecrAuth,
    }, { parent: this });

    // Create ECS task definition
    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-server-task`, {
      family: `${resourcePrefix}-server`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn: pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity({}).then(identity => identity.accountId)}:role/${args.projectName}-${args.environment}-ecs-task-execution-role`,
      containerDefinitions: pulumi.interpolate`[
        {
          "name": "server",
          "image": "${this.dockerImage.imageName}",
          "cpu": ${args.cpu},
          "memory": ${args.memory},
          "essential": true,
          "portMappings": [
            {
              "containerPort": 80,
              "protocol": "tcp"
            }
          ],
          "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
              "awslogs-group": "/ecs/${resourcePrefix}",
              "awslogs-region": "${aws.config.region}",
              "awslogs-stream-prefix": "server"
            }
          }
        }
      ]`,
      tags: {
        Name: `${resourcePrefix}-server-task`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "server",
      },
    }, { parent: this });

    // Create ECS service
    this.service = new aws.ecs.Service(`${resourcePrefix}-server-service`, {
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
          containerName: "server",
          containerPort: 80,
        },
      ],
      tags: {
        Name: `${resourcePrefix}-server-service`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "server",
      },
    }, { parent: this });

    this.registerOutputs();
  }
}
