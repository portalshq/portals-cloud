import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Interface for PlatformNetwork component arguments
 */
export interface PlatformNetworkArgs {
  readonly vpcCidr: string;
  readonly publicSubnetCidrs: string[];
  readonly availabilityZones: pulumi.Input<string[]>;
  readonly projectName: string;
  readonly environment: string;
}

/**
 * Interface for PlatformCluster component arguments
 */
export interface PlatformClusterArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
}

/**
 * Interface for PlatformDataStore component arguments
 */
export interface PlatformDataStoreArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
  readonly databaseInstanceClass: string;
  readonly databaseVersion: string;
  readonly databaseAllocatedStorage: number;
  readonly databaseUsername: string;
  readonly rotationEpoch: string;
  readonly recoveryControlsEnabled: boolean;
  readonly databaseBackupRetentionDays: number;
  /** The single ECS host is the only VPC principal permitted to reach RDS. */
  readonly ecsHostSecurityGroupId: pulumi.Input<string>;
}

/**
 * Interface for PlatformStorage component arguments
 * S3 for Lore chunks (Control Plane image lives on Docker Hub)
 */
export interface PlatformStorageArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly recoveryControlsEnabled: boolean;
}

/**
 * Interface for LoadBalancers component arguments
 */
export interface LoadBalancersArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
  readonly publicIngressEnabled: boolean;
  readonly jwksPublicationEnabled: boolean;
  readonly certificateArn?: string;
  readonly loreHostname: string;
  readonly authHostname: string;
  readonly allowedIngressCidrs: string[];
  readonly accessLogsBucket?: pulumi.Input<string>;
  readonly alarmsEnabled: boolean;
  readonly deletionProtectionEnabled: boolean;
  readonly alarmNotificationTopicArn?: pulumi.Input<string>;
  /** Explicitly opens the separately reviewed HTTPS API facade for Vercel. */
  readonly backendApiPublicEnabled: boolean;
  readonly backendApiHostname: string;
  /** EC2 host security group used by instance-mode target groups. */
  readonly ecsHostSecurityGroupId: pulumi.Input<string>;
}

export interface AuthGatewayServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly taskExecutionRoleName: pulumi.Input<string>;
  readonly grpcTargetGroupArn: pulumi.Input<string>;
  readonly httpTargetGroupArn: pulumi.Input<string>;
  /** Attach target groups only after the TLS edge exists. */
  readonly attachToAlb: boolean;
  readonly publicIngressEnabled: boolean;
  readonly projectName: string;
  readonly environment: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly cpuArchitecture: "ARM64" | "X86_64";
  readonly imageUri: string;
  readonly databaseUrlSecretArn: pulumi.Input<string>;
  readonly apiKeyPepperSecretArn: pulumi.Input<string>;
  readonly internalAdminSecretArn: pulumi.Input<string>;
  readonly kmsSigningKeyArn: pulumi.Input<string>;
  readonly kmsSigningKeyId: pulumi.Input<string>;
  readonly jwtKid: pulumi.Input<string>;
  readonly jwtSigningEnabled: boolean;
  readonly retiredKmsKeyArns: string[];
  readonly publicBaseUrl: string;
  readonly cognitoDomain: pulumi.Input<string>;
  readonly cognitoClientId: pulumi.Input<string>;
  readonly cognitoIssuer: pulumi.Input<string>;
  readonly awsRegion: string;
  readonly capacityProviderName: pulumi.Input<string>;
}

/**
 * Interface for LoreService component arguments
 */
export interface LoreServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly clusterName: pulumi.Input<string>;
  /** ARN of the cluster's ECS task execution role (Pulumi auto-suffixes IAM role names) */
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly rebacUrl: string;
  readonly publicIngressEnabled: boolean;
  readonly authEndpointUrl: string;
  readonly repoEndpointUrl: string;
  readonly albTargetGroupArn: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly cpuArchitecture: "ARM64" | "X86_64";
  /** Immutable ECR digest URI (repository@sha256:...) */
  readonly loreServerImageUri: string;
  /** S3 bucket name for immutable storage (Lore chunks) */
  readonly s3BucketName: pulumi.Output<string>;
  /** S3 bucket ARN for IAM policy */
  readonly s3BucketArn: pulumi.Output<string>;
  /** DynamoDB fragments association table (hash + repository_context) */
  readonly fragmentsTableName: pulumi.Output<string>;
  /** DynamoDB fragment metadata table (hash) */
  readonly metadataTableName: pulumi.Output<string>;
  /** DynamoDB mutable store table (repository_id + key) */
  readonly mutableTableName: pulumi.Output<string>;
  /** DynamoDB lock store table (hash + repositoryBranch + GSIs) */
  readonly locksTableName: pulumi.Output<string>;
  /** AWS region for plugin configuration */
  readonly awsRegion: string;
  readonly jwksEndpoint: string;
  readonly jwtIssuer: string;
  readonly capacityProviderName: pulumi.Input<string>;
}

/**
 * Interface for EC2Compute component arguments
 */
export interface EC2ComputeArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
  readonly instanceCount: number;
  readonly instanceType: string;
  readonly clusterName: pulumi.Input<string>;
  readonly capacityProviderName: string;
  readonly amiId?: string;
  readonly amiSsmParameter?: string;
  readonly recoveryControlsEnabled: boolean;
  /** Human deployment identity that must not manually terminate the only host. */
  readonly manualTerminationDenyUserName: string;
}

export interface EmailServiceArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly domain: string;
}

/** One low-memory ECS runtime for invitation, lead, and CRM operations. */
export interface BackendServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly taskExecutionRoleName: pulumi.Input<string>;
  readonly targetGroupArn: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly imageUri: string;
  /** Existing Neon application database URL stored in Secrets Manager. */
  readonly leadsDatabaseUrlSecretArn: pulumi.Input<string>;
  readonly hashKeySecretArn: pulumi.Input<string>;
  readonly encryptionKeySecretArn: pulumi.Input<string>;
  readonly backendTokenSecretArn: pulumi.Input<string>;
  readonly crmApiKeySecretArn: pulumi.Input<string>;
  readonly crmWebhookSecretArn: pulumi.Input<string>;
  readonly crmApiUrl: string;
  readonly cognitoUserPoolId: pulumi.Input<string>;
  readonly cognitoUserPoolArn: pulumi.Input<string>;
  readonly sesIdentityArn: pulumi.Input<string>;
  readonly sesConfigurationSetName: pulumi.Input<string>;
  readonly sesFromEmail: string;
  readonly publicAppUrl: string;
  readonly corsAllowedOrigins: string[];
  readonly awsRegion: string;
  readonly capacityProviderName: pulumi.Input<string>;
}
