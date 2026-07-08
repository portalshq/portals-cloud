import { ChannelManifestSchema, ChannelManifest } from "@portalshq/contracts";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export function loadManifest(path: string): ChannelManifest {
  const raw = parseYaml(readFileSync(path, "utf-8"));
  const result = ChannelManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid channel manifest at ${path}:\n${result.error.message}`);
  }
  return result.data;
}
