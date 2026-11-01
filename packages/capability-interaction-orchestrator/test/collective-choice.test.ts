import { describe, expect, it } from "vitest";
import { resolveCollectiveChoice } from "../src/collective-choice.js";
const options = [{ id: "bear", kind: "character" as const, name: "Bear" }, { id: "hat", kind: "prop" as const, name: "Hat" }];
describe("collective choice", () => {
  it("selects a plurality and returns no winner for no votes", () => {
    expect(resolveCollectiveChoice(options, [])).toBeNull();
    expect(resolveCollectiveChoice(options, [{ actorId: "a", optionId: "hat" }, { actorId: "b", optionId: "hat" }, { actorId: "c", optionId: "bear" }])).toEqual({ winner: options[1], votes: 2 });
  });
  it("uses an injected random tie breaker and validates ballots", () => {
    const tied = [{ actorId: "a", optionId: "bear" }, { actorId: "b", optionId: "hat" }];
    expect(resolveCollectiveChoice(options, tied, () => 1)?.winner.id).toBe("hat");
    expect(() => resolveCollectiveChoice(options, [...tied, tied[0]])).toThrow();
    expect(() => resolveCollectiveChoice(options, [{ actorId: "a", optionId: "unknown" }])).toThrow();
    expect(() => resolveCollectiveChoice(options, tied, () => 2)).toThrow();
  });
});
