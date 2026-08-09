import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readVersionPins } from "../src/versioning";

/**
 * Hermetic tests for the version pin resolution.
 *
 * readVersionPins() resolves infra/lore/versions.yaml relative to the working
 * directory, so each test runs in a temp dir with its own fixture file.
 */
function withVersionsFile(content: string, fn: () => void): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portals-versions-"));
  const dir = path.join(tmp, "infra", "lore");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "versions.yaml"), content);

  const prevCwd = process.cwd();
  process.chdir(tmp);
  try {
    fn();
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("returns an empty pin when control-plane.image is unset (fail-open)", () => {
  withVersionsFile(
    [
      "portals:",
      "  version: 0.2.0",
      "control-plane:",
      '  image: ""',
      "",
    ].join("\n"),
    () => {
      assert.deepEqual(readVersionPins(), { controlPlaneImageUri: "" });
    }
  );
});

test("returns the pinned image URI", () => {
  withVersionsFile(
    [
      "control-plane:",
      '  image: "portalshq/control-plane:abc123-20260809-120000"',
      "",
    ].join("\n"),
    () => {
      assert.deepEqual(readVersionPins(), {
        controlPlaneImageUri: "portalshq/control-plane:abc123-20260809-120000",
      });
    }
  );
});

test("throws with a publish-image.sh hint when control-plane.image is not a string", () => {
  withVersionsFile(
    ["control-plane:", "  image: 123", ""].join("\n"),
    () => {
      assert.throws(() => readVersionPins(), /publish-image\.sh/);
    }
  );
});

test("throws when the control-plane block is missing entirely", () => {
  withVersionsFile(["portals:", "  version: 0.2.0", ""].join("\n"), () => {
    assert.throws(() => readVersionPins(), /publish-image\.sh/);
  });
});
