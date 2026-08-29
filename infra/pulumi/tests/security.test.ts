import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";

const pulumiRoot = process.cwd();
const repositoryRoot = path.resolve(pulumiRoot, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(pulumiRoot, relativePath), "utf8");
}

test("Lore client release-source pin matches the checked-out submodule commit", () => {
  const versions = YAML.parse(
    fs.readFileSync(path.join(repositoryRoot, "infra/lore/versions.yaml"), "utf8"),
  );
  const submoduleCommit = execFileSync(
    "git",
    ["-C", path.join(repositoryRoot, "infra/lore/lore"), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  // The checked-out submodule is the source for the signed CLI release. The
  // server source pin is intentionally advanced later, together with its
  // newly built and verified image receipt.
  assert.equal(versions["lore-client"].source_commit, submoduleCommit);
});

test("public topology has no NLB or direct Lore/control-plane listener", () => {
  const source = read("src/components/LoadBalancers.ts");
  assert.doesNotMatch(source, /loadBalancerType:\s*["']network["']/);
  assert.doesNotMatch(source, /new aws\.lb\.Listener[\s\S]{0,300}port:\s*(80|8083|41337|41339)\b/);
  assert.match(source, /port:\s*443[\s\S]{0,100}protocol:\s*["']HTTPS["']/);
  assert.match(source, /AWSManagedRulesAmazonIpReputationList/);
});

test("JWKS bootstrap is publish-before-use and cannot route token or Lore RPCs", () => {
  const program = read("index.ts");
  const edge = read("src/components/LoadBalancers.ts");
  assert.match(program, /jwksPublicationEnabled && jwtSigningEnabled/);
  assert.match(program, /JWKS bootstrap publication requires JWT signing to remain disabled/);
  assert.match(edge, /args\.publicIngressEnabled[\s\S]{0,180}\/callback/);
  assert.match(edge, /:\s*\["\/\.well-known\/jwks\.json", "\/healthz"\]/);
  assert.match(edge, /if \(args\.publicIngressEnabled\) \{[\s\S]{0,400}auth-grpc-rule/);
});

test("Auth Gateway bootstrap does not require an ALB listener", () => {
  const program = read("index.ts");
  const gateway = read("src/components/AuthGatewayService.ts");
  assert.match(program, /attachToAlb: publicIngressEnabled \|\| jwksPublicationEnabled/);
  assert.match(gateway, /loadBalancers: args\.attachToAlb \? \[/);
  assert.match(gateway, /healthCheckGracePeriodSeconds: args\.attachToAlb \? 90 : undefined/);
});

test("Cognito managed-login passkeys use the actual authentication domain as RP ID", () => {
  const program = read("index.ts");
  assert.match(program, /`\$\{authDomainPrefix\}\.auth\.\$\{awsRegion\}\.amazoncognito\.com`/);
  assert.doesNotMatch(program, /relyingPartyId:\s*["']portals\.sh["']/);
});

test("the legacy control-plane token issuer cannot be deployed", () => {
  const program = read("index.ts");
  assert.match(program, /controlPlaneDesiredCount > 0/);
  assert.match(program, /legacy control-plane token issuer is retired/);
});

test("Lore uses static host ports and never exposes its readiness port", () => {
  const source = read("src/components/LoreService.ts");
  const network = read("src/components/PlatformNetwork.ts");
  assert.match(source, /networkMode:\s*"host"/);
  assert.match(source, /containerPort: 41337, hostPort: 41337/);
  assert.match(source, /containerPort: 41339, hostPort: 41339/);
  assert.match(source, /LORE_REBAC_URL/);
  assert.match(source, /LORE_REBAC_CONNECT_MAX_ATTEMPTS/);
  assert.match(source, /LORE_REBAC_HEALTH_MAX_ATTEMPTS/);
  assert.doesNotMatch(source, /networkConfiguration|serviceConnect|awsvpc/i);
  assert.match(network, /mapPublicIpOnLaunch:\s*false/);
});

test("load-balancer and container readiness both check Lore backing stores", () => {
  const loadBalancer = read("src/components/LoadBalancers.ts");
  const loreService = read("src/components/LoreService.ts");
  assert.match(loadBalancer, /path:\s*["']\/grpc\.health\.v1\.Health\/Check["']/);
  assert.match(loadBalancer, /port:\s*["']traffic-port["']/);
  assert.match(loadBalancer, /matcher:\s*["']0["']/);
  assert.match(loreService, /"CMD", "\/usr\/local\/bin\/loreserver", "healthcheck"/);
  const grpcServer = fs.readFileSync(path.join(repositoryRoot, "infra/lore/lore/lore-server/src/grpc/server.rs"), "utf8");
  const loreMain = fs.readFileSync(path.join(repositoryRoot, "infra/lore/lore/lore-server/src/bin/loreserver/main.rs"), "utf8");
  assert.match(grpcServer, /is_available\(Duration::from_secs\(5\)\)/);
  assert.match(loreMain, /LORE_REBAC_HEALTH_MAX_ATTEMPTS/);
  assert.match(loreMain, /backoff_ms/);
});

test("Auth Gateway retains scoped task permissions with host-only internal ports", () => {
  const source = read("src/components/AuthGatewayService.ts");
  const runtime = fs.readFileSync(
    path.join(repositoryRoot, "control-plane/auth-gateway/src/service.rs"),
    "utf8",
  );
  assert.match(source, /networkMode:\s*"host"/);
  assert.match(source, /hostPort: 8084/);
  assert.match(source, /hostPort: 8087/);
  assert.match(source, /INTERNAL_LISTEN_ADDR", value: "127\.0\.0\.1:8086"/);
  assert.match(source, /REBAC_LISTEN_ADDR", value: "127\.0\.0\.1:8087"/);
  assert.match(source, /kms:Sign/);
  assert.match(source, /secretsmanager:GetSecretValue/);
  assert.doesNotMatch(source, /networkConfiguration|serviceConnect|awsvpc/i);
  assert.doesNotMatch(source, /Action:\s*["']\*["']/);
  assert.match(runtime, /store\.is_healthy\(\)\.await/);
});

test("production images use immutable scan-on-push ECR repositories", () => {
  const source = read("src/components/ImageRepositories.ts");
  assert.match(source, /imageTagMutability:\s*"IMMUTABLE"/);
  assert.match(source, /imageScanningConfiguration:\s*\{ scanOnPush: true \}/);
  assert.match(source, /forceDelete:\s*false/);
});

test("image promotion is scan-gated and public release also requires a signature", () => {
  const program = read("index.ts");
  const versioning = read("src/versioning.ts");
  const publisher = fs.readFileSync(
    path.join(repositoryRoot, "infra/pulumi/scripts/verify-and-promote-image.sh"),
    "utf8",
  );
  const recorder = fs.readFileSync(
    path.join(repositoryRoot, "infra/pulumi/scripts/record-verified-image.mjs"),
    "utf8",
  );
  const releaseRecorder = fs.readFileSync(
    path.join(repositoryRoot, "infra/pulumi/scripts/record-nap-release.mjs"),
    "utf8",
  );
  const versionPinWriter = fs.readFileSync(
    path.join(repositoryRoot, "infra/pulumi/scripts/update-version-pin.mjs"),
    "utf8",
  );
  const lorePublisher = fs.readFileSync(
    path.join(repositoryRoot, "infra/lore/scripts/docker-buildx-lore.sh"),
    "utf8",
  );
  const driftRepair = fs.readFileSync(
    path.join(repositoryRoot, "control-plane/scripts/verify-and-update-versions.sh"),
    "utf8",
  );
  assert.match(program, /assertVersionPinVerified\(\s*"control-plane"/);
  assert.match(program, /assertVersionPinVerified\(\s*"backend"/);
  assert.match(program, /publicIngressEnabled \|\| backendApiPublicEnabled[\s\S]{0,100}assertPublicReleaseApproved\(versionPins\.release\)/);
  assert.match(
    program,
    /assertNapReleaseVerified\(versionPins\.release\.napClient, versionPins\.release\.loreClient\)/,
  );
  assert.match(program, /loreImagePlatform,\s*publicIngressEnabled, versionPins\.release/);
  assert.match(versioning, /document\?\.receipts\?\.\[image\]/);
  assert.match(versioning, /receipt\?\.signatureVerified !== true/);
  assert.match(publisher, /describe-image-scan-findings/);
  assert.match(publisher, /--severity CRITICAL,HIGH --exit-code 1/);
  assert.match(publisher, /Trivy produced empty JSON output/);
  assert.match(publisher, /Trivy produced invalid JSON output; refusing to promote/);
  assert.match(publisher, /\.Results \| type == "array"/);
  assert.match(recorder, /readYamlDocument\(versionsFile\)/);
  assert.match(recorder, /readJsonObject\(receiptsFile\)/);
  assert.match(recorder, /atomicWriteJson\(receiptsFile, receipts\)[\s\S]*atomicWriteYaml\(versionsFile, versions\)/);
  assert.match(releaseRecorder, /readYamlDocument\(versionsFile\)/);
  assert.match(releaseRecorder, /atomicWriteJson\(receiptsFile, receipts\)[\s\S]*atomicWriteYaml\(versionsFile, versions\)/);
  assert.match(versionPinWriter, /readYamlDocument\(versionsFile\)/);
  assert.match(versionPinWriter, /atomicWriteYaml\(versionsFile, versions\)/);
  assert.match(lorePublisher, /EXPECTED_BASE_IMAGE="\$\{BASE_PIN\}"/);
  assert.match(driftRepair, /UPDATE_PIN_SCRIPT" get control-plane image/);
  assert.match(driftRepair, /UPDATE_PIN_SCRIPT" set control-plane image/);
  assert.doesNotMatch(lorePublisher, /awk -v base/);
  assert.doesNotMatch(driftRepair, /awk -v image/);
  assert.doesNotMatch(publisher, /trivy[^\n]*--ignore-unfixed/i);
  assert.match(publisher, /\.SBOM/);
  assert.match(publisher, /\.Provenance/);
  assert.match(publisher, /EXPECTED_SOURCE_COMMIT/);
  assert.match(publisher, /provenance does not bind source commit/);
  for (const script of [
    "infra/lore/scripts/docker-buildx-lore.sh",
    "control-plane/scripts/publish-auth-gateway.sh",
    "services/backend-service/scripts/publish-image.sh",
  ]) {
    const source = fs.readFileSync(path.join(repositoryRoot, script), "utf8");
    assert.match(source, /ENVIRONMENT:-dev.*prod[\s\S]*REQUIRE_SIGNATURE.*true/);
    assert.match(source, /cosign sign --yes --key/);
  }
});

test("EC2 host-mode architecture is explicit and publishers remain architecture-aware", () => {
  for (const component of ["AuthGatewayService.ts", "LoreService.ts"]) {
    assert.match(read(`src/components/${component}`), /runtimePlatform:\s*\{ cpuArchitecture:\s*args\.cpuArchitecture/);
    assert.match(read(`src/components/${component}`), /networkMode:\s*"host"/);
    assert.match(read(`src/components/${component}`), /requiresCompatibilities:\s*\["EC2"\]/);
  }
  const backend = read("src/components/BackendService.ts");
  assert.match(backend, /networkMode:\s*"host"/);
  assert.match(backend, /requiresCompatibilities:\s*\["EC2"\]/);
  const backendPublisher = fs.readFileSync(
    path.join(repositoryRoot, "services/backend-service/scripts/publish-image.sh"),
    "utf8",
  );
  assert.match(backendPublisher, /BACKEND_TARGETARCH:-\$\{TARGETARCH:-amd64\}/);
  assert.match(backendPublisher, /--platform "\$\{PLATFORM\}"/);
  const backendDockerfile = fs.readFileSync(
    path.join(repositoryRoot, "services/backend-service/Dockerfile"),
    "utf8",
  );
  assert.match(backendDockerfile, /node:20-alpine@sha256:[a-f0-9]{64}/);
  const authPublisher = fs.readFileSync(path.join(repositoryRoot, "control-plane/scripts/publish-auth-gateway.sh"), "utf8");
  assert.match(authPublisher, /AUTH_TARGETARCH:-\$\{TARGETARCH:-amd64\}/);
  assert.match(authPublisher, /AUTH_PLATFORMS:-\$\{PLATFORMS:-linux\/amd64,linux\/arm64/);
  const authDockerfile = fs.readFileSync(path.join(repositoryRoot, "docker/auth-gateway/Dockerfile"), "utf8");
  assert.match(authDockerfile, /linux\/amd64\|linux\/arm64/);
  assert.match(authDockerfile, /target\/release\/lore-auth-gateway/);
});

test("PostgreSQL verifies the RDS certificate chain and hostname", () => {
  const source = read("src/components/PlatformDataStore.ts");
  const image = fs.readFileSync(
    path.join(repositoryRoot, "docker/auth-gateway/Dockerfile"),
    "utf8",
  );
  assert.match(source, /rds\.force_ssl/);
  assert.match(source, /sslmode=verify-full/);
  assert.match(source, /sslrootcert=\/etc\/ssl\/certs\/aws-rds-us-east-1-bundle\.pem/);
  assert.match(image, /ADD --chown=65532:65532 --chmod=0444/);
  assert.match(image, /--checksum=sha256:[a-f0-9]{64}/);
  assert.match(image, /truststore\.pki\.rds\.amazonaws\.com\/us-east-1\/us-east-1-bundle\.pem/);
});

test("recovery controls protect every durable store independent of stack label", () => {
  const database = read("src/components/PlatformDataStore.ts");
  const storage = read("src/components/PlatformStorage.ts");
  const edge = read("src/components/LoadBalancers.ts");
  assert.match(database, /deletionProtection:\s*args\.recoveryControlsEnabled/);
  assert.match(database, /backupRetentionPeriod:\s*args\.recoveryControlsEnabled \? args\.databaseBackupRetentionDays : 1/);
  assert.match(database, /skipFinalSnapshot:\s*!args\.recoveryControlsEnabled/);
  assert.equal((database.match(/pointInTimeRecovery:\s*\{\s*enabled:\s*true/g) ?? []).length, 4);
  assert.match(storage, /forceDestroy:\s*false/);
  assert.match(storage, /versioningConfiguration:\s*\{ status:\s*"Enabled" \}/);
  assert.match(edge, /enableDeletionProtection:\s*args\.deletionProtectionEnabled/);
  const backup = read("src/components/LowCostRdsBackups.ts");
  const program = read("index.ts");
  assert.match(backup, /rds:CreateDBSnapshot/);
  assert.match(backup, /rds:DeleteDBSnapshot/);
  assert.match(backup, /scheduleExpression:\s*"cron\(17 5 \* \* \? \*\)"/);
  assert.match(backup, /memorySize:\s*128/);
  assert.match(backup, /architectures:\s*\["arm64"\]/);
  assert.match(program, /databaseBackupRetentionDays < 7 && !lowCostRdsSnapshotsEnabled/);
});

test("WAF common HTTP inspection does not parse binary gRPC bodies", () => {
  const source = read("src/components/LoadBalancers.ts");
  assert.match(source, /AWSManagedRulesCommonRuleSet[\s\S]*scopeDownStatement/);
  assert.match(source, /"\/callback", "\/\.well-known\/jwks\.json", "\/healthz"/);
  assert.match(source, /WebAclLoggingConfiguration/);
  assert.match(source, /singleHeader:\s*\{ name:\s*"authorization"/);
  assert.match(source, /HTTPCode_Target_4XX_Count/);
  assert.match(source, /BlockedRequests/);
  assert.match(source, /auth-grpc[\s\S]*auth-http[\s\S]*unhealthy-targets/);
});

test("free-tier security baseline includes Access Analyzer and a recent-review gate", () => {
  const program = read("index.ts");
  const controls = read("src/components/SecurityControls.ts");
  assert.match(program, /publicEdgeEnabled && \(!authGatewayReady \|\| !securityControlsEnabled \|\| !releaseGateApproved/);
  assert.match(program, /assertRecentSecurityReview\(securityReviewDate\)/);
  assert.match(controls, /accessanalyzer\.Analyzer/);
  assert.match(controls, /type:\s*"ACCOUNT"/);
  assert.match(controls, /if \(args\.threatDetectionEnabled\)/);
});

test("the t3.micro profile consolidates backend work and makes memory safety observable", () => {
  const program = read("index.ts");
  const backend = read("src/components/BackendService.ts");
  const edge = read("src/components/LoadBalancers.ts");
  const monitoring = read("src/components/EcsMemoryMonitoring.ts");
  const validator = fs.readFileSync(
    path.join(repositoryRoot, "infra/pulumi/scripts/validate-ec2-capacity.mjs"),
    "utf8",
  );
  assert.match(program, /backendServiceDesiredCount/);
  assert.match(program, /loreEc2Memory"\) \?\? "256"/);
  assert.match(program, /authGatewayEc2Memory"\) \?\? "128"/);
  assert.match(program, /backendEc2Memory"\) \?\? "128"/);
  assert.match(program, /requestedMemory > 512/);
  assert.match(program, /memoryMonitoringEnabled and alarmNotificationEndpoint/);
  assert.match(backend, /containerPort: 8088/);
  assert.doesNotMatch(backend, /containerPort: 8089/);
  assert.match(edge, /backendHttpTargetGroup/);
  assert.match(edge, /backend-invitations-api-rule[\s\S]*backendHttpTargetGroup/);
  assert.match(edge, /backend-lead-api-rule[\s\S]*backendHttpTargetGroup/);
  assert.match(monitoring, /metricName: "MemoryUtilization"/);
  assert.match(monitoring, /threshold: 80/);
  assert.match(monitoring, /OutOfMemoryError/);
  assert.match(validator, /Lore=256, AuthGateway=128, Backend=128 MiB/);
  assert.match(validator, /headroomMb/);
});

test("public-host network has no NAT or private task surface", () => {
  const network = read("src/components/PlatformNetwork.ts");
  const cluster = read("src/components/PlatformCluster.ts");
  const program = read("index.ts");
  assert.match(network, /new aws\.ec2\.InternetGateway/);
  assert.match(network, /publicNetworkAcl/);
  assert.match(network, /fromPort: 1024, toPort: 65535/);
  assert.match(network, /fromPort: 5432, toPort: 5432/);
  assert.doesNotMatch(network, /NatGateway|privateSubnet|nat-/i);
  assert.doesNotMatch(cluster, /serviceConnect|ServiceConnect/i);
  assert.match(program, /controlPlaneDesiredCount > 0/);
  assert.match(program, /requires ecsLaunchType EC2/);
});

test("single host uses an Elastic IP lifecycle handler and preserves task IAM isolation", () => {
  const compute = read("src/components/EC2Compute.ts");
  const program = read("index.ts");
  assert.match(compute, /ECS_RESERVED_MEMORY=128/);
  assert.match(compute, /ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true/);
  assert.match(compute, /route_localnet=1/);
  assert.match(compute, /AssociateAddressCommand/);
  assert.match(compute, /DescribeAddressesCommand/);
  assert.match(compute, /CompleteLifecycleActionCommand/);
  assert.match(compute, /EC2 Instance-launch Lifecycle Action/);
  assert.match(compute, /associatePublicIpAddress: "false"/);
  assert.match(compute, /AmazonSSMManagedInstanceCore/);
  assert.match(compute, /CloudWatchAgentServerPolicy/);
  assert.match(compute, /portals-agent-verification/);
  assert.match(compute, /enable --now portals-ecs-host-iam\.service/);
  assert.match(compute, /enable --now portals-cloudwatch-agent\.service/);
  assert.match(compute, /enable --now portals-agent-verification\.service/);
  assert.match(compute, /dependsOn: \[lifecycleTarget, lifecyclePermission\]/);
  assert.ok(
    compute.indexOf("new aws.cloudwatch.EventTarget") < compute.indexOf("new aws.autoscaling.Group"),
    "the EventBridge target must exist before the ASG can emit its first launch lifecycle action",
  );
  assert.match(compute, /DenyManualTerminationOfPortalsEcsHost/);
  assert.doesNotMatch(compute, /disableApiTermination/);
  assert.match(program, /ecsHostElasticIp = ec2Compute\.elasticIp\.publicIp/);
});

test("ALB and RDS use instance-mode host networking with private database reachability", () => {
  const edge = read("src/components/LoadBalancers.ts");
  const datastore = read("src/components/PlatformDataStore.ts");
  const compute = read("src/components/EC2Compute.ts");
  assert.equal((edge.match(/targetType: "instance"/g) ?? []).length, 4);
  assert.match(edge, /port: 8088[\s\S]{0,180}path: "\/health"/);
  assert.match(edge, /port: 8085[\s\S]{0,180}path: "\/healthz"/);
  assert.match(datastore, /subnetIds: args\.publicSubnetIds/);
  assert.match(datastore, /publiclyAccessible: false/);
  assert.match(datastore, /sourceSecurityGroupId: args\.ecsHostSecurityGroupId/);
  assert.match(compute, /ecs-host-neon-egress/);
});

test("unified backend obtains only the Neon application URL and shares one pool", () => {
  const backend = read("src/components/BackendService.ts");
  const invitations = fs.readFileSync(path.join(repositoryRoot, "services/invitation-service/src/db.ts"), "utf8");
  const leads = fs.readFileSync(path.join(repositoryRoot, "services/lead-processing/src/db.ts"), "utf8");
  assert.match(backend, /LEADS_DATABASE_URL/);
  assert.doesNotMatch(backend, /name: "DATABASE_URL"/);
  assert.match(invitations, /portalsUnifiedNeonPool/);
  assert.match(leads, /portalsUnifiedNeonPool/);
  assert.match(backend, /networkMode: "host"/);
});

test("production Lore config requires scoped auth and disables AdminService", () => {
  const config = fs.readFileSync(
    path.join(repositoryRoot, "infra/lore/lore/lore-server/config/prod.toml"),
    "utf8",
  );
  assert.match(config, /jwt_audience\s*=\s*\[[^\]]*"lore"[^\]]*"portals\.works"/);
  assert.match(config, /admin_service_enabled\s*=\s*false/);
  assert.match(config, /store_health_check\s*=\s*true/);
});

test("repository v1 enforces scope and reconciles storage before ownership", () => {
  const root = path.join(repositoryRoot, "infra/lore/lore/lore-server/src/grpc/repository/v1");
  for (const handler of ["repository_metadata_get.rs", "repository_metadata_set.rs"]) {
    const source = fs.readFileSync(path.join(root, handler), "utf8");
    assert.match(source, /get_authorization\(request\.extensions\(\)\)/);
    assert.match(source, /verify_authorization\(&authorization, repository_id\)/);
  }

  const create = fs.readFileSync(path.join(root, "repository_create.rs"), "utf8");
  const durableNameMapping = create.lastIndexOf("repository::store_name_to_id");
  const ownerUpsert = create.lastIndexOf("repository_create_auth_resource");
  assert.ok(durableNameMapping >= 0 && ownerUpsert > durableNameMapping);
  assert.match(create, /if auth_url\.is_some\(\) \{\s*user_id\.clone\(\)/);
  assert.match(create, /metadata\.creator != creator/);

  const gatewayStore = fs.readFileSync(
    path.join(repositoryRoot, "control-plane/auth-gateway/src/store.rs"),
    "utf8",
  );
  assert.match(gatewayStore, /pg_advisory_xact_lock/);
  assert.match(gatewayStore, /ownership is already established for another subject/);
});

test("deployment TLS private keys are not tracked in the build context", () => {
  assert.equal(fs.existsSync(path.join(repositoryRoot, "infra/lore/certs/key.pem")), false);
  const dockerIgnore = fs.readFileSync(path.join(repositoryRoot, ".dockerignore"), "utf8");
  assert.match(dockerIgnore, /^infra\/lore\/certs$/m);
  assert.match(dockerIgnore, /test_data\/\*key\.pem/);
});
