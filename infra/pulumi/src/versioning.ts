import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

export type ImageService = "lore" | "control-plane" | "backend";

export interface SourcePin {
  sourceCommit: string;
  packagingCommit?: string;
  protocolCommit?: string;
}

export interface NapClientPin {
  version: string;
  sourceRepository: string;
  sourceCommit: string;
  releaseTag: string;
  securityContract: string;
  artifactManifestUrl: string;
  artifactManifestSha256: string;
  signatureBundleUrl: string;
  loreClientVersion: string;
}

export interface LoreClientPin {
  version: string;
  sourceRepository: string;
  sourceCommit: string;
  upstreamRepository: string;
  upstreamCommit: string;
  releaseTag: string;
  securityContract: string;
  installerSha256: string;
  artifactManifestUrl: string;
  artifactManifestSha256: string;
  signatureBundleUrl: string;
}

export interface ReleasePins {
  version: string;
  status: string;
  securityContract: string;
  napClient: NapClientPin;
  loreClient: LoreClientPin;
  lore: SourcePin & { securityContract: string };
  controlPlane: SourcePin & { implementation: string; securityContract: string };
  backend?: SourcePin & { securityContract: string };
}

export interface VersionPins {
  loreImageUri: string;
  /** The active control-plane image is the Auth Gateway image. */
  controlPlaneImageUri: string;
  backendImageUri: string;
  release: ReleasePins;
}

interface VerificationReceipt {
  service?: unknown;
  image?: unknown;
  platform?: unknown;
  platformDigest?: unknown;
  ecrScan?: { critical?: unknown; high?: unknown; completedAt?: unknown };
  trivyScan?: { critical?: unknown; high?: unknown; scannerVersion?: unknown; completedAt?: unknown };
  sbomVerified?: unknown;
  provenanceVerified?: unknown;
  signatureVerified?: unknown;
  sourceCommit?: unknown;
  packagingCommit?: unknown;
  protocolCommit?: unknown;
  sourceTreeClean?: unknown;
  verifiedAt?: unknown;
}

