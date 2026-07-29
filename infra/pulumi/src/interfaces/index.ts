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
  readonly controlPlaneSecurityGroupId?: pulumi.Input<string>;
}

/**
 * Interface for PlatformStorage component arguments
 * S3 for Lore chunks + ECR for Control Plane image
 */
export interface PlatformStorageArgs {
  readonly projectName: string;
  readonly environment: string;
}

/**
 * Interface for LoadBalancers component arguments
 */
export interface LoadBalancersArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly projectName: string;
  readonly environment: string;
}

/**
 * Interface for LoreService component arguments
 */
export interface LoreServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly clusterName: pulumi.Input<string>;
  readonly vpcId: pulumi.Input<string>;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly albTargetGroupArn: pulumi.Input<string>;
  readonly albSecurityGroupId: pulumi.Input<string>;
  readonly nlbTargetGroupArn: pulumi.Input<string>;
  readonly nlbSecurityGroupId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  /** Full image URI from external registry (e.g. portalshq/lore-server:latest-amd64) */
  readonly loreServerImageUri: string;
  /** S3 bucket name for immutable storage (Lore chunks) */
  readonly s3BucketName: pulumi.Output<string>;
  /** S3 bucket ARN for IAM policy */
  readonly s3BucketArn: pulumi.Output<string>;
  /** DynamoDB table name for mutable/lock store */
  readonly dynamoDbTableName: pulumi.Output<string>;
  /** AWS region for plugin configuration */
  readonly awsRegion: string;
}

/**
 * Interface for ControlPlaneService component arguments
 */
export interface ControlPlaneServiceArgs {
  readonly clusterArn: pulumi.Input<string>;
  readonly clusterName: pulumi.Input<string>;
  readonly vpcId: pulumi.Input<string>;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly ecrRepositoryUrl: pulumi.Input<string>;
  readonly albTargetGroupArn: pulumi.Input<string>;
  readonly albSecurityGroupId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly dockerPath: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly databaseUrl: pulumi.Output<string>;
  /** Ed25519 signing key for data plane JWT tokens (base64-encoded) */
  readonly ed25519SigningKey: pulumi.Input<string>;
  /** Docker image tag (defaults to "latest") */
  readonly imageTag?: string;
  /** RUST_LOG filter (defaults to "info,lorecloud_control_plane=debug,sqlx=warn") */
  readonly rustLog?: string;
  /** Enable JWT authentication (defaults to "false") */
  readonly jwtAuthEnabled?: pulumi.Input<string>;
  /** Enable idempotency (defaults to "true") */
  readonly idempotencyEnabled?: pulumi.Input<string>;
  /** Enable metrics (defaults to "true") */
  readonly metricsEnabled?: pulumi.Input<string>;
  /** Redis URL for idempotency cache (optional, falls back to in-memory) */
  readonly redisUrl?: pulumi.Input<string>;
  /** Data plane token expiry seconds (defaults to "3600") */
  readonly dpTokenExpirySecs?: pulumi.Input<string>;
  /** CORS allowed origins (defaults to "*") */
  readonly corsAllowedOrigins?: pulumi.Input<string>;
  /** Provider type: "aws" or "mock" (defaults to "aws") */
  readonly providerType?: pulumi.Input<string>;
  /** AWS region for S3 storage */
  readonly s3Region: string;
}
