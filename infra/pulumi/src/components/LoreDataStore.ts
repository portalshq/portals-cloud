import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface LoreDataStoreArgs {
  readonly projectName: string;
  readonly environment: string;
  readonly recoveryControlsEnabled: boolean;
  /** S3 bucket names are globally unique; the target stack must set its own. */
  readonly bucketName: string;
  /** Account assertion supplied only by the standalone target-account stack. */
  readonly accountGuard?: pulumi.Output<string>;
  /** Add aliases from the four tables' former PlatformDataStore URNs. */
  readonly preserveLegacyTableUrns?: boolean;
  /** The target data stack owns this policy; the legacy platform stack does not. */
  readonly createTaskAccessPolicy?: boolean;
}

/**
 * Lore's durable storage boundary: private/versioned S3, four DynamoDB tables,
 * and (for the dedicated data stack) the reusable task-role access policy.
 */
export class LoreDataStore extends pulumi.ComponentResource {
  public readonly chunksBucket: aws.s3.BucketV2;
  public readonly chunksBucketPolicy: aws.s3.BucketPolicy;
  public readonly fragmentsTable: aws.dynamodb.Table;
  public readonly metadataTable: aws.dynamodb.Table;
  public readonly mutableTable: aws.dynamodb.Table;
  public readonly locksTable: aws.dynamodb.Table;
  public readonly taskAccessPolicy?: aws.iam.Policy;

