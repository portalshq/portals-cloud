import { describe, expect, it, vi } from "vitest";
import { parseChoiceSettings, parseInteractionSettings } from "../src/interactions-config.js";

describe("parseChoiceSettings", () => {
  it("parses channel interaction settings with defaults", () => {
    expect(parseChoiceSettings({ choice: { "model-interval": true } })).toEqual([
      { optionCount: 3, price: 0, windowSeconds: 8, persistent: false, schedule: { mode: "model" } },
    ]);
    expect(parseChoiceSettings({ choice: { "interval-seconds": 60, "option-count": 6 } })?.[0]?.schedule).toEqual({ mode: "timed", intervalSeconds: 60 });
    expect(parseChoiceSettings(undefined)).toBeUndefined();
  });

  it("parses polymorphic choice arrays", () => {
    const parsed = parseChoiceSettings({
      choice: [
        { "interval-seconds": 60, price: 1 },
        { "model-interval": true, "option-count": 4 },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed?.[0]?.schedule).toEqual({ mode: "timed", intervalSeconds: 60 });
    expect(parsed?.[1]?.optionCount).toBe(4);
  });

  it("rejects invalid or conflicting settings", () => {
    for (const choice of [{}, { "model-interval": true, "interval-seconds": 5 }, { "interval-seconds": 1, "option-count": 1 }, { "interval-seconds": 1, price: -1 }, { "interval-seconds": 1, typo: true }]) {
      expect(() => parseChoiceSettings({ choice })).toThrow();
    }
  });
});

describe("parseInteractionSettings guides", () => {
  it("parses a single guide object", () => {
    const settings = parseInteractionSettings({
      guides: { price: 2, "interval-seconds": 300, "window-seconds": 90 },
    });
    expect(settings?.guides).toEqual([
      {
        price: 2,
        windowSeconds: 90,
        alwaysOpen: false,
        maxPendingPerUser: 10,
        promptMaxLength: 200,
        schedule: { mode: "timed", intervalSeconds: 300 },
      },
    ]);
  });

  it("parses guide arrays and model schedule", () => {
    const settings = parseInteractionSettings({
      guides: [
        { "model-interval": true },
        { "always-open": true, price: 1 },
      ],
    });
    expect(settings?.guides).toHaveLength(2);
    expect(settings?.guides?.[0]?.schedule).toEqual({ mode: "model" });
    expect(settings?.guides?.[1]?.alwaysOpen).toBe(true);
    expect(settings?.guides?.[1]?.schedule).toBeUndefined();
  });

  it("rejects guide configs without a schedule unless always-open", () => {
    expect(() => parseInteractionSettings({ guides: { price: 1 } })).toThrow(/scheduling mode/);
    expect(() => parseInteractionSettings({ guides: { "always-open": true, "interval-seconds": 60 } })).toThrow(/always-open/);
    expect(() => parseInteractionSettings({ guides: { price: 0, "interval-seconds": 60 } })).toThrow(/price/);
    expect(() => parseInteractionSettings({ guides: { typo: 1, "interval-seconds": 60 } })).toThrow(/Unknown guide setting/);
  });
});

describe("parseInteractionSettings feedback polymorphism", () => {
  it("accepts an object or single-element array", () => {
    expect(parseInteractionSettings({ feedback: { "reward-credits": 5 } })?.feedback.rewardCredits).toBe(5);
    expect(parseInteractionSettings({ feedback: [{ "reward-credits": 7 }] })?.feedback.rewardCredits).toBe(7);
  });

  it("warns and ignores additional feedback elements", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const settings = parseInteractionSettings({
      feedback: [{ "reward-credits": 3 }, { "reward-credits": 9 }, { "reward-credits": 11 }],
    });
    expect(settings?.feedback.rewardCredits).toBe(3);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/single config object/);
    warn.mockRestore();
  });
});
