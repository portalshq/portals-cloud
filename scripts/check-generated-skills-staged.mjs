import { execFileSync } from "node:child_process";

const generated = ["skills/portals-app-builder", "skills/apple-design"];
try {
  execFileSync("git", ["diff", "--exit-code", "--", ...generated], { stdio: "inherit" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...generated], { encoding: "utf8" });
  if (untracked.trim()) throw new Error(`Unstaged generated files:\n${untracked}`);
} catch (error) {
  console.error(error.message);
  console.error("Review and stage generated skill changes, then retry the commit.");
  process.exitCode = 1;
}
