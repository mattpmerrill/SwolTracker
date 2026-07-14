import { createContext, useContext, useEffect, useMemo } from 'react';
import { useToast } from '../components/Toast';
import { useWorkoutLogger } from '../hooks/useWorkoutLogger';
import { useProgram } from './ProgramContext';

const WorkoutLogContext = createContext(null);

/**
 * Workout log domain: set logging, completion, missed days, derived percentages.
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
    setMissedWorkouts(bundle.missedWorkouts || {});
  }, [bundle, setExerciseLog, setCompletedWorkouts, setMissedWorkouts]);

  const value = useMemo(() => ({
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
  }), [
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
