import { useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { buildMissingWorkoutSetLogs, getExerciseLogKey } from '../utils/workout';

/**
 * Hook for managing workout set logging and completion tracking.
 *
 * Writes are optimistic for snappy UX, then rolled back + toasted if the
 * DB call fails so the UI never lies about what was saved.
 */
export function useWorkoutLogger({ currentUser, currentWeek, currentDay, workoutProgram, gymId, toast }) {
  const [exerciseLog, setExerciseLog] = useState({});
  const [completedWorkouts, setCompletedWorkouts] = useState({});

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
      toast?.error('Could not save that set. Check your connection and try again.');
    }
  }, [currentUser, gymId, currentWeek, currentDay, exerciseLog, toast]);

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
    const previousLogSnapshot = missingSetLogs.length > 0
      ? Object.fromEntries(missingSetLogs.map(({ key: logKey }) => [logKey, exerciseLog[logKey]]))
      : null;

    setCompletedWorkouts(prev => ({ ...prev, [key]: !wasComplete }));

    const rollback = () => {
      setCompletedWorkouts(prev => {
        const next = { ...prev };
        if (previousCompletion === undefined) {
          delete next[key];
        } else {
          next[key] = previousCompletion;
        }
        return next;
      });
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
      toast?.error('Could not update workout completion. Try again.');
    };

    try {
      if (wasComplete) {
        if (gymId) {
          const ok = await db.unmarkWorkoutComplete(currentUser, gymId, week, day);
          if (ok === false) {
            rollback();
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
              rollback();
              return;
            }
          }
        }
        if (gymId) {
          const result = await db.markWorkoutComplete(currentUser, gymId, week, day);
          if (!result) {
            rollback();
            return;
          }
        }
      }
    } catch {
      rollback();
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
  }, [currentUser, gymId, completedWorkouts, exerciseLog, workoutProgram, getCompletionPercentage, toast]);

  return {
    exerciseLog,
    setExerciseLog,
    completedWorkouts,
    setCompletedWorkouts,
    logSet,
    isSetLogged,
    getCompletionPercentage,
    getTotalCompletedSets,
    getTotalCompletedWorkouts,
    isWorkoutComplete,
    toggleWorkoutComplete,
  };
}
