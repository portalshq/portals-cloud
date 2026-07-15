import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformStorageArgs } from "../interfaces";

/**
 * PlatformStorage Component
 * 
 * Creates core storage infrastructure with:
 * - ECR repositories for Docker images
 * - EFS file system for persistent storage
 * - EFS mount targets in private subnets
 */
export class PlatformStorage extends pulumi.ComponentResource {
  public readonly loreEcrRepository: aws.ecr.Repository;
  public readonly serverEcrRepository: aws.ecr.Repository;
  public readonly frontendEcrRepository: aws.ecr.Repository;
  public readonly controlPlaneEcrRepository: aws.ecr.Repository;
  public readonly efsFileSystem: aws.efs.FileSystem;
  public readonly efsMountTargets: aws.efs.MountTarget[];
  public readonly efsSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, args: PlatformStorageArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Storage", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create ECR repository for Lore service
    this.loreEcrRepository = new aws.ecr.Repository(`${resourcePrefix}-lore-ecr`, {
      name: `${resourcePrefix}-lore`,
      forceDelete: true,
      tags: {
        Name: `${resourcePrefix}-lore-ecr`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Create ECR repository for Server service
    this.serverEcrRepository = new aws.ecr.Repository(`${resourcePrefix}-server-ecr`, {
      name: `${resourcePrefix}-server`,
      forceDelete: true,
      tags: {
        Name: `${resourcePrefix}-server-ecr`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "server",
      },
    }, { parent: this });

    // Create ECR repository for Frontend service
    this.frontendEcrRepository = new aws.ecr.Repository(`${resourcePrefix}-frontend-ecr`, {
      name: `${resourcePrefix}-frontend`,
      forceDelete: true,
      tags: {
        Name: `${resourcePrefix}-frontend-ecr`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "frontend",
      },
    }, { parent: this });

    // Create ECR repository for Control Plane service
    this.controlPlaneEcrRepository = new aws.ecr.Repository(`${resourcePrefix}-controlplane-ecr`, {
      name: `${resourcePrefix}-controlplane`,
      forceDelete: true,
      tags: {
        Name: `${resourcePrefix}-controlplane-ecr`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // Create EFS Security Group
    this.efsSecurityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-efs-sg`, {
      vpcId: args.vpcId,
      description: "Security group for EFS file system",
      tags: {
        Name: `${resourcePrefix}-efs-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create EFS file system
    this.efsFileSystem = new aws.efs.FileSystem(`${resourcePrefix}-efs`, {
      creationToken: `${resourcePrefix}-efs`,
      performanceMode: "generalPurpose",
      throughputMode: "bursting",
      encrypted: true,
      tags: {
        Name: `${resourcePrefix}-efs`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create EFS mount targets in private subnets
    this.efsMountTargets = args.privateSubnetIds.map((subnetId, index) => {
      return new aws.efs.MountTarget(`${resourcePrefix}-efs-mount-${index}`, {
        fileSystemId: this.efsFileSystem.id,
        subnetId: subnetId,
        securityGroups: [this.efsSecurityGroup.id],
        tags: {
          Name: `${resourcePrefix}-efs-mount-${index}`,
          Project: args.projectName,
          Environment: args.environment,
        },
      }, { parent: this });
    });

    // Allow NFS traffic to EFS
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-efs-ingress`, {
      type: "ingress",
      fromPort: 2049,
      toPort: 2049,
      protocol: "tcp",
      securityGroupId: this.efsSecurityGroup.id,
      cidrBlocks: ["0.0.0.0/0"], // Will be restricted to specific security groups in production
    }, { parent: this });

    this.registerOutputs();
  }
}
