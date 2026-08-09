import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
import { PlatformDataStoreArgs } from "../interfaces";

/**
 * PlatformDataStore Component
 *
 * Creates:
 * - RDS PostgreSQL single instance (for Control Plane)
 * - DynamoDB table (for Lore Server mutable/lock store)
 */
export class PlatformDataStore extends pulumi.ComponentResource {
  // RDS (Control Plane)
  public readonly databaseInstance: aws.rds.Instance;
  public readonly subnetGroup: aws.rds.SubnetGroup;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly databaseUrl: pulumi.Output<string>;

  // DynamoDB (Lore Server)
  public readonly loreTable: aws.dynamodb.Table;

  constructor(name: string, args: PlatformDataStoreArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:DataStore", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── RDS: PostgreSQL single instance for Control Plane ────────────────

    this.subnetGroup = new aws.rds.SubnetGroup(`${resourcePrefix}-db-subnet-group`, {
      subnetIds: args.privateSubnetIds,
      description: "Database subnet group for RDS PostgreSQL",
      tags: {
        Name: `${resourcePrefix}-db-subnet-group`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    this.securityGroup = new aws.ec2.SecurityGroup(`${resourcePrefix}-db-sg`, {
      vpcId: args.vpcId,
      description: "Security group for RDS PostgreSQL",
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

    const dbPassword = new random.RandomPassword(`${resourcePrefix}-db-password`, {
      length: 32,
      special: true,
    }, { parent: this }).result;

    this.databaseInstance = new aws.rds.Instance(`${resourcePrefix}-db`, {
      engine: "postgres",
      engineVersion: args.databaseVersion,
      instanceClass: args.databaseInstanceClass,
      allocatedStorage: args.databaseAllocatedStorage,
      dbName: "portals",
      username: args.databaseUsername,
      password: pulumi.secret(dbPassword),
      dbSubnetGroupName: this.subnetGroup.name,
      vpcSecurityGroupIds: [this.securityGroup.id],
      publiclyAccessible: false,
      skipFinalSnapshot: true,
      storageEncrypted: true,
      applyImmediately: true,
      tags: {
        Name: `${resourcePrefix}-db`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this });

    this.databaseUrl = pulumi.interpolate`postgresql://${args.databaseUsername}:${this.databaseInstance.password}@${this.databaseInstance.endpoint}:5432/portals`;

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
