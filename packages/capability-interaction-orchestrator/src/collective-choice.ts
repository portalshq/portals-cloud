import { randomInt } from "node:crypto";

export interface ChoiceOption { id: string; kind: "character" | "prop"; name: string }
export interface ChoiceBallot { actorId: string; optionId: string }

/** Tally a closed choice window. The caller persists the returned result atomically. */
export function resolveCollectiveChoice(
  options: readonly ChoiceOption[],
  ballots: readonly ChoiceBallot[],
  chooseIndex: (upperBound: number) => number = randomInt,
): { winner: ChoiceOption; votes: number } | null {
  if (options.length < 2 || options.length > 6) throw new RangeError("A choice requires two to six options");
  const byId = new Map<string, ChoiceOption>();
  for (const option of options) {
    if (!option.id?.trim() || !option.name?.trim() || !["character", "prop"].includes(option.kind) || byId.has(option.id)) throw new TypeError("Invalid or duplicate choice option");
    byId.set(option.id, option);
  }
  const counts = new Map<string, number>();
  const actors = new Set<string>();
  for (const ballot of ballots) {
    if (!ballot.actorId?.trim() || actors.has(ballot.actorId) || !byId.has(ballot.optionId)) throw new TypeError("Invalid or duplicate ballot");
    actors.add(ballot.actorId);
    counts.set(ballot.optionId, (counts.get(ballot.optionId) ?? 0) + 1);
  }
  if (!ballots.length) return null;
  const highest = Math.max(...counts.values());
  const tied = options.filter((option) => counts.get(option.id) === highest);
  const index = tied.length === 1 ? 0 : chooseIndex(tied.length);
  if (!Number.isInteger(index) || index < 0 || index >= tied.length) throw new RangeError("Invalid random tie selection");
  return { winner: { ...tied[index] }, votes: highest };
}
