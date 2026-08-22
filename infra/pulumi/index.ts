import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PlatformNetwork } from "./src/components/PlatformNetwork";
import { PlatformCluster } from "./src/components/PlatformCluster";
import { PlatformDataStore } from "./src/components/PlatformDataStore";
import { PlatformStorage } from "./src/components/PlatformStorage";
import { LoadBalancers } from "./src/components/LoadBalancers";
import { LoreService } from "./src/components/LoreService";
import { AuthFoundation } from "./src/components/AuthFoundation";
import { SecurityControls } from "./src/components/SecurityControls";
import { AuthGatewayService } from "./src/components/AuthGatewayService";
import { ImageRepositories } from "./src/components/ImageRepositories";
import { LowCostRdsBackups } from "./src/components/LowCostRdsBackups";
import {
  assertNapReleaseVerified,
  assertPublicReleaseApproved,
  assertVersionPinVerified,
  readVersionPins,
} from "./src/versioning";

// ── Configuration ────────────────────────────────────────────────────────────
const config = new pulumi.Config();
const projectName = config.require("projectName");
const environment = config.require("environment");
const awsRegion = new pulumi.Config("aws").require("region");
const publicIngressEnabled = config.getBoolean("publicIngressEnabled") ?? false;
const jwksPublicationEnabled = config.getBoolean("jwksPublicationEnabled") ?? false;
const publicCertificateArn = config.get("publicCertificateArn") || undefined;
const loreHostname = config.get("loreHostname") ?? "lore.portals.works";
const authHostname = config.get("authHostname") ?? "auth.portals.works";
const allowedIngressCidrs = (config.get("allowedIngressCidrs") ?? "0.0.0.0/0").split(",");
const loreJwksEndpoint = config.get("loreJwksEndpoint") ?? "";
const loreJwtIssuer = config.get("loreJwtIssuer") ?? "";
const authCallbackUrls = (config.get("authCallbackUrls") ?? "http://127.0.0.1:8765/callback").split(",");
const authLogoutUrls = (config.get("authLogoutUrls") ?? "http://127.0.0.1:8765/logout").split(",");
const authDomainPrefix = config.get("authDomainPrefix") || undefined;
const authGatewayReady = config.getBoolean("authGatewayReady") ?? false;
const authFoundationEnabled = config.getBoolean("authFoundationEnabled") ?? false;
const jwtRetiredKmsKeyArns = (config.get("jwtRetiredKmsKeyArns") ?? "").split(",").filter(Boolean);
const jwtSigningEnabled = config.getBoolean("jwtSigningEnabled") ?? false;
const securityControlsEnabled = config.getBoolean("securityControlsEnabled") ?? false;
const threatDetectionEnabled = config.getBoolean("threatDetectionEnabled") ?? false;
const securityReviewDate = config.get("securityReviewDate") ?? "";
const releaseGateApproved = config.getBoolean("releaseGateApproved") ?? false;
const recoveryControlsEnabled = config.getBoolean("recoveryControlsEnabled") ?? true;
const databaseBackupRetentionDays = parseInt(config.get("databaseBackupRetentionDays") ?? (environment === "prod" ? "35" : "1"));
const lowCostRdsSnapshotsEnabled = config.getBoolean("lowCostRdsSnapshotsEnabled") ?? false;
const manualSnapshotRetentionCount = parseInt(config.get("manualSnapshotRetentionCount") ?? "7");
const credentialRotationEpoch = config.require("credentialRotationEpoch");

// Network
const vpcCidr = config.require("vpcCidr");
const publicSubnetCidrs = config.require("publicSubnetCidrs").split(",");
const privateSubnetCidrs = config.require("privateSubnetCidrs").split(",");

// RDS (Control Plane)
const databaseInstanceClass = config.require("databaseInstanceClass");
const databaseVersion = config.require("databaseVersion");
const databaseAllocatedStorage = parseInt(config.require("databaseAllocatedStorage"));

// ECS
const ecsFargateCpu = config.require("ecsFargateCpu");
const ecsFargateMemory = config.require("ecsFargateMemory");

