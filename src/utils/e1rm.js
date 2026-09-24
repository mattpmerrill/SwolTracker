import { findMaxKey } from './workout';

/**
 * Epley estimated 1RM: weight × (1 + reps / 30).
 * Returns null for anything we can't estimate: no/zero load, or reps outside
 * the 1–10 range (ranges like "8-10", AMRAP/failure, and timed work are all
 * non-estimable). Bodyweight/unloaded rows have a null weight and come back
 * null here, so they never fire a PR.
 */
export function epelyE1RM(weight, reps) {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const r =
    typeof reps === 'number'
      ? reps
      : typeof reps === 'string' && /^\d+$/.test(reps.trim())
        ? Number.parseInt(reps, 10)
        : null;
  if (r == null || r < 1 || r > 10) return null;
  return weight * (1 + r / 30);
}

/** Round to nearest 5 lbs, matching the app's %1RM working-weight rounding. */
export function roundToNearestFive(n) {
  if (!Number.isFinite(n)) return n;
  return Math.round(n / 5) * 5;
}

/** Current recorded 1RM for an exercise from the maxes map, or null. */
export function resolveCurrentMax(exerciseName, maxes = {}) {
  const key = findMaxKey(exerciseName, maxes || {});
  return key ? (maxes[key] ?? null) : null;
}
