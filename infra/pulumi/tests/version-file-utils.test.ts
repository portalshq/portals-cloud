import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
test("version-file writers reject malformed input and never write empty files", async () => {
  const utilities = await import("../scripts/version-file-utils.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "portals-version-files-"));
  try {
    const yamlFile = path.join(directory, "versions.yaml");
    const jsonFile = path.join(directory, "receipts.json");
    fs.writeFileSync(yamlFile, "lore: [broken\n", "utf8");
    fs.writeFileSync(jsonFile, "", "utf8");

    assert.throws(() => utilities.readYamlDocument(yamlFile), /YAML parse errors/);
    assert.throws(() => utilities.readJsonObject(jsonFile), /invalid JSON/);
    assert.throws(() => utilities.atomicWriteFile(jsonFile, ""), /empty content/);

    const document = YAML.parseDocument("schema_version: 2\nlore:\n  image: old\n");
    document.setIn(["lore", "image"], "registry.example/lore@sha256:abc");
    utilities.atomicWriteYaml(yamlFile, document);
    utilities.atomicWriteJson(jsonFile, { schemaVersion: 2, receipts: {} });

    assert.equal(YAML.parseDocument(fs.readFileSync(yamlFile, "utf8")).errors.length, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile, "utf8")), { schemaVersion: 2, receipts: {} });
    assert.equal(fs.readdirSync(directory).some((name) => name.endsWith(".tmp")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("all production BOM and receipt files are non-empty and parse cleanly", () => {
  const versionsFile = path.join(repositoryRoot, "infra/lore/versions.yaml");
  const versions = YAML.parseDocument(fs.readFileSync(versionsFile, "utf8"));
  assert.equal(versions.errors.length, 0);
  for (const filename of ["verified-images.json", "verified-releases.json"]) {
    const contents = fs.readFileSync(path.join(repositoryRoot, "infra/lore", filename), "utf8");
    assert.notEqual(contents.trim(), "");
    assert.equal(typeof JSON.parse(contents), "object");
  }
});
