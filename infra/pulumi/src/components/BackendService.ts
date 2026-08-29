import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BackendServiceArgs } from "../interfaces";

/** One 128 MiB host-network task for Neon-backed application operations. */
export class BackendService extends pulumi.ComponentResource {
  public readonly taskDefinition: aws.ecs.TaskDefinition;
  public readonly service: aws.ecs.Service;
  public readonly taskRole: aws.iam.Role;

  constructor(name: string, args: BackendServiceArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:service:BackendService", name, {}, opts);
    const prefix = `${args.projectName}-${args.environment}`;
    this.taskRole = new aws.iam.Role(`${prefix}-backend-task-role`, {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
      tags: { Project: args.projectName, Environment: args.environment, Service: "backend" },
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-backend-runtime`, {
      role: this.taskRole.id,
      policy: pulumi.all([args.cognitoUserPoolArn, args.sesIdentityArn]).apply(([userPool, identity]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: ["cognito-idp:AdminGetUser", "cognito-idp:AdminCreateUser"], Resource: userPool },
          { Effect: "Allow", Action: ["ses:SendEmail"], Resource: identity, Condition: { StringEquals: { "ses:FromAddress": args.sesFromEmail } } },
        ],
      })),
    }, { parent: this });
    new aws.iam.RolePolicy(`${prefix}-backend-execution-secrets`, {
      role: args.taskExecutionRoleName,
      policy: pulumi.all([
        args.leadsDatabaseUrlSecretArn, args.hashKeySecretArn, args.encryptionKeySecretArn,
        args.backendTokenSecretArn, args.crmApiKeySecretArn, args.crmWebhookSecretArn,
      ]).apply(resources => JSON.stringify({
        Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["secretsmanager:GetSecretValue"], Resource: resources }],
      })),
    }, { parent: this });

    this.taskDefinition = new aws.ecs.TaskDefinition(`${prefix}-backend-task`, {
      family: `${prefix}-backend`,
      networkMode: "host",
      requiresCompatibilities: ["EC2"],
      cpu: args.cpu,
      memory: args.memory,
      executionRoleArn: args.taskExecutionRoleArn,
      taskRoleArn: this.taskRole.arn,
      runtimePlatform: { cpuArchitecture: "X86_64", operatingSystemFamily: "LINUX" },
      containerDefinitions: pulumi.all([
        args.imageUri, args.leadsDatabaseUrlSecretArn, args.hashKeySecretArn, args.encryptionKeySecretArn,
        args.backendTokenSecretArn, args.crmApiKeySecretArn, args.crmWebhookSecretArn,
        args.cognitoUserPoolId, args.sesConfigurationSetName,
      ]).apply(([
        image, leadsDatabaseUrl, hashKey, encryptionKey, backendToken, crmApiKey, crmWebhookSecret,
        userPoolId, configurationSet,
      ]) => JSON.stringify([{
        name: "backend-service", image, essential: true, cpu: Number(args.cpu), memory: Number(args.memory),
        portMappings: [{ containerPort: 8088, hostPort: 8088, protocol: "tcp", name: "backend-http", appProtocol: "http" }],
        secrets: [
          { name: "LEADS_DATABASE_URL", valueFrom: leadsDatabaseUrl },
          { name: "LEADS_HASH_KEY", valueFrom: hashKey },
          { name: "LEADS_ENCRYPTION_KEY", valueFrom: encryptionKey },
          { name: "BACKEND_API_SHARED_SECRET", valueFrom: backendToken },
          { name: "CRM_API_KEY", valueFrom: crmApiKey },
          { name: "CRM_WEBHOOK_SECRET", valueFrom: crmWebhookSecret },
        ],
        environment: [
          { name: "PORT", value: "8088" },
          { name: "AWS_REGION", value: args.awsRegion },
          { name: "COGNITO_USER_POOL_ID", value: userPoolId },
          { name: "SES_FROM_EMAIL", value: args.sesFromEmail },
          { name: "SES_CONFIGURATION_SET", value: configurationSet },
          { name: "PUBLIC_APP_URL", value: args.publicAppUrl },
          { name: "CRM_API_URL", value: args.crmApiUrl },
          { name: "CORS_ALLOWED_ORIGINS", value: args.corsAllowedOrigins.join(",") },
          { name: "LEADS_ENCRYPTION_KEY_ID", value: "v1" },
        ],
        healthCheck: { command: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:8088/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval: 30, timeout: 5, retries: 3, startPeriod: 30 },
        logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": `/ecs/${prefix}`, "awslogs-region": args.awsRegion, "awslogs-stream-prefix": "backend" } },
      }])),
      tags: { Project: args.projectName, Environment: args.environment, Service: "backend" },
    }, { parent: this });
    this.service = new aws.ecs.Service(`${prefix}-backend-service`, {
      cluster: args.clusterArn,
      taskDefinition: this.taskDefinition.arn,
      desiredCount: args.desiredCount,
      capacityProviderStrategies: [{ capacityProvider: args.capacityProviderName, weight: 1, base: 1 }],
      loadBalancers: [{ targetGroupArn: args.targetGroupArn, containerName: "backend-service", containerPort: 8088 }],
      healthCheckGracePeriodSeconds: 90,
      deploymentCircuitBreaker: { enable: true, rollback: true },
      tags: { Project: args.projectName, Environment: args.environment, Service: "backend" },
    }, { parent: this });
    this.registerOutputs({ serviceName: this.service.name });
  }
}
