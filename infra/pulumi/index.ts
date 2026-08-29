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
import { EC2Compute } from "./src/components/EC2Compute";
import { EmailService } from "./src/components/EmailService";
import { BackendService } from "./src/components/BackendService";
import { EcsHostMemoryMonitoring, EcsMemoryMonitoring } from "./src/components/EcsMemoryMonitoring";
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
const backendApiPublicEnabled = config.getBoolean("backendApiPublicEnabled") ?? false;
const backendApiHostname = config.get("backendApiHostname") ?? "api.portals.works";
const backendCorsAllowedOrigins = (config.get("backendCorsAllowedOrigins") ?? "https://portals.works").split(",").filter(Boolean);
const publicAppUrl = config.get("publicAppUrl") ?? "https://portals.works";
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
const egressEndpointsEnabled = config.getBoolean("egressEndpointsEnabled") ?? false;
const alarmNotificationEndpoint = config.get("alarmNotificationEndpoint") || undefined;
const databaseBackupRetentionDays = parseInt(config.get("databaseBackupRetentionDays") ?? (environment === "prod" ? "35" : "1"));
const lowCostRdsSnapshotsEnabled = config.getBoolean("lowCostRdsSnapshotsEnabled") ?? false;
const manualSnapshotRetentionCount = parseInt(config.get("manualSnapshotRetentionCount") ?? "7");
const credentialRotationEpoch = config.require("credentialRotationEpoch");

// Network
const vpcCidr = config.require("vpcCidr");
const publicSubnetCidrs = config.require("publicSubnetCidrs").split(",");

// RDS (Control Plane)
const databaseInstanceClass = config.require("databaseInstanceClass");
const databaseVersion = config.require("databaseVersion");
const databaseAllocatedStorage = parseInt(config.require("databaseAllocatedStorage"));

// ECS
const ecsFargateCpu = config.require("ecsFargateCpu");
const ecsFargateMemory = config.require("ecsFargateMemory");
const ecsLaunchTypeValue = config.get("ecsLaunchType") ?? "EC2";
if (ecsLaunchTypeValue !== "EC2") {
  throw new Error("The public-host architecture requires ecsLaunchType EC2; Fargate task networking is not supported.");
}
const ecsLaunchType = ecsLaunchTypeValue as "EC2";
const ec2InstanceCount = parseInt(config.get("ec2InstanceCount") ?? "1");
const ec2InstanceType = config.get("ec2InstanceType") ?? "t3.micro";
const ec2AmiId = config.get("ec2AmiId") || undefined;
const ec2AmiSsmParameter = config.get("ec2AmiSsmParameter") || undefined;
const manualTerminationDenyUserName = config.get("manualTerminationDenyUserName") ?? "portals-pulumi-deployer";
const ec2SchedulableMemoryMb = parseInt(config.get("ec2SchedulableMemoryMb") ?? "875");
const memoryMonitoringEnabled = config.getBoolean("memoryMonitoringEnabled") ?? false;
const loreTaskCpu = config.get("loreEc2Cpu") ?? "256";
const loreTaskMemory = config.get("loreEc2Memory") ?? "256";
const authGatewayTaskCpu = config.get("authGatewayEc2Cpu") ?? "128";
const authGatewayTaskMemory = config.get("authGatewayEc2Memory") ?? "128";
const backendTaskCpu = config.get("backendEc2Cpu") ?? "128";
const backendTaskMemory = config.get("backendEc2Memory") ?? "128";

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
const backendServiceDesiredCount = parseInt(config.get("backendServiceDesiredCount") ?? "0");
const emailServiceEnabled = config.getBoolean("emailServiceEnabled") ?? false;
const sesDomain = config.get("sesDomain") || undefined;
const sesFromEmail = config.get("sesFromEmail") || undefined;
const leadsDatabaseUrlSecretArn = config.get("leadsDatabaseUrlSecretArn") || undefined;
const neonAllowlistConfirmed = config.getBoolean("neonAllowlistConfirmed") ?? false;
const leadHashKeySecretArn = config.get("leadHashKeySecretArn") || undefined;
const leadEncryptionKeySecretArn = config.get("leadEncryptionKeySecretArn") || undefined;
const backendApiSharedSecretArn = config.get("backendApiSharedSecretArn") || undefined;
const crmApiKeySecretArn = config.get("crmApiKeySecretArn") || undefined;
const crmWebhookSecretArn = config.get("crmWebhookSecretArn") || undefined;
const crmApiUrl = config.get("crmApiUrl") || undefined;

