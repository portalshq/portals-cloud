import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
import { PlatformDataStoreArgs } from "../interfaces";

/**
 * PlatformDataStore Component
 *
 * Creates:
 * - RDS PostgreSQL single instance (for Control Plane)
 */
export class PlatformDataStore extends pulumi.ComponentResource {
  // RDS (Control Plane)
  public readonly databaseInstance: aws.rds.Instance;
  public readonly subnetGroup: aws.rds.SubnetGroup;
  public readonly securityGroup: aws.ec2.SecurityGroup;
  public readonly databaseUrl: pulumi.Output<string>;
  public readonly databaseUrlSecret: aws.secretsmanager.Secret;

  constructor(name: string, args: PlatformDataStoreArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:DataStore", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── RDS: PostgreSQL single instance for Control Plane ────────────────

    this.subnetGroup = new aws.rds.SubnetGroup(`${resourcePrefix}-db-subnet-group`, {
      subnetIds: args.publicSubnetIds,
      description: "Private-only RDS endpoint in the public-host VPC subnets",
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

    new aws.ec2.SecurityGroupRule(`${resourcePrefix}-db-ecs-host-ingress`, {
      type: "ingress",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroupId: this.securityGroup.id,
      sourceSecurityGroupId: args.ecsHostSecurityGroupId,
      description: "Control-plane connections from the single ECS host only",
    }, { parent: this });

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
      // DB subnet-group moves are scheduled for the RDS maintenance window.
      applyImmediately: false,
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

    this.registerOutputs();
  }
}
