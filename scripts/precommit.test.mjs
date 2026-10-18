import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitChecks, runCommitChecks } from "./precommit.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("one commit invokes audit, package graph, skill generation, and applicable checks once", () => {
  const calls = [];
  runCommitChecks(["packages/sdk/src/index.ts"], (command, args) => calls.push([command, args]));
  assert.equal(calls.filter(([, args]) => args.includes("scripts/audit-rust.sh")).length, 1);
  assert.equal(calls.filter(([, args]) => args.includes("release:build")).length, 1);
  assert.equal(calls.filter(([, args]) => args.includes("skills:build")).length, 1);
  assert.equal(calls.filter(([, args]) => args.includes("build")).length, 0, "no second affected-workspace build");
  assert.equal(calls.filter(([, args]) => args.includes("generate-pdfs")).length, 0);
  assert.ok(calls.findIndex(([, args]) => args.includes("release:build")) < calls.findIndex(([, args]) => args.includes("skills:build")));
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json")));
  assert.ok(!rootPackage.workspaces.some((entry) => entry.startsWith("!packages/")));
  assert.equal(readFileSync(join(root, ".husky/pre-commit"), "utf8").trim(), "npm run precommit");
});

test("PDF generation is retained once for frontend or Sanity edits", () => {
  const checks = commitChecks(["frontend/app/page.tsx", "sanity/schema.ts"]);
  assert.equal(checks.filter(([, args]) => args.includes("generate-pdfs")).length, 1);
  assert.deepEqual(checks.at(-1), ["git", ["add", "--", "generated-assets/"]]);
});

test("a failed audit stops the commit before builds or generated writes", () => {
  const calls = [];
  assert.throws(() => runCommitChecks([], (command) => { calls.push(command); throw new Error("vulnerability"); }), /vulnerability/);
  assert.deepEqual(calls, ["sh"]);
});

test("generated skill edits must match the index, including new files", () => {
  const directory = mkdtempSync(join(tmpdir(), "portals-hook-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  const check = () => execFileSync(process.execPath, [join(root, "scripts/check-generated-skills-staged.mjs")], { cwd: directory, stdio: "pipe" });
  try {
    git("init", "--quiet");
    git("config", "user.name", "Hook Test");
    git("config", "user.email", "hook@example.test");
    mkdirSync(join(directory, "skills/portals-app-builder"), { recursive: true });
    const file = join(directory, "skills/portals-app-builder/SKILL.md");
    writeFileSync(file, "initial\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture");
    writeFileSync(file, "regenerated\n");
    assert.throws(check);
    git("add", ".");
    assert.doesNotThrow(check, "staged changes need not match HEAD");
    writeFileSync(join(directory, "skills/portals-app-builder/new.md"), "new\n");
    assert.throws(check);
    git("add", ".");
    assert.doesNotThrow(check);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("shared Rust audit scans each source lockfile once and fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "portals-audit-test-"));
  try {
    mkdirSync(join(directory, "scripts"), { recursive: true });
    mkdirSync(join(directory, "infra/lore/lore"), { recursive: true });
    mkdirSync(join(directory, "bin"));
    writeFileSync(join(directory, "scripts/audit-rust.sh"), readFileSync(join(root, "scripts/audit-rust.sh")));
    writeFileSync(join(directory, "infra/lore/lore/Cargo.lock"), "fixture");
    writeFileSync(join(directory, "bin/cargo"), '#!/bin/sh\n[ "$2" = "--version" ] && exit 0\nprintf "%s\\n" "$*" >> "$AUDIT_LOG"\n[ "${FAIL_AUDIT:-0}" = 1 ] && exit 1\nexit 0\n', { mode: 0o755 });
    const log = join(directory, "audit.log");
    const env = { ...process.env, PATH: `${join(directory, "bin")}:${process.env.PATH}`, AUDIT_LOG: log };
    execFileSync("sh", [join(directory, "scripts/audit-rust.sh")], { env });
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /^audit --file control-plane\/Cargo.lock /);
    assert.equal(calls[1], "audit --file infra/lore/lore/Cargo.lock");
    writeFileSync(log, "");
    assert.throws(() => execFileSync("sh", [join(directory, "scripts/audit-rust.sh")], { env: { ...env, FAIL_AUDIT: "1" } }));
    assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