if (controlPlaneDesiredCount > 0) {
  throw new Error(
    "the legacy control-plane token issuer is retired; keep it at zero and use the Auth Gateway",
  );
}
for (const [service, desiredCount] of [
  ["Lore", loreServiceDesiredCount],
  ["Auth Gateway", authGatewayDesiredCount],
  ["Backend", backendServiceDesiredCount],
] as const) {
  if (!Number.isInteger(desiredCount) || desiredCount < 0) {
    throw new Error(`${service} desired count must be a non-negative integer`);
  }
}
if (backendServiceDesiredCount > 0 && !emailServiceEnabled) {
  throw new Error("BackendService requires emailServiceEnabled so SES is provisioned first");
}
if (emailServiceEnabled && (!sesDomain || !sesFromEmail)) {
  throw new Error("emailServiceEnabled requires sesDomain and sesFromEmail");
}
if (backendServiceDesiredCount > 0 && !authFoundationEnabled) {
  throw new Error("BackendService requires authFoundationEnabled for Cognito access-token verification");
}
if (backendServiceDesiredCount > 0 && !neonAllowlistConfirmed) {
  throw new Error("BackendService requires neonAllowlistConfirmed after the exported ECS host Elastic IP is allowlisted in Neon.");
}
if (backendApiPublicEnabled && backendServiceDesiredCount < 1) {
  throw new Error("backendApiPublicEnabled requires the unified BackendService to be running");
}
if (!backendApiPublicEnabled && backendServiceDesiredCount > 0) {
  throw new Error("BackendService requires the explicitly gated backendApiPublicEnabled HTTPS facade");
}
if (backendServiceDesiredCount > 0 && (
  !leadsDatabaseUrlSecretArn ||
  !leadHashKeySecretArn || !leadEncryptionKeySecretArn || !backendApiSharedSecretArn ||
  !crmApiKeySecretArn || !crmWebhookSecretArn || !crmApiUrl
)) {
  throw new Error("BackendService requires the Neon URL, hash/encryption, backend token, CRM URL, API key, and webhook secret configuration");
}
if (egressEndpointsEnabled) {
  throw new Error("EgressControls is incompatible with the public-host architecture and must remain disabled.");
}

// versions.yaml is the sole bill of materials. The active control-plane image
// is the Auth Gateway; the legacy caller-selected-claims issuer is not built or
// deployable.
const versionPins = readVersionPins();
const { controlPlaneImageUri, loreImageUri: loreServerImageUri, backendImageUri } = versionPins;
const authGatewayImageUri = controlPlaneImageUri;

function assertDigestPinned(name: string, image: string, desiredCount: number): void {
  if (desiredCount > 0 && !/@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error(`${name} must use an immutable @sha256 digest before desiredCount can exceed zero`);
  }
}

