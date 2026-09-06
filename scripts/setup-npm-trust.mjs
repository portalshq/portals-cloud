import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npm, packages, registry, root, trustArgs } from "./package-release.mjs";

export async function setupTrust({ mode, packageList = packages(), run = spawnSync, wait = setTimeout }) {
  // npm's otplease() requires BOTH stdin and stdout to be terminals. Capturing
  // even a read-only `trust list --json` response disables its browser 2FA flow.
  const options = { cwd: root, stdio: "inherit" };
  const auth = run(npm, ["whoami", "--registry", registry], options);
  if (auth.status !== 0) throw new Error("Run npm login with a package maintainer account, then retry.");
  for (const { manifest } of packageList) {
    console.log(`\n${manifest.name}`);
    const command = mode === "list"
      ? ["trust", "list", manifest.name, "--registry", registry]
      : trustArgs(manifest.name);
    const result = run(npm, command, options);
    if (result.signal) throw new Error(`Interrupted by ${result.signal}`);
    if (result.status !== 0) {
      throw new Error(`Stopped at ${manifest.name}; see npm's error above. ` +
        "Complete browser 2FA when prompted. If trust already exists, inspect it with " +
        `npm trust list ${manifest.name}. Existing trust is never replaced automatically.`);
    }
    await wait(2000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const list = args.includes("--list");
  if (args.some((arg) => !["--apply", "--list"].includes(arg)) || (apply && list)) {
    throw new Error("Usage: npm run release:trust [-- --apply | -- --list]");
  }

  // Preview is entirely local: never pass --dry-run to a registry mutation.
  if (!apply && !list) {
    for (const { manifest } of packages()) console.log(`npm ${trustArgs(manifest.name).join(" ")}`);
    console.log("\nPreview only. After npm login, run npm run release:trust -- --apply (npm >= 11.15.0, 2FA required).");
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Run this command in an interactive terminal without piping or redirecting output; npm requires a terminal for browser 2FA.");
    }
    await setupTrust({ mode: list ? "list" : "apply" });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
