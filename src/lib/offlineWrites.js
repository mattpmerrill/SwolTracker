import { db } from './supabase';
import { WRITE_TYPES } from './offlineQueue';

export async function executeQueuedWrite(item) {
  const { type, payload } = item;

  if (type === WRITE_TYPES.LOG_SET) {
    return db.logSet(
      payload.userId,
      payload.gymId,
      payload.week,
      payload.day,
      payload.exerciseIndex,
      payload.setIndex,
      payload.exerciseName,
      payload.entry,
    );
  }

  if (type === WRITE_TYPES.MARK_COMPLETE) {
    const missing = payload.missingSetLogs || [];
    for (const set of missing) {
      const logged = await db.logSet(
        payload.userId,
        payload.gymId,
        payload.week,
        payload.day,
        set.exerciseIndex,
        set.setIndex,
        set.exerciseName,
        set.logData,
      );
      if (!logged) return null;
    }
    if (payload.clearMissed) {
      const cleared = await db.clearMissedDay(
        payload.userId,
        payload.gymId,
        payload.week,
        payload.day,
      );
      if (cleared === false) return null;
    }
    return db.markWorkoutComplete(
      payload.userId,
      payload.gymId,
      payload.week,
      payload.day,
    );
  }

  if (type === WRITE_TYPES.UNMARK_COMPLETE) {
    const ok = await db.unmarkWorkoutComplete(
      payload.userId,
      payload.gymId,
      payload.week,
      payload.day,
    );
    return ok === false ? null : { ok: true };
  }

  if (type === WRITE_TYPES.LOG_MISSED) {
    return db.logMissedDay(
      payload.userId,
      payload.gymId,
      payload.week,
      payload.day,
      payload.reason,
    );
  }

  if (type === WRITE_TYPES.CLEAR_MISSED) {
    const ok = await db.clearMissedDay(
      payload.userId,
      payload.gymId,
      payload.week,
      payload.day,
    );
    return ok === false ? null : { ok: true };
  }

  return null;
}