assertDigestPinned("Lore image", loreServerImageUri, loreServiceDesiredCount);
assertDigestPinned("Control Plane/Auth Gateway image", authGatewayImageUri, authGatewayDesiredCount);
assertDigestPinned("Backend service image", backendImageUri, backendServiceDesiredCount);

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
assertVersionPinVerified(
  "backend", backendImageUri, backendServiceDesiredCount, "linux/amd64",
  backendApiPublicEnabled, versionPins.release.backend,
);
if (publicIngressEnabled || backendApiPublicEnabled) {
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

const publicEdgeEnabled = publicIngressEnabled || backendApiPublicEnabled;
if (publicEdgeEnabled && (!authGatewayReady || !securityControlsEnabled || !releaseGateApproved)) {
  throw new Error(
    "public edge requires authGatewayReady, the mandatory security-control baseline, and releaseGateApproved; refusing to bypass release gates",
  );
}
if (publicEdgeEnabled) assertRecentSecurityReview(securityReviewDate);
if (publicEdgeEnabled && databaseBackupRetentionDays < 7 && !lowCostRdsSnapshotsEnabled) {
  throw new Error(
    "public ingress with less than seven days of RDS PITR requires bounded daily manual snapshots",
  );
}
if (publicEdgeEnabled && !jwtSigningEnabled) {
  throw new Error("public edge requires an explicitly activated KMS JWT signer");
}
if (ecsLaunchType === "EC2") {
  if (ec2InstanceCount !== 1 || ec2InstanceType !== "t3.micro") {
    throw new Error("the free-tier EC2 mode is intentionally limited to exactly one t3.micro ECS host");
  }
  if (loreCpuArchitecture !== "X86_64" || authGatewayCpuArchitecture !== "X86_64") {
    throw new Error("EC2 t3.micro capacity is x86_64; Lore and Auth Gateway images must be configured for X86_64");
  }
  const requestedMemory = loreServiceDesiredCount * parseInt(loreTaskMemory)
    + authGatewayDesiredCount * parseInt(authGatewayTaskMemory)
    + backendServiceDesiredCount * parseInt(backendTaskMemory);
  if (!Number.isInteger(ec2SchedulableMemoryMb) || ec2SchedulableMemoryMb < 512 || ec2SchedulableMemoryMb > 1024) {
    throw new Error("ec2SchedulableMemoryMb must be a whole number between 512 and 1024");
  }
  if (!Number.isInteger(requestedMemory) || requestedMemory > ec2SchedulableMemoryMb) {
    throw new Error(`one t3.micro has ${ec2SchedulableMemoryMb} MiB configured as safely schedulable; requested ${requestedMemory} MiB`);
  }
  // The approved free-tier profile is 256 MiB Lore + 128 MiB Auth + 128 MiB
  // Backend = 512 MiB, leaving 363 MiB of the 875 MiB task budget available.
  if (requestedMemory > 512) {
    throw new Error(`the EC2 free-tier memory profile permits at most 512 MiB of task reservations; requested ${requestedMemory} MiB`);
  }
  if (!memoryMonitoringEnabled || !alarmNotificationEndpoint) {
    throw new Error("EC2 free-tier mode requires memoryMonitoringEnabled and alarmNotificationEndpoint for 80% and OOM alerts");
  }
}
if (jwksPublicationEnabled && publicIngressEnabled) {
  throw new Error("jwksPublicationEnabled is a bootstrap mode and cannot be combined with publicIngressEnabled");
}
if (jwksPublicationEnabled && jwtSigningEnabled) {
  throw new Error("JWKS bootstrap publication requires JWT signing to remain disabled");
}
// JWKS bootstrap is publish-before-use. The LoadBalancers component restricts
// its routes separately from normal public ingress.
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
  availabilityZones,
  projectName,
  environment,
});

const securityControls = new SecurityControls(`${projectName}-security`, {
  enabled: securityControlsEnabled,
  projectName,
  environment,
  vpcId: platformNetwork.vpc.id,
  threatDetectionEnabled,
  notificationEndpoint: alarmNotificationEndpoint,
});

// Host-network services share one EC2 container instance; the ECS cluster itself
// has no subnet placement setting.
const platformCluster = new PlatformCluster(`${projectName}-cluster`, {
  vpcId: platformNetwork.vpc.id,
  projectName,
  environment,
});

const ec2Compute = new EC2Compute(`${projectName}-ec2-compute`, {
  vpcId: platformNetwork.vpc.id,
  vpcCidr,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
  instanceCount: ec2InstanceCount,
  instanceType: ec2InstanceType,
  clusterName: platformCluster.cluster.name,
  capacityProviderName: `${projectName}-${environment}-ec2`,
  amiId: ec2AmiId,
  amiSsmParameter: ec2AmiSsmParameter,
  recoveryControlsEnabled,
  manualTerminationDenyUserName,
});

// Create Platform Data Store (RDS for Control Plane + DynamoDB for Lore)
const platformDataStore = new PlatformDataStore(`${projectName}-datastore`, {
  vpcId: platformNetwork.vpc.id,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
  databaseInstanceClass,
  databaseVersion,
  databaseAllocatedStorage,
  databaseUsername: "portals_admin",
  rotationEpoch: credentialRotationEpoch,
  recoveryControlsEnabled,
  databaseBackupRetentionDays,
  ecsHostSecurityGroupId: ec2Compute.instanceSecurityGroup.id,
});

