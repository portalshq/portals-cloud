#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const [service, image, platform, platformDigest, ecrCompletedAt, trivyVersion,
  signatureVerified = "false", sourceCommit, sourceTreeClean,
  packagingCommit = "", protocolCommit = ""] = process.argv.slice(2);
const allowedServices = new Set(["lore", "control-plane"]);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const sourcePinsValid = commitPattern.test(sourceCommit ?? "") && sourceTreeClean === "true" &&
  (service !== "lore" || commitPattern.test(packagingCommit)) &&
  (service !== "control-plane" || commitPattern.test(protocolCommit));

if (!allowedServices.has(service) ||
    !/^.+@sha256:[a-f0-9]{64}$/.test(image ?? "") ||
    !/^linux\/(arm64|amd64)$/.test(platform ?? "") ||
    !digestPattern.test(platformDigest ?? "") ||
    !ecrCompletedAt || !trivyVersion ||
    !["true", "false"].includes(signatureVerified) || !sourcePinsValid) {
  console.error(
    "usage: record-verified-image.mjs <lore|control-plane> <image@sha256> <linux/arch> " +
      "<platform-sha256> <ecr-completed-at> <trivy-version> <signature-verified> " +
      "<source-commit> true [packaging-commit] [protocol-commit]",
  );
  process.exit(2);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(scriptDir, "../../..");
const versionsFile = path.join(repoRoot, "infra/lore/versions.yaml");
const receiptsFile = path.join(repoRoot, "infra/lore/verified-images.json");
const now = new Date().toISOString();

const versions = YAML.parseDocument(fs.readFileSync(versionsFile, "utf8"));
if (versions.getIn([service, "image"]) === undefined) {
  throw new Error(`cannot find ${service}.image in ${versionsFile}`);
}
versions.setIn([service, "image"], image);
versions.setIn([service, "source_commit"], sourceCommit);
if (service === "lore") versions.setIn([service, "packaging_commit"], packagingCommit);
if (service === "control-plane") versions.setIn([service, "protocol_commit"], protocolCommit);

let receipts;
if (fs.existsSync(receiptsFile)) {
  receipts = JSON.parse(fs.readFileSync(receiptsFile, "utf8"));
} else {
  receipts = { schemaVersion: 2, receipts: {} };
}
if (receipts.schemaVersion === 1) {
  // Legacy component-keyed entries describe superseded dirty-source dev
  // digests; the first v2 promotion replaces them wholesale.
  console.warn(`migrating legacy schema-v1 ${receiptsFile}: discarding stale entries`);
  receipts = { schemaVersion: 2, receipts: {} };
}
if (receipts.schemaVersion !== 2 || typeof receipts.receipts !== "object") {
  throw new Error(`unsupported verification receipt schema in ${receiptsFile}`);
}

// Append-only digest-keyed ledger: multiple digests per component (dev/prod,
// successive releases) coexist; lookups are by exact pinned image URI.
receipts.receipts[image] = {
  service,
  platform,
  platformDigest,
  ecrScan: { critical: 0, high: 0, completedAt: ecrCompletedAt },
  trivyScan: { critical: 0, high: 0, scannerVersion: trivyVersion, completedAt: now },
  sbomVerified: true,
  provenanceVerified: true,
  signatureVerified: signatureVerified === "true",
  sourceCommit,
  ...(service === "lore" ? { packagingCommit } : { protocolCommit }),
  sourceTreeClean: true,
  verifiedAt: now,
};

fs.writeFileSync(`${versionsFile}.tmp`, versions.toString());
fs.renameSync(`${versionsFile}.tmp`, versionsFile);
fs.writeFileSync(`${receiptsFile}.tmp`, `${JSON.stringify(receipts, null, 2)}\n`);
fs.renameSync(`${receiptsFile}.tmp`, receiptsFile);

console.log(`${service} promoted to ${image} from clean source ${sourceCommit}`);