  constructor(name: string, args: LoreDataStoreArgs, opts?: pulumi.ComponentResourceOptions) {
    // Keep the component type/name used by the old PlatformStorage component
    // so S3 child URNs remain stable during the source-level extraction.
    super("portals:platform:Storage", name, {}, opts);

    const prefix = `${args.projectName}-${args.environment}`;
    const tags = {
      Project: args.projectName,
      Environment: args.environment,
      Service: "lore",
    };
    const checked = (value: string): pulumi.Input<string> => args.accountGuard
      ? args.accountGuard.apply(() => value)
      : value;
    const legacyAlias = (logicalName: string): pulumi.Alias[] => args.preserveLegacyTableUrns
      ? [{
        name: logicalName,
        type: "aws:dynamodb/table:Table",
        parent: `urn:pulumi:${pulumi.getStack()}::${pulumi.getProject()}::portals:platform:DataStore::${args.projectName}-datastore`,
      }]
      : [];

    this.chunksBucket = new aws.s3.BucketV2(`${prefix}-lore-chunks`, {
      bucket: checked(args.bucketName),
      forceDestroy: false,
      tags: { Name: args.bucketName, Project: args.projectName, Environment: args.environment, Service: "lore" },
    }, { parent: this, protect: args.recoveryControlsEnabled });

    const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(`${prefix}-lore-chunks-pab`, {
      bucket: this.chunksBucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }, { parent: this });

    new aws.s3.BucketOwnershipControls(`${prefix}-lore-chunks-oc`, {
      bucket: this.chunksBucket.id,
      rule: { objectOwnership: "BucketOwnerEnforced" },
    }, { parent: this, dependsOn: [publicAccessBlock] });

    new aws.s3.BucketVersioningV2(`${prefix}-lore-chunks-versioning`, {
      bucket: this.chunksBucket.id,
      versioningConfiguration: { status: "Enabled" },
    }, { parent: this });

    new aws.s3.BucketServerSideEncryptionConfigurationV2(`${prefix}-lore-chunks-sse`, {
      bucket: this.chunksBucket.id,
      rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" }, bucketKeyEnabled: true }],
    }, { parent: this });

    new aws.s3.BucketLifecycleConfigurationV2(`${prefix}-lore-chunks-lifecycle`, {
      bucket: this.chunksBucket.id,
      rules: [{
        id: "abort-incomplete-multipart-uploads",
        status: "Enabled",
        abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
      }],
    }, { parent: this });

    this.chunksBucketPolicy = new aws.s3.BucketPolicy(`${prefix}-lore-chunks-policy`, {
      bucket: this.chunksBucket.id,
      policy: this.chunksBucket.arn.apply((arn) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Sid: "DenyInsecureTransport",
          Effect: "Deny",
          Principal: "*",
          Action: "s3:*",
          Resource: [arn, `${arn}/*`],
          Condition: { Bool: { "aws:SecureTransport": "false" } },
        }],
      })),
    }, { parent: this });

    // Schemas mirror lore-aws. Binary identifiers are DynamoDB B keys; only
    // lock-store owner/description indexes are strings. Lore requires tables
    // to exist before startup and does not provision them itself.
    const tableOpts = (logicalName: string): pulumi.CustomResourceOptions => ({
      parent: this,
      protect: args.recoveryControlsEnabled,
      aliases: legacyAlias(logicalName),
    });

    this.fragmentsTable = new aws.dynamodb.Table(`${prefix}-lore-fragments`, {
      name: checked(`${prefix}-lore-fragments`),
      billingMode: "PROVISIONED",
      readCapacity: 1,
      writeCapacity: 1,
      attributes: [{ name: "hash", type: "B" }, { name: "repository_context", type: "B" }],
      hashKey: "hash",
      rangeKey: "repository_context",
      pointInTimeRecovery: { enabled: true },
      tags: { Name: `${prefix}-lore-fragments`, ...tags },
    }, tableOpts(`${prefix}-lore-fragments`));

    this.metadataTable = new aws.dynamodb.Table(`${prefix}-lore-metadata`, {
      name: checked(`${prefix}-lore-metadata`),
      billingMode: "PROVISIONED",
      readCapacity: 1,
      writeCapacity: 1,
      attributes: [{ name: "hash", type: "B" }],
      hashKey: "hash",
      pointInTimeRecovery: { enabled: true },
      tags: { Name: `${prefix}-lore-metadata`, ...tags },
    }, tableOpts(`${prefix}-lore-metadata`));

    this.mutableTable = new aws.dynamodb.Table(`${prefix}-lore-mutable`, {
      name: checked(`${prefix}-lore-mutable`),
      billingMode: "PROVISIONED",
      readCapacity: 1,
      writeCapacity: 1,
      attributes: [{ name: "repository_id", type: "B" }, { name: "key", type: "B" }],
      hashKey: "repository_id",
      rangeKey: "key",
      pointInTimeRecovery: { enabled: true },
      tags: { Name: `${prefix}-lore-mutable`, ...tags },
    }, tableOpts(`${prefix}-lore-mutable`));

    this.locksTable = new aws.dynamodb.Table(`${prefix}-lore-locks`, {
      name: checked(`${prefix}-lore-locks`),
      billingMode: "PROVISIONED",
      readCapacity: 1,
      writeCapacity: 1,
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
      pointInTimeRecovery: { enabled: true },
      globalSecondaryIndexes: [
        { name: "owner-repo-branch", hashKey: "ownerId", rangeKey: "repositoryBranch", projectionType: "ALL", readCapacity: 1, writeCapacity: 1 },
        { name: "repo-branch-description", hashKey: "repositoryBranch", rangeKey: "description", projectionType: "ALL", readCapacity: 1, writeCapacity: 1 },
        { name: "repo-branch", hashKey: "repository", rangeKey: "branch", projectionType: "ALL", readCapacity: 1, writeCapacity: 1 },
      ],
      tags: { Name: `${prefix}-lore-locks`, ...tags },
    }, tableOpts(`${prefix}-lore-locks`));

    if (args.createTaskAccessPolicy) {
      this.taskAccessPolicy = new aws.iam.Policy(`${prefix}-lore-storage-access`, {
        description: "Lore task access to its S3 chunk bucket and DynamoDB tables",
        policy: pulumi.all([
          this.chunksBucket.arn,
          this.fragmentsTable.arn,
          this.metadataTable.arn,
          this.mutableTable.arn,
          this.locksTable.arn,
        ]).apply(([bucketArn, fragmentsArn, metadataArn, mutableArn, locksArn]) => JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:ListBucket", "s3:GetBucketLocation"],
              Resource: bucketArn,
            },
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
              Resource: `${bucketArn}/*`,
            },
            {
              Effect: "Allow",
              Action: [
                "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
                "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
                "dynamodb:TransactWriteItems", "dynamodb:TransactGetItems",
                "dynamodb:DescribeTable",
              ],
              Resource: [
                fragmentsArn, `${fragmentsArn}/index/*`,
                metadataArn, `${metadataArn}/index/*`,
                mutableArn, `${mutableArn}/index/*`,
                locksArn, `${locksArn}/index/*`,
              ],
            },
          ],
        })),
        tags,
      }, { parent: this });
    }

    this.registerOutputs({
      chunksBucketName: this.chunksBucket.bucket,
      chunksBucketArn: this.chunksBucket.arn,
      fragmentsTableName: this.fragmentsTable.name,
      fragmentsTableArn: this.fragmentsTable.arn,
      metadataTableName: this.metadataTable.name,
      metadataTableArn: this.metadataTable.arn,
      mutableTableName: this.mutableTable.name,
      mutableTableArn: this.mutableTable.arn,
      locksTableName: this.locksTable.name,
      locksTableArn: this.locksTable.arn,
      taskAccessPolicyArn: this.taskAccessPolicy?.arn,
    });
  }
}
