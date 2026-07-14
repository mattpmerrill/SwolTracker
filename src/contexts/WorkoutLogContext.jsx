import { createContext, useContext, useEffect, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { useWorkoutLogger } from '../hooks/useWorkoutLogger';
import { useProgram } from './ProgramContext';

const WorkoutLogContext = createContext(null);

/**
 * Workout log domain: set logging, completion tracking, derived percentages.
 * Depends on ProgramContext for week/day/program/gym and on the authenticated
 * user id for log keys.
 */
export function WorkoutLogProvider({ children, currentUser, bundle }) {
  const toast = useToast();
  const { currentWeek, currentDay, workoutProgram, gymId } = useProgram();

  const {
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
  } = useWorkoutLogger({
    currentUser,
    currentWeek,
    currentDay,
    workoutProgram,
    gymId,
    toast,
  });

  // Hydrate from bootstrap once the ready bundle arrives / reloads.
  useEffect(() => {
    if (!bundle || bundle.kind === 'onboarding') return;
    setExerciseLog(bundle.exerciseLog || {});
    setCompletedWorkouts(bundle.completedWorkouts || {});
  }, [bundle, setExerciseLog, setCompletedWorkouts]);

  const value = useMemo(() => ({
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
  }), [
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
  ]);

  return (
    <WorkoutLogContext.Provider value={value}>
      {children}
    </WorkoutLogContext.Provider>
  );
}

export function useWorkoutLog() {
  const ctx = useContext(WorkoutLogContext);
  if (!ctx) {
    throw new Error('useWorkoutLog must be used within WorkoutLogProvider');
  }
  return ctx;
}