if (lowCostRdsSnapshotsEnabled) {
  new LowCostRdsBackups(`${projectName}-${environment}-rds-backups`, {
    projectName,
    environment,
    databaseInstanceId: platformDataStore.databaseInstance.identifier,
    databaseInstanceArn: platformDataStore.databaseInstance.arn,
    retentionCount: manualSnapshotRetentionCount,
    alarmNotificationTopicArn: securityControls.alertTopic?.arn,
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

// Create the fail-closed HTTPS edge. No NLB or direct service listeners exist.
const loadBalancers = new LoadBalancers(`${projectName}-loadbalancers`, {
  vpcId: platformNetwork.vpc.id,
  vpcCidr,
  publicSubnetIds: pulumi.all(platformNetwork.publicSubnets.map(s => s.id)),
  projectName,
  environment,
  publicIngressEnabled,
  jwksPublicationEnabled,
  backendApiPublicEnabled,
  backendApiHostname,
  certificateArn: publicCertificateArn,
  loreHostname,
  authHostname,
  allowedIngressCidrs,
  accessLogsBucket: securityControls.auditBucket?.bucket,
  alarmsEnabled: securityControlsEnabled,
  deletionProtectionEnabled: recoveryControlsEnabled,
  alarmNotificationTopicArn: securityControls.alertTopic?.arn,
  ecsHostSecurityGroupId: ec2Compute.instanceSecurityGroup.id,
});

for (const [service, port] of [["lore", 41337], ["auth-grpc", 8084], ["auth-http", 8085], ["backend", 8088]] as const) {
  new aws.ec2.SecurityGroupRule(`${projectName}-${environment}-ecs-host-${service}-from-alb`, {
    type: "ingress",
    fromPort: port,
    toPort: port,
    protocol: "tcp",
    securityGroupId: ec2Compute.instanceSecurityGroup.id,
    sourceSecurityGroupId: loadBalancers.albSecurityGroup.id,
    description: `ALB-only ingress to ECS host ${service} port ${port}`,
  });
}
new aws.ec2.SecurityGroupRule(`${projectName}-${environment}-ecs-host-rds-egress`, {
  type: "egress",
  fromPort: 5432,
  toPort: 5432,
  protocol: "tcp",
  securityGroupId: ec2Compute.instanceSecurityGroup.id,
  sourceSecurityGroupId: platformDataStore.securityGroup.id,
  description: "Control-plane RDS access from ECS host",
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
    grpcTargetGroupArn: loadBalancers.authGrpcTargetGroup.arn,
    httpTargetGroupArn: loadBalancers.authHttpTargetGroup.arn,
    attachToAlb: publicIngressEnabled || jwksPublicationEnabled,
    publicIngressEnabled,
    projectName, environment,
    desiredCount: authGatewayDesiredCount,
    cpu: authGatewayTaskCpu,
    memory: authGatewayTaskMemory,
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
    capacityProviderName: ec2Compute.capacityProvider.name,
  });
}

const emailService = emailServiceEnabled ? new EmailService(`${projectName}-email`, {
  projectName,
  environment,
  domain: sesDomain!,
}) : undefined;

let backendService: BackendService | undefined;
if (backendServiceDesiredCount > 0) {
  const auth = authFoundation!;
  const email = emailService!;
  backendService = new BackendService(`${projectName}-backend-service`, {
    clusterArn: platformCluster.cluster.arn,
    taskExecutionRoleArn: platformCluster.taskExecutionRole.arn,
    taskExecutionRoleName: platformCluster.taskExecutionRole.name,
    targetGroupArn: loadBalancers.backendHttpTargetGroup.arn,
    projectName,
    environment,
    desiredCount: backendServiceDesiredCount,
    cpu: backendTaskCpu,
    memory: backendTaskMemory,
    imageUri: backendImageUri,
    leadsDatabaseUrlSecretArn: leadsDatabaseUrlSecretArn!,
    hashKeySecretArn: leadHashKeySecretArn!,
    encryptionKeySecretArn: leadEncryptionKeySecretArn!,
    backendTokenSecretArn: backendApiSharedSecretArn!,
    crmApiKeySecretArn: crmApiKeySecretArn!,
    crmWebhookSecretArn: crmWebhookSecretArn!,
    crmApiUrl: crmApiUrl!,
    cognitoUserPoolId: auth.userPool.id,
    cognitoUserPoolArn: auth.userPool.arn,
    sesIdentityArn: email.domainIdentity.arn,
    sesConfigurationSetName: email.invitationConfigurationSet.name,
    sesFromEmail: sesFromEmail!,
    publicAppUrl,
    corsAllowedOrigins: backendCorsAllowedOrigins,
    awsRegion,
    capacityProviderName: ec2Compute.capacityProvider.name,
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
    rebacUrl: "http://127.0.0.1:8087",
    authEndpointUrl: `ucs-auth://${authHostname}`,
    repoEndpointUrl: `grpcs://${loreHostname}`,
    albTargetGroupArn: loadBalancers.loreGrpcTargetGroup.arn,
    publicIngressEnabled,
    projectName,
    environment,
    desiredCount: loreServiceDesiredCount,
    cpu: loreTaskCpu,
    memory: loreTaskMemory,
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
    capacityProviderName: ec2Compute.capacityProvider.name,
  }, { dependsOn: authGatewayService ? [authGatewayService.service] : undefined });
}

if (memoryMonitoringEnabled) {
  const alertTopic = securityControls.alertTopic
  if (!alertTopic) {
    throw new Error("memoryMonitoringEnabled requires securityControlsEnabled and alarmNotificationEndpoint");
  }
  new EcsHostMemoryMonitoring(`${projectName}-ecs-host-memory`, {
    projectName,
    environment,
    autoScalingGroupName: ec2Compute.autoScalingGroup.name,
    alarmNotificationTopicArn: alertTopic.arn,
  });
  if (loreService) {
    new EcsMemoryMonitoring(`${projectName}-lore-memory`, {
      projectName, environment, clusterName: platformCluster.cluster.name, serviceName: loreService.service.name,
      taskMemoryMb: parseInt(loreTaskMemory), alarmNotificationTopicArn: alertTopic.arn,
    });
  }
  if (authGatewayService) {
    new EcsMemoryMonitoring(`${projectName}-auth-memory`, {
      projectName, environment, clusterName: platformCluster.cluster.name, serviceName: authGatewayService.service.name,
      taskMemoryMb: parseInt(authGatewayTaskMemory), alarmNotificationTopicArn: alertTopic.arn,
    });
  }
  if (backendService) {
    new EcsMemoryMonitoring(`${projectName}-backend-memory`, {
      projectName, environment, clusterName: platformCluster.cluster.name, serviceName: backendService.service.name,
      taskMemoryMb: parseInt(backendTaskMemory), alarmNotificationTopicArn: alertTopic.arn,
    });
  }
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
export const backendRepositoryUrl = imageRepositories.backend.repositoryUrl;
export const sesDomainVerificationToken = emailService?.domainIdentity.verificationToken ?? pulumi.output("");
export const backendServiceSecurityGroupArn = ec2Compute.instanceSecurityGroup.arn;
export const ecsCapacityProviderName = ec2Compute.capacityProvider.name;
export const ecsHostElasticIp = ec2Compute.elasticIp.publicIp;
export const ecsHostElasticIpAllocationId = ec2Compute.elasticIp.id;
export const ecsHostAutoScalingGroupName = ec2Compute.autoScalingGroup.name;
export const loreGrpcTargetGroupArn = loadBalancers.loreGrpcTargetGroup.arn;
export const authGrpcTargetGroupArn = loadBalancers.authGrpcTargetGroup.arn;
export const authHttpTargetGroupArn = loadBalancers.authHttpTargetGroup.arn;
export const backendHttpTargetGroupArn = loadBalancers.backendHttpTargetGroup.arn;
export const alarmNotificationTopicArn = securityControls.alertTopic?.arn ?? pulumi.output("");
export const loreServiceSecurityGroupArn = ec2Compute.instanceSecurityGroup.arn;
// Compatibility output for consumers of the retired legacy service.
export const controlPlaneServiceSecurityGroupArn = pulumi.output("");
