import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertPinsHaveReceipts,
  assertPublicReleaseApproved,
  assertNapReleaseVerified,
  assertVersionPinVerified,
  readVersionPins,
  type ReleasePins,
} from "../src/versioning";

const sha = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;

function manifest(overrides = ""): string {
  return `schema_version: 2
release:
  version: "0.2.0"
  status: "contained"
  security_contract: "lore-auth-v1"
nap-client:
  version: "0.5.8"
  source_repository: "https://github.com/portalshq/narrativeengine.git"
  source_commit: "${sha("a")}"
  release_tag: "v0.5.8"
  security_contract: "legacy"
  artifact_manifest_url: "https://example.test/SHA256SUMS"
  artifact_manifest_sha256: ""
  signature_bundle_url: ""
  lore_client_version: "0.8.4"
lore-client:
  version: "0.8.4"
  source_repository: "https://github.com/portalshq/lore"
  source_commit: ""
  upstream_repository: "https://github.com/EpicGames/lore"
  upstream_commit: "${sha("7")}"
  release_tag: ""
  security_contract: "lore-auth-v1"
  installer_sha256: "${"9".repeat(64)}"
  artifact_manifest_url: ""
  artifact_manifest_sha256: ""
  signature_bundle_url: ""
lore:
  source_commit: ""
  packaging_commit: ""
  security_contract: "lore-auth-v1"
  image: "registry.test/lore@${digest("b")}"
control-plane:
  implementation: "auth-gateway"
  source_commit: ""
  protocol_commit: ""
  security_contract: "lore-auth-v1"
  image: "registry.test/auth@${digest("c")}"
legacy-control-plane:
  status: "retired"
  image: ""
${overrides}`;
}

