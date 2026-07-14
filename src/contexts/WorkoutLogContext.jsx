import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import { useWorkoutLogger } from '../hooks/useWorkoutLogger';
import { exerciseLogFromRows } from '../lib/bootstrapLogs';
import { db } from '../lib/supabase';
import { useProgram } from './ProgramContext';

const WorkoutLogContext = createContext(null);

/**
 * Workout log domain: set logging, completion, missed days, derived percentages.
 * Depends on ProgramContext for week/day/program/gym and on the authenticated
 * user id for log keys.
 *
 * Bootstrap hydrates a recent week window of set logs (Phase 1.4). When the user
 * navigates to an older week outside that window, we fetch and merge those rows.
 */
export function WorkoutLogProvider({ children, currentUser, bundle }) {
  const toast = useToast();
  const { currentWeek, currentDay, workoutProgram, gymId } = useProgram();
  const [logFromWeek, setLogFromWeek] = useState(1);
  const fetchInFlight = useRef(null);

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
    setLogFromWeek(bundle.logFromWeek ?? 1);
  }, [bundle, setExerciseLog, setCompletedWorkouts, setMissedWorkouts]);

  // Lazy-load set logs when navigating earlier than the bootstrap window.
  useEffect(() => {
    if (!gymId || !Number.isFinite(currentWeek)) return;
    if (currentWeek >= logFromWeek) return;

    const fromWeek = currentWeek;
    const toWeek = logFromWeek - 1;
    const key = `${gymId}:${fromWeek}-${toWeek}`;
    if (fetchInFlight.current === key) return;
    fetchInFlight.current = key;

    let cancelled = false;
    (async () => {
      try {
        const rows = await db.getWorkoutLogsInWeekRange(gymId, fromWeek, toWeek);
        if (cancelled) return;
        const partial = exerciseLogFromRows(rows);
        setExerciseLog((prev) => ({ ...partial, ...prev }));
        setLogFromWeek(fromWeek);
      } catch (error) {
        console.error('Error lazy-loading workout logs:', error);
      } finally {
        if (fetchInFlight.current === key) fetchInFlight.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gymId, currentWeek, logFromWeek, setExerciseLog]);

  const value = useMemo(() => ({
    exerciseLog,
    setExerciseLog,
    completedWorkouts,
    setCompletedWorkouts,
    missedWorkouts,
    setMissedWorkouts,
    logFromWeek,
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
    logFromWeek,
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
