#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { atomicWriteYaml, readYamlDocument } from "./version-file-utils.mjs";

const [action, service, field, value] = process.argv.slice(2);
const writablePins = new Set(["lore:base_image", "control-plane:image"]);
const pinKey = `${service}:${field}`;
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const versionsFile = path.resolve(scriptDir, "../../lore/versions.yaml");

if (!["get", "set"].includes(action) || !writablePins.has(pinKey) ||
    (action === "get" && value !== undefined) ||
    (action === "set" && (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9./:@_-]*$/.test(value)))) {
  console.error("usage: update-version-pin.mjs <get|set> <lore|control-plane> <base_image|image> [image-reference]");
  process.exit(2);
}

const versions = readYamlDocument(versionsFile);
if (versions.getIn(["schema_version"]) !== 2 || versions.getIn([service, field]) === undefined) {
  throw new Error(`cannot find ${service}.${field} in schema-v2 ${versionsFile}`);
}

if (action === "get") {
  const current = versions.getIn([service, field]);
  if (typeof current !== "string" || current.trim() === "") {
    throw new Error(`${service}.${field} is empty in ${versionsFile}`);
  }
  process.stdout.write(`${current}\n`);
} else {
  versions.setIn([service, field], value);
  atomicWriteYaml(versionsFile, versions);
}
