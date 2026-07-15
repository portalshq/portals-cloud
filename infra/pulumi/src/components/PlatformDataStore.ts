import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformDataStoreArgs } from "../interfaces";

/**
 * PlatformDataStore Component
 * 
 * Creates an Aurora PostgreSQL RDS cluster with:
 * - Aurora PostgreSQL Cluster
 * - Database Subnet Group
 * - Security Group
 * - Database Instance
 */
export class PlatformDataStore extends pulumi.ComponentResource {
  public readonly cluster: aws.rds.Cluster;
  public readonly clusterInstance: aws.rds.ClusterInstance;
  public readonly subnetGroup: aws.rds.SubnetGroup;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly databaseUrl: pulumi.Output<string>;

  constructor(name: string, args: PlatformDataStoreArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:DataStore", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // Create Database Subnet Group
    this.subnetGroup = new aws.rds.SubnetGroup(`${resourcePrefix}-db-subnet-group`, {
      subnetIds: args.privateSubnetIds,
      description: "Database subnet group for Aurora PostgreSQL",
      tags: {
        Name: `${resourcePrefix}-db-subnet-group`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Database Security Group
    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-db-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Aurora PostgreSQL",
      tags: {
        Name: `${resourcePrefix}-db-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Aurora PostgreSQL Cluster
    this.cluster = new aws.rds.Cluster(`${resourcePrefix}-aurora-cluster`, {
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineVersion: args.databaseVersion,
      databaseName: "portals",
      masterUsername: args.databaseUsername,
      masterPassword: pulumi.secret(new aws.random.RandomPassword(`${resourcePrefix}-db-password`, {
        length: 32,
        special: true,
      }, { parent: this }).result),
      dbSubnetGroupName: this.subnetGroup.name,
      vpcSecurityGroupIds: [this.securityGroup.id],
      skipFinalSnapshot: true,
      storageEncrypted: true,
      applyImmediately: true,
      tags: {
        Name: `${resourcePrefix}-aurora-cluster`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Create Aurora PostgreSQL Instance
    this.clusterInstance = new aws.rds.ClusterInstance(`${resourcePrefix}-aurora-instance`, {
      clusterIdentifier: this.cluster.id,
      instanceClass: args.databaseInstanceClass,
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineVersion: args.databaseVersion,
      dbSubnetGroupName: this.subnetGroup.name,
      publiclyAccessible: false,
      tags: {
        Name: `${resourcePrefix}-aurora-instance`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Construct database URL
    this.databaseUrl = pulumi.interpolate`postgresql://${args.databaseUsername}:${this.cluster.masterPassword}@${this.cluster.endpoint}:5432/portals`;

    // Allow ingress from ECS tasks to the database
    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-db-ingress`, {
      type: "ingress",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      cidrBlocks: ["0.0.0.0/0"], // Will be restricted to specific security groups in production
    }, { parent: this });

    // Allow ingress from control-plane security group if provided
    if (args.controlPlaneSecurityGroupId) {
      new aws.ec2.SecurityGroupRule(`${resourcePrefix}-db-controlplane-ingress`, {
        type: "ingress",
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        securityGroupId: this.securityGroup.id,
        sourceSecurityGroupId: args.controlPlaneSecurityGroupId,
      }, { parent: this });
    }

    this.registerOutputs();
  }
}