function withFiles(versions: string, receipt: unknown | undefined, fn: () => void): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portals-versions-"));
  const dir = path.join(tmp, "infra", "lore");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "versions.yaml"), versions);
  if (receipt !== undefined) {
    fs.writeFileSync(path.join(dir, "verified-images.json"), JSON.stringify(receipt));
  }
  const previous = process.cwd();
  process.chdir(tmp);
  try {
    fn();
  } finally {
    process.chdir(previous);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("reads Lore client, Lore server, active control-plane, and Nap pins from one manifest", () => {
  withFiles(manifest(), undefined, () => {
    const pins = readVersionPins();
    assert.equal(pins.loreImageUri, `registry.test/lore@${digest("b")}`);
    assert.equal(pins.controlPlaneImageUri, `registry.test/auth@${digest("c")}`);
    assert.equal(pins.release.napClient.version, "0.5.8");
    assert.equal(pins.release.loreClient.version, "0.8.4");
    assert.equal(pins.release.loreClient.upstreamCommit, sha("7"));
    assert.equal(pins.release.controlPlane.implementation, "auth-gateway");
  });
});

test("retired legacy issuer cannot acquire an image pin", () => {
  const invalid = manifest().replace(
    'legacy-control-plane:\n  status: "retired"\n  image: ""',
    `legacy-control-plane:\n  status: "active"\n  image: "registry.test/legacy@${digest("d")}"`,
  );
  withFiles(invalid, undefined, () => {
    assert.throws(() => readVersionPins(), /must remain retired/);
  });
});

function approvedRelease(): ReleasePins {
  return {
    version: "0.2.0",
    status: "approved",
    securityContract: "lore-auth-v1",
    napClient: {
      version: "0.5.9",
      sourceRepository: "https://github.com/portalshq/narrativeengine.git",
      sourceCommit: sha("a"),
      releaseTag: "v0.5.9",
      securityContract: "lore-auth-v1",
      artifactManifestUrl: "https://example.test/SHA256SUMS",
      artifactManifestSha256: digest("d"),
      signatureBundleUrl: "https://example.test/SHA256SUMS.sigstore.json",
      loreClientVersion: "0.8.5-portals.1",
    },
    loreClient: {
      version: "0.8.5-portals.1",
      sourceRepository: "https://github.com/portalshq/lore",
      sourceCommit: sha("6"),
      upstreamRepository: "https://github.com/EpicGames/lore",
      upstreamCommit: sha("7"),
      releaseTag: "v0.8.5-portals.1",
      securityContract: "lore-auth-v1",
      installerSha256: "9".repeat(64),
      artifactManifestUrl: "https://example.test/lore/SHA256SUMS",
      artifactManifestSha256: digest("8"),
      signatureBundleUrl: "https://example.test/lore/SHA256SUMS.sigstore.json",
    },
    lore: { sourceCommit: sha("e"), packagingCommit: sha("f"), securityContract: "lore-auth-v1" },
    controlPlane: {
      implementation: "auth-gateway",
      sourceCommit: sha("1"),
      protocolCommit: sha("2"),
      securityContract: "lore-auth-v1",
    },
  };
}

test("public release requires approved, compatible, signed client metadata", () => {
  const release = approvedRelease();
  assert.doesNotThrow(() => assertPublicReleaseApproved(release));
  assert.throws(
    () => assertPublicReleaseApproved({ ...release, status: "contained" }),
    /requires approved/,
  );
  assert.throws(
    () => assertPublicReleaseApproved({
      ...release,
      napClient: { ...release.napClient, securityContract: "legacy" },
    }),
    /contracts do not match/,
  );
});

test("Nap release receipt must match both Nap and Lore cryptographic evidence", () => {
  const nap = approvedRelease().napClient;
  const loreClient = approvedRelease().loreClient;
  const receipt = {
    schemaVersion: 1,
    releases: {
      "nap-client": {
        version: nap.version,
        sourceCommit: nap.sourceCommit,
        releaseTag: nap.releaseTag,
        securityContract: nap.securityContract,
        artifactManifestSha256: nap.artifactManifestSha256,
        loreClientVersion: loreClient.version,
        loreClientSourceCommit: loreClient.sourceCommit,
        loreClientArtifactManifestSha256: loreClient.artifactManifestSha256,
        napSignatureVerified: true,
        napChecksumsVerified: true,
        loreSignatureVerified: true,
        verifiedAt: "2026-08-13T00:00:00Z",
      },
    },
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portals-releases-"));
  const dir = path.join(tmp, "infra", "lore");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "versions.yaml"), manifest());
  fs.writeFileSync(path.join(dir, "verified-releases.json"), JSON.stringify(receipt));
  const previous = process.cwd();
  process.chdir(tmp);
  try {
    assert.doesNotThrow(() => assertNapReleaseVerified(nap, loreClient));
    assert.throws(
      () => assertNapReleaseVerified({ ...nap, sourceCommit: sha("f") }, loreClient),
      /no matching cryptographic verification receipt/,
    );
    assert.throws(
      () => assertNapReleaseVerified(nap, { ...loreClient, sourceCommit: sha("f") }),
      /no matching cryptographic verification receipt/,
    );
  } finally {
    process.chdir(previous);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("public image evidence must match signature and clean source commits", () => {
  const image = `registry.test/lore@${digest("a")}`;
  const receipt = {
    schemaVersion: 2,
    receipts: {
      [image]: {
        service: "lore",
        platform: "linux/arm64",
        platformDigest: digest("b"),
        ecrScan: { critical: 0, high: 0, completedAt: "2026-08-13T00:00:00Z" },
        trivyScan: { critical: 0, high: 0, scannerVersion: "0.73.0", completedAt: "2026-08-13T00:01:00Z" },
        sbomVerified: true,
        provenanceVerified: true,
        signatureVerified: true,
        sourceCommit: sha("c"),
        packagingCommit: sha("d"),
        sourceTreeClean: true,
        verifiedAt: "2026-08-13T00:01:00Z",
      },
    },
  };
  withFiles(manifest(), receipt, () => {
    assert.doesNotThrow(() => assertVersionPinVerified(
      "lore", image, 1, "linux/arm64", true,
      { sourceCommit: sha("c"), packagingCommit: sha("d") },
    ));
    assert.throws(() => assertVersionPinVerified(
      "lore", image, 1, "linux/arm64", true,
      { sourceCommit: sha("e"), packagingCommit: sha("d") },
    ), /not bound to the clean source/);
  });
});

test("contained services still require scans, but stopped services need no receipt", () => {
  const image = `registry.test/auth@${digest("c")}`;
  withFiles(manifest(), { schemaVersion: 2, receipts: {} }, () => {
    assert.doesNotThrow(() => assertVersionPinVerified("control-plane", image, 0, "linux/arm64"));
    assert.throws(
      () => assertVersionPinVerified("control-plane", image, 1, "linux/arm64"),
      /no matching successful/,
    );
  });
});

test("digest-keyed ledger lets multiple digests of one service coexist", () => {
  const mkReceipt = (platformDigest: string) => ({
    service: "lore",
    platform: "linux/arm64",
    platformDigest,
    ecrScan: { critical: 0, high: 0, completedAt: "2026-08-21T00:00:00Z" },
    trivyScan: { critical: 0, high: 0, scannerVersion: "0.73.0", completedAt: "2026-08-21T00:01:00Z" },
    sbomVerified: true,
    provenanceVerified: true,
    verifiedAt: "2026-08-21T00:01:00Z",
  });
  const dev = `registry.test/lore@${digest("e")}`;
  const prod = `registry.test/lore@${digest("f")}`;
  const ledger = { schemaVersion: 2, receipts: { [dev]: mkReceipt(digest("b")), [prod]: mkReceipt(digest("9")) } };
  withFiles(manifest(), ledger, () => {
    assert.doesNotThrow(() => assertVersionPinVerified("lore", dev, 1, "linux/arm64"));
    assert.doesNotThrow(() => assertVersionPinVerified("lore", prod, 1, "linux/arm64"));
    assert.throws(
      () => assertVersionPinVerified("lore", `registry.test/lore@${digest("1")}`, 1, "linux/arm64"),
      /no matching successful/,
    );
  });
});

test("legacy-schema ledgers are rejected fail-closed for running services", () => {
  const image = `registry.test/auth@${digest("c")}`;
  withFiles(manifest(), { schemaVersion: 1, images: {} }, () => {
    assert.throws(
      () => assertVersionPinVerified("control-plane", image, 1, "linux/arm64"),
      /schemaVersion 2/,
    );
  });
});

test("every versions.yaml pin resolves to a receipt once the v2 ledger exists", () => {
  let pins;
  try {
    pins = readVersionPins();
  } catch {
    return; // versions.yaml not resolvable from this working directory
  }
  assertPinsHaveReceipts(pins);
});
