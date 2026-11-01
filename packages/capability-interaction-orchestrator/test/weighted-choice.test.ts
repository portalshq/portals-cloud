import { describe, expect, it } from "vitest";
import { weightedChoices } from "../src/weighted-choice.js";

describe("weightedChoices", () => {
  const candidates = [
    { value: "bear", previousSelections: 0 },
    { value: "hat", previousSelections: 10 },
  ];

  it("boosts prior selections and selects without replacement", () => {
    expect(weightedChoices(candidates, 2, () => 0.4)).toEqual(["hat", "bear"]);
    expect(weightedChoices(candidates, 1, () => 0.2)).toEqual(["bear"]);
  });

  it("bounds the boost and validates its inputs", () => {
    expect(weightedChoices([{ value: "x", previousSelections: 100 }, candidates[0]], 1, () => 0.6)).toEqual(["x"]);
    expect(() => weightedChoices(candidates, 3)).toThrow(RangeError);
    expect(() => weightedChoices([{ value: "x", previousSelections: -1 }], 1)).toThrow(RangeError);
    expect(() => weightedChoices(candidates, 1, () => 1)).toThrow(RangeError);
  });
});
