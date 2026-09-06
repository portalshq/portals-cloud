import assert from "node:assert/strict";
import { test } from "node:test";
import { registry, repository, trustArgs, validatePack } from "./package-release.mjs";
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
