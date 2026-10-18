import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LoreDataStore } from "../src/components/LoreDataStore";

const config = new pulumi.Config();
const projectName = config.require("projectName");
const environment = config.require("environment");
const expectedAwsAccountId = config.require("expectedAwsAccountId");
const bucketName = config.require("bucketName");
const recoveryControlsEnabled = config.getBoolean("recoveryControlsEnabled") ?? true;

if (!/^\d{12}$/.test(expectedAwsAccountId)) {
  throw new Error("expectedAwsAccountId must be a 12-digit AWS account ID");
}

// Fail closed: every physical resource input is transitively dependent on this
// assertion, so preview/up cannot create resources in a different AWS account.
const accountGuard = aws.getCallerIdentityOutput({}).accountId.apply((actualAccountId) => {
  if (actualAccountId !== expectedAwsAccountId) {
    throw new Error(`Refusing Lore data deployment: expected AWS account ${expectedAwsAccountId}, got ${actualAccountId}`);
  }
  return actualAccountId;
});

const loreData = new LoreDataStore("portals-lore-data", {
  projectName,
  environment,
  recoveryControlsEnabled,
  bucketName,
  accountGuard,
  createTaskAccessPolicy: true,
});

export const verifiedAwsAccountId = accountGuard;
export const loreChunksBucketName = loreData.chunksBucket.bucket;
export const loreChunksBucketArn = loreData.chunksBucket.arn;
export const loreFragmentsTableName = loreData.fragmentsTable.name;
export const loreFragmentsTableArn = loreData.fragmentsTable.arn;
export const loreMetadataTableName = loreData.metadataTable.name;
export const loreMetadataTableArn = loreData.metadataTable.arn;
export const loreMutableTableName = loreData.mutableTable.name;
export const loreMutableTableArn = loreData.mutableTable.arn;
export const loreLocksTableName = loreData.locksTable.name;
export const loreLocksTableArn = loreData.locksTable.arn;
export const loreTaskAccessPolicyArn = loreData.taskAccessPolicy!.arn;
