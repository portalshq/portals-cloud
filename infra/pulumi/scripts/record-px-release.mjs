#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { atomicWriteYaml, readYamlDocument } from "./version-file-utils.mjs";

const [metadataFile, releaseBaseUrl, verifiedLoreSourceCommit] = process.argv.slice(2);
if (!metadataFile || !/^https:\/\//.test(releaseBaseUrl ?? "") ||
    !/^[a-f0-9]{40}$/.test(verifiedLoreSourceCommit ?? "")) {
  console.error(
    "usage: record-px-release.mjs <verified-release-metadata.json> " +
      "<https-release-base-url> <verified-lore-source-commit>",
  );
  process.exit(2);
}

const metadata = readJsonObject(metadataFile);
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
  throw new Error("verified Px metadata is incomplete or incompatible");
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const versionsFile = path.resolve(scriptDir, "../../lore/versions.yaml");
const versions = readYamlDocument(versionsFile);
if (versions.getIn(["schema_version"]) !== 3) {
  throw new Error("versions.yaml schema_version must be 3");
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
    "Px metadata does not match the independently promoted top-level lore-client release",
  );
}
versions.setIn(["px-client", "version"], metadata.version);
versions.setIn(["px-client", "source_repository"], "https://github.com/portalshq/px.git");
versions.setIn(["px-client", "source_commit"], metadata.source_commit);
versions.setIn(["px-client", "release_tag"], metadata.release_tag);
versions.setIn(["px-client", "security_contract"], metadata.security_contract);
versions.setIn(["px-client", "artifact_manifest_url"], `${releaseBaseUrl}/SHA256SUMS`);
versions.setIn(["px-client", "artifact_manifest_sha256"], metadata.artifact_manifest_sha256);
versions.setIn(["px-client", "signature_bundle_url"], `${releaseBaseUrl}/SHA256SUMS.sigstore.json`);
versions.setIn(["px-client", "lore_client_version"], metadata.lore_client_version);
versions.setIn(["px-client", "verification"], {
  verified_at: new Date().toISOString(),
  verifier: "portalshq/portals-cloud/.github/workflows/promote-px-release.yml",
  px: {
    source_commit: metadata.source_commit,
    release_tag: metadata.release_tag,
    security_contract: metadata.security_contract,
    artifact_manifest_sha256: metadata.artifact_manifest_sha256,
    signature_bundle_url: `${releaseBaseUrl}/SHA256SUMS.sigstore.json`,
    signature_verified: true,
    checksums_verified: true,
  },
  lore_client: {
    version: metadata.lore_client_version,
    source_commit: verifiedLoreSourceCommit,
    artifact_manifest_sha256: metadata.lore_client_artifact_manifest_sha256,
    signature_bundle_url: metadata.lore_client_signature_bundle_url,
    signature_verified: true,
    checksums_verified: true,
  },
});
// The selected versions and the evidence that verified them now share one
// atomic, reviewable YAML document.
atomicWriteYaml(versionsFile, versions);
console.log(`Px ${metadata.version} promoted from ${metadata.source_commit}`);
