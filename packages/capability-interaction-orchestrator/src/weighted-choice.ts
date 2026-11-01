/** A candidate's prior selection count is durable state supplied by the caller. */
export interface WeightedCandidate<T> {
  value: T;
  previousSelections: number;
}

/**
 * Select without replacement. Prior selections add a bounded, gentle boost:
 * weights range from 1 to 2, with each selection adding 0.1. Injecting the
 * random source lets callers test the distribution deterministically.
 */
export function weightedChoices<T>(
  candidates: readonly WeightedCandidate<T>[],
  count: number,
  random: () => number = Math.random,
): T[] {
  if (!Number.isInteger(count) || count < 0 || count > candidates.length) {
    throw new RangeError("count must be an integer between zero and the candidate count");
  }
  const remaining = candidates.map((candidate) => {
    if (!Number.isSafeInteger(candidate.previousSelections) || candidate.previousSelections < 0) {
      throw new RangeError("previousSelections must be a non-negative integer");
    }
    return { value: candidate.value, weight: 1 + Math.min(candidate.previousSelections, 10) / 10 };
  });
  const selected: T[] = [];
  while (selected.length < count) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("random must return a number in [0, 1)");
    }
    let target = sample * remaining.reduce((sum, candidate) => sum + candidate.weight, 0);
    let index = 0;
    while (index < remaining.length - 1 && target >= remaining[index].weight) {
      target -= remaining[index++].weight;
    }
    selected.push(remaining.splice(index, 1)[0].value);
  }
  return selected;
}
