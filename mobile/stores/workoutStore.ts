import { create } from 'zustand';
import { db } from '../lib/db';

interface WorkoutState {
  // Program data
  workoutProgram: Record<number, any>;
  currentWeek: number;
  currentDay: string;

  // Logging
  exerciseLog: Record<string, any>;
  completedWorkouts: Record<string, boolean>;

  // Actions
  setWorkoutProgram: (program: Record<number, any>) => void;
  updateWorkoutProgram: (updates: Record<number, any>) => void;
  setCurrentWeek: (week: number) => void;
  setCurrentDay: (day: string) => void;
  setExerciseLog: (log: Record<string, any>) => void;
  setCompletedWorkouts: (workouts: Record<string, boolean>) => void;

  // Workout logging
  logSet: (
    userId: string,
    gymId: string,
    exerciseIndex: number,
    setIndex: number,
    data: any
  ) => Promise<void>;

  isSetLogged: (
    userId: string,
    exerciseIndex: number,
    setIndex: number,
    targetUserId?: string
  ) => boolean;

  getCompletionPercentage: (
    userId: string,
    week: number,
    day: string,
    targetUserId?: string
  ) => number;

  toggleWorkoutComplete: (
    userId: string,
    gymId: string,
    week: number,
    day: string
  ) => Promise<boolean>;

  // Data loading
  loadWorkoutData: (userId: string, gymId: string) => Promise<void>;

  reset: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workoutProgram: {},
  currentWeek: 1,
  currentDay: '',
  exerciseLog: {},
  completedWorkouts: {},

  setWorkoutProgram: (program) => set({ workoutProgram: program }),
  updateWorkoutProgram: (updates) =>
    set((state) => ({ workoutProgram: { ...state.workoutProgram, ...updates } })),
  setCurrentWeek: (week) => set({ currentWeek: week }),
  setCurrentDay: (day) => set({ currentDay: day }),
  setExerciseLog: (log) => set({ exerciseLog: log }),
  setCompletedWorkouts: (workouts) => set({ completedWorkouts: workouts }),

  logSet: async (userId, gymId, exerciseIndex, setIndex, data) => {
    const { currentWeek, currentDay, exerciseLog } = get();
    const key = `${userId}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`;
    const wasCompleted = exerciseLog[key]?.completed || false;

    // Normalize property names to match repository expectations
    const actualWeight = data.actualWeight ?? data.prescribedWeight ?? data.weight ?? null;
    const prescribedWeight = data.prescribedWeight ?? data.weight ?? null;
    const actualReps = data.actualReps ?? data.prescribedReps ?? data.reps ?? null;
    const prescribedReps = data.prescribedReps ?? data.reps ?? null;
    const completed = !wasCompleted;

    const normalizedData = {
      actualWeight,
      prescribedWeight,
      actualReps,
      prescribedReps,
      completed,
      percentage: data.percentage,
      exerciseName: data.exerciseName,
    };

    set((state) => ({
      exerciseLog: {
        ...state.exerciseLog,
        [key]: normalizedData,
      },
    }));

    if (gymId) {
      await db.logSet(
        userId, gymId, currentWeek, currentDay,
        exerciseIndex, setIndex,
        data.exerciseName || `Exercise ${exerciseIndex + 1}`,
        normalizedData
      );
    }
  },

  isSetLogged: (userId, exerciseIndex, setIndex, targetUserId) => {
    const { currentWeek, currentDay, exerciseLog } = get();
    const uid = targetUserId || userId;
    return exerciseLog[`${uid}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`]?.completed || false;
  },

  getCompletionPercentage: (userId, week, day, targetUserId) => {
    const { workoutProgram, exerciseLog } = get();
    const uid = targetUserId || userId;
    if (!workoutProgram[week]?.[day]?.exercises) return 0;
    const totalSets = workoutProgram[week][day].exercises.reduce(
      (acc: number, ex: any) => acc + ex.sets, 0
    );
    if (totalSets === 0) return 0;
    let completed = 0;
    workoutProgram[week][day].exercises.forEach((ex: any, ei: number) => {
      for (let si = 0; si < ex.sets; si++) {
        if (exerciseLog[`${uid}-${week}-${day}-${ei}-${si}`]?.completed) completed++;
      }
    });
    return Math.round((completed / totalSets) * 100);
  },

  toggleWorkoutComplete: async (userId, gymId, week, day) => {
    const { completedWorkouts } = get();
    const key = `${userId}-${week}-${day}`;
    const wasComplete = completedWorkouts[key] || false;

    set((state) => ({
      completedWorkouts: { ...state.completedWorkouts, [key]: !wasComplete },
    }));

    if (wasComplete) {
      await db.unmarkWorkoutComplete(userId, gymId, week, day);
    } else {
      await db.markWorkoutComplete(userId, gymId, week, day);
    }

    return !wasComplete; // returns new completion state for confetti trigger
  },

  loadWorkoutData: async (userId, gymId) => {
    try {
      const [logs, completions, programs] = await Promise.all([
        db.getAllWorkoutLogs(gymId),
        db.getWorkoutCompletions(gymId),
        db.getAllWorkoutPrograms(gymId),
      ]);

      // Convert logs array to key-value object
      const logMap: Record<string, any> = {};
      if (Array.isArray(logs)) {
        logs.forEach((log: any) => {
          const key = `${log.user_id}-${log.week_number}-${log.day_name}-${log.exercise_index}-${log.set_index}`;
          logMap[key] = {
            completed: log.completed,
            actualWeight: log.actual_weight,
            prescribedWeight: log.prescribed_weight,
            actualReps: log.actual_reps,
            prescribedReps: log.prescribed_reps,
            percentage: log.percentage,
            exerciseName: log.exercise_name,
          };
        });
      }

      // Convert completions to key-value object
      const completionMap: Record<string, boolean> = {};
      if (Array.isArray(completions)) {
        completions.forEach((c: any) => {
          completionMap[`${c.user_id}-${c.week_number}-${c.day_name}`] = true;
        });
      }

      // Programs already returned as week-indexed object from repo
      const programMap: Record<number, any> = programs && typeof programs === 'object' ? programs : {};

      set({
        exerciseLog: logMap,
        completedWorkouts: completionMap,
        workoutProgram: programMap,
      });
    } catch (error) {
      console.error('Failed to load workout data:', error);
    }
  },

  reset: () => set({
    workoutProgram: {},
    currentWeek: 1,
    currentDay: '',
    exerciseLog: {},
    completedWorkouts: {},
  }),
}));
