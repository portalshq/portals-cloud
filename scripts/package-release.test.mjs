import assert from "node:assert/strict";
import { test } from "node:test";
import { registry, repository, trustArgs, validatePack, packages } from "./package-release.mjs";
import { releasePackages } from "./release-packages.mjs";
import { setupTrust } from "./setup-npm-trust.mjs";

function fixture() {
  return {
    pkg: { directory: "packages/example", manifest: {
      name: "@portalshq/example", version: "1.0.0",
      repository: { url: `git+https://github.com/${repository}.git`, directory: "packages/example" },
      publishConfig: { access: "public", registry },
      main: "dist/index.js", types: "dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
    } },
    pack: { name: "@portalshq/example", version: "1.0.0",
      files: ["package.json", "README.md", "dist/index.js", "dist/index.d.ts"].map((path) => ({ path })) },
  };
}

test("accepts built packages and targets the exact OIDC identity", () => {
  const { pkg, pack } = fixture();
  validatePack(pkg, pack);
  assert.deepEqual(trustArgs(pkg.manifest.name), ["trust", "github", "@portalshq/example",
    "--repo", "portalshq/portals-cloud", "--file", "release.yml", "--env", "production",
    "--allow-publish", "--registry", registry, "--yes"]);
});

test("trust setup preserves interactive 2FA for both creation and listing", async () => {
  for (const mode of ["apply", "list"]) {
    const calls = [];
    await setupTrust({ mode, packageList: [fixture().pkg], wait: async () => {},
      run: (_npm, args, options) => {
        assert.equal(options.stdio, "inherit", "capturing stdout disables npm browser 2FA");
        calls.push(args);
        return { status: 0 };
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1], mode === "apply" ? "github" : "list");
  }
});

test("trust setup stops at the first failure instead of repeating it for every package", async () => {
  let calls = 0;
  await assert.rejects(setupTrust({ mode: "apply", packageList: [fixture().pkg, fixture().pkg],
    wait: async () => {},
    run: () => ({ status: ++calls === 1 ? 0 : 1 }),
  }), /Stopped at @portalshq\/example/);
  assert.equal(calls, 2);
});

test("rejects missing JS, declarations, CLI and subpath exports", () => {
  for (const path of ["dist/index.js", "dist/index.d.ts"]) {
    const { pkg, pack } = fixture();
    pack.files = pack.files.filter((file) => file.path !== path);
    assert.throws(() => validatePack(pkg, pack), /missing packed entry point/);
  }
  const { pkg, pack } = fixture();
  pkg.manifest.bin = { example: "./dist/cli.js" };
  assert.throws(() => validatePack(pkg, pack), /missing packed entry point/);
  delete pkg.manifest.bin;
  pkg.manifest.exports["./browser"] = { default: "./dist/browser.js" };
  assert.throws(() => validatePack(pkg, pack), /missing packed entry point/);
});

test("rejects unintended files, incorrect repository and recursive publishing", () => {
  const { pkg, pack } = fixture();
  pack.files.push({ path: ".env" });
  assert.throws(() => validatePack(pkg, pack), /unexpected packed file/);
  pack.files.pop();
  pkg.manifest.scripts = { publish: "npm publish" };
  assert.throws(() => validatePack(pkg, pack), /recursively publish/);
  delete pkg.manifest.scripts;
  pkg.manifest.repository.url = "git+https://github.com/wrong/repository.git";
  assert.throws(() => validatePack(pkg, pack), /repository metadata/);
});

test("release scope selects only real packages and never returns nothing", () => {
  const selected = releasePackages();
  const known = new Set(packages().map(({ directory }) => directory));
  assert.ok(selected.length > 0, "a release must always build at least one package");
  for (const { directory } of selected) {
    assert.ok(known.has(directory), `${directory} is not a publishable package`);
  }
  assert.ok(selected.length <= packages().length);
});

test("release scope never selects private or missing directories", () => {
  for (const { directory, manifest } of releasePackages()) {
    assert.ok(!manifest.private, `${directory} is private`);
    assert.ok(directory.startsWith("packages/"), `${directory} is outside packages/`);
  }
});

test("package discovery follows workspace exclusions", () => {
  const discovered = new Set(packages().map(({ directory }) => directory));
  assert.ok(!discovered.has("packages/platform-billing"));
  assert.ok(!discovered.has("packages/policy"));
});


test("allows packaged Markdown guides and rejects private or executable documentation assets", () => {
  const { pkg, pack } = fixture();
  pack.files.push({ path: "docs/integration-guide.md" }, { path: "docs/setup/database.md" });
  validatePack(pkg, pack);
  for (const path of ["docs/.env", "docs/setup.js", "docs/token.json", "src/index.ts"]) {
    assert.throws(() => validatePack(pkg, { ...pack, files: [...pack.files, { path }] }), /unexpected packed file/);
  }
});


test("native recovery preserves nested tool versions and ignores unrelated optional dependencies", async () => {
  const { linuxBuildNatives } = await import("./install-build-native.mjs");
  assert.deepEqual(linuxBuildNatives({
    "node_modules/rollup": { optionalDependencies: { "@rollup/rollup-linux-x64-gnu": "4.63.1", "@rollup/rollup-darwin-arm64": "4.63.1" } },
    "node_modules/rolldown": { optionalDependencies: { "@rolldown/binding-linux-x64-gnu": "1.2.0" } },
    "node_modules/vite/node_modules/rolldown": { optionalDependencies: { "@rolldown/binding-linux-x64-gnu": "1.1.5" } },
    "node_modules/example": { optionalDependencies: { "@example/linux-x64-gnu": "1.0.0" } },
  }), [
    { directory: "node_modules/rollup", name: "@rollup/rollup-linux-x64-gnu", version: "4.63.1" },
    { directory: "node_modules/rolldown", name: "@rolldown/binding-linux-x64-gnu", version: "1.2.0" },
    { directory: "node_modules/vite/node_modules/rolldown", name: "@rolldown/binding-linux-x64-gnu", version: "1.1.5" },
  ]);
  assert.throws(() => linuxBuildNatives({ "node_modules/rollup": {
    optionalDependencies: { "@rollup/rollup-linux-x64-gnu": "latest" },
  } }), /Unpinned/);
});
