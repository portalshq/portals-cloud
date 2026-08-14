import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Interface for PlatformNetwork component arguments
 */
export interface PlatformNetworkArgs {
  readonly vpcCidr: string;
  readonly publicSubnetCidrs: string[];
  readonly privateSubnetCidrs: string[];
  readonly availabilityZones: pulumi.Input<string[]>;
  readonly projectName: string;
  readonly environment: string;
}

/**
 * Interface for PlatformCluster component arguments
 */
export interface PlatformClusterArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
  readonly serviceConnectEnabled: boolean;
}

/**
 * Interface for PlatformDataStore component arguments
 */
export interface PlatformDataStoreArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
  readonly databaseInstanceClass: string;
  readonly databaseVersion: string;
  readonly databaseAllocatedStorage: number;
  readonly databaseUsername: string;
  readonly rotationEpoch: string;
  readonly recoveryControlsEnabled: boolean;
  readonly databaseBackupRetentionDays: number;
  readonly controlPlaneSecurityGroupId?: pulumi.Input<string>;
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
}

export interface AuthGatewayServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly taskExecutionRoleName: pulumi.Input<string>;
  readonly serviceConnectNamespaceArn: pulumi.Input<string>;
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly sharedTaskSecurityGroupId: pulumi.Input<string>;
  readonly controlPlaneSecurityGroupId?: pulumi.Input<string>;
  readonly albSecurityGroupId: pulumi.Input<string>;
  readonly grpcTargetGroupArn: pulumi.Input<string>;
  readonly httpTargetGroupArn: pulumi.Input<string>;
  /** Attach target groups only after the TLS edge exists. */
  readonly attachToAlb: boolean;
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
}

/**
 * Interface for LoreService component arguments
 */
export interface LoreServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly clusterName: pulumi.Input<string>;
  /** ARN of the cluster's ECS task execution role (Pulumi auto-suffixes IAM role names) */
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly serviceConnectNamespaceArn: pulumi.Input<string>;
  readonly rebacUrl: string;
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly albTargetGroupArn: pulumi.Input<string>;
  readonly albSecurityGroupId: pulumi.Input<string>;
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
}

/**
 * Interface for ControlPlaneService component arguments
 */
export interface ControlPlaneServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly clusterName: pulumi.Input<string>;
  /** ARN of the cluster's ECS task execution role (Pulumi auto-suffixes IAM role names) */
  readonly taskExecutionRoleArn: pulumi.Input<string>;
  readonly vpcId: pulumi.Input<string>;
  readonly vpcCidr: string;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /** Shared ECS task security group (attached alongside the service SG for DB access) */
  readonly taskSecurityGroupId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly cpuArchitecture: "ARM64" | "X86_64";
  readonly databaseUrl: pulumi.Output<string>;
  /** Ed25519 signing key for data plane JWT tokens (base64-encoded) */
  readonly ed25519SigningKey: pulumi.Input<string>;
  /** Immutable ECR digest URI (repository@sha256:...), pinned in
   *  infra/lore/versions.yaml. Build + push via control-plane/scripts/publish-image.sh —
   *  Pulumi does not build images. */
  readonly controlPlaneImageUri: string;
  /** RUST_LOG filter (defaults to "info,lorecloud_control_plane=debug,sqlx=warn") */
  readonly rustLog?: string;
  /** Enable JWT authentication (defaults to "true") */
  readonly jwtAuthEnabled?: pulumi.Input<string>;
  /** Enable idempotency (defaults to "true") */
  readonly idempotencyEnabled?: pulumi.Input<string>;
  /** Enable metrics (defaults to "true") */
  readonly metricsEnabled?: pulumi.Input<string>;
  /** Redis URL for idempotency cache (optional, falls back to in-memory) */
  readonly redisUrl?: pulumi.Input<string>;
  /** Data plane token expiry seconds (defaults to "300") */
  readonly dpTokenExpirySecs?: pulumi.Input<string>;
  /** CORS allowed origins (defaults to the private Auth Gateway origin) */
  readonly corsAllowedOrigins?: pulumi.Input<string>;
  /** Provider type: "aws" or "mock" (defaults to "aws") */
  readonly providerType?: pulumi.Input<string>;
  /** AWS region for S3 storage */
  readonly s3Region: string;
  /** S3 bucket for Lore chunks (matches the bucket provisioned by PlatformStorage) */
  readonly s3BucketName: pulumi.Input<string>;
  readonly s3BucketArn: pulumi.Input<string>;
}
