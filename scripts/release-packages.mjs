import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { packages, root } from "./package-release.mjs";

const TURBO = resolve(root, "node_modules/.bin/turbo");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/**
 * The packages touched since the previous release. The publish job runs after
 * `changeset version`, so HEAD already carries the version bumps and the last
 * "Version Packages" commit marks where the previous release ended.
 *
 * Falls back to every package when that cannot be worked out. Building extra
 * packages only costs time; missing one would skip a release, so the safe
 * direction is to over-select.
 */
export function releasePackages() {
  const all = packages();
  let base;
  try {
    base = git(["rev-list", "-n", "1", "--grep=^Version Packages$", "HEAD"]);
  } catch {
    base = "";
  }
  if (!base) return all;

  const touched = new Set(
    git(["diff", "--name-only", `${base}..HEAD`])
      .split("\n")
      .map((file) => /^packages\/([^/]+)\//.exec(file)?.[1])
      .filter(Boolean),
  );
  const selected = all.filter(({ directory }) => touched.has(directory.split("/").pop()));
  return selected.length ? selected : all;
}

function runTurbo(tasks) {
  const filters = releasePackages().flatMap(({ directory }) => ["--filter", `./${directory}`]);
  return spawnSync(TURBO, ["run", ...tasks, ...filters], { cwd: root, stdio: "inherit" }).status ?? 1;
}

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status ?? 1;
}

const task = process.argv[2];
if (task === "build") {
  process.exit(runTurbo(["build"]));
} else if (task === "check") {
  const unit = runNode(["--test", resolve(root, "scripts/package-release.test.mjs")]);
  const lintTest = runTurbo(["lint", "test"]);
  const packs = runNode([resolve(root, "scripts/check-package-packs.mjs"),
    ...releasePackages().map(({ directory }) => directory)]);
  process.exit(unit || lintTest || packs);
} else if (task) {
  process.stderr.write("usage: release-packages.mjs build|check\n");
  process.exit(2);
}