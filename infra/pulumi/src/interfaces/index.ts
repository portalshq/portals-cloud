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
