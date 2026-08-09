import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

/**
 * Reads deployment version pins from infra/lore/versions.yaml.
 *
 * versions.yaml is the single source of truth for what is deployed. The
 * control-plane image is updated by control-plane/scripts/publish-image.sh
 * after each push; this module surfaces it to the Pulumi program.
 *
 * When control-plane.image is empty the pin is "" — the caller decides whether
 * to skip the service (allows fresh-stack bootstrap and `pulumi destroy`).
 */
export interface VersionPins {
  controlPlaneImageUri: string;
}

const VERSIONS_FILE_NAME = "versions.yaml";

/** Walks up from `startDir` looking for `relative`, returning the first match. */
function findUp(startDir: string, relative: string): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, relative);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function resolveVersionsFile(): string {
  // Works regardless of how the program is run (ts-node from source, compiled
  // from bin/, or from the repo root) by walking up to the repo root.
  const cwdCandidates = [
    path.resolve(process.cwd(), "infra/lore", VERSIONS_FILE_NAME),
    path.resolve(process.cwd(), "lore", VERSIONS_FILE_NAME),
  ];
  for (const candidate of cwdCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const fromModule = findUp(__dirname, path.join("infra", "lore", VERSIONS_FILE_NAME));
  return fromModule ?? cwdCandidates[0];
}

export function readVersionPins(): VersionPins {
  const file = resolveVersionsFile();
  if (!fs.existsSync(file)) {
    throw new Error(
      `versions.yaml not found (looked for ${file}). ` +
        "It lives at infra/lore/versions.yaml in the repo root."
    );
  }

  const doc = YAML.parse(fs.readFileSync(file, "utf-8"));
  const image = doc?.["control-plane"]?.image;
  if (typeof image !== "string") {
    throw new Error(
      "control-plane.image is not a string in " +
        `${file}. Run control-plane/scripts/publish-image.sh first.`
    );
  }

  return { controlPlaneImageUri: image };
}
