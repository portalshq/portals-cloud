import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { AuthGatewayServiceArgs } from "../interfaces";

/** Private Fargate runtime for Cognito login, KMS JWT issuance, and ReBAC. */
export class AuthGatewayService extends pulumi.ComponentResource {
  public readonly service: aws.ecs.Service;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly taskRole: aws.iam.Role;

  constructor(name: string, args: AuthGatewayServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:security:AuthGatewayService", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;

    this.securityGroup = new aws.ec2.SecurityGroup(`${prefix}-auth-gateway-sg`, {
      vpcId: args.vpcId,
      description: "Auth Gateway; public traffic arrives only through the TLS ALB",
      revokeRulesOnDelete: true,
      tags: { Project: args.projectName, Environment: args.environment, Service: "auth-gateway" },
    }, { parent: this });
    if (args.attachToAlb) {
      for (const port of [8084, 8085]) {
        new aws.ec2.SecurityGroupRule(`${prefix}-auth-gateway-alb-${port}`, {
          type: "ingress", fromPort: port, toPort: port, protocol: "tcp",
          securityGroupId: this.securityGroup.id, sourceSecurityGroupId: args.albSecurityGroupId,
          description: "TLS ALB to Auth Gateway",
        }, { parent: this });
      }
    }
    if (args.controlPlaneSecurityGroupId) {
      new aws.ec2.SecurityGroupRule(`${prefix}-auth-gateway-internal`, {
        type: "ingress", fromPort: 8086, toPort: 8086, protocol: "tcp",
        securityGroupId: this.securityGroup.id, sourceSecurityGroupId: args.controlPlaneSecurityGroupId,
        description: "Private idempotent ReBAC/API-key mutations from control plane",
      }, { parent: this });
    }
    for (const [label, port, cidr] of [["https", 443, "0.0.0.0/0"], ["postgres", 5432, args.vpcCidr]] as const) {
      new aws.ec2.SecurityGroupRule(`${prefix}-auth-gateway-${label}-egress`, {
        type: "egress", fromPort: port, toPort: port, protocol: "tcp",
        securityGroupId: this.securityGroup.id, cidrBlocks: [cidr], description: label,
      }, { parent: this });
    }
    for (const protocol of ["tcp", "udp"] as const) {
      new aws.ec2.SecurityGroupRule(`${prefix}-auth-gateway-dns-${protocol}`, {
        type: "egress", fromPort: 53, toPort: 53, protocol,
        securityGroupId: this.securityGroup.id, cidrBlocks: [args.vpcCidr], description: "VPC DNS",
      }, { parent: this });
    }

    this.taskRole = new aws.iam.Role(`${prefix}-auth-gateway-task-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-auth-gateway-runtime`, {
      role: this.taskRole.id,
      policy: pulumi.all([args.kmsSigningKeyArn, args.apiKeyPepperSecretArn]).apply(([key, pepper]) => JSON.stringify({
        Version: "2012-10-17", Statement: [
          { Effect: "Allow", Action: ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"], Resource: [key, ...args.retiredKmsKeyArns] },
          { Effect: "Allow", Action: ["secretsmanager:GetSecretValue"], Resource: pepper },
        ],
      })),
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-auth-gateway-execution-secrets`, {
      role: args.taskExecutionRoleName,
      policy: pulumi.all([args.databaseUrlSecretArn, args.internalAdminSecretArn]).apply(resources => JSON.stringify({
        Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: resources }],
      })),
    }, { parent: this });

    const task = new aws.ecs.TaskDefinition(`${prefix}-auth-gateway-task`, {
      family: `${prefix}-auth-gateway`, networkMode: "awsvpc", requiresCompatibilities: ["FARGATE"],
      cpu: args.cpu, memory: args.memory, executionRoleArn: args.taskExecutionRoleArn, taskRoleArn: this.taskRole.arn,
      runtimePlatform: { cpuArchitecture: args.cpuArchitecture, operatingSystemFamily: "LINUX" },
      containerDefinitions: pulumi.all([
        args.imageUri, args.databaseUrlSecretArn, args.internalAdminSecretArn,
        args.apiKeyPepperSecretArn, args.kmsSigningKeyId, args.jwtKid,
        args.cognitoDomain, args.cognitoClientId, args.cognitoIssuer,
      ]).apply(([image, databaseSecret, internalSecret, pepperSecret, kmsKey, jwtKid, cognitoDomain, cognitoClient, cognitoIssuer]) => JSON.stringify([{
        name: "auth-gateway", image, essential: true,
        portMappings: [
          { containerPort: 8084, protocol: "tcp", name: "auth-grpc", appProtocol: "grpc" },
          { containerPort: 8085, protocol: "tcp", name: "auth-http", appProtocol: "http" },
          { containerPort: 8086, protocol: "tcp", name: "internal-http", appProtocol: "http" },
          { containerPort: 8087, protocol: "tcp", name: "rebac", appProtocol: "grpc" },
        ],
        secrets: [
          { name: "DATABASE_URL", valueFrom: databaseSecret },
          { name: "INTERNAL_ADMIN_TOKEN", valueFrom: internalSecret },
        ],
        environment: [
          { name: "GRPC_LISTEN_ADDR", value: "0.0.0.0:8084" },
          { name: "HTTP_LISTEN_ADDR", value: "0.0.0.0:8085" },
          { name: "INTERNAL_LISTEN_ADDR", value: "0.0.0.0:8086" },
          { name: "REBAC_LISTEN_ADDR", value: "0.0.0.0:8087" },
          { name: "PUBLIC_BASE_URL", value: args.publicBaseUrl },
          { name: "COGNITO_DOMAIN", value: cognitoDomain },
          { name: "COGNITO_CLIENT_ID", value: cognitoClient },
          { name: "COGNITO_ISSUER", value: cognitoIssuer },
          { name: "COGNITO_REDIRECT_URI", value: `${args.publicBaseUrl}/callback` },
          { name: "JWT_ISSUER", value: args.publicBaseUrl },
          { name: "JWT_KMS_KEY_ID", value: kmsKey },
          { name: "JWT_KID", value: jwtKid },
          { name: "JWT_SIGNING_ENABLED", value: String(args.jwtSigningEnabled) },
          { name: "JWT_RETIRED_KMS_KEY_IDS", value: args.retiredKmsKeyArns.join(",") },
          { name: "API_KEY_PEPPER_SECRET_ARN", value: pepperSecret },
          { name: "LORE_ENV", value: args.environment },
          { name: "RUST_LOG", value: "info,auth_gateway=info,sqlx=warn" },
        ],
        healthCheck: { command: ["CMD", "/usr/local/bin/lore-auth-gateway", "healthcheck"], interval: 30, timeout: 5, retries: 3, startPeriod: 30 },
        logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": `/ecs/${prefix}`, "awslogs-region": args.awsRegion, "awslogs-stream-prefix": "auth-gateway" } },
      }])),
      tags: { Project: args.projectName, Environment: args.environment, Service: "auth-gateway" },
    }, { parent: this });

    this.service = new aws.ecs.Service(`${prefix}-auth-gateway-service`, {
      cluster: args.clusterArn, taskDefinition: task.arn, desiredCount: args.desiredCount, launchType: "FARGATE",
      networkConfiguration: { subnets: args.privateSubnetIds, securityGroups: [this.securityGroup.id, args.sharedTaskSecurityGroupId], assignPublicIp: false },
      loadBalancers: args.attachToAlb ? [
        { targetGroupArn: args.grpcTargetGroupArn, containerName: "auth-gateway", containerPort: 8084 },
        { targetGroupArn: args.httpTargetGroupArn, containerName: "auth-gateway", containerPort: 8085 },
      ] : [],
      healthCheckGracePeriodSeconds: args.attachToAlb ? 60 : undefined,
      serviceConnectConfiguration: {
        enabled: true,
        namespace: args.serviceConnectNamespaceArn,
        services: [{
          portName: "rebac",
          discoveryName: "auth-gateway-rebac",
          clientAlias: [{ port: 8087, dnsName: "auth-gateway-rebac" }],
        }],
      },
      tags: { Project: args.projectName, Environment: args.environment, Service: "auth-gateway" },
    }, { parent: this });
    this.registerOutputs();
  }
}
