import { describe, expect, it, vi } from "vitest";

import { LiveDelivery } from "../src/index.js";
import { createLiveCaptionController } from "../src/browser.js";

describe("live caption playback integration", () => {
  it("connects a delivery session and keeps streamed captions visible on the media timeline", async () => {
    const delivery = new LiveDelivery({
      sessionId: "live-captioned",
      playbackManifestUrl: "https://media.example/live.m3u8",
      fetch: vi.fn().mockResolvedValue(new Response("#EXTM3U", { status: 200 })),
    });
    const playback = await delivery.start();
    expect(playback.playbackManifestUrl).toBe("https://media.example/live.m3u8");

    const added: Array<{ startTime: number; endTime: number; text: string }> = [];
    const removed: Array<{ startTime: number }> = [];
    const track = {
      mode: "disabled",
      addCue: vi.fn((cue) => added.push(cue as { startTime: number; endTime: number; text: string })),
      removeCue: vi.fn((cue) => removed.push(cue as { startTime: number })),
    } as unknown as TextTrack;
    const player = {
      currentTime: 184,
      addTextTrack: vi.fn(() => track),
    } as unknown as HTMLMediaElement;
    const captions = createLiveCaptionController(player, {
      id: "en-live", label: "English", language: "en", retentionSeconds: 2,
      createCue: (startTime, endTime, text) => ({ startTime, endTime, text }) as TextTrackCue,
    });

    captions.publish({ text: "Welcome", durationSeconds: 1.5 });
    player.currentTime = 188;
    captions.publish({ text: "The stream is live.", durationSeconds: 2 });

    expect(player.addTextTrack).toHaveBeenCalledWith("captions", "English", "en");
    expect(track.mode).toBe("showing");
    expect(added).toEqual([
      { startTime: 184, endTime: 185.5, text: "Welcome" },
      { startTime: 188, endTime: 190, text: "The stream is live." },
    ]);
    expect(removed).toEqual([expect.objectContaining({ startTime: 184 })]);

    captions.dispose();
    expect(track.mode).toBe("disabled");
    await delivery.stop();
  });
});
