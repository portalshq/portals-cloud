import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformNetwork } from "./src/components/PlatformNetwork";
import { PlatformCluster } from "./src/components/PlatformCluster";
import { PlatformDataStore } from "./src/components/PlatformDataStore";
import { PlatformStorage } from "./src/components/PlatformStorage";
import { PlatformEventBus } from "./src/components/PlatformEventBus";
import { LoadBalancers } from "./src/components/LoadBalancers";
import { LoreService } from "./src/components/LoreService";
import { ServerService } from "./src/components/ServerService";
import { FrontendService } from "./src/components/FrontendService";
import { ControlPlaneService } from "./src/components/ControlPlaneService";

// Get configuration
const config = new pulumi.Config();
const projectName = config.require("projectName");
const environment = config.require("environment");
const awsRegion = config.require("aws:region");

const vpcCidr = config.require("vpcCidr");
const publicSubnetCidrs = config.require("publicSubnetCidrs").split(",");
const privateSubnetCidrs = config.require("privateSubnetCidrs").split(",");

const databaseInstanceClass = config.require("databaseInstanceClass");
const databaseVersion = config.require("databaseVersion");
const databaseAllocatedStorage = parseInt(config.require("databaseAllocatedStorage"));

const ecsFargateCpu = config.require("ecsFargateCpu");
const ecsFargateMemory = config.require("ecsFargateMemory");

const loreServiceDesiredCount = parseInt(config.require("loreServiceDesiredCount"));
const serverServiceDesiredCount = parseInt(config.require("serverServiceDesiredCount"));
const frontendServiceDesiredCount = parseInt(config.require("frontendServiceDesiredCount"));

const loreServerDockerPath = config.require("loreServerDockerPath");
const serverDockerPath = config.require("serverDockerPath");
const frontendDockerPath = config.require("frontendDockerPath");
const controlPlaneDockerPath = config.require("controlPlaneDockerPath");
const controlPlaneDesiredCount = parseInt(config.require("controlPlaneDesiredCount"));

// Get availability zones
const availabilityZones = pulumi.output(aws.getAvailabilityZones({ state: "available" })).then(azs => azs.names.slice(0, 3));

// Create Platform Network
const platformNetwork = new PlatformNetwork(`${projectName}-network`, {
  vpcCidr,
  publicSubnetCidrs,
  privateSubnetCidrs,
  availabilityZones,
  projectName,
  environment,
});

// Create Platform Cluster
const platformCluster = new PlatformCluster(`${projectName}-cluster`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
});

// Create Platform Data Store
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

// Create Platform Storage (ECR and EFS)
const platformStorage = new PlatformStorage(`${projectName}-storage`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  availabilityZones,
  projectName,
  environment,
});

// Create Platform Event Bus (SQS)
const platformEventBus = new PlatformEventBus(`${projectName}-eventbus`, {
  vpcId: platformNetwork.vpc.id,
  projectName,
  environment,
});

// Create Load Balancers
const loadBalancers = new LoadBalancers(`${projectName}-loadbalancers`, {
  vpcId: platformNetwork.vpc.id,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
});

// Create Lore Service
const loreService = new LoreService(`${projectName}-lore-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  ecrRepositoryUrl: platformStorage.loreEcrRepository.repositoryUrl,
  efsFileSystemId: platformStorage.efsFileSystem.id,
  efsMountTargetIds: pulumi.all(platformStorage.efsMountTargets.map(mt => mt.id)),
  albTargetGroupArn: loadBalancers.loreAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  nlbTargetGroupArn: loadBalancers.loreNlbTargetGroup.arn,
  nlbSecurityGroupId: loadBalancers.nlbSecurityGroup.id,
  projectName,
  environment,
  dockerPath: loreServerDockerPath,
  desiredCount: loreServiceDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
  databaseUrl: platformDataStore.databaseUrl,
});

// Create Server Service
const serverService = new ServerService(`${projectName}-server-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  ecrRepositoryUrl: platformStorage.serverEcrRepository.repositoryUrl,
  albTargetGroupArn: loadBalancers.serverAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  projectName,
  environment,
  dockerPath: serverDockerPath,
  desiredCount: serverServiceDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
});

// Create Frontend Service
const frontendService = new FrontendService(`${projectName}-frontend-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  ecrRepositoryUrl: platformStorage.frontendEcrRepository.repositoryUrl,
  albTargetGroupArn: loadBalancers.frontendAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  projectName,
  environment,
  dockerPath: frontendDockerPath,
  desiredCount: frontendServiceDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
});

// Create Control Plane Service
const controlPlaneService = new ControlPlaneService(`${projectName}-controlplane-service`, {
  clusterArn: platformCluster.cluster.arn,
  clusterName: platformCluster.cluster.name,
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  ecrRepositoryUrl: platformStorage.controlPlaneEcrRepository.repositoryUrl,
  albTargetGroupArn: loadBalancers.serverAlbTargetGroup.arn,
  albSecurityGroupId: loadBalancers.albSecurityGroup.id,
  projectName,
  environment,
  dockerPath: controlPlaneDockerPath,
  desiredCount: controlPlaneDesiredCount,
  cpu: ecsFargateCpu,
  memory: ecsFargateMemory,
  databaseUrl: platformDataStore.databaseUrl,
  eventQueueUrl: platformEventBus.queueUrl,
  eventQueueArn: platformEventBus.queueArn,
  deadLetterQueueUrl: platformEventBus.deadLetterQueueUrl,
  deadLetterQueueArn: platformEventBus.deadLetterQueueArn,
});

// Export critical connection strings
export const databaseUrl = pulumi.secret(platformDataStore.databaseUrl);
export const albDnsName = loadBalancers.alb.dnsName;
export const nlbDnsName = loadBalancers.nlb.dnsName;
export const vpcId = platformNetwork.vpc.id;
export const clusterArn = platformCluster.cluster.arn;
export const loreEcrRepositoryUrl = platformStorage.loreEcrRepository.repositoryUrl;
export const serverEcrRepositoryUrl = platformStorage.serverEcrRepository.repositoryUrl;
export const frontendEcrRepositoryUrl = platformStorage.frontendEcrRepository.repositoryUrl;
export const controlPlaneEcrRepositoryUrl = platformStorage.controlPlaneEcrRepository.repositoryUrl;
export const efsFileSystemId = platformStorage.efsFileSystem.id;
export const eventQueueUrl = platformEventBus.queueUrl;
export const eventQueueArn = platformEventBus.queueArn;
export const deadLetterQueueUrl = platformEventBus.deadLetterQueueUrl;
export const deadLetterQueueArn = platformEventBus.deadLetterQueueArn;