// Separate architecture configuration for each service
// For backward compatibility, if old ecsCpuArchitecture is set, use it as default
const legacyCpuArchitecture = config.get("ecsCpuArchitecture");
const defaultArchitecture = legacyCpuArchitecture || "ARM64";

if (legacyCpuArchitecture) {
  console.warn("ecsCpuArchitecture is deprecated; use loreCpuArchitecture and authGatewayCpuArchitecture instead");
  if (legacyCpuArchitecture !== "ARM64" && legacyCpuArchitecture !== "X86_64") {
    throw new Error("ecsCpuArchitecture must be ARM64 or X86_64");
  }
}

const loreCpuArchitectureValue = config.get("loreCpuArchitecture") ?? defaultArchitecture;
if (loreCpuArchitectureValue !== "ARM64" && loreCpuArchitectureValue !== "X86_64") {
  throw new Error("loreCpuArchitecture must be ARM64 or X86_64");
}
const loreCpuArchitecture = loreCpuArchitectureValue as "ARM64" | "X86_64";

const authGatewayCpuArchitectureValue = config.get("authGatewayCpuArchitecture") ?? defaultArchitecture;
if (authGatewayCpuArchitectureValue !== "ARM64" && authGatewayCpuArchitectureValue !== "X86_64") {
  throw new Error("authGatewayCpuArchitecture must be ARM64 or X86_64");
}
const authGatewayCpuArchitecture = authGatewayCpuArchitectureValue as "ARM64" | "X86_64";

// Service counts
const loreServiceDesiredCount = parseInt(config.require("loreServiceDesiredCount"));
const controlPlaneDesiredCount = parseInt(config.require("controlPlaneDesiredCount"));
const authGatewayDesiredCount = parseInt(config.get("authGatewayDesiredCount") ?? "0");

if (controlPlaneDesiredCount > 0) {
  throw new Error(
    "the legacy control-plane token issuer is retired; keep it at zero and use the Auth Gateway",
  );
}

// versions.yaml is the sole bill of materials. The active control-plane image
// is the Auth Gateway; the legacy caller-selected-claims issuer is not built or
// deployable.
const versionPins = readVersionPins();
const { controlPlaneImageUri, loreImageUri: loreServerImageUri } = versionPins;
const authGatewayImageUri = controlPlaneImageUri;

function assertDigestPinned(name: string, image: string, desiredCount: number): void {
  if (desiredCount > 0 && !/@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error(`${name} must use an immutable @sha256 digest before desiredCount can exceed zero`);
  }
}

assertDigestPinned("Lore image", loreServerImageUri, loreServiceDesiredCount);
assertDigestPinned("Control Plane/Auth Gateway image", authGatewayImageUri, authGatewayDesiredCount);

// Use separate architecture platforms for each service
const loreImagePlatform = loreCpuArchitecture === "ARM64" ? "linux/arm64" : "linux/amd64";
const authGatewayImagePlatform = authGatewayCpuArchitecture === "ARM64" ? "linux/arm64" : "linux/amd64";

