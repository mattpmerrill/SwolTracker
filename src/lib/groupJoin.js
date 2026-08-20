/**
 * Helpers for joining a workout group. Kept out of the hook so the two
 * production bugs (truthy `{ success: false }`, program map treated as array)
 * can be unit-tested without mounting React.
 */

/**
 * @param {unknown} result - RPC payload from acceptGroupInvite
 * @returns {boolean}
 */
export function inviteSucceeded(result) {
  if (result == null) return false;
  if (typeof result === 'boolean') return result;
  if (typeof result === 'object') return result.success === true;
  return false;
}

/**
 * `getAllWorkoutPrograms` returns `{ [weekNumber]: programData }`, never an array.
 * @param {unknown} programs
 * @returns {Record<string, unknown> | null} map to hydrate workoutProgram, or null to leave state
 */
export function programMapFromRepo(programs) {
  if (!programs || typeof programs !== 'object' || Array.isArray(programs)) return null;
  return Object.keys(programs).length > 0 ? programs : null;
}
