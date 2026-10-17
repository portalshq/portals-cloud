import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Hosted Ubuntu x64 runners can miss Rollup's optional native package. Install
// only that package outside the workspace so npm cannot re-resolve peer deps
// or replace compilers after npm ci has installed the release lockfile.
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const version = require("rollup/package.json").version;
const packageName = "@rollup/rollup-linux-x64-gnu";
const temporary = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "portals-rollup-"));
try {
  const result = spawnSync("npm", ["install", "--prefix", temporary, "--ignore-scripts",
    "--no-save", "--package-lock=false", "--no-audit", "--no-fund", `${packageName}@${version}`],
  { cwd: temporary, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Rollup native installation failed (${result.status}).`);
  mkdirSync(join(root, "node_modules/@rollup"), { recursive: true });
  cpSync(join(temporary, "node_modules", packageName), join(root, "node_modules", packageName), { recursive: true });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
