#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { atomicWriteJson, atomicWriteYaml, readJsonObject, readYamlDocument } from "./version-file-utils.mjs";

const [image, baseImage, platformDigest, sourceCommit, packagingCommit, buildId, trivyVersion, signatureIdentity, signatureIssuer, bundleSha256] = process.argv.slice(2);
const digest = /^sha256:[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const imagePattern = /^portalshq\/lore@sha256:[a-f0-9]{64}$/;

if (!imagePattern.test(image ?? "") || !imagePattern.test(baseImage ?? "") || !digest.test(platformDigest ?? "") ||
    !commit.test(sourceCommit ?? "") || !commit.test(packagingCommit ?? "") || !/^[A-Za-z0-9._-]{1,64}$/.test(buildId ?? "") ||
    !trivyVersion || !signatureIdentity || signatureIssuer !== "https://token.actions.githubusercontent.com" || !digest.test(bundleSha256 ?? "")) {
  console.error("usage: record-verified-dockerhub-lore.mjs <image> <base-image> <platform-digest> <source-commit> <packaging-commit> <build-id> <trivy-version> <signature-identity> <github-oidc-issuer> <bundle-sha256>");
  process.exit(2);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(scriptDir, "../../..");
const versionsFile = path.join(repoRoot, "infra/lore/versions.yaml");
const receiptsFile = path.join(repoRoot, "infra/lore/verified-dockerhub-images.json");
const versions = readYamlDocument(versionsFile);
if (versions.getIn(["mac-lore", "platform"]) !== "linux/amd64") throw new Error("mac-lore must target linux/amd64");

let ledger = fs.existsSync(receiptsFile) ? readJsonObject(receiptsFile) : { schemaVersion: 1, receipts: {} };
if (ledger.schemaVersion !== 1 || ledger.receipts === null || Array.isArray(ledger.receipts) || typeof ledger.receipts !== "object") {
  throw new Error(`unsupported Docker Hub receipt schema in ${receiptsFile}`);
}

const verifiedAt = new Date().toISOString();
ledger.receipts[image] = {
  service: "lore",
  platform: "linux/amd64",
  indexDigest: image.slice(image.indexOf("@") + 1),
  platformDigest,
  baseImage,
  sourceCommit,
  packagingCommit,
  buildId,
  signature: { identity: signatureIdentity, issuer: signatureIssuer, bundleSha256 },
  sbomReference: `${image}#sbom`,
  provenanceReference: `${image}#provenance`,
  trivyScan: { critical: 0, high: 0, scannerVersion: trivyVersion, completedAt: verifiedAt },
  verifiedAt,
};

versions.setIn(["mac-lore", "source_commit"], sourceCommit);
versions.setIn(["mac-lore", "packaging_commit"], packagingCommit);
versions.setIn(["mac-lore", "base_image"], baseImage);
versions.setIn(["mac-lore", "image"], image);
versions.setIn(["mac-lore", "receipt_key"], image);

atomicWriteJson(receiptsFile, ledger);
atomicWriteYaml(versionsFile, versions);
console.log(`Docker Hub Lore promoted to ${image} from clean source ${sourceCommit}`);
