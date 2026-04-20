import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@bot-native/sdk";
import { buildContextBundle } from "../bot-native-shim.js";
import type { ToolResult, CurrentMax } from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";
import type { createQueryTools } from "./queries.js";

export function createContextTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>
) {
  /**
   * Calculate workout streak: consecutive weeks where the user completed
   * at least one workout.
   */
  async function calculateStreak(gymId: string): Promise<{
    currentStreakWeeks: number;
    longestStreakWeeks: number;
    completedWeeks: number[];
  }> {
    const { data } = await supabase
      .from("workout_completions")
      .select("week_number")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .order("week_number", { ascending: true });

    const completions = data ?? [];
    const weeksWithWorkout = [...new Set(completions.map((c: any) => c.week_number as number))].sort(
      (a, b) => a - b
    );

    if (weeksWithWorkout.length === 0) {
      return { currentStreakWeeks: 0, longestStreakWeeks: 0, completedWeeks: [] };
    }

    const currentWeek = getCurrentWeek(null);

    // Calculate streaks
    let longestStreak = 1;
    let currentRun = 1;
    for (let i = 1; i < weeksWithWorkout.length; i++) {
      if (weeksWithWorkout[i] === weeksWithWorkout[i - 1] + 1) {
        currentRun++;
        longestStreak = Math.max(longestStreak, currentRun);
      } else {
        currentRun = 1;
      }
    }

    // Current streak: walk backwards from current week
    let currentStreak = 0;
    const weekSet = new Set(weeksWithWorkout);
    for (let w = currentWeek; w >= 1; w--) {
      if (weekSet.has(w)) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      currentStreakWeeks: currentStreak,
      longestStreakWeeks: longestStreak,
      completedWeeks: weeksWithWorkout,
    };
  }

  async function get_streak(): Promise<ToolResult> {
    const gymId = await queries.resolveGymId();
    if (!gymId) {
      throw AppError.notFound("No gym found.");
    }

    const { currentStreakWeeks, longestStreakWeeks, completedWeeks } =
      await calculateStreak(gymId);

    const streakEmoji = currentStreakWeeks >= 4 ? "🔥🔥🔥" : currentStreakWeeks >= 2 ? "🔥🔥" : currentStreakWeeks >= 1 ? "🔥" : "—";

    const message =
      currentStreakWeeks === 0
        ? `No active streak yet. Get a workout in this week to start one! Longest streak: ${longestStreakWeeks} week${longestStreakWeeks !== 1 ? "s" : ""}.`
        : `${streakEmoji} ${currentStreakWeeks}-week streak! Longest ever: ${longestStreakWeeks} week${longestStreakWeeks !== 1 ? "s" : ""}. Weeks active: ${completedWeeks.join(", ")}.`;

    return {
      success: true,
      message,
      data: {
        current_streak_weeks: currentStreakWeeks,
        longest_streak_weeks: longestStreakWeeks,
        completed_weeks: completedWeeks,
      },
    };
  }

  async function get_context_bundle(): Promise<ToolResult> {
    // Gather all data in parallel
    const [profileResult, maxesResult, statsResult, recentResult, todayResult] =
      await Promise.all([
        queries.get_profile(),
        queries.get_maxes(),
        queries.get_stats(),
        queries.get_recent_sessions(1),
        queries.get_todays_workout(),
      ]);

    const profile = profileResult.data as Record<string, unknown>;
    const maxes = (maxesResult.data as any)?.maxes ?? {};
    const stats = statsResult.data as Record<string, unknown>;
    const sessions = (recentResult.data as any)?.sessions ?? [];
    const todayData = todayResult.data as Record<string, unknown>;

    // Current week + day
    const currentWeek = getCurrentWeek(
      (profile.program_start_date as string) ?? null
    );
    const todayName = getTodayName();

    // Today's workout details (now includes logged status from 2C)
    const todayFocus = (todayData.focus as string) ?? "Rest day";
    const todayExercises = (todayData.exercises as any[]) ?? [];
    const todayExerciseCount = todayExercises.length;
    const todayLoggedSets = (todayData.total_logged_sets as number) ?? 0;
    const todayPrescribedSets = (todayData.total_prescribed_sets as number) ?? 0;
    const todayCompleted = (todayData.day_completed as boolean) ?? false;
    const todayCompletedExercises = (todayData.completed_exercises as number) ?? 0;
    const gymId = (todayData.gym_id as string) ?? await queries.resolveGymId();

    // This week's completions
    let completionsThisWeek = 0;
    let totalDaysWithWorkout = 0;
    let streak = { currentStreakWeeks: 0, longestStreakWeeks: 0, completedWeeks: [] as number[] };

    if (gymId) {
      const [completionRes, programRes, streakRes] = await Promise.all([
        supabase
          .from("workout_completions")
          .select("id, day_name")
          .eq("user_id", userId)
          .eq("gym_id", gymId)
          .eq("week_number", currentWeek),
        supabase
          .from("workout_programs")
          .select("program_data")
          .eq("gym_id", gymId)
          .eq("week_number", currentWeek)
          .single(),
        calculateStreak(gymId),
      ]);

      completionsThisWeek = completionRes.data?.length ?? 0;
      streak = streakRes;

      if (programRes.data?.program_data) {
        totalDaysWithWorkout = Object.values(programRes.data.program_data).filter(
          (day: any) => day?.exercises?.length > 0
        ).length;
      }
    }

    // Top 3 maxes
    const maxEntries = Object.entries(maxes as Record<string, number>)
      .sort(([, a], [, b]) => (b as number) - (a as number))
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

    // Build summary string
    const todayStatus = todayCompleted
      ? `Today (${todayName}) is complete ✓ — ${todayLoggedSets}/${todayPrescribedSets} sets done.`
      : todayLoggedSets > 0
        ? `Today (${todayName}) is in progress — ${todayLoggedSets}/${todayPrescribedSets} sets done (${todayCompletedExercises}/${todayExerciseCount} exercises complete).`
        : todayFocus === "Rest day"
          ? `Today (${todayName}) is a rest day.`
          : `Today (${todayName}) — ${todayFocus}, ${todayExerciseCount} exercises — not started yet.`;

    const streakStr = streak.currentStreakWeeks > 0
      ? `🔥 ${streak.currentStreakWeeks}-week streak.`
      : "No active streak.";

    const summary = `${userName} is on Week ${currentWeek}. ${todayStatus} Completed ${completionsThisWeek}/${totalDaysWithWorkout || workoutDays.length} workouts this week. ${streakStr} ${totalSets} total sets across ${weeksActive} active weeks. Last workout: ${lastWorkout}.`;

    const bundle = buildContextBundle("swoltracker", userId, summary, {
      current_week: currentWeek,
      today_name: todayName,
      today_focus: todayFocus,
      today_exercise_count: todayExerciseCount,
      today_logged_sets: todayLoggedSets,
      today_prescribed_sets: todayPrescribedSets,
      today_completed: todayCompleted,
      today_completed_exercises: todayCompletedExercises,
      workouts_this_week: `${completionsThisWeek}/${totalDaysWithWorkout || workoutDays.length}`,
      current_streak_weeks: streak.currentStreakWeeks,
      longest_streak_weeks: streak.longestStreakWeeks,
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

  return { get_context_bundle, get_streak };
}
