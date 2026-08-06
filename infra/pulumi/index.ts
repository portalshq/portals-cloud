import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformNetwork } from "./src/components/PlatformNetwork";
import { PlatformCluster } from "./src/components/PlatformCluster";
import { PlatformDataStore } from "./src/components/PlatformDataStore";
import { PlatformStorage } from "./src/components/PlatformStorage";
import { LoadBalancers } from "./src/components/LoadBalancers";
import { LoreService } from "./src/components/LoreService";
import { ControlPlaneService } from "./src/components/ControlPlaneService";

// ── Configuration ────────────────────────────────────────────────────────────
const config = new pulumi.Config();
const projectName = config.require("projectName");
const environment = config.require("environment");
const awsRegion = new pulumi.Config("aws").require("region");

// Network
const vpcCidr = config.require("vpcCidr");
const publicSubnetCidrs = config.require("publicSubnetCidrs").split(",");
const privateSubnetCidrs = config.require("privateSubnetCidrs").split(",");

// RDS (Control Plane)
const databaseInstanceClass = config.require("databaseInstanceClass");
const databaseVersion = config.require("databaseVersion");
const databaseAllocatedStorage = parseInt(config.require("databaseAllocatedStorage"));

// ECS
const ecsFargateCpu = config.require("ecsFargateCpu");
const ecsFargateMemory = config.require("ecsFargateMemory");

// Service counts
const loreServiceDesiredCount = parseInt(config.require("loreServiceDesiredCount"));
const controlPlaneDesiredCount = parseInt(config.require("controlPlaneDesiredCount"));

// Control Plane Docker build
const controlPlaneDockerPath = config.require("controlPlaneDockerPath");

// Lore Server external image
const loreServerImageUri = config.require("loreServerImageUri");

// Control Plane secrets
const ed25519SigningKey = config.requireSecret("ed25519SigningKey");

// Get availability zones (resolve synchronously for PlatformNetwork args)
const availabilityZones = aws.getAvailabilityZones({ state: "available" }).then(azs => azs.names.slice(0, 3));

// ── Infrastructure ───────────────────────────────────────────────────────────

// Create Platform Network
const platformNetwork = new PlatformNetwork(`${projectName}-network`, {
  vpcCidr,
  publicSubnetCidrs,
  privateSubnetCidrs,
  availabilityZones,
  projectName,
  environment,
});

// Create Platform Cluster (ECS Fargate + IAM + CloudWatch)
const platformCluster = new PlatformCluster(`${projectName}-cluster`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
});

// Create Platform Data Store (RDS for Control Plane + DynamoDB for Lore)
const platformDataStore = new PlatformDataStore(`${projectName}-datastore`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  projectName,
  environment,
  databaseInstanceClass,
  databaseVersion,
  databaseAllocatedStorage,
  databaseUsername: "portals_admin",
});

// Create Platform Storage (S3 for Lore chunks + ECR for Control Plane image)
const platformStorage = new PlatformStorage(`${projectName}-storage`, {
  projectName,
  environment,
});

// Create Load Balancers (ALB + NLB)
const loadBalancers = new LoadBalancers(`${projectName}-loadbalancers`, {
  vpcId: platformNetwork.vpc.id,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
});

// Create Lore Service (VCS — pulls from external registry)
const loreService = new LoreService(`${projectName}-lore-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  albTargetGroupArn: loadBalancers.loreAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  nlbTargetGroupArn: loadBalancers.loreNlbTargetGroup.arn,
  nlbSecurityGroupId: loadBalancers.nlbSecurityGroup.id,
  projectName,
  environment,
  desiredCount: loreServiceDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
  loreServerImageUri,
  s3BucketName: platformStorage.loreChunksBucket.bucket,
  s3BucketArn: platformStorage.loreChunksBucket.arn,
  dynamoDbTableName: platformDataStore.loreTable.name,
  awsRegion,
});

// Create Control Plane Service (built from Dockerfile)
const controlPlaneService = new ControlPlaneService(`${projectName}-controlplane-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  ecrRepositoryUrl: platformStorage.controlPlaneEcrRepository.repositoryUrl,
  albTargetGroupArn: loadBalancers.controlPlaneAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  projectName,
  environment,
  dockerPath: controlPlaneDockerPath,
  desiredCount: controlPlaneDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
  databaseUrl: platformDataStore.databaseUrl,
  ed25519SigningKey,
  s3Region: awsRegion,
});

// ── Exports ──────────────────────────────────────────────────────────────────

export const databaseUrl = pulumi.secret(platformDataStore.databaseUrl);
export const albDnsName = loadBalancers.alb.dnsName;
export const nlbDnsName = loadBalancers.nlb.dnsName;
export const vpcId = platformNetwork.vpc.id;
export const clusterArn = platformCluster.cluster.arn;
export const controlPlaneEcrRepositoryUrl = platformStorage.controlPlaneEcrRepository.repositoryUrl;
export const loreChunksBucketName = platformStorage.loreChunksBucket.bucket;
export const loreChunksBucketArn = platformStorage.loreChunksBucket.arn;
export const loreDynamoDbTableName = platformDataStore.loreTable.name;
export const loreDynamoDbTableArn = platformDataStore.loreTable.arn;
export const loreServiceSecurityGroupArn = loreService.securityGroup.arn;
export const controlPlaneServiceSecurityGroupArn = controlPlaneService.securityGroup.arn;