assertVersionPinVerified(
  "lore", loreServerImageUri, loreServiceDesiredCount, loreImagePlatform,
  publicIngressEnabled, versionPins.release.lore,
);
assertVersionPinVerified(
  "control-plane", authGatewayImageUri, authGatewayDesiredCount, authGatewayImagePlatform,
  publicIngressEnabled, versionPins.release.controlPlane,
);
if (publicIngressEnabled) {
  assertPublicReleaseApproved(versionPins.release);
  assertNapReleaseVerified(versionPins.release.napClient, versionPins.release.loreClient);
}
if (authGatewayDesiredCount > 0 && !authDomainPrefix) {
  throw new Error("authDomainPrefix is required before the Auth Gateway can run");
}
if (authGatewayDesiredCount > 0 && !authFoundationEnabled) {
  throw new Error("authFoundationEnabled must be true before the Auth Gateway can run");
}
if (loreServiceDesiredCount > 0 && (!loreJwksEndpoint || !loreJwtIssuer)) {
  throw new Error("Lore authentication settings are required before desiredCount can exceed zero");
}
if (loreServiceDesiredCount > 0 && authGatewayDesiredCount < 1) {
  throw new Error("Lore cannot run without the Auth Gateway and private ReBAC service");
}
if (publicIngressEnabled && loreServiceDesiredCount < 1) {
  throw new Error("public ingress cannot be enabled while Lore is scaled to zero");
}
function assertRecentSecurityReview(date: string, maxAgeDays = 90): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("public ingress requires securityReviewDate in YYYY-MM-DD format");
  }
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("securityReviewDate is not a real calendar date");
  }
  const reviewedAt = Date.parse(`${date}T23:59:59Z`);
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(reviewedAt) || reviewedAt > now + 24 * 60 * 60 * 1000 || now - reviewedAt > maxAgeMs) {
    throw new Error(`securityReviewDate must be no more than ${maxAgeDays} days old and not in the future`);
  }
}

if (publicIngressEnabled && (!authGatewayReady || !securityControlsEnabled || !releaseGateApproved)) {
  throw new Error(
    "public ingress requires authGatewayReady, the mandatory security-control baseline, and releaseGateApproved; refusing to bypass release gates",
  );
}
if (publicIngressEnabled) assertRecentSecurityReview(securityReviewDate);
if (publicIngressEnabled && databaseBackupRetentionDays < 7 && !lowCostRdsSnapshotsEnabled) {
  throw new Error(
    "public ingress with less than seven days of RDS PITR requires bounded daily manual snapshots",
  );
}
if (publicIngressEnabled && !jwtSigningEnabled) {
  throw new Error("public ingress requires an explicitly activated KMS JWT signer");
}
if (jwksPublicationEnabled && publicIngressEnabled) {
  throw new Error("jwksPublicationEnabled is a bootstrap mode and cannot be combined with publicIngressEnabled");
}
// Allow JWT signing with JWKS publication for private Lore signed-token testing
// The LoadBalancers component restricts routes based on publicIngressEnabled
if (jwksPublicationEnabled && authGatewayDesiredCount < 1) {
  throw new Error("JWKS bootstrap publication requires a running Auth Gateway");
}
if (jwksPublicationEnabled && (!authGatewayReady || !securityControlsEnabled)) {
  throw new Error("JWKS bootstrap publication requires a healthy Auth Gateway and security controls");
}

// Get availability zones (resolve synchronously for PlatformNetwork args)
const availabilityZones = aws.getAvailabilityZones({ state: "available" }).then(azs => azs.names.slice(0, 3));

// ── Infrastructure ───────────────────────────────────────────────────────────

// Create Platform Network
const platformNetwork = new PlatformNetwork(`${projectName}-network`, {
  vpcCidr,
  publicSubnetCidrs,
  privateSubnetCidrs,
  availabilityZones,
  projectName,
  environment,
});

// Create Platform Cluster (ECS Fargate + IAM + CloudWatch)
const platformCluster = new PlatformCluster(`${projectName}-cluster`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
  serviceConnectEnabled: authGatewayDesiredCount > 0,
});

// Create Platform Data Store (RDS for Control Plane + DynamoDB for Lore)
const platformDataStore = new PlatformDataStore(`${projectName}-datastore`, {
  vpcId: platformNetwork.vpc.id,
  privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
  projectName,
  environment,
  databaseInstanceClass,
  databaseVersion,
  databaseAllocatedStorage,
  databaseUsername: "portals_admin",
  rotationEpoch: credentialRotationEpoch,
  recoveryControlsEnabled,
  databaseBackupRetentionDays,
  controlPlaneSecurityGroupId: platformCluster.taskSecurityGroup.id,
});

if (lowCostRdsSnapshotsEnabled) {
  new LowCostRdsBackups(`${projectName}-${environment}-rds-backups`, {
    projectName,
    environment,
    databaseInstanceId: platformDataStore.databaseInstance.identifier,
    databaseInstanceArn: platformDataStore.databaseInstance.arn,
    retentionCount: manualSnapshotRetentionCount,
  });
}

