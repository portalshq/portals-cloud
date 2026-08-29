#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { atomicWriteJson, atomicWriteYaml, readJsonObject, readYamlDocument } from "./version-file-utils.mjs";

const [service, image, platform, platformDigest, ecrCompletedAt, trivyVersion,
  signatureVerified = "false", sourceCommit, sourceTreeClean,
  packagingCommit = "", protocolCommit = "", baseImage = ""] = process.argv.slice(2);
const allowedServices = new Set(["lore", "control-plane", "backend"]);
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
    "usage: record-verified-image.mjs <lore|control-plane|backend> <image@sha256> <linux/arch> " +
      "<platform-sha256> <ecr-completed-at> <trivy-version> <signature-verified> " +
      "<source-commit> true [packaging-commit] [protocol-commit] [lore-base-image@sha256]",
  );
  process.exit(2);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(scriptDir, "../../..");
const versionsFile = path.join(repoRoot, "infra/lore/versions.yaml");
const receiptsFile = path.join(repoRoot, "infra/lore/verified-images.json");
const now = new Date().toISOString();

const versions = readYamlDocument(versionsFile);
if (service === "backend" && versions.getIn(["backend"]) === undefined) {
  // yaml.Document#setIn stores a plain object as one scalar node; a later
  // nested getIn cannot traverse it until serialization. Create each map path
  // explicitly so first-time Backend promotion is validated before any write.
  versions.setIn(["backend", "source_repository"], "https://github.com/DigitalCreationsCo/portals-cloud.git");
  versions.setIn(["backend", "source_commit"], "");
  versions.setIn(["backend", "security_contract"], versions.getIn(["release", "security_contract"]));
  versions.setIn(["backend", "image"], "");
}
if (versions.getIn([service, "image"]) === undefined) {
  throw new Error(`cannot find ${service}.image in ${versionsFile}`);
}
versions.setIn([service, "image"], image);
versions.setIn([service, "source_commit"], sourceCommit);
if (service === "lore") versions.setIn([service, "packaging_commit"], packagingCommit);
if (service === "control-plane") versions.setIn([service, "protocol_commit"], protocolCommit);
if (baseImage !== "") {
  if (service !== "lore" || !/^.+@sha256:[a-f0-9]{64}$/.test(baseImage)) {
    throw new Error("only Lore may update a sha256-pinned base image");
  }
  versions.setIn(["lore", "base_image"], baseImage);
}

let receipts = fs.existsSync(receiptsFile)
  ? readJsonObject(receiptsFile)
  : { schemaVersion: 2, receipts: {} };
if (receipts.schemaVersion === 1) {
  // Legacy component-keyed entries describe superseded dirty-source dev
  // digests; the first v2 promotion replaces them wholesale.
  console.warn(`migrating legacy schema-v1 ${receiptsFile}: discarding stale entries`);
  receipts = { schemaVersion: 2, receipts: {} };
}
if (receipts.schemaVersion !== 2 || receipts.receipts === null ||
    Array.isArray(receipts.receipts) || typeof receipts.receipts !== "object") {
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
  ...(service === "lore" ? { packagingCommit } : {}),
  ...(service === "control-plane" ? { protocolCommit } : {}),
  sourceTreeClean: true,
  verifiedAt: now,
};

// Publish the receipt before the BOM pin: an interrupted run may leave an
// unreferenced receipt, but can never pin an image without its evidence.
atomicWriteJson(receiptsFile, receipts);
atomicWriteYaml(versionsFile, versions);

console.log(`${service} promoted to ${image} from clean source ${sourceCommit}`);
