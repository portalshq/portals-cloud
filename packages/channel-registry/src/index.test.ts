import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openChannelRegistry } from "./index.js";

describe("channel registry", () => {
  it("writes resolved manifests only after all entities resolve", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "channel-registry-"));
    const filePath = path.join(directory, "channels.json");
    await writeFile(filePath, JSON.stringify({ channels: { demo: { controlEndpoint: "https://queue.example.com", queueTokenEnv: "QUEUE_TOKEN", requiredEntities: ["px://demo/character/lead"] } }, entities: {} }));
    const registry = openChannelRegistry({ filePath, resolveManifests: async () => [{ id: "px://demo/character/lead", name: "Lead" }] });

    await registry.refresh();

    expect(registry.get("demo").queueTokenEnv).toBe("QUEUE_TOKEN");
    expect(registry.manifests("demo")).toHaveLength(1);
    expect(JSON.parse(await readFile(filePath, "utf8")).entities).toHaveProperty("px://demo/character/lead");
  });
});
