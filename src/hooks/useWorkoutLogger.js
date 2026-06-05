import { useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { buildMissingWorkoutSetLogs, getExerciseLogKey } from '../utils/workout';

/**
 * Hook for managing workout set logging and completion tracking
 */
export function useWorkoutLogger({ currentUser, currentWeek, currentDay, workoutProgram, gymId }) {
  const [exerciseLog, setExerciseLog] = useState({});
  const [completedWorkouts, setCompletedWorkouts] = useState({});

  const logSet = useCallback(async (exerciseIndex, setIndex, data) => {
    const key = getExerciseLogKey(currentUser, currentWeek, currentDay, exerciseIndex, setIndex);
    const wasCompleted = exerciseLog[key]?.completed || false;
    const actualWeight = data.actualWeight ?? data.prescribedWeight ?? data.weight ?? null;
    const prescribedWeight = data.prescribedWeight ?? data.weight ?? null;
    const actualReps = data.actualReps ?? data.reps ?? null;
    const prescribedReps = data.prescribedReps ?? data.reps ?? null;
    const completed = !wasCompleted;
    setExerciseLog(prev => ({
      ...prev,
      [key]: { actualWeight, prescribedWeight, actualReps, prescribedReps, completed },
    }));
    if (gymId) {
      await db.logSet(
        currentUser,
        gymId,
        currentWeek,
        currentDay,
        exerciseIndex,
        setIndex,
        data.exerciseName || `Exercise ${exerciseIndex + 1}`,
        { actualWeight, prescribedWeight, actualReps, prescribedReps, completed },
      );
    }
  }, [currentUser, gymId, currentWeek, currentDay, exerciseLog]);

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

    setCompletedWorkouts(prev => ({ ...prev, [key]: !wasComplete }));

    if (wasComplete) {
      await db.unmarkWorkoutComplete(currentUser, gymId, week, day);
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
          await Promise.all(missingSetLogs.map(({ exerciseIndex, setIndex, exerciseName, logData }) => (
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
        }
      }
      await db.markWorkoutComplete(currentUser, gymId, week, day);
    }

    if (!wasComplete && (completionPct === 100 || missingSetLogs.length > 0)) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7']
      });
    }
  }, [currentUser, gymId, completedWorkouts, exerciseLog, workoutProgram, getCompletionPercentage]);

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
