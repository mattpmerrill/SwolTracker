/**
 * Cold-start workout log bounds for web bootstrap (Phase 1.4).
 * Completions + missed days stay full-history (tiny rows).
 * Set-level logs load a recent window and lazy-load older weeks on navigate.
 */
export const BOOTSTRAP_LOG_LOOKBACK_WEEKS = 8

/** Inclusive earliest week to fetch for cold start given calendar current week. */
export function getBootstrapLogFromWeek(currentWeek, lookbackWeeks = BOOTSTRAP_LOG_LOOKBACK_WEEKS) {
  const week = Number.isFinite(currentWeek) ? Math.max(1, Math.trunc(currentWeek)) : 1
  const lookback = Math.max(1, lookbackWeeks || BOOTSTRAP_LOG_LOOKBACK_WEEKS)
  return Math.max(1, week - lookback + 1)
}

/** Map workout_logs rows into the client exerciseLog shape. */
export function exerciseLogFromRows(logs) {
  const exerciseLog = {}
  if (!Array.isArray(logs)) return exerciseLog
  for (const l of logs) {
    const key = `${l.user_id}-${l.week_number}-${l.day_name}-${l.exercise_index}-${l.set_index}`
    exerciseLog[key] = {
      completed: l.completed,
      actualWeight: l.actual_weight,
      actualReps: l.actual_reps,
    }
  }
  return exerciseLog
}
