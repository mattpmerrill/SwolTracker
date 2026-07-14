import { useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { reportWriteFailure } from '../lib/errorService';
import { buildMissingWorkoutSetLogs, getExerciseLogKey } from '../utils/workout';

/**
 * Hook for managing workout set logging, completion, and missed-day tracking.
 *
 * Writes are optimistic for snappy UX, then rolled back + toasted if the
 * DB call fails so the UI never lies about what was saved.
 */
export function useWorkoutLogger({ currentUser, currentWeek, currentDay, workoutProgram, gymId, toast }) {
  const [exerciseLog, setExerciseLog] = useState({});
  const [completedWorkouts, setCompletedWorkouts] = useState({});
  /** Map of `${userId}-${week}-${day}` → { reason: string|null } */
  const [missedWorkouts, setMissedWorkouts] = useState({});

  const failWrite = useCallback(async (operation, message, userMessage, context = {}) => {
    await reportWriteFailure({
      db,
      toast,
      userId: currentUser,
      component: 'useWorkoutLogger.js',
      operation,
      message,
      userMessage,
      context,
    });
  }, [currentUser, toast]);

  const logSet = useCallback(async (exerciseIndex, setIndex, data) => {
    const key = getExerciseLogKey(currentUser, currentWeek, currentDay, exerciseIndex, setIndex);
    const previous = exerciseLog[key];
    const wasCompleted = previous?.completed || false;
    const actualWeight = data.actualWeight ?? data.prescribedWeight ?? data.weight ?? null;
    const prescribedWeight = data.prescribedWeight ?? data.weight ?? null;
    const actualReps = data.actualReps ?? data.reps ?? null;
    const prescribedReps = data.prescribedReps ?? data.reps ?? null;
    const completed = !wasCompleted;
    const nextEntry = { actualWeight, prescribedWeight, actualReps, prescribedReps, completed };

    setExerciseLog(prev => ({
      ...prev,
      [key]: nextEntry,
    }));

    if (!gymId) return;

    const result = await db.logSet(
      currentUser,
      gymId,
      currentWeek,
      currentDay,
      exerciseIndex,
      setIndex,
      data.exerciseName || `Exercise ${exerciseIndex + 1}`,
      nextEntry,
    );

    if (!result) {
      setExerciseLog(prev => {
        const next = { ...prev };
        if (previous === undefined) {
          delete next[key];
        } else {
          next[key] = previous;
        }
        return next;
      });
      await failWrite(
        'logSet',
        'logSet returned null',
        'Could not save that set. Check your connection and try again.',
        { week: currentWeek, day: currentDay, exerciseIndex, setIndex },
      );
    }
  }, [currentUser, gymId, currentWeek, currentDay, exerciseLog, failWrite]);

  const isSetLogged = useCallback((exerciseIndex, setIndex, targetUserId = currentUser) => {
    return exerciseLog[getExerciseLogKey(targetUserId, currentWeek, currentDay, exerciseIndex, setIndex)]?.completed;
  }, [currentWeek, currentDay, exerciseLog, currentUser]);

  const getCompletionPercentage = useCallback((week, day, targetUserId = currentUser) => {
    if (!workoutProgram[week]?.[day]?.exercises) return 0;
    const totalSets = workoutProgram[week][day].exercises.reduce((acc, ex) => acc + ex.sets, 0);
    if (totalSets === 0) return 0;
    let completed = 0;
    workoutProgram[week][day].exercises.forEach((ex, ei) => {
      for (let si = 0; si < ex.sets; si++) {
        if (exerciseLog[getExerciseLogKey(targetUserId, week, day, ei, si)]?.completed) completed++;
      }
    });
    return Math.round((completed / totalSets) * 100);
  }, [workoutProgram, exerciseLog, currentUser]);

  const getTotalCompletedSets = useCallback((userId = currentUser) => {
    return Object.keys(exerciseLog).filter(k => k.startsWith(userId) && exerciseLog[k]?.completed).length;
  }, [exerciseLog, currentUser]);

  const getTotalCompletedWorkouts = useCallback((userId = currentUser) => {
    return Object.keys(completedWorkouts).filter(k => k.startsWith(userId) && completedWorkouts[k]).length;
  }, [completedWorkouts, currentUser]);

  const isWorkoutComplete = useCallback((week, day, targetUserId = currentUser) => {
    return completedWorkouts[`${targetUserId}-${week}-${day}`] || false;
  }, [completedWorkouts, currentUser]);

  const isWorkoutMissed = useCallback((week, day, targetUserId = currentUser) => {
    return !!missedWorkouts[`${targetUserId}-${week}-${day}`];
  }, [missedWorkouts, currentUser]);

  const getMissedReason = useCallback((week, day, targetUserId = currentUser) => {
    return missedWorkouts[`${targetUserId}-${week}-${day}`]?.reason ?? null;
  }, [missedWorkouts, currentUser]);

  const toggleWorkoutComplete = useCallback(async (week, day) => {
    const key = `${currentUser}-${week}-${day}`;
    const wasComplete = completedWorkouts[key] || false;
    const completionPct = getCompletionPercentage(week, day, currentUser);
    const missingSetLogs = buildMissingWorkoutSetLogs(
      workoutProgram[week]?.[day],
      exerciseLog,
      currentUser,
      week,
      day,
    );

    // Snapshot for rollback
    const previousCompletion = completedWorkouts[key];
    const previousMissed = missedWorkouts[key];
    const previousLogSnapshot = missingSetLogs.length > 0
      ? Object.fromEntries(missingSetLogs.map(({ key: logKey }) => [logKey, exerciseLog[logKey]]))
      : null;

    setCompletedWorkouts(prev => ({ ...prev, [key]: !wasComplete }));
    // Completing a day clears missed status optimistically
    if (!wasComplete && previousMissed) {
      setMissedWorkouts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }

    const rollback = async (operation, message) => {
      setCompletedWorkouts(prev => {
        const next = { ...prev };
        if (previousCompletion === undefined) {
          delete next[key];
        } else {
          next[key] = previousCompletion;
        }
        return next;
      });
      if (previousMissed) {
        setMissedWorkouts((prev) => ({ ...prev, [key]: previousMissed }));
      }
      if (previousLogSnapshot) {
        setExerciseLog(prev => {
          const next = { ...prev };
          for (const [logKey, prior] of Object.entries(previousLogSnapshot)) {
            if (prior === undefined) delete next[logKey];
            else next[logKey] = prior;
          }
          return next;
        });
      }
      await failWrite(operation, message, 'Could not update workout completion. Try again.', { week, day });
    };

    try {
      if (wasComplete) {
        if (gymId) {
          const ok = await db.unmarkWorkoutComplete(currentUser, gymId, week, day);
          if (ok === false) {
            await rollback('unmarkWorkoutComplete', 'unmarkWorkoutComplete returned false');
            return;
          }
        }
      } else {
        if (missingSetLogs.length > 0) {
          setExerciseLog(prev => {
            const next = { ...prev };
            missingSetLogs.forEach(({ key: logKey, logData }) => {
              next[logKey] = logData;
            });
            return next;
          });

          if (gymId) {
            const results = await Promise.all(missingSetLogs.map(({ exerciseIndex, setIndex, exerciseName, logData }) => (
              db.logSet(
                currentUser,
                gymId,
                week,
                day,
                exerciseIndex,
                setIndex,
                exerciseName,
                logData,
              )
            )));
            if (results.some((r) => !r)) {
              await rollback('logSet.onComplete', 'one or more missing set logs failed on complete');
              return;
            }
          }
        }
        if (gymId) {
          // Clear missed day if present (complete supersedes miss)
          if (previousMissed) {
            const cleared = await db.clearMissedDay(currentUser, gymId, week, day);
            if (cleared === false) {
              await rollback('clearMissedDay.onComplete', 'clearMissedDay returned false');
              return;
            }
          }
          const result = await db.markWorkoutComplete(currentUser, gymId, week, day);
          if (!result) {
            await rollback('markWorkoutComplete', 'markWorkoutComplete returned null');
            return;
          }
        }
      }
    } catch (err) {
      await rollback('toggleWorkoutComplete', err?.message || 'toggleWorkoutComplete threw');
      return;
    }

    if (!wasComplete && (completionPct === 100 || missingSetLogs.length > 0)) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7']
      });
    }
  }, [currentUser, gymId, completedWorkouts, missedWorkouts, exerciseLog, workoutProgram, getCompletionPercentage, failWrite]);

  /**
   * Mark a scheduled workout day as intentionally missed.
   * Blocks if already complete. Rest days should not call this (UI guards).
   */
  const markWorkoutMissed = useCallback(async (week, day, reason = null) => {
    const key = `${currentUser}-${week}-${day}`;
    if (completedWorkouts[key]) {
      toast?.error?.('Unmark complete before logging a skip.');
      return false;
    }

    const previous = missedWorkouts[key];
    setMissedWorkouts((prev) => ({ ...prev, [key]: { reason: reason || null } }));

    if (!gymId) return true;

    const result = await db.logMissedDay(currentUser, gymId, week, day, reason);
    if (!result) {
      setMissedWorkouts((prev) => {
        const next = { ...prev };
        if (previous === undefined) delete next[key];
        else next[key] = previous;
        return next;
      });
      await failWrite(
        'logMissedDay',
        'logMissedDay returned null',
        'Could not log that skip. Try again.',
        { week, day, reason },
      );
      return false;
    }

    toast?.success?.(reason
      ? `Logged ${day} as skipped (${reason}). No guilt — we'll adapt.`
      : `Logged ${day} as skipped. No guilt — we'll adapt.`);
    return true;
  }, [currentUser, gymId, completedWorkouts, missedWorkouts, toast, failWrite]);

  const clearWorkoutMissed = useCallback(async (week, day) => {
    const key = `${currentUser}-${week}-${day}`;
    const previous = missedWorkouts[key];
    if (!previous) return true;

    setMissedWorkouts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    if (!gymId) return true;

    const ok = await db.clearMissedDay(currentUser, gymId, week, day);
    if (ok === false) {
      setMissedWorkouts((prev) => ({ ...prev, [key]: previous }));
      await failWrite(
        'clearMissedDay',
        'clearMissedDay returned false',
        'Could not undo that skip. Try again.',
        { week, day },
      );
      return false;
    }
    toast?.success?.(`Cleared skip for ${day}.`);
    return true;
  }, [currentUser, gymId, missedWorkouts, toast, failWrite]);

  return {
    exerciseLog,
    setExerciseLog,
    completedWorkouts,
    setCompletedWorkouts,
    missedWorkouts,
    setMissedWorkouts,
    logSet,
    isSetLogged,
    getCompletionPercentage,
    getTotalCompletedSets,
    getTotalCompletedWorkouts,
    isWorkoutComplete,
    toggleWorkoutComplete,
    isWorkoutMissed,
    getMissedReason,
    markWorkoutMissed,
    clearWorkoutMissed,
  };
}