// Create Platform Storage (S3 for Lore chunks)
const platformStorage = new PlatformStorage(`${projectName}-storage`, {
  projectName,
  environment,
  recoveryControlsEnabled,
});

// Repositories exist while services are contained so images can be built,
// scanned, signed, and pinned before any task or public listener is created.
const imageRepositories = new ImageRepositories(`${projectName}-images`, {
  projectName,
  environment,
});

const authFoundation = authFoundationEnabled ? new AuthFoundation(`${projectName}-auth`, {
  projectName, environment,
  relyingPartyId: authDomainPrefix
    ? `${authDomainPrefix}.auth.${awsRegion}.amazoncognito.com`
    : authHostname,
  callbackUrls: authCallbackUrls,
  logoutUrls: authLogoutUrls, domainPrefix: authDomainPrefix, rotationEpoch: credentialRotationEpoch,
}) : undefined;

const securityControls = new SecurityControls(`${projectName}-security`, {
  enabled: securityControlsEnabled,
  projectName,
  environment,
  vpcId: platformNetwork.vpc.id,
  threatDetectionEnabled,
});

// Create the fail-closed HTTPS edge. No NLB or direct service listeners exist.
const loadBalancers = new LoadBalancers(`${projectName}-loadbalancers`, {
  vpcId: platformNetwork.vpc.id,
  vpcCidr,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
  publicIngressEnabled,
  jwksPublicationEnabled,
  certificateArn: publicCertificateArn,
  loreHostname,
  authHostname,
  allowedIngressCidrs,
  accessLogsBucket: securityControls.auditBucket?.bucket,
  alarmsEnabled: securityControlsEnabled,
  deletionProtectionEnabled: recoveryControlsEnabled,
});

let authGatewayService: AuthGatewayService | undefined;
if (authGatewayDesiredCount > 0) {
  const auth = authFoundation!;
  const cognitoIssuer = pulumi.interpolate`https://${auth.userPool.endpoint}`;
  const cognitoDomain = `https://${authDomainPrefix}.auth.${awsRegion}.amazoncognito.com`;
  authGatewayService = new AuthGatewayService(`${projectName}-auth-gateway`, {
    clusterArn: platformCluster.cluster.arn,
    taskExecutionRoleArn: platformCluster.taskExecutionRole.arn,
    taskExecutionRoleName: platformCluster.taskExecutionRole.name,
    serviceConnectNamespaceArn: platformCluster.serviceConnectNamespace!.arn,
    vpcId: platformNetwork.vpc.id,
    vpcCidr,
    privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
    sharedTaskSecurityGroupId: platformCluster.taskSecurityGroup.id,
    controlPlaneSecurityGroupId: undefined,
    albSecurityGroupId: loadBalancers.albSecurityGroup.id,
    grpcTargetGroupArn: loadBalancers.authGrpcTargetGroup.arn,
    httpTargetGroupArn: loadBalancers.authHttpTargetGroup.arn,
    attachToAlb: publicIngressEnabled || jwksPublicationEnabled,
    projectName, environment,
    desiredCount: authGatewayDesiredCount,
    cpu: ecsFargateCpu,
    memory: ecsFargateMemory,
    cpuArchitecture: authGatewayCpuArchitecture,
    imageUri: authGatewayImageUri,
    databaseUrlSecretArn: platformDataStore.databaseUrlSecret.arn,
    apiKeyPepperSecretArn: auth.apiKeyPepperSecret.arn,
    internalAdminSecretArn: auth.internalAdminSecret.arn,
    kmsSigningKeyArn: auth.signingKey.arn,
    kmsSigningKeyId: auth.signingKey.keyId,
    jwtKid: auth.signingKey.keyId,
    jwtSigningEnabled,
    retiredKmsKeyArns: jwtRetiredKmsKeyArns,
    publicBaseUrl: `https://${authHostname}`,
    cognitoDomain,
    cognitoClientId: auth.userPoolClient.id,
    cognitoIssuer,
    awsRegion,
  });
}

