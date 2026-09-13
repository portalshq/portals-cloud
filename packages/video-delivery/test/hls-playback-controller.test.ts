import { describe, expect, it, vi } from "vitest";

import { HlsPlaybackController, type PlaybackObservation } from "../src/hls-playback-controller.js";

function media(nativeHls = false): HTMLMediaElement {
  return {
    canPlayType: vi.fn().mockReturnValue(nativeHls ? "maybe" : ""),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    src: "",
    error: null,
    onplaying: null,
    onwaiting: null,
    onstalled: null,
    onerror: null,
  } as unknown as HTMLMediaElement;
}

describe("HlsPlaybackController", () => {
  it("uses native HLS and reports media state", async () => {
    const element = media(true);
    const observations: PlaybackObservation[] = [];
    const controller = new HlsPlaybackController({
      media: element,
      session: { playbackManifestUrl: "https://media.example/live.m3u8" },
      onObservation: (observation) => observations.push(observation),
    });

    await controller.attach();
    expect(element.src).toBe("https://media.example/live.m3u8");
    element.onwaiting?.(new Event("waiting"));
    element.onplaying?.(new Event("playing"));
    expect(observations.map(({ state }) => state)).toEqual(["loading", "buffering", "playing"]);
    controller.destroy();
    expect(observations.at(-1)?.state).toBe("destroyed");
  });

  it("attaches hls.js when native HLS is unavailable", async () => {
    const element = media();
    const loadSource = vi.fn();
    const attachMedia = vi.fn();
    const destroy = vi.fn();
    class FakeHls {
      static isSupported(): boolean { return true; }
      loadSource = loadSource;
      attachMedia = attachMedia;
      destroy = destroy;
    }
    const controller = new HlsPlaybackController({
      media: element,
      session: { playbackManifestUrl: "https://media.example/live.m3u8" },
      loadHls: async () => FakeHls,
    });

    await controller.attach();
    expect(loadSource).toHaveBeenCalledWith("https://media.example/live.m3u8");
    expect(attachMedia).toHaveBeenCalledWith(element);
    controller.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
