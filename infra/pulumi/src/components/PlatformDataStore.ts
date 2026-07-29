import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
import { PlatformDataStoreArgs } from "../interfaces";

/**
 * PlatformDataStore Component
 *
 * Creates:
 * - Aurora PostgreSQL RDS cluster (for Control Plane)
 * - DynamoDB table (for Lore Server mutable/lock store)
 */
export class PlatformDataStore extends pulumi.ComponentResource {
  // RDS (Control Plane)
  public readonly cluster: aws.rds.Cluster;
  public readonly clusterInstance: aws.rds.ClusterInstance;
  public readonly subnetGroup: aws.rds.SubnetGroup;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly databaseUrl: pulumi.Output<string>;

  // DynamoDB (Lore Server)
  public readonly loreTable: aws.dynamodb.Table;

  constructor(name: string, args: PlatformDataStoreArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:DataStore", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── RDS: Aurora PostgreSQL for Control Plane ─────────────────────────

    this.subnetGroup = new aws.rds.SubnetGroup(`${resourcePrefix}-db-subnet-group`, {
      subnetIds: args.privateSubnetIds,
      description: "Database subnet group for Aurora PostgreSQL",
      tags: {
        Name: `${resourcePrefix}-db-subnet-group`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-db-sg`, {
      vpcId: args.vpcId,
      description: "Security group for Aurora PostgreSQL",
      tags: {
        Name: `${resourcePrefix}-db-sg`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    // Allow PostgreSQL ingress only from the specified security group
    // (control plane or ECS task security group — passed as arg)
    if (args.controlPlaneSecurityGroupId) {
      new aws.ec2.SecurityGroupRule(`${resourcePrefix}-db-cp-ingress`, {
        type: "ingress",
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        securityGroupId: this.securityGroup.id,
        sourceSecurityGroupId: args.controlPlaneSecurityGroupId,
      }, { parent: this });
    }

    this.cluster = new aws.rds.Cluster(`${resourcePrefix}-aurora-cluster`, {
      engine: aws.rds.EngineType.AuroraPostgresql,
      engineVersion: args.databaseVersion,
      databaseName: "portals",
      masterUsername: args.databaseUsername,
      masterPassword: pulumi.secret(new random.RandomPassword(`${resourcePrefix}-db-password`, {
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

    this.databaseUrl = pulumi.interpolate`postgresql://${args.databaseUsername}:${this.cluster.masterPassword}@${this.cluster.endpoint}:5432/portals`;

    // ── DynamoDB: Lore Server mutable + lock store ───────────────────────

    this.loreTable = new aws.dynamodb.Table(`${resourcePrefix}-lore-store`, {
      name: `${resourcePrefix}-lore-store`,
      billingMode: "PAY_PER_REQUEST",
      attributes: [
        { name: "RepositoryID", type: "S" },
        { name: "ItemKey", type: "S" },
        { name: "UserId", type: "S" },
      ],
      hashKey: "RepositoryID",
      rangeKey: "ItemKey",
      pointInTimeRecovery: {
        enabled: true,
      },
      tags: {
        Name: `${resourcePrefix}-lore-store`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
      globalSecondaryIndexes: [
        {
          name: "UserIdIndex",
          hashKey: "UserId",
          rangeKey: "RepositoryID",
          projectionType: "ALL",
        },
      ],
    }, { parent: this });

    this.registerOutputs();
  }
}
