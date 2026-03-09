import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Profile,
  CurrentMax,
  MaxRecord,
  Gym,
  WorkoutProgramRow,
  WorkoutLog,
  RecentSession,
  UserStats,
  ToolResult,
  ProgramDay,
} from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";

export function createQueryTools(supabase: SupabaseClient, userId: string) {
  // ── Helpers ──────────────────────────────────────────────

  async function getMyGyms(): Promise<Gym[]> {
    const { data } = await supabase
      .from("gym_members")
      .select(
        `gym_id, role, gyms (id, name, invite_code, created_by)`
      )
      .eq("user_id", userId);

    return (
      data?.map((m: any) => ({ ...m.gyms, role: m.role })) ?? []
    );
  }

  async function resolveGymId(gymId?: string): Promise<string | null> {
    if (gymId) return gymId;
    const gyms = await getMyGyms();
    return gyms[0]?.id ?? null;
  }

  // ── Tools ────────────────────────────────────────────────

  async function get_profile(): Promise<ToolResult> {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!data) {
      return { success: false, message: "Profile not found.", data: {} };
    }

    const profile = data as Profile;
    return {
      success: true,
      message: `Profile for ${profile.name ?? "user"}: goals=${(profile.fitness_goals ?? []).join(", ")}, schedule=${(profile.workout_days ?? []).join(", ")}, start=${profile.program_start_date ?? "not set"}`,
      data: profile as unknown as Record<string, unknown>,
    };
  }

  async function get_maxes(): Promise<ToolResult> {
    const { data } = await supabase
      .from("current_user_maxes")
      .select("*")
      .eq("user_id", userId);

    const maxes: Record<string, number> = {};
    (data as CurrentMax[] | null)?.forEach(
      (m) => (maxes[m.exercise_name] = m.weight_lbs)
    );

    const entries = Object.entries(maxes);
    const summary = entries.length
      ? entries.map(([name, w]) => `${name}: ${w} lbs`).join(", ")
      : "No maxes recorded yet.";

    return {
      success: true,
      message: summary,
      data: { maxes },
    };
  }

  async function get_max_history(exerciseName: string): Promise<ToolResult> {
    const { data } = await supabase
      .from("user_maxes")
      .select("*")
      .eq("user_id", userId)
      .eq("exercise_name", exerciseName)
      .order("recorded_at", { ascending: true });

    const records = (data as MaxRecord[] | null) ?? [];
    const summary = records.length
      ? records
          .map((r) => `${r.weight_lbs} lbs (${new Date(r.recorded_at).toLocaleDateString()})`)
          .join(" → ")
      : `No history for ${exerciseName}.`;

    return {
      success: true,
      message: `${exerciseName} progression: ${summary}`,
      data: { exercise_name: exerciseName, history: records },
    };
  }

  async function list_gyms(): Promise<ToolResult> {
    const gyms = await getMyGyms();
    if (gyms.length === 0) {
      return { success: true, message: "No gyms found.", data: { gyms: [] } };
    }

    const lines = gyms.map(
      (g, i) => `${i + 1}. ${g.name} (${g.id}) — role: ${g.role}`
    );
    return {
      success: true,
      message: `Your gyms:\n${lines.join("\n")}`,
      data: { gyms: gyms.map((g) => ({ id: g.id, name: g.name, role: g.role })) },
    };
  }

  async function get_todays_workout(gymId?: string, dayName?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    // Get profile for program start date
    const { data: profile } = await supabase
      .from("profiles")
      .select("program_start_date")
      .eq("id", userId)
      .single();

    const currentWeek = getCurrentWeek(profile?.program_start_date ?? null);
    const todayName = dayName ?? getTodayName();

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", currentWeek)
      .single();

    if (!programRow) {
      return {
        success: true,
        message: `No program found for Week ${currentWeek}. Generate one first.`,
        data: { current_week: currentWeek, day_name: todayName, gym_id: resolvedGymId },
      };
    }

    const program = (programRow as WorkoutProgramRow).program_data;
    const today: ProgramDay | undefined = program[todayName];

    if (!today) {
      return {
        success: true,
        message: `${todayName} is a rest day (Week ${currentWeek}).`,
        data: { current_week: currentWeek, day_name: todayName, rest_day: true, gym_id: resolvedGymId },
      };
    }

    // Fetch user maxes to resolve percentage-based weights
    const { data: maxRows } = await supabase
      .from("current_user_maxes")
      .select("exercise_name, weight_lbs")
      .eq("user_id", userId);

    const maxes: Record<string, number> = {};
    (maxRows as CurrentMax[] | null)?.forEach(
      (m) => (maxes[m.exercise_name] = m.weight_lbs)
    );

    // Build enriched exercises with resolved weights and exercise_index
    const enrichedExercises = today.exercises.map((ex, i) => {
      const max1RM = maxes[ex.name] ?? null;
      let weight_lbs: number | null = null;

      if (ex.percentages && ex.percentages.length > 0 && max1RM) {
        // Use the heaviest prescribed percentage as the target weight
        const maxPct = Math.max(...ex.percentages);
        weight_lbs = Math.round((maxPct / 100) * max1RM);
      }

      return {
        exercise_index: i,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight_lbs,
        max_1rm: max1RM,
        percentages: ex.percentages ?? null,
        muscleGroups: ex.muscleGroups ?? null,
      };
    });

    const exerciseLines = enrichedExercises.map((ex) => {
      const weightStr = ex.weight_lbs
        ? `@ ${ex.weight_lbs} lbs`
        : ex.percentages
          ? "(no max on file)"
          : "";
      return `  ${ex.exercise_index + 1}. ${ex.name} — ${ex.sets}x${ex.reps} ${weightStr}`.trim();
    });

    return {
      success: true,
      message: `Week ${currentWeek}, ${todayName} — ${today.focus}:\n${exerciseLines.join("\n")}`,
      data: {
        current_week: currentWeek,
        day_name: todayName,
        focus: today.focus,
        exercises: enrichedExercises,
        gym_id: resolvedGymId,
      },
    };
  }

  async function get_workout_logs(
    weekNumber?: number,
    dayName?: string,
    gymId?: string
  ): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);

    // If no week specified, use current week
    let week = weekNumber;
    if (!week) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("program_start_date")
        .eq("id", userId)
        .single();
      week = getCurrentWeek(profile?.program_start_date ?? null);
    }

    let query = supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("week_number", week);

    if (resolvedGymId) {
      query = query.eq("gym_id", resolvedGymId);
    }
    if (dayName) {
      query = query.eq("day_name", dayName);
    }

    const { data } = await query;
    const logs = (data as WorkoutLog[] | null) ?? [];

    const completedSets = logs.filter((l) => l.completed).length;
    const summary = `Week ${week}${dayName ? `, ${dayName}` : ""}: ${completedSets} sets completed across ${new Set(logs.map((l) => l.exercise_name)).size} exercises.`;

    return {
      success: true,
      message: summary,
      data: { week_number: week, day_name: dayName ?? null, logs },
    };
  }

  async function get_recent_sessions(limit: number = 4): Promise<ToolResult> {
    const { data } = await supabase
      .from("workout_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("completed", true)
      .order("completed_at", { ascending: false });

    const sessionMap = new Map<string, RecentSession>();
    (data as WorkoutLog[] | null)?.forEach((log) => {
      const key = `${log.week_number}-${log.day_name}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          week_number: log.week_number,
          day_name: log.day_name,
          completed_at: log.completed_at,
          exercises: [],
        });
      }
      sessionMap.get(key)!.exercises.push({
        exercise_name: log.exercise_name,
        prescribed_weight: log.prescribed_weight,
        prescribed_reps: log.prescribed_reps,
        actual_weight: log.actual_weight,
        actual_reps: log.actual_reps,
      });
    });

    const sessions = Array.from(sessionMap.values())
      .sort(
        (a, b) =>
          new Date(b.completed_at).getTime() -
          new Date(a.completed_at).getTime()
      )
      .slice(0, limit);

    const summary = sessions.length
      ? sessions
          .map(
            (s) =>
              `Week ${s.week_number} ${s.day_name}: ${s.exercises.length} exercises`
          )
          .join("; ")
      : "No recent sessions.";

    return {
      success: true,
      message: `Last ${limit} sessions: ${summary}`,
      data: { sessions },
    };
  }

  async function get_stats(): Promise<ToolResult> {
    const { data } = await supabase
      .from("workout_logs")
      .select("week_number")
      .eq("user_id", userId)
      .eq("completed", true);

    const weeks = new Set(
      (data as { week_number: number }[] | null)?.map(
        (l) => l.week_number
      ) ?? []
    );
    const stats: UserStats = {
      totalSets: data?.length ?? 0,
      weeksActive: weeks.size,
    };

    return {
      success: true,
      message: `${stats.totalSets} total sets completed across ${stats.weeksActive} active weeks.`,
      data: stats as unknown as Record<string, unknown>,
    };
  }

  return {
    get_profile,
    get_maxes,
    get_max_history,
    list_gyms,
    get_todays_workout,
    get_workout_logs,
    get_recent_sessions,
    get_stats,
    // Expose helpers for other tool modules
    getMyGyms,
    resolveGymId,
  };
}
