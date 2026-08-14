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

test("Lore client upstream pin matches the checked-out submodule commit", () => {
  const versions = YAML.parse(
    fs.readFileSync(path.join(repositoryRoot, "infra/lore/versions.yaml"), "utf8"),
  );
  const submoduleCommit = execFileSync(
    "git",
    ["-C", path.join(repositoryRoot, "infra/lore/lore"), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  assert.equal(versions["lore-client"].upstream_commit, submoduleCommit);
  assert.equal(versions.lore.upstream_commit, submoduleCommit);
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

test("private Auth Gateway bootstrap does not require an ALB listener", () => {
  const program = read("index.ts");
  const gateway = read("src/components/AuthGatewayService.ts");
  assert.match(program, /attachToAlb: publicIngressEnabled \|\| jwksPublicationEnabled/);
  assert.match(gateway, /loadBalancers: args\.attachToAlb \? \[/);
  assert.match(gateway, /healthCheckGracePeriodSeconds: args\.attachToAlb \? 60 : undefined/);
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

test("Lore tasks are private and accept service traffic only from the ALB", () => {
  const source = read("src/components/LoreService.ts");
  assert.match(source, /assignPublicIp:\s*false/);
  assert.match(source, /sourceSecurityGroupId:\s*args\.albSecurityGroupId/);
  assert.doesNotMatch(source, /type:\s*["']ingress["'][\s\S]{0,300}cidrBlocks:\s*\[["']0\.0\.0\.0\/0["']\]/);
});

test("load-balancer and container readiness both check Lore backing stores", () => {
  const loadBalancer = read("src/components/LoadBalancers.ts");
  const loreService = read("src/components/LoreService.ts");
  assert.match(loadBalancer, /path:\s*["']\/grpc\.health\.v1\.Health\/Check["']/);
  assert.match(loadBalancer, /port:\s*["']traffic-port["']/);
  assert.match(loadBalancer, /matcher:\s*["']0["']/);
  assert.match(loreService, /"CMD", "\/usr\/local\/bin\/loreserver", "healthcheck"/);
  const grpcServer = fs.readFileSync(path.join(repositoryRoot, "infra/lore/lore/lore-server/src/grpc/server.rs"), "utf8");
  assert.match(grpcServer, /is_available\(Duration::from_secs\(5\)\)/);
});

test("Auth Gateway has scoped runtime permissions and private mutation ingress", () => {
  const source = read("src/components/AuthGatewayService.ts");
  const runtime = fs.readFileSync(
    path.join(repositoryRoot, "control-plane/auth-gateway/src/service.rs"),
    "utf8",
  );
  assert.match(source, /assignPublicIp:\s*false/);
  assert.match(source, /kms:Sign/);
  assert.match(source, /secretsmanager:GetSecretValue/);
  assert.match(source, /sourceSecurityGroupId:\s*args\.controlPlaneSecurityGroupId/);
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
  assert.match(program, /assertVersionPinVerified\(\s*"control-plane"/);
  assert.match(program, /assertPublicReleaseApproved\(versionPins\.release\)/);
  assert.match(
    program,
    /assertNapReleaseVerified\(versionPins\.release\.napClient, versionPins\.release\.loreClient\)/,
  );
  assert.match(program, /imagePlatform,\s*publicIngressEnabled, versionPins\.release/);
  assert.match(versioning, /receipt\?\.image === image/);
  assert.match(versioning, /receipt\?\.signatureVerified !== true/);
  assert.match(publisher, /describe-image-scan-findings/);
  assert.match(publisher, /--severity CRITICAL,HIGH --exit-code 1/);
  assert.doesNotMatch(publisher, /trivy[^\n]*--ignore-unfixed/i);
  assert.match(publisher, /\.SBOM/);
  assert.match(publisher, /\.Provenance/);
  assert.match(publisher, /EXPECTED_SOURCE_COMMIT/);
  assert.match(publisher, /provenance does not bind source commit/);
});

test("Fargate architecture is explicit and publisher target architecture is configurable", () => {
  for (const component of ["AuthGatewayService.ts", "LoreService.ts", "ControlPlaneService.ts"]) {
    assert.match(read(`src/components/${component}`), /runtimePlatform:\s*\{ cpuArchitecture:\s*args\.cpuArchitecture/);
  }
  const authPublisher = fs.readFileSync(path.join(repositoryRoot, "control-plane/scripts/publish-auth-gateway.sh"), "utf8");
  assert.match(authPublisher, /TARGETARCH="\$\{TARGETARCH:-arm64\}"/);
  assert.match(authPublisher, /PLATFORMS:-linux\/\$\{TARGETARCH\}/);
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
  assert.match(program, /publicIngressEnabled && \(!authGatewayReady \|\| !securityControlsEnabled \|\| !releaseGateApproved/);
  assert.match(program, /assertRecentSecurityReview\(securityReviewDate\)/);
  assert.match(controls, /accessanalyzer\.Analyzer/);
  assert.match(controls, /type:\s*"ACCOUNT"/);
  assert.match(controls, /if \(args\.threatDetectionEnabled\)/);
});

test("production Lore config requires scoped auth and disables AdminService", () => {
  const config = fs.readFileSync(
    path.join(repositoryRoot, "infra/lore/lore/lore-server/config/prod.toml"),
    "utf8",
  );
  assert.match(config, /jwt_audience\s*=\s*\[[^\]]*"lore"[^\]]*"portals\.sh"/);
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
