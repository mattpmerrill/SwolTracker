import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExerciseName } from "../exercise-normalizer.js";
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
  ProgramExercise,
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

  async function resolveCurrentWeek(): Promise<number> {
    const { data: profile } = await supabase
      .from("profiles")
      .select("program_start_date")
      .eq("id", userId)
      .single();
    return getCurrentWeek(profile?.program_start_date ?? null);
  }

  async function getUserMaxes(): Promise<Record<string, number>> {
    const { data } = await supabase
      .from("current_user_maxes")
      .select("exercise_name, weight_lbs")
      .eq("user_id", userId);
    const maxes: Record<string, number> = {};
    (data as CurrentMax[] | null)?.forEach(
      (m) => (maxes[m.exercise_name] = m.weight_lbs)
    );
    return maxes;
  }

  function enrichExercises(
    exercises: ProgramExercise[],
    maxes: Record<string, number>
  ) {
    return exercises.map((ex, i) => {
      const max1RM = maxes[ex.name] ?? null;
      let weight_lbs: number | null = null;

      if (ex.percentages && ex.percentages.length > 0 && max1RM) {
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
    exerciseName = normalizeExerciseName(exerciseName);
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

  async function get_todays_workout(gymId?: string, dayName?: string, weekNumber?: number): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const week = weekNumber ?? await resolveCurrentWeek();
    const day = dayName ?? getTodayName();

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", week)
      .single();

    if (!programRow) {
      return {
        success: true,
        message: `No program found for Week ${week}. Generate one first.`,
        data: { current_week: week, day_name: day, gym_id: resolvedGymId },
      };
    }

    const program = (programRow as WorkoutProgramRow).program_data;
    const today: ProgramDay | undefined = program[day];

    if (!today) {
      return {
        success: true,
        message: `${day} is a rest day (Week ${week}).`,
        data: { current_week: week, day_name: day, rest_day: true, gym_id: resolvedGymId },
      };
    }

    const [maxes, logsResult, completionResult] = await Promise.all([
      getUserMaxes(),
      supabase
        .from("workout_logs")
        .select("exercise_index, set_index, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed, completed_at")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .eq("day_name", day)
        .order("exercise_index", { ascending: true })
        .order("set_index", { ascending: true }),
      supabase
        .from("workout_completions")
        .select("id, completed_at")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .eq("day_name", day)
        .maybeSingle(),
    ]);

    const logs = (logsResult.data as Array<Pick<WorkoutLog, "exercise_index" | "set_index" | "exercise_name" | "actual_weight" | "actual_reps" | "prescribed_weight" | "prescribed_reps" | "completed" | "completed_at">> | null) ?? [];
    const enrichedExercises = enrichExercises(today.exercises, maxes).map((ex) => {
      const matchingLogs = logs.filter((log) => log.exercise_index === ex.exercise_index);
      const completedLogs = matchingLogs.filter((log) => log.completed);
      const loggedSetIndexes = [...new Set(completedLogs.map((log) => log.set_index))].sort((a, b) => a - b);
      const setsLogged = loggedSetIndexes.length;
      const setsRemaining = Math.max(0, ex.sets - setsLogged);

      return {
        ...ex,
        sets_logged: setsLogged,
        sets_remaining: setsRemaining,
        is_fully_logged: setsLogged >= ex.sets,
        logged_set_indexes: loggedSetIndexes,
        logged_sets: completedLogs.map((log) => ({
          set_index: log.set_index,
          actual_weight: log.actual_weight,
          actual_reps: log.actual_reps,
          prescribed_weight: log.prescribed_weight,
          prescribed_reps: log.prescribed_reps,
          completed_at: log.completed_at,
        })),
      };
    });

    const adHocLogs = logs.filter(
      (log) => log.exercise_index >= today.exercises.length
    );

    const completedExercises = enrichedExercises.filter((ex) => ex.is_fully_logged).length;
    const totalLoggedSets = enrichedExercises.reduce((sum, ex) => sum + ex.sets_logged, 0);
    const totalPrescribedSets = enrichedExercises.reduce((sum, ex) => sum + ex.sets, 0);
    const dayCompleted = Boolean(completionResult.data);

    const exerciseLines = enrichedExercises.map((ex) => {
      const weightStr = ex.weight_lbs
        ? `@ ${ex.weight_lbs} lbs`
        : ex.percentages
          ? "(no max on file)"
          : "";
      const progressStr = ex.sets_logged > 0
        ? ` — logged ${ex.sets_logged}/${ex.sets}`
        : "";
      return `  ${ex.exercise_index + 1}. ${ex.name} — ${ex.sets}x${ex.reps} ${weightStr}${progressStr}`.trim();
    });

    const statusLine = dayCompleted
      ? `\nStatus: complete (${totalLoggedSets}/${totalPrescribedSets} programmed sets logged)`
      : totalLoggedSets > 0
        ? `\nStatus: in progress (${totalLoggedSets}/${totalPrescribedSets} programmed sets logged)`
        : "";

    return {
      success: true,
      message: `Week ${week}, ${day} — ${today.focus}:\n${exerciseLines.join("\n")}${statusLine}`,
      data: {
        current_week: week,
        day_name: day,
        focus: today.focus,
        exercises: enrichedExercises,
        gym_id: resolvedGymId,
        day_completed: dayCompleted,
        day_completed_at: completionResult.data?.completed_at ?? null,
        completed_exercises: completedExercises,
        total_exercises: enrichedExercises.length,
        total_logged_sets: totalLoggedSets,
        total_prescribed_sets: totalPrescribedSets,
        ad_hoc_logs: adHocLogs,
      },
    };
  }

  async function get_weekly_workout(weekNumber?: number, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const week = weekNumber ?? await resolveCurrentWeek();

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", week)
      .single();

    if (!programRow) {
      return {
        success: true,
        message: `No program found for Week ${week}.`,
        data: { week_number: week, gym_id: resolvedGymId },
      };
    }

    const program = (programRow as WorkoutProgramRow).program_data;
    const maxes = await getUserMaxes();
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const days: Record<string, unknown> = {};
    const lines: string[] = [];
    let totalSets = 0;

    for (const dayName of dayOrder) {
      const day: ProgramDay | undefined = program[dayName];
      if (!day || day.exercises.length === 0) {
        days[dayName] = { focus: "Rest", exercises: [] };
        lines.push(`  ${dayName}: Rest`);
        continue;
      }

      const enriched = enrichExercises(day.exercises, maxes);
      const daySets = enriched.reduce((sum, ex) => sum + ex.sets, 0);
      totalSets += daySets;

      days[dayName] = { focus: day.focus, exercises: enriched, total_sets: daySets };
      lines.push(`  ${dayName}: ${day.focus} — ${enriched.length} exercises, ${daySets} sets`);
    }

    return {
      success: true,
      message: `Week ${week} (${totalSets} total sets):\n${lines.join("\n")}`,
      data: { week_number: week, total_sets: totalSets, days, gym_id: resolvedGymId },
    };
  }

  async function get_program_overview(gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const currentWeek = await resolveCurrentWeek();

    const { data: rows } = await supabase
      .from("workout_programs")
      .select("week_number, program_data, ai_notes")
      .eq("gym_id", resolvedGymId)
      .order("week_number", { ascending: true });

    const programs = (rows as WorkoutProgramRow[] | null) ?? [];
    if (programs.length === 0) {
      return {
        success: true,
        message: "No programs found.",
        data: { current_week: currentWeek, total_weeks: 0, weeks: [] },
      };
    }

    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const weeks = programs.map((row) => {
      const prog = row.program_data;
      let totalSets = 0;
      let totalExercises = 0;
      const dailySummary: Record<string, { focus: string; exercises: number; sets: number }> = {};

      for (const dayName of dayOrder) {
        const day: ProgramDay | undefined = prog[dayName];
        if (!day || day.exercises.length === 0) {
          dailySummary[dayName] = { focus: "Rest", exercises: 0, sets: 0 };
          continue;
        }
        const daySets = day.exercises.reduce((sum, ex) => sum + ex.sets, 0);
        totalSets += daySets;
        totalExercises += day.exercises.length;
        dailySummary[dayName] = { focus: day.focus, exercises: day.exercises.length, sets: daySets };
      }

      return {
        week_number: row.week_number,
        total_sets: totalSets,
        total_exercises: totalExercises,
        ai_notes: row.ai_notes,
        days: dailySummary,
      };
    });

    const lines = weeks.map((w) => {
      const marker = w.week_number === currentWeek ? " ← current" : "";
      const dayFocuses = dayOrder
        .map((d) => w.days[d])
        .filter((d) => d.focus !== "Rest")
        .map((d) => d.focus)
        .join(", ");
      return `  Week ${w.week_number}: ${w.total_sets} sets, ${w.total_exercises} exercises — ${dayFocuses}${marker}`;
    });

    return {
      success: true,
      message: `Program overview (${programs.length} weeks, currently Week ${currentWeek}):\n${lines.join("\n")}`,
      data: {
        current_week: currentWeek,
        total_weeks: programs.length,
        weeks,
        gym_id: resolvedGymId,
      },
    };
  }

  async function get_program_progression(exerciseName: string, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const currentWeek = await resolveCurrentWeek();
    const maxes = await getUserMaxes();
    const max1RM = maxes[exerciseName] ?? null;

    const { data: rows } = await supabase
      .from("workout_programs")
      .select("week_number, program_data")
      .eq("gym_id", resolvedGymId)
      .order("week_number", { ascending: true });

    const programs = (rows as WorkoutProgramRow[] | null) ?? [];
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    const progression: {
      week_number: number;
      day_name: string;
      sets: number;
      reps: number | string;
      percentages: number[] | null;
      weight_lbs: number | null;
    }[] = [];

    for (const row of programs) {
      for (const dayName of dayOrder) {
        const day: ProgramDay | undefined = row.program_data[dayName];
        if (!day) continue;

        for (const ex of day.exercises) {
          if (ex.name.toLowerCase() !== exerciseName.toLowerCase()) continue;

          let weight_lbs: number | null = null;
          if (ex.percentages && ex.percentages.length > 0 && max1RM) {
            const maxPct = Math.max(...ex.percentages);
            weight_lbs = Math.round((maxPct / 100) * max1RM);
          }

          progression.push({
            week_number: row.week_number,
            day_name: dayName,
            sets: ex.sets,
            reps: ex.reps,
            percentages: ex.percentages ?? null,
            weight_lbs,
          });
        }
      }
    }

    if (progression.length === 0) {
      return {
        success: true,
        message: `${exerciseName} not found in any program.`,
        data: { exercise_name: exerciseName, max_1rm: max1RM, progression: [] },
      };
    }

    const lines = progression.map((p) => {
      const pctStr = p.percentages ? p.percentages.join("/") + "%" : "";
      const weightStr = p.weight_lbs ? `@ ${p.weight_lbs} lbs` : "";
      const marker = p.week_number === currentWeek ? " ← current" : "";
      return `  Week ${p.week_number} ${p.day_name}: ${p.sets}x${p.reps} ${pctStr} ${weightStr}${marker}`.trim();
    });

    return {
      success: true,
      message: `${exerciseName} progression${max1RM ? ` (1RM: ${max1RM} lbs)` : ""}:\n${lines.join("\n")}`,
      data: {
        exercise_name: exerciseName,
        max_1rm: max1RM,
        current_week: currentWeek,
        progression,
      },
    };
  }

  async function get_workout_logs(
    weekNumber?: number,
    dayName?: string,
    gymId?: string
  ): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);

    const week = weekNumber ?? await resolveCurrentWeek();

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
    get_weekly_workout,
    get_program_overview,
    get_program_progression,
    get_workout_logs,
    get_recent_sessions,
    get_stats,
    // Expose helpers for other tool modules
    getMyGyms,
    resolveGymId,
  };
}
