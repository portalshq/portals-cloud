import { describe, expect, it } from "vitest";
import { parseChoiceSettings } from "../src/interactions-config.js";
describe("parseChoiceSettings", () => {
  it("parses channel interaction settings with defaults", () => {
    expect(parseChoiceSettings({ choice: { "model-choice-interval": true } })).toEqual({ choiceNumber: 3, price: 0, choiceDuration: 8, persistent: false, schedule: { mode: "model" } });
    expect(parseChoiceSettings({ choice: { "choice-interval-seconds": 60, "choice-number": 6 } })?.schedule).toEqual({ mode: "timed", choiceIntervalSeconds: 60 });
    expect(parseChoiceSettings(undefined)).toBeUndefined();
  });
  it("rejects invalid or conflicting settings", () => {
    for (const choice of [{}, { "model-choice-interval": true, "choice-interval-seconds": 5 }, { "choice-interval-seconds": 1, "choice-number": 1 }, { "choice-interval-seconds": 1, price: -1 }, { "choice-interval-seconds": 1, typo: true }]) {
      expect(() => parseChoiceSettings({ choice })).toThrow();
    }
  });
});
