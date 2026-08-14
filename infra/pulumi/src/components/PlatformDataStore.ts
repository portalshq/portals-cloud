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
  public readonly databaseUrlSecret: aws.secretsmanager.Secret;

  // DynamoDB (Lore Server)
  public readonly fragmentsTable: aws.dynamodb.Table;
  public readonly metadataTable: aws.dynamodb.Table;
  public readonly mutableTable: aws.dynamodb.Table;
  public readonly locksTable: aws.dynamodb.Table;

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
    }, { parent: this, protect: args.recoveryControlsEnabled });

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

    // Alphanumeric-only password: special characters like ":" or "#" would
    // break the postgres:// DATABASE_URL that the Control Plane parses.
    const dbPassword = new random.RandomPassword(`${resourcePrefix}-db-password`, {
      length: 40,
      special: false,
      keepers: { rotationEpoch: args.rotationEpoch },
    }, { parent: this }).result;

    const parameterGroup = new aws.rds.ParameterGroup(`${resourcePrefix}-db-tls`, {
      family: `postgres${args.databaseVersion.split(".")[0]}`,
      description: "Require TLS for every Portals PostgreSQL connection",
      parameters: [{ name: "rds.force_ssl", value: "1", applyMethod: "immediate" }],
      tags: { Project: args.projectName, Environment: args.environment },
    }, { parent: this });

    this.databaseInstance = new aws.rds.Instance(`${resourcePrefix}-db`, {
      engine: "postgres",
      engineVersion: args.databaseVersion,
      instanceClass: args.databaseInstanceClass,
      allocatedStorage: args.databaseAllocatedStorage,
      dbName: "portals",
      username: args.databaseUsername,
      password: pulumi.secret(dbPassword),
      parameterGroupName: parameterGroup.name,
      dbSubnetGroupName: this.subnetGroup.name,
      vpcSecurityGroupIds: [this.securityGroup.id],
      publiclyAccessible: false,
      deletionProtection: args.recoveryControlsEnabled,
      backupRetentionPeriod: args.recoveryControlsEnabled ? args.databaseBackupRetentionDays : 1,
      copyTagsToSnapshot: true,
      skipFinalSnapshot: !args.recoveryControlsEnabled,
      finalSnapshotIdentifier: args.recoveryControlsEnabled ? `${resourcePrefix}-final` : undefined,
      storageEncrypted: true,
      applyImmediately: true,
      tags: {
        Name: `${resourcePrefix}-db`,
        Project: args.projectName,
        Environment: args.environment,
      },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    // Use `.address` (hostname only) — `.endpoint` already includes ":5432",
    // which would produce a malformed URL like host:5432:5432.
    this.databaseUrl = pulumi.interpolate`postgresql://${args.databaseUsername}:${this.databaseInstance.password}@${this.databaseInstance.address}:5432/portals?sslmode=verify-full&sslrootcert=/etc/ssl/certs/aws-rds-us-east-1-bundle.pem`;
    this.databaseUrlSecret = new aws.secretsmanager.Secret(`${resourcePrefix}-database-url`, {
      description: "Runtime PostgreSQL URL; consumed through ECS secret injection",
      recoveryWindowInDays: 30,
      tags: { Project: args.projectName, Environment: args.environment, Purpose: "database-url" },
    }, { parent: this, protect: args.recoveryControlsEnabled });
    new aws.secretsmanager.SecretVersion(`${resourcePrefix}-database-url`, {
      secretId: this.databaseUrlSecret.id,
      secretString: pulumi.secret(this.databaseUrl),
    }, { parent: this });

    // ── DynamoDB: Lore Server tables ─────────────────────────────────────
    // Key schemas mirror lore-aws (lore/lore-aws/src/store/*.rs). The SDK
    // serializes Hash/Context/Partition/Bytes as binary, so every key except
    // the string-typed lock-store GSI keys is type B. Tables must pre-exist:
    // the AWS plugin's ensure_table() only checks existence.
    const loreTags = {
      Project: args.projectName,
      Environment: args.environment,
      Service: "lore",
    };

    // Immutable store — fragment associations: hash (B) + repository_context (B)
    this.fragmentsTable = new aws.dynamodb.Table(`${resourcePrefix}-lore-fragments`, {
      name: `${resourcePrefix}-lore-fragments`,
      billingMode: "PAY_PER_REQUEST",
      attributes: [
        { name: "hash", type: "B" },
        { name: "repository_context", type: "B" },
      ],
      hashKey: "hash",
      rangeKey: "repository_context",
      pointInTimeRecovery: {
        enabled: true,
      },
      tags: {
        Name: `${resourcePrefix}-lore-fragments`,
        ...loreTags,
      },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    // Immutable store — fragment metadata: hash (B) primary key only
    this.metadataTable = new aws.dynamodb.Table(`${resourcePrefix}-lore-metadata`, {
      name: `${resourcePrefix}-lore-metadata`,
      billingMode: "PAY_PER_REQUEST",
      attributes: [
        { name: "hash", type: "B" },
      ],
      hashKey: "hash",
      pointInTimeRecovery: {
        enabled: true,
      },
      tags: {
        Name: `${resourcePrefix}-lore-metadata`,
        ...loreTags,
      },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    // Mutable store — branch pointers: repository_id (B) + key (B)
    this.mutableTable = new aws.dynamodb.Table(`${resourcePrefix}-lore-mutable`, {
      name: `${resourcePrefix}-lore-mutable`,
      billingMode: "PAY_PER_REQUEST",
      attributes: [
        { name: "repository_id", type: "B" },
        { name: "key", type: "B" },
      ],
      hashKey: "repository_id",
      rangeKey: "key",
      pointInTimeRecovery: {
        enabled: true,
      },
      tags: {
        Name: `${resourcePrefix}-lore-mutable`,
        ...loreTags,
      },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    // Lock store — distributed locks: hash (B) + repositoryBranch (B),
    // plus the three GSIs the lock queries rely on.
    this.locksTable = new aws.dynamodb.Table(`${resourcePrefix}-lore-locks`, {
      name: `${resourcePrefix}-lore-locks`,
      billingMode: "PAY_PER_REQUEST",
      attributes: [
        { name: "hash", type: "B" },
        { name: "repositoryBranch", type: "B" },
        { name: "ownerId", type: "S" },
        { name: "description", type: "S" },
        { name: "repository", type: "B" },
        { name: "branch", type: "B" },
      ],
      hashKey: "hash",
      rangeKey: "repositoryBranch",
      pointInTimeRecovery: {
        enabled: true,
      },
      globalSecondaryIndexes: [
        {
          name: "owner-repo-branch",
          hashKey: "ownerId",
          rangeKey: "repositoryBranch",
          projectionType: "ALL",
        },
        {
          name: "repo-branch-description",
          hashKey: "repositoryBranch",
          rangeKey: "description",
          projectionType: "ALL",
        },
        {
          name: "repo-branch",
          hashKey: "repository",
          rangeKey: "branch",
          projectionType: "ALL",
        },
      ],
      tags: {
        Name: `${resourcePrefix}-lore-locks`,
        ...loreTags,
      },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    this.registerOutputs();
  }
}
