import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function commitChecks(stagedPaths) {
  const checks = [
    ["sh", ["scripts/audit-rust.sh"]],
    ["cargo", ["fmt", "--manifest-path", "control-plane/Cargo.toml", "--all", "--", "--check"]],
    // One Turbo graph owns every package build, including dependency builds.
    [npm, ["run", "release:build"]],
    [npm, ["exec", "--", "turbo", "run", "lint", "--filter=[HEAD]"]],
    [npm, ["run", "skills:build"]],
    // Generated skills must be reviewed/staged; never silently stage source edits.
    [process.execPath, ["scripts/check-generated-skills-staged.mjs"]],
  ];
  if (stagedPaths.some((path) => path.startsWith("frontend/") || path.startsWith("sanity/"))) {
    checks.push(
      [npm, ["run", "generate-pdfs", "--workspace=frontend"]],
      ["git", ["add", "--", "generated-assets/"]],
    );
  }
  return checks;
}

export function runCommitChecks(stagedPaths, run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" })) {
  for (const [command, args] of commitChecks(stagedPaths)) {
    console.log(`[pre-commit] ${command} ${args.join(" ")}`);
    run(command, args);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = execFileSync("git", ["diff", "--cached", "--name-only", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    runCommitChecks(paths);
  } catch (error) {
    console.error("Commit checks failed. If generated skills changed, review and stage them before retrying.");
    process.exitCode = error.status || 1;
  }
}
