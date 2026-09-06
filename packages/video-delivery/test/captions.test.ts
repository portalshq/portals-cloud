import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebVtt, normalizeCaptionTracks } from "../src/index.js";
import { mountPlaybackCaptions } from "../src/browser.js";

afterEach(() => vi.restoreAllMocks());

describe("caption helpers", () => {
  it("normalizes a viewer-ready WebVTT track", () => {
    expect(normalizeCaptionTracks([{
      id: "en", label: "English", language: "en", src: "https://captions.example/program.vtt",
    }])).toEqual([{
      id: "en", label: "English", language: "en", src: "https://captions.example/program.vtt", kind: "captions",
    }]);
  });

  it("copies directly supplied caption cues into the playback descriptor", () => {
    const tracks = normalizeCaptionTracks([{
      id: "en", label: "English", language: "en", cues: [
        { startTimeSeconds: 0, endTimeSeconds: 1, text: "Welcome" },
      ],
    }]);
    expect(tracks).toEqual([{
      id: "en", label: "English", language: "en", kind: "captions", cues: [
        { startTimeSeconds: 0, endTimeSeconds: 1, text: "Welcome" },
      ],
    }]);
  });

  it("rejects ambiguous or unsafe track sources", () => {
    expect(() => normalizeCaptionTracks([
      { id: "en", label: "English", language: "en", src: "https://captions.example/en.vtt", default: true },
      { id: "es", label: "Spanish", language: "es", src: "https://captions.example/es.vtt", default: true },
    ])).toThrow("at most one default");
    expect(() => normalizeCaptionTracks([
      { id: "en", label: "English", language: "en", src: "file:///private/captions.vtt" },
    ])).toThrow("http or https");
    expect(() => normalizeCaptionTracks([
      { id: "en", label: "English", language: "en", src: "https://secret@captions.example/en.vtt" },
    ])).toThrow("credentials");
    expect(() => normalizeCaptionTracks([
      { id: "en", label: "English", language: "en" },
    ] as never)).toThrow("exactly one");
  });

  it("creates a WebVTT document with millisecond timestamps", () => {
    expect(createWebVtt([
      { id: "intro", startTimeSeconds: 0, endTimeSeconds: 1.25, text: "Welcome" },
      { startTimeSeconds: 1.25, endTimeSeconds: 62.5, text: "Let's begin." },
    ])).toBe("WEBVTT\n\nintro\n00:00:00.000 --> 00:00:01.250\nWelcome\n\n00:00:01.250 --> 00:01:02.500\nLet's begin.\n");
  });

  it("mounts browser-native sidecar tracks and removes only its own elements", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:caption");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    const element = {
      kind: "", src: "", srclang: "", label: "", default: false,
      setAttribute: vi.fn(), remove: vi.fn(),
    } as unknown as HTMLTrackElement;
    const player = {
      ownerDocument: { createElement: vi.fn(() => element) },
      append: vi.fn(),
    } as unknown as HTMLMediaElement;
    const mounted = mountPlaybackCaptions(player, {
      captionTracks: [{
        id: "en", label: "English", language: "en", cues: [
          { startTimeSeconds: 0, endTimeSeconds: 1, text: "Welcome" },
        ], default: true,
      }],
    });

    expect(mounted.elements).toHaveLength(1);
    expect(element).toMatchObject({
      kind: "captions", src: "blob:caption", srclang: "en", label: "English", default: true,
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(player.append).toHaveBeenCalledWith(element);
    mounted.remove();
    mounted.remove();
    expect(element.remove).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:caption");
  });

  it("rejects invalid or overlapping cues", () => {
    expect(() => createWebVtt([{ startTimeSeconds: 1, endTimeSeconds: 1, text: "No duration" }])).toThrow("after");
    expect(() => createWebVtt([
      { startTimeSeconds: 0, endTimeSeconds: 2, text: "First" },
      { startTimeSeconds: 1, endTimeSeconds: 3, text: "Overlap" },
    ])).toThrow("without overlapping");
  });
});
