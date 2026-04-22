/**
 * Apply a weight override and cascade it to later unlogged sets.
 *
 * When a lifter scales a set down ("I'm not feeling it — 170 instead of 185"),
 * they almost always want the remaining sets of that exercise to follow suit.
 * Logged sets are immutable; the cascade skips them.
 *
 * @param {Object.<number, number>} overrides - current { [setIdx]: weight } map
 * @param {number} setIdx - the set being edited
 * @param {number|null} newWeight - the new weight, or null to clear
 * @param {(setIdx: number) => boolean} isLogged - predicate for "this set is logged"
 * @param {number} totalSets - total sets in the exercise
 * @returns {Object.<number, number>} new overrides map
 */
export function applyWeightCascade(overrides, setIdx, newWeight, isLogged, totalSets) {
  const next = { ...overrides };
  for (let i = setIdx; i < totalSets; i++) {
    if (i > setIdx && isLogged(i)) continue;
    if (newWeight === null || newWeight === undefined) {
      delete next[i];
    } else {
      next[i] = newWeight;
    }
  }
  return next;
}
