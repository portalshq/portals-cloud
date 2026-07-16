import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import { ControlPlaneServiceArgs } from "../interfaces";

/**
 * ControlPlaneService Component
 * 
 * Creates an ECS Fargate service for the Control Plane with:
 * - Docker image build and push to ECR
 * - ECS task definition
 * - ECS service with ALB integration
 * - Security groups
 * - Environment variables for database and event bus
 */
export class ControlPlaneService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly dockerImage: docker.Image;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly iamRolePolicyAttachment: aws.iam.RolePolicyAttachment;

  constructor(name: string, args: ControlPlaneServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:ControlPlaneService", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create security group for Control Plane service
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-controlplane-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Control Plane service",
      tags: {
        Name: `${resourcePrefix}-controlplane-sg`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // Allow ingress from ALB security group
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-alb-ingress`, {
      type: "ingress",
      fromPort: 8083,
      toPort: 8083,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.albSecurityGroupId,
    }, { parent: this });

    // Allow egress from Control Plane service
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-controlplane-egress`, {
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
    this.dockerImage = new docker.Image(`${resourcePrefix}-controlplane-image`, {
      build: {
        context: args.dockerPath,
      },
      imageName: pulumi.interpolate`${args.ecrRepositoryUrl}:${args.imageTag ?? "latest"}`,
      registry: ecrAuth,
    }, { parent: this });

    // Attach event bus policy to task execution role
    this.iamRolePolicyAttachment = new aws.iam.RolePolicyAttachment(
      `${resourcePrefix}-controlplane-eventbus-policy-attachment`,
      {
        role: pulumi.interpolate`${args.projectName}-${args.environment}-ecs-task-execution-role`,
        policyArn: args.eventQueueArn.apply(arn => {
          // Extract account ID and region from ARN
          const parts = arn.split(":");
          const accountId = parts[4];
          const region = parts[3];
          return pulumi.interpolate`arn:aws:iam::${accountId}:policy/${resourcePrefix}-events-policy`;
        }),
      },
      { parent: this }
    );

    // Create ECS task definition
    this.taskDefinition = new aws.ecs.TaskDefinition(`${resourcePrefix}-controlplane-task`, {
      family: `${resourcePrefix}-controlplane`,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn: pulumi.interpolate`arn:aws:iam::${aws.getCallerIdentity({}).then(identity => identity.accountId)}:role/${args.projectName}-${args.environment}-ecs-task-execution-role`,
      containerDefinitions: pulumi.interpolate`[
        {
          "name": "control-plane",
          "image": "${this.dockerImage.imageName}",
          "cpu": ${args.cpu},
          "memory": ${args.memory},
          "essential": true,
          "portMappings": [
            {
              "containerPort": 8083,
              "protocol": "tcp"
            }
          ],
          "environment": [
            {
              "name": "DATABASE_URL",
              "value": "${args.databaseUrl}"
            },
            {
              "name": "LISTEN_ADDR",
              "value": "0.0.0.0:8083"
            },
            {
              "name": "EVENT_QUEUE_URL",
              "value": "${args.eventQueueUrl}"
            },
            {
              "name": "DEAD_LETTER_QUEUE_URL",
              "value": "${args.deadLetterQueueUrl}"
            },
            {
              "name": "ED25519_SIGNING_KEY",
              "value": "${args.ed25519SigningKey}"
            },
            {
              "name": "S3_ENDPOINT",
              "value": "${args.s3Endpoint}"
            },
            {
              "name": "S3_ACCESS_KEY",
              "value": "${args.s3AccessKey}"
            },
            {
              "name": "S3_SECRET_KEY",
              "value": "${args.s3SecretKey}"
            },
            {
              "name": "S3_BUCKET_CHUNKS",
              "value": "${args.s3BucketChunks}"
            },
            {
              "name": "S3_FORCE_PATH_STYLE",
              "value": "${args.s3ForcePathStyle}"
            },
            {
              "name": "AWS_REGION",
              "value": "${aws.config.region}"
            },
            {
              "name": "RUST_LOG",
              "value": "${args.rustLog ?? "info"}"
            },
            {
              "name": "JWT_AUTH_ENABLED",
              "value": "${args.jwtAuthEnabled ?? "false"}"
            },
            {
              "name": "IDEMPOTENCY_ENABLED",
              "value": "${args.idempotencyEnabled ?? "true"}"
            },
            {
              "name": "METRICS_ENABLED",
              "value": "${args.metricsEnabled ?? "true"}"
            },
            {
              "name": "REDIS_URL",
              "value": "${args.redisUrl ?? ""}"
            },
            {
              "name": "DP_TOKEN_EXPIRY_SECS",
              "value": "${args.dpTokenExpirySecs ?? "3600"}"
            },
            {
              "name": "CORS_ALLOWED_ORIGINS",
              "value": "${args.corsAllowedOrigins ?? "*"}"
            },
            {
              "name": "PROVIDER_TYPE",
              "value": "${args.providerType ?? "aws"}"
            }
          ],
          "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
              "awslogs-group": "/ecs/${resourcePrefix}",
              "awslogs-region": "${aws.config.region}",
              "awslogs-stream-prefix": "control-plane"
            }
          }
        }
      ]`,
      tags: {
        Name: `${resourcePrefix}-controlplane-task`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // Create ECS service
    this.service = new aws.ecs.Service(`${resourcePrefix}-controlplane-service`, {
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
