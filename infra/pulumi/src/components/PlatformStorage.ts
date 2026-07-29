import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformStorageArgs } from "../interfaces";

/**
 * PlatformStorage Component
 *
 * Creates storage infrastructure with:
 * - S3 bucket for Lore repository chunks (immutable store)
 * - ECR repository for Control Plane Docker image (built from Dockerfile)
 */
export class PlatformStorage extends pulumi.ComponentResource {
  public readonly controlPlaneEcrRepository: aws.ecr.Repository;
  public readonly loreChunksBucket: aws.s3.BucketV2;
  public readonly loreChunksBucketPolicy: aws.s3.BucketPolicy;

  constructor(name: string, args: PlatformStorageArgs, opts?: pulumi.ComponentResourceOptions) {
    super("portals:platform:Storage", name, {}, opts);

    const resourcePrefix = `${args.projectName}-${args.environment}`;

    // ── ECR: Control Plane only ─────────────────────────────────────────
    this.controlPlaneEcrRepository = new aws.ecr.Repository(`${resourcePrefix}-controlplane-ecr`, {
      name: `${resourcePrefix}-controlplane`,
      forceDelete: true,
      imageScanningConfiguration: {
        scanOnPush: true,
      },
      tags: {
        Name: `${resourcePrefix}-controlplane-ecr`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "control-plane",
      },
    }, { parent: this });

    // ── S3: Lore repository chunks ──────────────────────────────────────
    this.loreChunksBucket = new aws.s3.BucketV2(`${resourcePrefix}-lore-chunks`, {
      bucket: `${resourcePrefix}-lore-chunks`,
      forceDestroy: true,
      tags: {
        Name: `${resourcePrefix}-lore-chunks`,
        Project: args.projectName,
        Environment: args.environment,
        Service: "lore",
      },
    }, { parent: this });

    // Block all public access
    const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(`${resourcePrefix}-lore-chunks-pab`, {
      bucket: this.loreChunksBucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }, { parent: this });

    // Enforce bucket ownership (no ACLs)
    new aws.s3.BucketOwnershipControls(`${resourcePrefix}-lore-chunks-oc`, {
      bucket: this.loreChunksBucket.id,
      rule: {
        objectOwnership: "BucketOwnerEnforced",
      },
    }, { parent: this, dependsOn: [publicAccessBlock] });

    // Enforce server-side encryption by default
    new aws.s3.BucketServerSideEncryptionConfigurationV2(`${resourcePrefix}-lore-chunks-sse`, {
      bucket: this.loreChunksBucket.id,
      rules: [
        {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
          },
          bucketKeyEnabled: true,
        },
      ],
    }, { parent: this });

    // Bucket policy: deny all access by default (will be expanded when task roles are known)
    // This is a placeholder — actual access is controlled via IAM task roles
    this.loreChunksBucketPolicy = new aws.s3.BucketPolicy(`${resourcePrefix}-lore-chunks-policy`, {
      bucket: this.loreChunksBucket.id,
      policy: pulumi.all([this.loreChunksBucket.arn]).apply(([bucketArn]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "DenyInsecureTransport",
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: [
              bucketArn,
              `${bucketArn}/*`,
            ],
            Condition: {
              Bool: {
                "aws:SecureTransport": "false",
              },
            },
          },
        ],
      })),
    }, { parent: this });

    this.registerOutputs();
  }
}
