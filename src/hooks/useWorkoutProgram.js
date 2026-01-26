import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import { defaultWorkoutProgram } from '../constants';
import { getTodayDayName, calculateCurrentWeek } from '../utils/date';
import { getExerciseLogKey } from '../utils/workout';

/**
 * Hook for managing workout program state
 */
export function useWorkoutProgram({ currentUser, gymId, demoMode }) {
  const [workoutProgram, setWorkoutProgram] = useState(defaultWorkoutProgram);
  const [exerciseLog, setExerciseLog] = useState({});
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(getTodayDayName);
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString());

  // Calculate actual current week based on program start date
  const actualCurrentWeek = calculateCurrentWeek(programStartDate);

  // Get today's workout
  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const hasWorkoutProgrammed = workoutProgram[currentWeek] !== undefined;

  // Log a set completion
  const logSet = useCallback(async (exerciseIndex, setIndex, data) => {
    const key = getExerciseLogKey(currentUser, currentWeek, currentDay, exerciseIndex, setIndex);
    const wasCompleted = exerciseLog[key]?.completed || false;
    const newStatus = !wasCompleted;

    // Optimistic update
    const newLog = {
      ...exerciseLog,
      [key]: {
        ...data,
        completed: newStatus
      }
    };
    setExerciseLog(newLog);

    if (demoMode) return;

    // Persist to Supabase
    if (gymId) {
      const result = await db.logSet(
        currentUser,
        gymId,
        currentWeek,
        currentDay,
        exerciseIndex,
        setIndex,
        data.exerciseName || `Exercise ${exerciseIndex + 1}`,
        {
          ...data,
          completed: newStatus
        }
      );
      if (!result) {
        console.error('Failed to save workout log to database');
      }
    } else {
      console.warn('Cannot save workout log: gymId is not set');
    }
  }, [currentUser, gymId, currentWeek, currentDay, exerciseLog, demoMode]);

  // Check if a set is logged
  const isSetLogged = useCallback((exerciseIndex, setIndex, targetUserId = currentUser) => {
    const key = getExerciseLogKey(targetUserId, currentWeek, currentDay, exerciseIndex, setIndex);
    return exerciseLog[key]?.completed;
  }, [currentWeek, currentDay, exerciseLog, currentUser]);

  // Get completion percentage for a workout day
  const getCompletionPercentage = useCallback((week, day, targetUserId = currentUser) => {
    if (!workoutProgram[week] || !workoutProgram[week][day] || !workoutProgram[week][day].exercises) {
      return 0;
    }
    const totalSets = workoutProgram[week][day].exercises.reduce((acc, exercise) => acc + exercise.sets, 0);
    if (totalSets === 0) return 0;

    let completedSets = 0;
    workoutProgram[week][day].exercises.forEach((exercise, exerciseIndex) => {
      for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
        const key = getExerciseLogKey(targetUserId, week, day, exerciseIndex, setIndex);
        if (exerciseLog[key]?.completed) {
          completedSets++;
        }
      }
    });
    return Math.round((completedSets / totalSets) * 100);
  }, [workoutProgram, exerciseLog, currentUser]);

  // Get total completed sets for a user
  const getTotalCompletedSets = useCallback((targetUserId = currentUser) => {
    return Object.keys(exerciseLog).filter(k => k.startsWith(targetUserId) && exerciseLog[k]?.completed).length;
  }, [exerciseLog, currentUser]);

  // Navigation
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeek(w => Math.max(1, w - 1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeek(w => w + 1);
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeek(actualCurrentWeek);
  }, [actualCurrentWeek]);

  return {
    workoutProgram,
    setWorkoutProgram,
    exerciseLog,
    setExerciseLog,
    currentWeek,
    setCurrentWeek,
    currentDay,
    setCurrentDay,
    programStartDate,
    setProgramStartDate,
    actualCurrentWeek,
    todayWorkout,
    hasWorkoutProgrammed,
    logSet,
    isSetLogged,
    getCompletionPercentage,
    getTotalCompletedSets,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
