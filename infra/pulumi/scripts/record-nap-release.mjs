#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const [metadataFile, releaseBaseUrl, verifiedLoreSourceCommit] = process.argv.slice(2);
if (!metadataFile || !/^https:\/\//.test(releaseBaseUrl ?? "") ||
    !/^[a-f0-9]{40}$/.test(verifiedLoreSourceCommit ?? "")) {
  console.error(
    "usage: record-nap-release.mjs <verified-release-metadata.json> " +
      "<https-release-base-url> <verified-lore-source-commit>",
  );
  process.exit(2);
}

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const commitPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
if (metadata.schema_version !== 1 || !semverPattern.test(metadata.version ?? "") ||
    metadata.release_tag !== `v${metadata.version}` ||
    !commitPattern.test(metadata.source_commit ?? "") ||
    metadata.security_contract !== "lore-auth-v1" ||
    !digestPattern.test(metadata.artifact_manifest_sha256 ?? "") ||
    metadata.lore_client_repository !== "portalshq/lore" ||
    !semverPattern.test(metadata.lore_client_version ?? "") ||
    !/^[a-f0-9]{64}$/.test(metadata.lore_client_installer_sha256 ?? "") ||
    !/^https:\/\//.test(metadata.lore_client_artifact_manifest_url ?? "") ||
    !digestPattern.test(metadata.lore_client_artifact_manifest_sha256 ?? "") ||
    !/^https:\/\//.test(metadata.lore_client_signature_bundle_url ?? "")) {
  throw new Error("verified Nap metadata is incomplete or incompatible");
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const versionsFile = path.resolve(scriptDir, "../../lore/versions.yaml");
const receiptsFile = path.resolve(scriptDir, "../../lore/verified-releases.json");
const versions = YAML.parseDocument(fs.readFileSync(versionsFile, "utf8"));
if (versions.getIn(["schema_version"]) !== 2) {
  throw new Error("versions.yaml schema_version must be 2");
}
const loreClient = versions.getIn(["lore-client"]);
if (!loreClient ||
    loreClient.get("source_repository") !== "https://github.com/portalshq/lore" ||
    loreClient.get("source_commit") !== verifiedLoreSourceCommit ||
    loreClient.get("version") !== metadata.lore_client_version ||
    loreClient.get("release_tag") !== `v${metadata.lore_client_version}` ||
    loreClient.get("installer_sha256") !== metadata.lore_client_installer_sha256 ||
    loreClient.get("artifact_manifest_url") !== metadata.lore_client_artifact_manifest_url ||
    loreClient.get("artifact_manifest_sha256") !== metadata.lore_client_artifact_manifest_sha256 ||
    loreClient.get("signature_bundle_url") !== metadata.lore_client_signature_bundle_url) {
  throw new Error(
    "Nap metadata does not match the independently promoted top-level lore-client release",
  );
}
versions.setIn(["nap-client", "version"], metadata.version);
versions.setIn(["nap-client", "source_commit"], metadata.source_commit);
versions.setIn(["nap-client", "release_tag"], metadata.release_tag);
versions.setIn(["nap-client", "security_contract"], metadata.security_contract);
versions.setIn(["nap-client", "artifact_manifest_url"], `${releaseBaseUrl}/SHA256SUMS`);
versions.setIn(["nap-client", "artifact_manifest_sha256"], metadata.artifact_manifest_sha256);
versions.setIn(["nap-client", "signature_bundle_url"], `${releaseBaseUrl}/SHA256SUMS.sigstore.json`);
versions.setIn(["nap-client", "lore_client_version"], metadata.lore_client_version);
fs.writeFileSync(`${versionsFile}.tmp`, versions.toString());
fs.renameSync(`${versionsFile}.tmp`, versionsFile);
const receipts = fs.existsSync(receiptsFile)
  ? JSON.parse(fs.readFileSync(receiptsFile, "utf8"))
  : { schemaVersion: 1, releases: {} };
if (receipts.schemaVersion !== 1 || typeof receipts.releases !== "object") {
  throw new Error(`unsupported release receipt schema in ${receiptsFile}`);
}
receipts.releases["nap-client"] = {
  version: metadata.version,
  sourceCommit: metadata.source_commit,
  releaseTag: metadata.release_tag,
  securityContract: metadata.security_contract,
  artifactManifestSha256: metadata.artifact_manifest_sha256,
  loreClientVersion: metadata.lore_client_version,
  loreClientSourceCommit: verifiedLoreSourceCommit,
  loreClientArtifactManifestSha256: metadata.lore_client_artifact_manifest_sha256,
  napSignatureVerified: true,
  napChecksumsVerified: true,
  loreSignatureVerified: true,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(`${receiptsFile}.tmp`, `${JSON.stringify(receipts, null, 2)}\n`);
fs.renameSync(`${receiptsFile}.tmp`, receiptsFile);
console.log(`Nap ${metadata.version} promoted from ${metadata.source_commit}`);