const VERSIONS_FILE_NAME = "versions.yaml";
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function findUp(startDir: string, relative: string): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, relative);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function resolveVersionsFile(): string {
  const candidates = [
    path.resolve(process.cwd(), "infra/lore", VERSIONS_FILE_NAME),
    path.resolve(process.cwd(), "lore", VERSIONS_FILE_NAME),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return findUp(__dirname, path.join("infra", "lore", VERSIONS_FILE_NAME)) ?? candidates[0];
}

function resolveVerificationFile(): string {
  return path.join(path.dirname(resolveVersionsFile()), "verified-images.json");
}

function resolveReleaseVerificationFile(): string {
  return path.join(path.dirname(resolveVersionsFile()), "verified-releases.json");
}

function stringAt(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string in ${resolveVersionsFile()}`);
  return value;
}

/**
 * Bind a running image to independent scan/attestation evidence. Public
 * release additionally requires a signature and clean, matching source pins.
 */
export function assertVersionPinVerified(
  service: ImageService,
  image: string,
  desiredCount: number,
  platform: "linux/arm64" | "linux/amd64",
  requirePublicEvidence = false,
  expectedSource?: SourcePin,
): void {
  if (desiredCount < 1) return;
  const file = resolveVerificationFile();
  if (!fs.existsSync(file)) throw new Error(`${service} has no image-verification receipt at ${file}`);
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  let receipt: VerificationReceipt | undefined;
  let serviceBound = false;
  if (document?.schemaVersion === 2) {
    // Digest-keyed ledger: multiple digests per service coexist.
    receipt = document?.receipts?.[image] as VerificationReceipt | undefined;
    serviceBound = receipt?.service === service;
  } else if (document?.schemaVersion === 1 && typeof document?.images === "object") {
    console.warn(`${file} is legacy schemaVersion 1 — migrate to v2 via promote scripts`);
    receipt = document?.images?.[service] as VerificationReceipt | undefined;
    // Legacy receipts store the image inside the receipt; validate it matches.
    if (receipt && (receipt as { image?: string }).image !== undefined && (receipt as { image?: string }).image !== image) {
      receipt = undefined;
    }
    serviceBound = receipt !== undefined;
  } else {
    throw new Error(
      `${file} must be verification-ledger schemaVersion 1 or 2; ` +
        "regenerate receipts via infra/pulumi/scripts/verify-and-promote-image.sh",
    );
  }
  const scanPassed = (scan: VerificationReceipt["ecrScan"]): boolean =>
    scan?.critical === 0 && scan?.high === 0 &&
    typeof scan?.completedAt === "string" && scan.completedAt.length > 0;
  const valid = receipt !== undefined && serviceBound && receipt.platform === platform &&
    typeof receipt.platformDigest === "string" && SHA256_PATTERN.test(receipt.platformDigest) &&
    scanPassed(receipt.ecrScan) && scanPassed(receipt.trivyScan) &&
    typeof receipt.trivyScan?.scannerVersion === "string" &&
    receipt.sbomVerified === true && receipt.provenanceVerified === true &&
    typeof receipt.verifiedAt === "string" && receipt.verifiedAt.length > 0;
  if (!valid) {
    throw new Error(
      `${service} pin has no matching successful ECR/Trivy/SBOM/provenance receipt; ` +
        "run infra/pulumi/scripts/verify-and-promote-image.sh",
    );
  }
  if (!requirePublicEvidence) return;
  if (receipt?.signatureVerified !== true) {
    throw new Error(`${service} image signature is not verified; refusing public release`);
  }
  const sourceMatches = expectedSource !== undefined &&
    SHA_PATTERN.test(expectedSource.sourceCommit) &&
    receipt.sourceTreeClean === true &&
    receipt.sourceCommit === expectedSource.sourceCommit &&
    (expectedSource.packagingCommit === undefined ||
      (SHA_PATTERN.test(expectedSource.packagingCommit) &&
        receipt.packagingCommit === expectedSource.packagingCommit)) &&
    (expectedSource.protocolCommit === undefined ||
      (SHA_PATTERN.test(expectedSource.protocolCommit) &&
        receipt.protocolCommit === expectedSource.protocolCommit));
  if (!sourceMatches) {
    throw new Error(`${service} image is not bound to the clean source commits in versions.yaml`);
  }
}

/** Fail closed unless versions.yaml describes one complete compatible release. */
export function assertPublicReleaseApproved(release: ReleasePins): void {
  if (release.status !== "approved") {
    throw new Error(`versions.yaml release.status is ${release.status}; public release requires approved`);
  }
  if (!SEMVER_PATTERN.test(release.version) || !release.securityContract) {
    throw new Error("versions.yaml release version/security contract is incomplete");
  }
  const contracts = [
    release.napClient.securityContract,
    release.loreClient.securityContract,
    release.lore.securityContract,
    release.controlPlane.securityContract,
    ...(release.backend ? [release.backend.securityContract] : []),
  ];
  if (contracts.some(contract => contract !== release.securityContract)) {
    throw new Error("Nap, Lore client, Lore server, and control-plane security contracts do not match the release contract");
  }
  const nap = release.napClient;
  const napValid = SEMVER_PATTERN.test(nap.version) && nap.releaseTag === `v${nap.version}` &&
    SHA_PATTERN.test(nap.sourceCommit) && /^https:\/\//.test(nap.sourceRepository) &&
    /^https:\/\//.test(nap.artifactManifestUrl) && SHA256_PATTERN.test(nap.artifactManifestSha256) &&
    /^https:\/\//.test(nap.signatureBundleUrl) &&
    nap.loreClientVersion === release.loreClient.version;
  if (!napValid) {
    throw new Error("Nap client release is not commit-, checksum-, signature-, and Lore-client-pinned");
  }
  const loreClient = release.loreClient;
  const loreClientValid = SEMVER_PATTERN.test(loreClient.version) &&
    loreClient.releaseTag === `v${loreClient.version}` &&
    loreClient.sourceRepository === "https://github.com/portalshq/lore" &&
    loreClient.upstreamRepository === "https://github.com/EpicGames/lore" &&
    SHA_PATTERN.test(loreClient.sourceCommit) && SHA_PATTERN.test(loreClient.upstreamCommit) &&
    /^[a-f0-9]{64}$/.test(loreClient.installerSha256) &&
    /^https:\/\//.test(loreClient.artifactManifestUrl) &&
    SHA256_PATTERN.test(loreClient.artifactManifestSha256) &&
    /^https:\/\//.test(loreClient.signatureBundleUrl);
  if (!loreClientValid) {
    throw new Error("Lore client release is not fork-, upstream-, commit-, checksum-, and signature-pinned");
  }
  if (!SHA_PATTERN.test(release.lore.sourceCommit) ||
      !SHA_PATTERN.test(release.lore.packagingCommit ?? "") ||
      !SHA_PATTERN.test(release.controlPlane.sourceCommit) ||
      !SHA_PATTERN.test(release.controlPlane.protocolCommit ?? "") ||
      release.controlPlane.implementation !== "auth-gateway") {
    throw new Error("Lore/control-plane source pins are incomplete or select the retired implementation");
  }
}

/** Require a receipt produced by cryptographic Nap and Lore artifact checks. */
export function assertNapReleaseVerified(nap: NapClientPin, loreClient: LoreClientPin): void {
  const file = resolveReleaseVerificationFile();
  if (!fs.existsSync(file)) throw new Error(`Nap has no release-verification receipt at ${file}`);
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  const receipt = document?.schemaVersion === 1 ? document?.releases?.["nap-client"] : undefined;
  const valid = receipt?.version === nap.version && receipt?.sourceCommit === nap.sourceCommit &&
    receipt?.releaseTag === nap.releaseTag && receipt?.securityContract === nap.securityContract &&
    receipt?.artifactManifestSha256 === nap.artifactManifestSha256 &&
    receipt?.loreClientVersion === loreClient.version &&
    receipt?.loreClientSourceCommit === loreClient.sourceCommit &&
    receipt?.loreClientArtifactManifestSha256 === loreClient.artifactManifestSha256 &&
    receipt?.napSignatureVerified === true && receipt?.napChecksumsVerified === true &&
    receipt?.loreSignatureVerified === true &&
    typeof receipt?.verifiedAt === "string" && receipt.verifiedAt.length > 0;
  if (!valid) throw new Error("Nap/Lore client pins have no matching cryptographic verification receipt");
}

/**
 * Fail closed once the v2 ledger exists: every pinned image must have a
 * matching receipt. Legacy-schema ledgers are skipped with a warning until
 * regenerated.
 */
export function assertPinsHaveReceipts(pins: VersionPins): void {
  const file = resolveVerificationFile();
  if (!fs.existsSync(file)) return;
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  if (document?.schemaVersion !== 2) {
    console.warn(`pin-receipt consistency skipped: ${file} is still legacy schema`);
    return;
  }
  for (const [service, image] of [
    ["lore", pins.loreImageUri],
    ["control-plane", pins.controlPlaneImageUri],
    ...(pins.backendImageUri ? [["backend", pins.backendImageUri] as const] : []),
  ] as const) {
    const receipt = document?.receipts?.[image];
    if (!receipt) {
      throw new Error(
        `${service} pin ${image} has no matching receipt in ${file}; ` +
          "run infra/pulumi/scripts/verify-and-promote-image.sh",
      );
    }
  }
}

/** Read the single deployment/release bill of materials. */
export function readVersionPins(): VersionPins {
  const file = resolveVersionsFile();
  if (!fs.existsSync(file)) throw new Error(`versions.yaml not found (looked for ${file})`);
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));
  if (doc?.schema_version !== 2) throw new Error(`versions.yaml schema_version must be 2 in ${file}`);

  const nap = doc?.["nap-client"];
  const loreClient = doc?.["lore-client"];
  const lore = doc?.lore;
  const controlPlane = doc?.["control-plane"];
  const backend = doc?.backend;
  const releaseDoc = doc?.release;
  const legacy = doc?.["legacy-control-plane"];
  if (legacy?.status !== "retired" || legacy?.image !== "") {
    throw new Error("legacy-control-plane must remain retired with an empty image pin");
  }

  const release: ReleasePins = {
    version: stringAt(releaseDoc?.version, "release.version"),
    status: stringAt(releaseDoc?.status, "release.status"),
    securityContract: stringAt(releaseDoc?.security_contract, "release.security_contract"),
    napClient: {
      version: stringAt(nap?.version, "nap-client.version"),
      sourceRepository: stringAt(nap?.source_repository, "nap-client.source_repository"),
      sourceCommit: stringAt(nap?.source_commit, "nap-client.source_commit"),
      releaseTag: stringAt(nap?.release_tag, "nap-client.release_tag"),
      securityContract: stringAt(nap?.security_contract, "nap-client.security_contract"),
      artifactManifestUrl: stringAt(nap?.artifact_manifest_url, "nap-client.artifact_manifest_url"),
      artifactManifestSha256: stringAt(nap?.artifact_manifest_sha256, "nap-client.artifact_manifest_sha256"),
      signatureBundleUrl: stringAt(nap?.signature_bundle_url, "nap-client.signature_bundle_url"),
      loreClientVersion: stringAt(nap?.lore_client_version, "nap-client.lore_client_version"),
    },
    loreClient: {
      version: stringAt(loreClient?.version, "lore-client.version"),
      sourceRepository: stringAt(loreClient?.source_repository, "lore-client.source_repository"),
      sourceCommit: stringAt(loreClient?.source_commit, "lore-client.source_commit"),
      upstreamRepository: stringAt(loreClient?.upstream_repository, "lore-client.upstream_repository"),
      upstreamCommit: stringAt(loreClient?.upstream_commit, "lore-client.upstream_commit"),
      releaseTag: stringAt(loreClient?.release_tag, "lore-client.release_tag"),
      securityContract: stringAt(loreClient?.security_contract, "lore-client.security_contract"),
      installerSha256: stringAt(loreClient?.installer_sha256, "lore-client.installer_sha256"),
      artifactManifestUrl: stringAt(loreClient?.artifact_manifest_url, "lore-client.artifact_manifest_url"),
      artifactManifestSha256: stringAt(
        loreClient?.artifact_manifest_sha256,
        "lore-client.artifact_manifest_sha256",
      ),
      signatureBundleUrl: stringAt(loreClient?.signature_bundle_url, "lore-client.signature_bundle_url"),
    },
    lore: {
      sourceCommit: stringAt(lore?.source_commit, "lore.source_commit"),
      packagingCommit: stringAt(lore?.packaging_commit, "lore.packaging_commit"),
      securityContract: stringAt(lore?.security_contract, "lore.security_contract"),
    },
    controlPlane: {
      implementation: stringAt(controlPlane?.implementation, "control-plane.implementation"),
      sourceCommit: stringAt(controlPlane?.source_commit, "control-plane.source_commit"),
      protocolCommit: stringAt(controlPlane?.protocol_commit, "control-plane.protocol_commit"),
      securityContract: stringAt(controlPlane?.security_contract, "control-plane.security_contract"),
    },
    ...(backend ? {
      backend: {
        sourceCommit: stringAt(backend?.source_commit, "backend.source_commit"),
        securityContract: stringAt(backend?.security_contract, "backend.security_contract"),
      },
    } : {}),
  };

  return {
    loreImageUri: stringAt(lore?.image, "lore.image"),
    controlPlaneImageUri: stringAt(controlPlane?.image, "control-plane.image"),
    backendImageUri: backend ? stringAt(backend?.image, "backend.image") : "",
    release,
  };
}
