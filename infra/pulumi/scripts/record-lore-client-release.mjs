#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const [tag, sourceCommit, installerSha256, releaseBaseUrl, manifestSha256] = process.argv.slice(2);
const tagPattern = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const match = tagPattern.exec(tag ?? "");
if (!match || !/^[a-f0-9]{40}$/.test(sourceCommit ?? "") ||
    !/^[a-f0-9]{64}$/.test(installerSha256 ?? "") ||
    releaseBaseUrl !== `https://github.com/portalshq/lore/releases/download/${tag}` ||
    !/^sha256:[a-f0-9]{64}$/.test(manifestSha256 ?? "")) {
  console.error(
    "usage: record-lore-client-release.mjs <vX.Y.Z> <source-commit> " +
      "<installer-sha256> <trusted-release-base-url> <sha256:manifest-digest>",
  );
  process.exit(2);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const versionsFile = path.resolve(scriptDir, "../../lore/versions.yaml");
const versions = YAML.parseDocument(fs.readFileSync(versionsFile, "utf8"));
if (versions.getIn(["schema_version"]) !== 2 ||
    versions.getIn(["lore-client", "source_repository"]) !== "https://github.com/portalshq/lore" ||
    versions.getIn(["lore-client", "upstream_repository"]) !== "https://github.com/EpicGames/lore" ||
    !/^[a-f0-9]{40}$/.test(versions.getIn(["lore-client", "upstream_commit"]) ?? "")) {
  throw new Error("versions.yaml has no valid pinned Lore fork/upstream relationship");
}

const version = match[1];
versions.setIn(["lore-client", "version"], version);
versions.setIn(["lore-client", "source_commit"], sourceCommit);
versions.setIn(["lore-client", "release_tag"], tag);
versions.setIn(["lore-client", "security_contract"], "lore-auth-v1");
versions.setIn(["lore-client", "installer_sha256"], installerSha256);
versions.setIn(["lore-client", "artifact_manifest_url"], `${releaseBaseUrl}/SHA256SUMS`);
versions.setIn(["lore-client", "artifact_manifest_sha256"], manifestSha256);
versions.setIn(["lore-client", "signature_bundle_url"], `${releaseBaseUrl}/SHA256SUMS.sigstore.json`);
fs.writeFileSync(`${versionsFile}.tmp`, versions.toString());
fs.renameSync(`${versionsFile}.tmp`, versionsFile);
console.log(`Lore client ${version} promoted from ${sourceCommit}; upstream pin unchanged`);
