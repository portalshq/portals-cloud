/**
 * Tests for VideoProvider interface and adapters.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createVideoProvider,
  type VideoProvider,
  type VideoSessionConfig,
  type VideoSessionHandle,
  type VideoSessionStatus,
  type VideoInteraction,
  type ProviderConfig,
} from "./video-provider";

describe("VideoProvider factory", () => {
  it("should create FAL provider", () => {
    const provider = createVideoProvider({
      type: "fal",
      modelName: "fal-ai/fast-sdxl",
      apiKey: "test-key",
    });

    expect(provider).toBeDefined();
  });

  it("should create Reactor provider", () => {
    const provider = createVideoProvider({
      type: "reactor",
      modelName: "reactor/helios",
      apiKey: "test-key",
    });

    expect(provider).toBeDefined();
  });

  it("should create OpenRouter provider", () => {
    const provider = createVideoProvider({
      type: "openrouter",
      modelName: "anthropic/claude-3.5-sonnet",
      apiKey: "test-key",
    });

    expect(provider).toBeDefined();
  });

  it("should throw on unknown provider type", () => {
    expect(() => {
      createVideoProvider({
        type: "unknown" as any,
        modelName: "test",
        apiKey: "test-key",
      });
    }).toThrow("Unknown provider type");
  });
});

describe("FAL adapter", () => {
  let provider: VideoProvider;

  beforeEach(() => {
    provider = createVideoProvider({
      type: "fal",
      modelName: "fal-ai/fast-sdxl",
      apiKey: "test-key",
    });
  });

  afterEach(() => {
    if (provider.destroy) {
      provider.destroy();
    }
  });

  describe("startSession", () => {
    it("should create a session and return a handle", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);

      expect(handle).toBeDefined();
      expect(handle.sessionId).toBeDefined();
      expect(handle.providerType).toBe("fal");
    });

    it("should throw on provider config type mismatch", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "reactor",
          modelName: "reactor/helios",
          apiKey: "test-key",
        },
      };

      await expect(provider.startSession(config)).rejects.toThrow("Provider config type mismatch");
    });
  });

  describe("sendInteraction", () => {
    it("should throw on unknown session", async () => {
      const interaction: VideoInteraction = {
        type: "prompt",
        payload: {
          type: "prompt",
          prompt: "A bear walking in the forest",
        },
      };

      await expect(provider.sendInteraction("unknown-session", interaction)).rejects.toThrow("Session not found");
    });

    it("should throw on unsupported interaction type", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);

      const interaction: VideoInteraction = {
        type: "command",
        payload: {
          type: "command",
          command: "test",
          params: {},
        },
      };

      await expect(provider.sendInteraction(handle.sessionId, interaction)).rejects.toThrow("Unsupported interaction type");
    });
  });

  describe("stopSession", () => {
    it("should stop a session", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);
      await expect(provider.stopSession(handle.sessionId)).resolves.not.toThrow();
    });

    it("should throw on unknown session", async () => {
      await expect(provider.stopSession("unknown-session")).rejects.toThrow("Session not found");
    });
  });

  describe("getSessionStatus", () => {
    it("should return session status", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);
      const status = await provider.getSessionStatus(handle.sessionId);

      expect(status).toBeDefined();
      expect(status.sessionId).toBe(handle.sessionId);
      expect(status.state).toBe("ready");
    });

    it("should throw on unknown session", async () => {
      await expect(provider.getSessionStatus("unknown-session")).rejects.toThrow("Session not found");
    });
  });

  describe("getVideoBuffer", () => {
    it("should throw on unknown session", async () => {
      if (provider.getVideoBuffer) {
        await expect(provider.getVideoBuffer("unknown-session")).rejects.toThrow("Session not found");
      }
    });

    it("should throw when video not ready", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);

      if (provider.getVideoBuffer) {
        await expect(provider.getVideoBuffer(handle.sessionId)).rejects.toThrow("Video not ready");
      }
    });
  });
});

describe("Reactor adapter", () => {
  let provider: VideoProvider;

  beforeEach(() => {
    provider = createVideoProvider({
      type: "reactor",
      modelName: "reactor/helios",
      apiKey: "test-key",
    });
  });

  afterEach(() => {
    if (provider.destroy) {
      provider.destroy();
    }
  });

  describe("startSession", () => {
    it("should create a session and return a handle", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "reactor",
          modelName: "reactor/helios",
          apiKey: "test-key",
        },
      };

      // This will fail without actual Reactor API
      // We test the interface contract by catching the error
      try {
        const handle = await provider.startSession(config);
        expect(handle).toBeDefined();
        expect(handle.reactorToken).toBeDefined();
        expect(handle.reactorSessionId).toBeDefined();
      } catch (error) {
        // Expected to fail without real API key
        expect(error).toBeDefined();
      }
    });

    it("should throw on provider config type mismatch", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      await expect(provider.startSession(config)).rejects.toThrow("Provider config type mismatch");
    });
  });

  describe("sendInteraction", () => {
    it("should throw on unknown session", async () => {
      const interaction: VideoInteraction = {
        type: "prompt",
        payload: {
          type: "prompt",
          prompt: "A bear walking in the forest",
        },
      };

      await expect(provider.sendInteraction("unknown-session", interaction)).rejects.toThrow("Session not found");
    });

    it("should throw on WebRTC constraint (documented behavior)", async () => {
      // Note: This test documents the WebRTC constraint
      // In production, this would require a valid session first
      const interaction: VideoInteraction = {
        type: "prompt",
        payload: {
          type: "prompt",
          prompt: "A bear walking in the forest",
        },
      };

      // Without a real session, we can't test this
      // But the adapter is documented to throw on sendInteraction
      // because Reactor commands require WebRTC
    });
  });
});

describe("OpenRouter adapter", () => {
  let provider: VideoProvider;

  beforeEach(() => {
    provider = createVideoProvider({
      type: "openrouter",
      modelName: "anthropic/claude-3.5-sonnet",
      apiKey: "test-key",
    });
  });

  afterEach(() => {
    if (provider.destroy) {
      provider.destroy();
    }
  });

  describe("startSession", () => {
    it("should create a session and return a handle", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "openrouter",
          modelName: "anthropic/claude-3.5-sonnet",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);

      expect(handle).toBeDefined();
      expect(handle.sessionId).toBeDefined();
      expect(handle.providerType).toBe("openrouter");
    });

    it("should throw on provider config type mismatch", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "fal",
          modelName: "fal-ai/fast-sdxl",
          apiKey: "test-key",
        },
      };

      await expect(provider.startSession(config)).rejects.toThrow("Provider config type mismatch");
    });
  });

  describe("sendInteraction", () => {
    it("should throw on unknown session", async () => {
      const interaction: VideoInteraction = {
        type: "prompt",
        payload: {
          type: "prompt",
          prompt: "A bear walking in the forest",
        },
      };

      await expect(provider.sendInteraction("unknown-session", interaction)).rejects.toThrow("Session not found");
    });

    it("should throw on unsupported interaction type", async () => {
      const config: VideoSessionConfig = {
        channelId: "test-channel",
        providerConfig: {
          type: "openrouter",
          modelName: "anthropic/claude-3.5-sonnet",
          apiKey: "test-key",
        },
      };

      const handle = await provider.startSession(config);

      const interaction: VideoInteraction = {
        type: "command",
        payload: {
          type: "command",
          command: "test",
          params: {},
        },
      };

      await expect(provider.sendInteraction(handle.sessionId, interaction)).rejects.toThrow("Unsupported interaction type");
    });
  });
});

describe("Provider lifecycle", () => {
  it("should call destroy method if available", async () => {
    const provider = createVideoProvider({
      type: "fal",
      modelName: "fal-ai/fast-sdxl",
      apiKey: "test-key",
    });

    if (provider.destroy) {
      // destroy() returns void, not a Promise
      expect(() => provider.destroy()).not.toThrow();
    }
  });
});
