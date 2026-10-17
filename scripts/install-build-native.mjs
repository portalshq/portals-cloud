import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Match every locked build-tool instance, including nested versions. */
export function linuxBuildNatives(packages) {
  return Object.entries(packages).flatMap(([directory, manifest]) => {
    if (!/(?:^|\/)node_modules\/(?:rollup|rolldown|oxc-parser|oxc-transform)$/.test(directory)) return [];
    return Object.entries(manifest.optionalDependencies ?? {})
      .filter(([name]) => /^@(rollup|rolldown|oxc-parser|oxc-transform)\/.*linux-x64-gnu$/.test(name))
      .map(([name, version]) => {
        if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error(`Unpinned native package: ${name}@${version}`);
        return { directory, name, version };
      });
  });
}

export function installBuildNatives() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  for (const { directory, name, version } of linuxBuildNatives(lock.packages)) {
    const temporary = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "portals-native-"));
    try {
      // Fetch only this pinned tarball. npm install would re-resolve unrelated
      // workspace peers and may replace the compiler selected by npm ci.
      const packed = spawnSync("npm", ["pack", `${name}@${version}`, "--ignore-scripts", "--json"],
        { cwd: temporary, encoding: "utf8" });
      if (packed.error) throw packed.error;
      if (packed.status !== 0) throw new Error(packed.stderr || `Could not pack ${name}.`);
      const output = JSON.parse(packed.stdout);
      const filename = (Array.isArray(output) ? output[0] : output[name]).filename;
      const unpacked = join(temporary, "unpacked");
      mkdirSync(unpacked);
      const extracted = spawnSync("tar", ["-xzf", join(temporary, filename), "--strip-components=1", "-C", unpacked], { stdio: "inherit" });
      if (extracted.error) throw extracted.error;
      if (extracted.status !== 0) throw new Error(`Could not extract ${name}.`);
      const target = join(root, directory, "node_modules", name);
      mkdirSync(target, { recursive: true });
      cpSync(unpacked, target, { recursive: true });
      console.log(`${directory}: recovered ${name}@${version}`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) installBuildNatives();
