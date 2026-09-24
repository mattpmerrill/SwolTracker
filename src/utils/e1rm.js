import { findMaxKey } from './workout';

/**
 * Epley estimated 1RM: weight × (1 + reps / 30).
 * Returns null for anything we can't estimate: no/zero load, or reps outside
 * the 1–10 range (ranges like "8-10", AMRAP/failure, and timed work are all
 * non-estimable). Bodyweight/unloaded rows have a null weight and come back
 * null here, so they never fire a PR.
 */
export function epleyE1RM(weight, reps) {
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

/** Key under which this exercise's 1RM is stored in the maxes map, or null. */
export function resolveMaxKey(exerciseName, maxes = {}) {
  if (!exerciseName) return null;
  const key = findMaxKey(exerciseName, maxes || {});
  return key && maxes[key] != null ? key : null;
}

/** Current recorded 1RM for an exercise from the maxes map, or null. */
export function resolveCurrentMax(exerciseName, maxes = {}) {
  const key = resolveMaxKey(exerciseName, maxes);
  return key ? maxes[key] : null;
}

/**
 * Per-lift strength trend from the loaded exercise log.
 * Only lifts that have a recorded 1RM are tracked (grouped under the max's
 * key, so "Bench" and "Barbell Bench Press" land on one line). Each lift gets
 * its best estimated 1RM per week, oldest → newest, plus the change from the
 * first to the last week in the window.
 *
 * exerciseLog keys are `${userId}-${week}-${day}-${exerciseIndex}-${setIndex}`;
 * userId is a uuid (contains dashes), so we match on the prefix and parse the
 * remainder rather than splitting the whole key.
 */
export function buildStrengthTrends(exerciseLog = {}, userId, maxes = {}, { minWeeks = 2, limit = 6 } = {}) {
  if (!userId || !maxes || Object.keys(maxes).length === 0) return [];
  const prefix = `${userId}-`;
  const byLift = {};

  for (const [key, entry] of Object.entries(exerciseLog || {})) {
    if (!key.startsWith(prefix) || !entry?.completed) continue;
    const week = Number.parseInt(key.slice(prefix.length).split('-')[0], 10);
    if (!Number.isFinite(week)) continue;
    const liftKey = resolveMaxKey(entry.exerciseName, maxes);
    if (!liftKey) continue;
    const est = epleyE1RM(Number(entry.actualWeight), entry.actualReps);
    if (est == null) continue;
    const weeks = (byLift[liftKey] ||= {});
    weeks[week] = Math.max(weeks[week] ?? 0, est);
  }

  return Object.entries(byLift)
    .map(([lift, weeks]) => {
      const points = Object.entries(weeks)
        .map(([week, e1rm]) => ({ week: Number(week), e1rm: roundToNearestFive(e1rm) }))
        .sort((a, b) => a.week - b.week);
      return {
        lift,
        points,
        latest: points[points.length - 1]?.e1rm ?? null,
        change: points.length > 1 ? points[points.length - 1].e1rm - points[0].e1rm : 0,
      };
    })
    .filter(t => t.points.length >= minWeeks)
    .sort((a, b) => b.latest - a.latest)
    .slice(0, limit);
}
