import type { SupabaseClient } from "@supabase/supabase-js";
import { buildContextBundle } from "../bot-native-shim.js";
import type { ToolResult, CurrentMax } from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";
import type { createQueryTools } from "./queries.js";

export function createContextTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>
) {
  async function get_context_bundle(): Promise<ToolResult> {
    // Gather all data in parallel
    const [profileResult, maxesResult, statsResult, recentResult] =
      await Promise.all([
        queries.get_profile(),
        queries.get_maxes(),
        queries.get_stats(),
        queries.get_recent_sessions(1),
      ]);

    const profile = profileResult.data as Record<string, unknown>;
    const maxes = (maxesResult.data as any)?.maxes ?? {};
    const stats = statsResult.data as Record<string, unknown>;
    const sessions = (recentResult.data as any)?.sessions ?? [];

    // Current week
    const currentWeek = getCurrentWeek(
      (profile.program_start_date as string) ?? null
    );
    const todayName = getTodayName();

    // Get today's workout info
    const todayResult = await queries.get_todays_workout();
    const todayData = todayResult.data as Record<string, unknown>;
    const todayFocus = (todayData.focus as string) ?? "Rest day";
    const todayExerciseCount =
      ((todayData.exercises as unknown[]) ?? []).length;

    // Completions this week
    const gymId = await queries.resolveGymId();
    let completionsThisWeek = 0;
    let totalDaysWithWorkout = 0;
    if (gymId) {
      const { data: completions } = await supabase
        .from("workout_completions")
        .select("id")
        .eq("user_id", userId)
        .eq("gym_id", gymId)
        .eq("week_number", currentWeek);
      completionsThisWeek = completions?.length ?? 0;

      // Count how many days have workouts this week
      const { data: programRow } = await supabase
        .from("workout_programs")
        .select("program_data")
        .eq("gym_id", gymId)
        .eq("week_number", currentWeek)
        .single();
      if (programRow?.program_data) {
        totalDaysWithWorkout = Object.values(programRow.program_data).filter(
          (day: any) => day?.exercises?.length > 0
        ).length;
      }
    }

    // Top 3 maxes
    const maxEntries = Object.entries(maxes as Record<string, number>)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    const topMaxes = Object.fromEntries(maxEntries);

    // Last workout
    const lastSession = sessions[0];
    const lastWorkout = lastSession
      ? `${lastSession.day_name} — ${lastSession.exercises.length} exercises`
      : "None yet";

    const userName = (profile.name as string) ?? "User";
    const workoutDays = (profile.workout_days as string[]) ?? [];
    const totalSets = (stats.totalSets as number) ?? 0;
    const weeksActive = (stats.weeksActive as number) ?? 0;

    const summary = `${userName} is on Week ${currentWeek}. Today is ${todayName} — ${todayFocus}, ${todayExerciseCount} exercises. Completed ${completionsThisWeek}/${totalDaysWithWorkout || workoutDays.length} workouts this week. ${totalSets} total sets across ${weeksActive} active weeks. Last workout: ${lastWorkout}.`;

    const bundle = buildContextBundle("swoltracker", userId, summary, {
      current_week: currentWeek,
      today_focus: todayFocus,
      today_exercise_count: todayExerciseCount,
      workouts_this_week: `${completionsThisWeek}/${totalDaysWithWorkout || workoutDays.length}`,
      total_sets: totalSets,
      weeks_active: weeksActive,
      top_maxes: topMaxes,
      last_workout: lastWorkout,
    });

    return {
      success: true,
      message: JSON.stringify(bundle),
      data: bundle as unknown as Record<string, unknown>,
    };
  }

  return { get_context_bundle };
}
