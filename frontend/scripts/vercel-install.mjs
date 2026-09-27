import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.env.VERCEL !== "1") {
  throw new Error("This installer is only for Vercel builds.");
}

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(frontendDir, "..");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [rootManifest, frontendManifest, billingManifest, policyManifest] =
  await Promise.all([
    readJson(resolve(repoDir, "package.json")),
    readJson(resolve(frontendDir, "package.json")),
    readJson(resolve(repoDir, "packages/platform-billing/package.json")),
    readJson(resolve(repoDir, "packages/policy/package.json")),
  ]);

const run = (args) => {
  const result = spawnSync("npm", args, {
    cwd: repoDir,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with status ${result.status}`);
  }
};

const excludedWorkspaces = new Set([
  "!packages/platform-billing",
  "!packages/policy",
]);
// Vercel deploys the published releases; normal repository installs keep the
// source workspaces linked for development and Changesets release workflows.
rootManifest.workspaces = [
  ...rootManifest.workspaces.filter((workspace) => !excludedWorkspaces.has(workspace)),
  ...excludedWorkspaces,
];
await writeFile(
  resolve(repoDir, "package.json"),
  `${JSON.stringify(rootManifest, null, 2)}\n`,
);

const billingRange = frontendManifest.dependencies?.[billingManifest.name];
if (!billingRange || !/^\^?\d+\.\d+\.\d+/.test(billingRange)) {
  throw new Error(`Expected a semver dependency for ${billingManifest.name}.`);
}

run([
  "install",
  "--workspace=frontend",
  "--package-lock-only",
  "--ignore-scripts",
  "--save-exact",
  `${billingManifest.name}@${billingRange}`,
]);
run([
  "install",
  "--workspace=frontend",
  "--package-lock-only",
  "--ignore-scripts",
  "--save-exact",
  `${policyManifest.name}@${policyManifest.version}`,
]);
run([
  "uninstall",
  "--workspace=frontend",
  "--package-lock-only",
  "--ignore-scripts",
  policyManifest.name,
]);
run(["ci"]);
