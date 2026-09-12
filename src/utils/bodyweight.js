import { getRestSeconds } from './restCue';

/** True when this set has no prescribed/logged load and is not a %1RM row. */
export function isBodyweightLoad({ prescribedWeight, percentage, weightOverride } = {}) {
  return prescribedWeight == null && weightOverride == null && !percentage;
}

export function isAmrapPrescription(reps) {
  return /amrap|to failure|\bfailure\b/i.test(String(reps ?? ''));
}

/** Session from insights: no recorded load means bodyweight (or unloaded). */
export function isBodyweightSession(session) {
  if (!session) return true;
  return !(session.avg_actual_weight > 0) && !(session.avg_prescribed_weight > 0);
}

/**
 * Non-interactive copy for the vacated load column.
 * Last session is the number to beat; otherwise AMRAP intent or rest.
 */
export function bodyweightRowHint({ reps, isLogged = false, lastAvgReps = null } = {}) {
  if (isLogged) return '';
  const last = typeof lastAvgReps === 'number' && Number.isFinite(lastAvgReps) && lastAvgReps > 0
    ? Math.round(lastAvgReps)
    : null;
  if (last != null) return `Last ${last}`;
  if (isAmrapPrescription(reps)) return 'Max effort';
  return `${getRestSeconds(reps)}s rest`;
}

export function overloadIncreaseMessage({ exerciseName, consecutiveHits, isBodyweight = false }) {
  const streak = `${exerciseName} hit prescribed reps for ${consecutiveHits} straight sessions.`;
  if (isBodyweight) return `${streak} Add 2 reps next time.`;
  return `${streak} Add 5 lbs next time.`;
}

export function overloadDeloadMessage({ exerciseName, consecutiveMisses, isBodyweight = false }) {
  if (isBodyweight) {
    return `${exerciseName} has missed prescribed reps for ${consecutiveMisses} straight sessions. Consider fewer reps or an easier variation.`;
  }
  return `${exerciseName} has missed prescribed reps for ${consecutiveMisses} straight sessions. Consider a deload or form check.`;
}
