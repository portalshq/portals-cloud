import { describe, expect, it } from "vitest";
import { validateChoiceOptions } from "../src/choice.js";
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


it("validates and preserves safe option image URLs", () => {
  expect(validateChoiceOptions([{ ...options[0], imageUrl: "/api/choice-images/abc" }, options[1]])[0].imageUrl).toBe("/api/choice-images/abc");
  expect(() => validateChoiceOptions([{ ...options[0], imageUrl: "javascript:alert(1)" }, options[1]])).toThrow();
  expect(() => validateChoiceOptions([{ ...options[0], imageUrl: "//evil.example/image" }, options[1]])).toThrow();
  expect(() => validateChoiceOptions([{ ...options[0], imageUrl: "/\\evil.example/image" }, options[1]])).toThrow();
});


it("preserves valid dynamic PX entity types on winners", () => {
  const choices = validateChoiceOptions([{ id: "a", kind: "location", name: "Forest", createdEntity: true }, { id: "b", kind: "creature-kind", name: "Dragon" }]);
  expect(resolveCollectiveChoice(choices, [{ actorId: "v", optionId: "a" }])?.winner).toMatchObject({ kind: "location", createdEntity: true });
  expect(() => validateChoiceOptions([{ id: "a", kind: "../prop", name: "bad" }, options[1]])).toThrow();
});
