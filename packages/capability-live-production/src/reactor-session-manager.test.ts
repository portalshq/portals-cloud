import { describe, expect, it, vi } from "vitest";
import { ReactorSessionManager } from "./reactor-session-manager.js";

describe("ReactorSessionManager", () => {
  it("rejects server-side commands when Reactor requires the frontend WebRTC channel", async () => {
    const onCommand = vi.fn();
    const manager = new ReactorSessionManager({
      config: {
        apiKey: "test-api-key",
        modelName: "reactor/test-model",
        sessionId: "test-session",
      },
      onCommand,
    });

    await manager.connect();

    await expect(manager.sendCommand("start", { prompt: "private customer prompt" }))
      .rejects.toThrow(/frontend via Reactor SDK WebRTC connection/);
    expect(onCommand).not.toHaveBeenCalled();

    await manager.disconnect();
  });

  it("rejects commands before a session is connected", async () => {
    const manager = new ReactorSessionManager({
      config: { apiKey: "test-api-key", modelName: "reactor/test-model" },
    });

    await expect(manager.sendCommand("start", {})).rejects.toThrow("Not connected to Reactor session");
  });
});
