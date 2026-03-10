import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult, ProgramExercise } from "../types.js";
import { getTodayName } from "../week-calc.js";
import type { createQueryTools } from "./queries.js";
import type { createActionTools } from "./actions.js";

type WeightInput = number | "prescribed";

interface LogExerciseParams {
  exercise_name: string;
  sets: number;
  reps: number | string;
  weight_lbs?: number;
  notes?: string;
  percentage_of_max?: number;
}

interface LogWorkoutSummaryExercise {
  exercise_name: string;
  sets?: number;
  reps: number | string;
  weight_lbs?: WeightInput;
  notes?: string;
  percentage_of_max?: number;
}

interface LogWorkoutSummaryParams {
  gym_id?: string;
  week_number?: number;
  day_name?: string;
  exercises: LogWorkoutSummaryExercise[];
  mark_complete?: boolean;
}

interface ResolvedProgramExercise extends Omit<ProgramExercise, "percentages"> {
  exercise_index: number;
  weight_lbs: number | null;
  max_1rm: number | null;
  percentages?: number[] | null;
}

export function createNaturalLanguageTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>,
  actions: ReturnType<typeof createActionTools>
) {
  function fuzzyMatch(input: string, exercises: Array<{ name: string }>): number {
    const normalized = input.toLowerCase().trim();

    const exactIdx = exercises.findIndex(
      (e) => e.name.toLowerCase() === normalized
    );
    if (exactIdx >= 0) return exactIdx;

    const subIdx = exercises.findIndex(
      (e) =>
        e.name.toLowerCase().includes(normalized) ||
        normalized.includes(e.name.toLowerCase())
    );
    if (subIdx >= 0) return subIdx;

    const inputWords = normalized.split(/\s+/);
    let bestIdx = -1;
    let bestScore = 0;
    exercises.forEach((e, i) => {
      const exWords = e.name.toLowerCase().split(/\s+/);
      const overlap = inputWords.filter((w) => exWords.includes(w)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestIdx = i;
      }
    });

    return bestScore > 0 ? bestIdx : -1;
  }

  async function resolveWorkoutContext(
    gymId?: string,
    dayName?: string,
    weekNumber?: number
  ) {
    const todayResult = await queries.get_todays_workout(gymId, dayName, weekNumber);
    const todayData = todayResult.data as Record<string, unknown>;

    const resolvedGymId = todayData.gym_id as string | undefined;
    const currentWeek = (todayData.current_week as number) ?? weekNumber ?? 1;
    const resolvedDayName = (todayData.day_name as string) ?? dayName ?? getTodayName();
    const exercises = (todayData.exercises as ResolvedProgramExercise[]) ?? [];

    if (!resolvedGymId) {
      return {
        success: false,
        message: "No gym found. Cannot log workout.",
      } as const;
    }

    return {
      success: true,
      gymId: resolvedGymId,
      weekNumber: currentWeek,
      dayName: resolvedDayName,
      exercises,
    } as const;
  }

  async function resolveWeight(
    exerciseName: string,
    params: { weight_lbs?: number; percentage_of_max?: number }
  ) {
    const { weight_lbs, percentage_of_max } = params;

    if (typeof weight_lbs === "number") {
      return { actual_weight: weight_lbs, prescribed_weight: weight_lbs };
    }

    if (percentage_of_max) {
      const maxResult = await queries.get_maxes();
      const maxes = (maxResult.data as any)?.maxes ?? {};
      const max1RM = maxes[exerciseName];
      if (max1RM) {
        const resolved = Math.round((percentage_of_max / 100) * max1RM);
        return { actual_weight: resolved, prescribed_weight: resolved };
      }
    }

    return { actual_weight: 0, prescribed_weight: undefined };
  }

  async function resolveExistingLogs(
    gymId: string,
    weekNumber: number,
    dayName: string
  ) {
    const { data } = await supabase
      .from("workout_logs")
      .select("exercise_index, set_index, exercise_name")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .eq("week_number", weekNumber)
      .eq("day_name", dayName)
      .order("exercise_index", { ascending: true })
      .order("set_index", { ascending: true });

    return (data ?? []) as Array<{
      exercise_index: number;
      set_index: number;
      exercise_name: string;
    }>;
  }

  async function log_exercise(params: LogExerciseParams): Promise<ToolResult> {
    const { exercise_name, sets, reps } = params;
    const resolvedWeight = await resolveWeight(exercise_name, params);
    const context = await resolveWorkoutContext();

    if (!context.success) {
      return {
        success: false,
        message: context.message,
        data: {},
      };
    }

    const exerciseIndex = context.exercises.length > 0
      ? fuzzyMatch(exercise_name, context.exercises)
      : -1;

    const resolvedIndex = exerciseIndex >= 0 ? exerciseIndex : context.exercises.length;

    let startSetIndex = 0;
    if (exerciseIndex < 0) {
      const existingLogs = await resolveExistingLogs(
        context.gymId,
        context.weekNumber,
        context.dayName
      );
      const matchingIndexes = existingLogs
        .filter((log) => log.exercise_index === resolvedIndex)
        .map((log) => log.set_index);
      startSetIndex = matchingIndexes.length > 0 ? Math.max(...matchingIndexes) + 1 : 0;
    }

    const entries = Array.from({ length: sets }, (_, i) => ({
      gym_id: context.gymId,
      week_number: context.weekNumber,
      day_name: context.dayName,
      exercise_index: resolvedIndex,
      set_index: startSetIndex + i,
      exercise_name,
      actual_weight: resolvedWeight.actual_weight,
      actual_reps: reps,
      prescribed_weight: resolvedWeight.prescribed_weight,
      prescribed_reps: reps,
    }));

    const bulkResult = await actions.log_many_sets(
      entries.map((entry) => ({
        gym_id: entry.gym_id,
        week_number: entry.week_number,
        day_name: entry.day_name,
        exercise_index: entry.exercise_index,
        set_index: entry.set_index,
        exercise_name: entry.exercise_name,
        actual_weight: entry.actual_weight,
        actual_reps: entry.actual_reps,
        prescribed_weight: entry.prescribed_weight,
        prescribed_reps: entry.prescribed_reps,
        completed: true,
      }))
    );

    if (!bulkResult.success) {
      return bulkResult;
    }

    const matchNote =
      exerciseIndex >= 0
        ? `(matched to program exercise #${exerciseIndex + 1})`
        : "(logged as ad-hoc exercise)";

    return {
      success: true,
      message: `Logged: ${exercise_name} ${sets}x${reps}${resolvedWeight.actual_weight ? ` @ ${resolvedWeight.actual_weight} lbs` : ""} ${matchNote}`,
      data: {
        exercise_name,
        sets,
        reps,
        weight_lbs: resolvedWeight.actual_weight,
        exercise_index: resolvedIndex,
        matched_to_program: exerciseIndex >= 0,
        week_number: context.weekNumber,
        day_name: context.dayName,
      },
    };
  }

  async function log_workout_summary(
    params: LogWorkoutSummaryParams
  ): Promise<ToolResult> {
    const context = await resolveWorkoutContext(
      params.gym_id,
      params.day_name,
      params.week_number
    );

    if (!context.success) {
      return {
        success: false,
        message: context.message,
        data: {},
      };
    }

    const existingLogs = await resolveExistingLogs(
      context.gymId,
      context.weekNumber,
      context.dayName
    );

    const maxExistingExerciseIndex = existingLogs.length
      ? Math.max(...existingLogs.map((log) => log.exercise_index))
      : context.exercises.length - 1;

    let nextAdHocIndex = Math.max(context.exercises.length, maxExistingExerciseIndex + 1);
    const adHocNameToIndex = new Map<string, number>();
    const rows: Array<{
      gym_id: string;
      week_number: number;
      day_name: string;
      exercise_index: number;
      set_index: number;
      exercise_name: string;
      actual_weight: number;
      actual_reps: number | string;
      prescribed_weight?: number;
      prescribed_reps?: number | string;
      completed: true;
    }> = [];
    const summary: string[] = [];

    for (const exercise of params.exercises) {
      const matchedIndex = context.exercises.length > 0
        ? fuzzyMatch(exercise.exercise_name, context.exercises)
        : -1;
      const matchedExercise = matchedIndex >= 0 ? context.exercises[matchedIndex] : undefined;
      const normalizedName = exercise.exercise_name.toLowerCase().trim();

      let resolvedIndex = matchedIndex;
      if (resolvedIndex < 0) {
        const existingMatch = existingLogs.find(
          (log) => log.exercise_name.toLowerCase().trim() === normalizedName
        );

        if (existingMatch) {
          resolvedIndex = existingMatch.exercise_index;
        } else if (adHocNameToIndex.has(normalizedName)) {
          resolvedIndex = adHocNameToIndex.get(normalizedName) ?? nextAdHocIndex;
        } else {
          resolvedIndex = nextAdHocIndex++;
          adHocNameToIndex.set(normalizedName, resolvedIndex);
        }
      }

      const existingSetIndexes = [
        ...existingLogs
          .filter((log) => log.exercise_index === resolvedIndex)
          .map((log) => log.set_index),
        ...rows
          .filter((row) => row.exercise_index === resolvedIndex)
          .map((row) => row.set_index),
      ];
      const startSetIndex = existingSetIndexes.length > 0 ? Math.max(...existingSetIndexes) + 1 : 0;

      const setCount = exercise.sets ?? matchedExercise?.sets ?? 1;
      let actualWeight = 0;
      let prescribedWeight: number | undefined = undefined;

      if (exercise.weight_lbs === "prescribed") {
        if (!matchedExercise) {
          return {
            success: false,
            message: `Cannot use prescribed weight for ${exercise.exercise_name} because it was not matched to today's program.`,
            data: {},
          };
        }

        if (matchedExercise.weight_lbs == null) {
          return {
            success: false,
            message: `Cannot resolve prescribed weight for ${exercise.exercise_name} — no max/percentage was available.`,
            data: {},
          };
        }

        actualWeight = matchedExercise.weight_lbs;
        prescribedWeight = matchedExercise.weight_lbs;
      } else if (typeof exercise.weight_lbs === "number") {
        actualWeight = exercise.weight_lbs;
        prescribedWeight = matchedExercise?.weight_lbs ?? exercise.weight_lbs;
      } else if (exercise.percentage_of_max) {
        const resolved = await resolveWeight(exercise.exercise_name, {
          percentage_of_max: exercise.percentage_of_max,
        });
        actualWeight = resolved.actual_weight;
        prescribedWeight = resolved.prescribed_weight;
      } else {
        actualWeight = matchedExercise?.weight_lbs ?? 0;
        prescribedWeight = matchedExercise?.weight_lbs ?? undefined;
      }

      for (let i = 0; i < setCount; i++) {
        rows.push({
          gym_id: context.gymId,
          week_number: context.weekNumber,
          day_name: context.dayName,
          exercise_index: resolvedIndex,
          set_index: startSetIndex + i,
          exercise_name: matchedExercise?.name ?? exercise.exercise_name,
          actual_weight: actualWeight,
          actual_reps: exercise.reps,
          prescribed_weight: prescribedWeight,
          prescribed_reps: matchedExercise?.reps ?? exercise.reps,
          completed: true,
        });
      }

      const descriptor = matchedIndex >= 0
        ? `${matchedExercise?.name} (${setCount}x${exercise.reps}${actualWeight ? ` @ ${actualWeight} lbs` : ""})`
        : `${exercise.exercise_name} (${setCount}x${exercise.reps}${actualWeight ? ` @ ${actualWeight} lbs` : ""}, ad-hoc)`;
      summary.push(descriptor);
    }

    const bulkResult = await actions.log_many_sets(rows);
    if (!bulkResult.success) {
      return bulkResult;
    }

    let completionMessage = "";
    if (params.mark_complete) {
      const completion = await actions.mark_workout_complete(
        context.gymId,
        context.weekNumber,
        context.dayName
      );
      if (!completion.success) {
        return completion;
      }
      completionMessage = ` ${completion.message}`;
    }

    return {
      success: true,
      message: `Logged workout summary for ${context.dayName} (Week ${context.weekNumber}): ${summary.join("; ")}.${completionMessage}`,
      data: {
        gym_id: context.gymId,
        week_number: context.weekNumber,
        day_name: context.dayName,
        exercises_logged: params.exercises.length,
        sets_logged: rows.length,
        mark_complete: params.mark_complete ?? false,
      },
    };
  }

  return { log_exercise, log_workout_summary };
}
