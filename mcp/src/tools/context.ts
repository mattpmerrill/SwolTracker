import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, buildContextBundleFromModules } from "@bot-native/sdk";
import type { ToolResult } from "../types.js";
import { getCurrentWeek } from "../week-calc.js";
import { createContextModules } from "../context-modules.js";
import type { createQueryTools } from "./queries.js";

const CONTEXT_MAX_TOKENS = 2000;

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
    const bundle = await buildContextBundleFromModules({
      appName: "swoltracker",
      userId,
      modules: createContextModules(),
      deps: { supabase, userId },
      maxTokens: CONTEXT_MAX_TOKENS,
    });

    return {
      success: true,
      message: JSON.stringify(bundle),
      data: bundle as unknown as Record<string, unknown>,
    };
  }

  return { get_context_bundle, get_streak };
}
