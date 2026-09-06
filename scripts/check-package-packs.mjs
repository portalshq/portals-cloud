import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { npm, packages, root, validatePack } from "./package-release.mjs";

for (const pkg of packages()) {
  const result = spawnSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: resolve(root, pkg.directory), encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "npm pack failed");
  const output = JSON.parse(result.stdout);
  // npm 11 returns an array; npm 12 keys pack output by package name.
  const pack = Array.isArray(output) ? output[0] : output[pkg.manifest.name];
  validatePack(pkg, pack);
  console.log(`${pack.name}@${pack.version}: ${pack.files.length} files, entry points verified`);
}
