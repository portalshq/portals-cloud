import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const repository = "portalshq/portals-cloud";
export const registry = "https://registry.npmjs.org/";
export const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function packages() {
  const workspacePatterns = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).workspaces;
  const directories = [];
  for (const entry of readdirSync(resolve(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = `packages/${entry.name}`;
    if (existsSync(resolve(root, directory, "package.json"))) directories.push(directory);
    for (const child of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const nested = `${directory}/${child.name}`;
      if (child.isDirectory() && existsSync(resolve(root, nested, "package.json"))) directories.push(nested);
    }
  }
  return directories
    .filter((directory) => isWorkspace(directory, workspacePatterns))
    .map((directory) => ({
      directory,
      manifest: JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8")),
    }))
    .filter(({ manifest }) => !manifest.private)
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

function isWorkspace(directory, patterns) {
  const matches = (pattern) => {
    const expression = pattern.split("/").map((segment) =>
      segment === "*" ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("/");
    return new RegExp(`^${expression}$`).test(directory);
  };
  const included = patterns.some((pattern) => !pattern.startsWith("!") && matches(pattern));
  const excluded = patterns.some((pattern) => pattern.startsWith("!") && matches(pattern.slice(1)));
  return included && !excluded;
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
    if (!file.startsWith("dist/") && !file.startsWith("sql/") && !/^docs\/(?:[^/]+\/)*[^/]+\.md$/i.test(file) && !/^(package\.json|readme(?:\..*)?|licen[cs]e(?:\..*)?|changelog(?:\..*)?)$/i.test(file)) {
      fail(`unexpected packed file ${file}`);
    }
  }
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  return value && typeof value === "object" ? Object.values(value).flatMap(exportTargets) : [];
}
