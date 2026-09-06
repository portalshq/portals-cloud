import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const repository = "portalshq/portals-cloud";
export const registry = "https://registry.npmjs.org/";
export const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function packages() {
  return ["packages", "packages/stubs"].flatMap((parent) =>
    readdirSync(resolve(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "stubs")
      .map((entry) => {
        const directory = `${parent}/${entry.name}`;
        const manifest = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8"));
        return { directory, manifest };
      }),
  ).filter(({ manifest }) => !manifest.private)
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export function trustArgs(name) {
  return ["trust", "github", name, "--repo", repository, "--file", "release.yml",
    "--env", "production", "--allow-publish", "--registry", registry, "--yes"];
}

export function validatePack({ directory, manifest }, pack) {
  const fail = (message) => { throw new Error(`${manifest.name}: ${message}`); };
  if (manifest.repository?.url !== `git+https://github.com/${repository}.git` ||
      manifest.repository?.directory !== directory) fail("repository metadata does not match the release workflow");
  if (manifest.publishConfig?.access !== "public" || manifest.publishConfig?.registry !== registry) {
    fail("publishConfig must target the public npm registry");
  }
  if (manifest.scripts?.publish) fail("publish lifecycle scripts must not recursively publish");
  if (pack.name !== manifest.name || pack.version !== manifest.version) fail("tarball identity mismatch");
  const files = new Set(pack.files.map(({ path }) => path));
  const entryPoints = [manifest.main, manifest.types,
    ...Object.values(typeof manifest.bin === "string" ? { bin: manifest.bin } : manifest.bin ?? {}),
    ...exportTargets(manifest.exports)].filter(Boolean);
  if (!manifest.main || !manifest.types) fail("main and types entry points are required");
  for (const entry of entryPoints) {
    if (!files.has(entry.replace(/^\.\//, ""))) fail(`missing packed entry point ${entry}; build first`);
  }
  for (const file of files) {
    if (!file.startsWith("dist/") && !/^(package\.json|readme(?:\..*)?|licen[cs]e(?:\..*)?|changelog(?:\..*)?)$/i.test(file)) {
      fail(`unexpected packed file ${file}`);
    }
  }
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  return value && typeof value === "object" ? Object.values(value).flatMap(exportTargets) : [];
}
