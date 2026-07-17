import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Interface for PlatformNetwork component arguments
 */
export interface PlatformNetworkArgs {
  readonly vpcCidr: string;
  readonly publicSubnetCidrs: string[];
  readonly privateSubnetCidrs: string[];
  readonly availabilityZones: string[];
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
 * Interface for PlatformStorage component arguments (ECR and EFS)
 */
export interface PlatformStorageArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly availabilityZones: string[];
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
  readonly ecrRepositoryUrl: pulumi.Input<string>;
  readonly efsFileSystemId: pulumi.Input<string>;
  readonly efsMountTargetIds: pulumi.Input<pulumi.Input<string>[]>;
  readonly albTargetGroupArn: pulumi.Input<string>;
  readonly albSecurityGroupId: pulumi.Input<string>;
  readonly nlbTargetGroupArn: pulumi.Input<string>;
  readonly nlbSecurityGroupId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
  readonly dockerPath: string;
  readonly desiredCount: number;
  readonly cpu: string;
  readonly memory: string;
  readonly databaseUrl: pulumi.Output<string>;
}

/**
 * Interface for ServerService component arguments
 */
export interface ServerServiceArgs {
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
}

/**
 * Interface for FrontendService component arguments
 */
export interface FrontendServiceArgs {
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
}

/**
 * Interface for PlatformEventBus component arguments
 */
export interface PlatformEventBusArgs {
  readonly vpcId: pulumi.Input<string>;
  readonly projectName: string;
  readonly environment: string;
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
  readonly eventQueueUrl: pulumi.Output<string>;
  readonly eventQueueArn: pulumi.Output<string>;
  /** Ed25519 signing key for data plane JWT tokens (base64-encoded) */
  readonly ed25519SigningKey: pulumi.Input<string>;
  /** S3 endpoint URL (empty string for real AWS S3) */
  readonly s3Endpoint: string;
  /** S3 access key for repository chunk storage */
  readonly s3AccessKey: pulumi.Input<string>;
  /** S3 secret key for repository chunk storage */
  readonly s3SecretKey: pulumi.Input<string>;
  /** S3 bucket name for repository chunks */
  readonly s3BucketChunks: string;
  /** AWS region for S3 storage */
  readonly s3Region: string;
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
}