// A zero desired count means the service definition itself is absent. This
// avoids retaining stale task definitions containing obsolete credentials.
let loreService: LoreService | undefined;
if (loreServiceDesiredCount > 0) {
  loreService = new LoreService(`${projectName}-lore-service`, {
    clusterArn: platformCluster.cluster.arn,
    clusterName: platformCluster.cluster.name,
    taskExecutionRoleArn: platformCluster.taskExecutionRole.arn,
    serviceConnectNamespaceArn: platformCluster.serviceConnectNamespace!.arn,
    rebacUrl: "http://auth-gateway-rebac:8087",
    vpcId: platformNetwork.vpc.id,
    vpcCidr,
    privateSubnetIds: pulumi.all(platformNetwork.privateSubnets.map(s => s.id)),
    albTargetGroupArn: loadBalancers.loreGrpcTargetGroup.arn,
    albSecurityGroupId: loadBalancers.albSecurityGroup.id,
    projectName,
    environment,
    desiredCount: loreServiceDesiredCount,
    cpu: ecsFargateCpu,
    memory: ecsFargateMemory,
    cpuArchitecture: loreCpuArchitecture,
    loreServerImageUri,
    s3BucketName: platformStorage.loreChunksBucket.bucket,
    s3BucketArn: platformStorage.loreChunksBucket.arn,
    fragmentsTableName: platformDataStore.fragmentsTable.name,
    metadataTableName: platformDataStore.metadataTable.name,
    mutableTableName: platformDataStore.mutableTable.name,
    locksTableName: platformDataStore.locksTable.name,
    awsRegion,
    jwksEndpoint: loreJwksEndpoint,
    jwtIssuer: loreJwtIssuer,
  });
}

if (loreService && authGatewayService) {
  new aws.ec2.SecurityGroupRule(`${projectName}-${environment}-auth-rebac-from-lore`, {
    type: "ingress", fromPort: 8087, toPort: 8087, protocol: "tcp",
    securityGroupId: authGatewayService.securityGroup.id,
    sourceSecurityGroupId: loreService.securityGroup.id,
    description: "Lore-only access to ReBAC mutation gRPC",
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const databaseUrl = pulumi.secret(platformDataStore.databaseUrl);
export const albDnsName = loadBalancers.alb.dnsName;
export const vpcId = platformNetwork.vpc.id;
export const clusterArn = platformCluster.cluster.arn;
export { controlPlaneImageUri };
export const loreChunksBucketName = platformStorage.loreChunksBucket.bucket;
export const loreChunksBucketArn = platformStorage.loreChunksBucket.arn;
export const loreFragmentsTableName = platformDataStore.fragmentsTable.name;
export const loreFragmentsTableArn = platformDataStore.fragmentsTable.arn;
export const loreMetadataTableName = platformDataStore.metadataTable.name;
export const loreMutableTableName = platformDataStore.mutableTable.name;
export const loreLocksTableName = platformDataStore.locksTable.name;
export const cognitoUserPoolId = authFoundation?.userPool.id ?? pulumi.output("");
export const cognitoClientId = authFoundation?.userPoolClient.id ?? pulumi.output("");
export const jwtSigningKeyArn = authFoundation?.signingKey.arn ?? pulumi.output("");
export const apiKeyPepperSecretArn = authFoundation?.apiKeyPepperSecret.arn ?? pulumi.output("");
export const loreRepositoryUrl = imageRepositories.lore.repositoryUrl;
export const controlPlaneRepositoryUrl = imageRepositories.controlPlane.repositoryUrl;
export const authGatewayRepositoryUrl = imageRepositories.authGateway.repositoryUrl;
export const loreServiceSecurityGroupArn = loreService
  ? loreService.securityGroup.arn
  : pulumi.output("");
// Compatibility output for consumers of the retired legacy service.
export const controlPlaneServiceSecurityGroupArn = pulumi.output("");
