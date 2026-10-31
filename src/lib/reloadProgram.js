import { db } from './supabase';

/**
 * Re-read every program week for a gym and hand them to the app. Shared by the hooks that change the
 * program on the server (Chad's chat edits, check-in apply, missed-day moves). Each caller shows its
 * own toast. Same guard as bootstrap: an empty result never replaces the program.
 * @returns {Promise<boolean>} true when the program was replaced
 */
export async function reloadProgram({ programGymId, setWorkoutProgram }) {
  try {
    const programs = await db.getAllWorkoutPrograms(programGymId);
    if (programs && Object.keys(programs).length > 0) {
      setWorkoutProgram(programs);
      return true;
    }
    console.error('reloadProgram: getAllWorkoutPrograms returned no weeks');
    return false;
  } catch (err) {
    console.error('reloadProgram failed:', err?.message);
    return false;
  }
}
