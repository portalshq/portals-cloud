import { spawnSync } from "node:child_process";

const packageName = process.env.npm_package_name;
const packageVersion = process.env.npm_package_version;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!packageName || !packageVersion) {
  throw new Error("publish-workspace must run from an npm package script");
}

const packageSpec = `${packageName}@${packageVersion}`;
const lookup = run(["view", packageSpec, "version", "--json"], { captureOutput: true });

if (lookup.status === 0) {
  console.log(`${packageSpec} is already published; skipping.`);
  process.exit(0);
}

const lookupError = `${lookup.stdout ?? ""}\n${lookup.stderr ?? ""}`;
if (!/\bE404\b|404 Not Found/.test(lookupError)) {
  process.stderr.write(lookupError);
  throw new Error(`Unable to verify whether ${packageSpec} is published`);
}

console.log(`${packageSpec} is unpublished; publishing.`);
const publish = run(["publish", "--access", "public"]);
if (publish.status !== 0) process.exit(publish.status ?? 1);

function run(args, { captureOutput = false } = {}) {
  return spawnSync(npm, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: captureOutput ? "pipe" : "inherit",
  });
}
