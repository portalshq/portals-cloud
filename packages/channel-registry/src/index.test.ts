import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openChannelRegistry, parseChannelRegistry } from "./index.js";

describe("channel registry", () => {
  it("validates channel data without performing refresh I/O", () => {
    expect(() => parseChannelRegistry({ channels: { demo: { controlEndpoint: "invalid", queueTokenEnv: "TOKEN", requiredEntities: ["px://demo/character/lead"] } } })).toThrow();
    expect(parseChannelRegistry({ channels: { demo: { controlEndpoint: "https://queue.example.com", queueTokenEnv: "TOKEN", requiredEntities: ["px://demo/character/lead"], interactions: { choice: { "model-choice-interval": true } } } } }).channels.demo.interactions).toEqual({ choice: { "model-choice-interval": true } });
  });
  it("preserves the signup bonus block and rejects invalid amounts", () => {
    const channel = { controlEndpoint: "https://queue.example.com", queueTokenEnv: "TOKEN", requiredEntities: ["px://demo/character/lead"] };
    expect(parseChannelRegistry({ channels: { demo: { ...channel, signup: { "bonus-credits": 3 } } } }).channels.demo.signup).toEqual({ "bonus-credits": 3 });
    expect(() => parseChannelRegistry({ channels: { demo: { ...channel, signup: { "bonus-credits": -1 } } } })).toThrow();
    expect(() => parseChannelRegistry({ channels: { demo: { ...channel, signup: { "bonus-credits": 1.5 } } } })).toThrow();
  });
  it("accepts an environment reference as the control endpoint", () => {
    expect(parseChannelRegistry({ channels: { demo: { controlEndpoint: "${BROADCAST_CONTROL_ENDPOINT}", queueTokenEnv: "TOKEN", requiredEntities: ["px://demo/character/lead"] } } }).channels.demo.controlEndpoint).toBe("${BROADCAST_CONTROL_ENDPOINT}");
  });
  it("writes resolved manifests only after all entities resolve", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "channel-registry-"));
    const filePath = path.join(directory, "channels.json");
    await writeFile(filePath, JSON.stringify({ channels: { demo: { controlEndpoint: "https://queue.example.com", queueTokenEnv: "QUEUE_TOKEN", requiredEntities: ["px://demo/character/lead"], interactions: { choice: { "model-choice-interval": true } } } }, entities: {} }));
    const registry = openChannelRegistry({ filePath, resolveManifests: async () => [{ id: "px://demo/character/lead", name: "Lead" }] });

    await registry.refresh();

    expect(registry.get("demo").interactions).toEqual({ choice: { "model-choice-interval": true } });
    expect(JSON.parse(await readFile(filePath, "utf8")).channels.demo.interactions).toEqual({ choice: { "model-choice-interval": true } });
    expect(registry.get("demo").queueTokenEnv).toBe("QUEUE_TOKEN");
    expect(registry.manifests("demo")).toHaveLength(1);
    expect(JSON.parse(await readFile(filePath, "utf8")).entities).toHaveProperty("px://demo/character/lead");
  });
});
