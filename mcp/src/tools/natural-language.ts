import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult, ProgramExercise } from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";
import type { createQueryTools } from "./queries.js";
import type { createActionTools } from "./actions.js";

interface LogExerciseParams {
  exercise_name: string;
  sets: number;
  reps: number | string;
  weight_lbs?: number;
  notes?: string;
  percentage_of_max?: number;
}

export function createNaturalLanguageTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>,
  actions: ReturnType<typeof createActionTools>
) {
  /**
   * Fuzzy match an exercise name against today's program.
   * Returns the exercise index if found, or -1 for ad-hoc.
   */
  function fuzzyMatch(
    input: string,
    exercises: ProgramExercise[]
  ): number {
    const normalized = input.toLowerCase().trim();

    // Exact match first
    const exactIdx = exercises.findIndex(
      (e) => e.name.toLowerCase() === normalized
    );
    if (exactIdx >= 0) return exactIdx;

    // Substring match
    const subIdx = exercises.findIndex(
      (e) =>
        e.name.toLowerCase().includes(normalized) ||
        normalized.includes(e.name.toLowerCase())
    );
    if (subIdx >= 0) return subIdx;

    // Word overlap match
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

  async function log_exercise(params: LogExerciseParams): Promise<ToolResult> {
    const { exercise_name, sets, reps, weight_lbs, percentage_of_max } =
      params;

    // Resolve weight from percentage if needed
    let resolvedWeight = weight_lbs ?? 0;
    if (percentage_of_max && !weight_lbs) {
      const maxResult = await queries.get_maxes();
      const maxes = (maxResult.data as any)?.maxes ?? {};
      const max1RM = maxes[exercise_name];
      if (max1RM) {
        resolvedWeight = Math.round((percentage_of_max / 100) * max1RM);
      }
    }

    // Get today's workout to find exercise index
    const todayResult = await queries.get_todays_workout();
    const todayData = todayResult.data as Record<string, unknown>;
    const gymId = todayData.gym_id as string | undefined;
    const currentWeek = (todayData.current_week as number) ?? 1;
    const dayName = (todayData.day_name as string) ?? getTodayName();
    const exercises = (todayData.exercises as ProgramExercise[]) ?? [];

    if (!gymId) {
      return {
        success: false,
        message: "No gym found. Cannot log exercise.",
        data: {},
      };
    }

    // Find exercise in today's program
    const exerciseIndex = exercises.length > 0
      ? fuzzyMatch(exercise_name, exercises)
      : -1;

    // Determine the actual exercise index to use
    // If not found in program, append after existing exercises
    const resolvedIndex =
      exerciseIndex >= 0 ? exerciseIndex : exercises.length;

    // Find existing sets for this exercise to determine starting set_index
    let startSetIndex = 0;
    if (exerciseIndex < 0) {
      // Ad-hoc exercise — check if we already logged sets for it today
      const { data: existingLogs } = await supabase
        .from("workout_logs")
        .select("set_index")
        .eq("user_id", userId)
        .eq("gym_id", gymId)
        .eq("week_number", currentWeek)
        .eq("day_name", dayName)
        .eq("exercise_index", resolvedIndex)
        .order("set_index", { ascending: false })
        .limit(1);

      if (existingLogs?.length) {
        startSetIndex = existingLogs[0].set_index + 1;
      }
    }

    // Log each set
    const results: string[] = [];
    for (let i = 0; i < sets; i++) {
      const setResult = await actions.log_set({
        gym_id: gymId,
        week_number: currentWeek,
        day_name: dayName,
        exercise_index: resolvedIndex,
        set_index: startSetIndex + i,
        exercise_name,
        actual_weight: resolvedWeight,
        actual_reps: reps,
        prescribed_weight: resolvedWeight,
        prescribed_reps: reps,
      });
      results.push(setResult.message);
    }

    const matchNote =
      exerciseIndex >= 0
        ? `(matched to program exercise #${exerciseIndex + 1})`
        : "(logged as ad-hoc exercise)";

    return {
      success: true,
      message: `Logged: ${exercise_name} ${sets}x${reps}${resolvedWeight ? ` @ ${resolvedWeight} lbs` : ""} ${matchNote}`,
      data: {
        exercise_name,
        sets,
        reps,
        weight_lbs: resolvedWeight,
        exercise_index: resolvedIndex,
        matched_to_program: exerciseIndex >= 0,
        set_results: results,
      },
    };
  }

  return { log_exercise };
}
