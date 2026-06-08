import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@bot-native/sdk";
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
    // Membership check: when the caller supplies a gym_id, confirm the
    // authenticated user is in that gym before returning it. Without this,
    // the service-role Supabase client in api/mcp.js would bypass RLS and
    // write to a stranger's gym. (SECURITY-REVIEW-2026-04 F-001.)
    const gyms = await getMyGyms();
    if (!gymId) return gyms[0]?.id ?? null;
    return gyms.find((g) => g.id === gymId)?.id ?? null;
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

  function roundToNearestFive(weight: number): number {
    return Math.round(weight / 5) * 5;
  }

  function resolveMaxForExercise(
    exerciseName: string,
    maxes: Record<string, number>
  ): number | null {
    const canonical = normalizeExerciseName(exerciseName);
    const exactKey = Object.keys(maxes).find(
      (key) => key.toLowerCase() === canonical.toLowerCase()
    );
    return exactKey ? maxes[exactKey] : null;
  }

  function enrichExercises(
    exercises: ProgramExercise[],
    maxes: Record<string, number>
  ) {
    return exercises.map((ex, i) => {
      const max1RM = resolveMaxForExercise(ex.name, maxes);
      let weight_lbs: number | null = null;

      if (ex.percentages && ex.percentages.length > 0 && max1RM) {
        const maxPct = Math.max(...ex.percentages);
        weight_lbs = roundToNearestFive((maxPct / 100) * max1RM);
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
      throw AppError.notFound("Profile not found.");
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
    const max1RM = resolveMaxForExercise(exerciseName, maxes);

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
            weight_lbs = roundToNearestFive((maxPct / 100) * max1RM);
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

  async function get_training_history_summary(gymId?: string, lookbackWeeks: number = 4): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    const currentWeek = await resolveCurrentWeek();
    const safeLookbackWeeks = Math.max(1, lookbackWeeks || 4);
    const fromWeek = Math.max(1, currentWeek - safeLookbackWeeks + 1);

    const [profileResult, maxesResult, logsResult, completionsResult, missedDaysResult, programsResult] =
      await Promise.all([
        get_profile(),
        get_maxes(),
        supabase
          .from("workout_logs")
          .select("week_number, day_name, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed_at")
          .eq("user_id", userId)
          .eq("gym_id", resolvedGymId)
          .eq("completed", true)
          .gte("week_number", fromWeek)
          .order("week_number", { ascending: false }),
        supabase
          .from("workout_completions")
          .select("week_number, day_name")
          .eq("user_id", userId)
          .eq("gym_id", resolvedGymId)
          .gte("week_number", fromWeek),
        supabase
          .from("missed_days")
          .select("week_number, day_name, reason")
          .eq("user_id", userId)
          .eq("gym_id", resolvedGymId)
          .gte("week_number", fromWeek)
          .order("week_number", { ascending: false }),
        supabase
          .from("workout_programs")
          .select("week_number, program_data, ai_notes")
          .eq("gym_id", resolvedGymId)
          .gte("week_number", fromWeek)
          .order("week_number", { ascending: false }),
      ]);

    const profile = profileResult.data as Record<string, unknown>;
    const maxes = (maxesResult.data as any)?.maxes ?? {};
    const logs = (logsResult.data ?? []) as Array<{
      week_number: number; day_name: string; exercise_name: string;
      actual_weight: number; actual_reps: number | string;
      prescribed_weight: number | null; prescribed_reps: number | string | null;
      completed_at: string | null;
    }>;
    const completions = (completionsResult.data ?? []) as Array<{ week_number: number; day_name: string }>;
    const missedDays = (missedDaysResult.data ?? []) as Array<{ week_number: number; day_name: string; reason: string | null }>;
    const programs = (programsResult.data ?? []) as Array<{ week_number: number; program_data: Record<string, any>; ai_notes: string | null }>;

    const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const parseReps = (value: number | string | null | undefined) => {
      if (typeof value === "number") return value;
      const match = String(value ?? "").match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : 0;

    const weekSummaries: Record<number, {
      scheduled_days: string[];
      completed_days: string[];
      missed_days: Array<{ day: string; reason: string | null }>;
      exercise_sessions: Array<{
        day_name: string;
        exercise_name: string;
        sets_logged: number;
        avg_actual_weight: number;
        avg_prescribed_weight: number;
        avg_actual_reps: number;
        prescribed_reps: number | null;
        hit_all_reps: boolean;
      }>;
    }> = {};

    for (let w = fromWeek; w <= currentWeek; w++) {
      weekSummaries[w] = { scheduled_days: [], completed_days: [], missed_days: [], exercise_sessions: [] };
    }

    for (const c of completions) {
      if (weekSummaries[c.week_number]) weekSummaries[c.week_number].completed_days.push(c.day_name);
    }
    for (const m of missedDays) {
      if (weekSummaries[m.week_number]) weekSummaries[m.week_number].missed_days.push({ day: m.day_name, reason: m.reason });
    }
    for (const program of programs) {
      const summary = weekSummaries[program.week_number];
      if (!summary) continue;
      summary.scheduled_days = dayOrder.filter((day) => program.program_data?.[day]?.exercises?.length > 0);
    }

    const sessionMap = new Map<string, {
      week_number: number;
      day_name: string;
      exercise_name: string;
      actual_weights: number[];
      prescribed_weights: number[];
      actual_reps: number[];
      prescribed_reps: number[];
      hit_all_reps: boolean;
      completed_at: string | null;
    }>();
    for (const log of logs) {
      const sessionKey = `${log.week_number}::${log.day_name}::${log.exercise_name}`;
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          week_number: log.week_number,
          day_name: log.day_name,
          exercise_name: log.exercise_name,
          actual_weights: [],
          prescribed_weights: [],
          actual_reps: [],
          prescribed_reps: [],
          hit_all_reps: true,
          completed_at: log.completed_at,
        });
      }

      const session = sessionMap.get(sessionKey)!;
      const actualReps = parseReps(log.actual_reps);
      const prescribedReps = log.prescribed_reps === null ? null : parseReps(log.prescribed_reps);
      if (typeof log.actual_weight === "number") session.actual_weights.push(log.actual_weight);
      if (typeof log.prescribed_weight === "number") session.prescribed_weights.push(log.prescribed_weight);
      session.actual_reps.push(actualReps);
      if (prescribedReps !== null) session.prescribed_reps.push(prescribedReps);
      if (prescribedReps !== null && actualReps < prescribedReps) {
        session.hit_all_reps = false;
      }
    }

    Array.from(sessionMap.values())
      .sort((a, b) => {
        if (a.week_number !== b.week_number) return b.week_number - a.week_number;
        return dayOrder.indexOf(a.day_name) - dayOrder.indexOf(b.day_name);
      })
      .forEach((session) => {
        const summary = weekSummaries[session.week_number];
        if (!summary) return;

        summary.exercise_sessions.push({
          day_name: session.day_name,
          exercise_name: session.exercise_name,
          sets_logged: session.actual_reps.length,
          avg_actual_weight: average(session.actual_weights),
          avg_prescribed_weight: average(session.prescribed_weights),
          avg_actual_reps: average(session.actual_reps),
          prescribed_reps: session.prescribed_reps[0] ?? null,
          hit_all_reps: session.hit_all_reps,
        });
      });

    const weekLines: string[] = [];
    for (let w = fromWeek; w <= currentWeek; w++) {
      const ws = weekSummaries[w];
      if (!ws) continue;
      const completionRate = ws.scheduled_days.length > 0
        ? `${ws.completed_days.length}/${ws.scheduled_days.length} days`
        : `${ws.completed_days.length} days`;

      const exLines = ws.exercise_sessions
        .slice(0, 4)
        .map((session) => {
          const targetWeight = session.avg_actual_weight || session.avg_prescribed_weight || 0;
          const hitStr = session.hit_all_reps ? "hit reps" : "missed reps";
          return `    - ${session.day_name} ${session.exercise_name}: ${session.sets_logged} sets @ ~${targetWeight} lbs, ${hitStr}`;
        });

      const missedStr = ws.missed_days.length > 0
        ? `\n  Missed: ${ws.missed_days.map((m) => `${m.day}${m.reason ? ` (${m.reason})` : ""}`).join(", ")}`
        : "";

      weekLines.push(
        `Week ${w}: ${completionRate} completed${missedStr}` +
        (exLines.length > 0 ? `\n  Exercises:\n${exLines.join("\n")}` : "")
      );
    }

    const nextWeek = currentWeek + 1;

    const summary = [
      `Training History Summary for ${profile.name ?? "Athlete"} (Weeks ${fromWeek}–${currentWeek}):`,
      `Current 1RMs: ${Object.entries(maxes).map(([k, v]) => `${k}: ${v} lbs`).join(", ") || "None on file"}`,
      "",
      weekLines.join("\n\n"),
      "",
      `Recommended next week: Week ${nextWeek}`,
    ].join("\n");

    return {
      success: true,
      message: summary,
      data: {
        current_week: currentWeek,
        next_week: nextWeek,
        from_week: fromWeek,
        lookback_weeks: safeLookbackWeeks,
        gym_id: resolvedGymId,
        summary_text: summary,
        week_summaries: weekSummaries,
        maxes,
        profile_name: profile.name,
        missed_days: missedDays,
        programs_context: programs.map((p) => ({ week_number: p.week_number, ai_notes: p.ai_notes })),
      },
    };
  }

  async function get_overload_recommendations(gymId?: string, lookbackWeeks: number = 4): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    const currentWeek = await resolveCurrentWeek();
    const safeLookbackWeeks = Math.max(1, lookbackWeeks || 4);
    const fromWeek = Math.max(1, currentWeek - safeLookbackWeeks + 1);

    const { data: logsRaw } = await supabase
      .from("workout_logs")
      .select("week_number, day_name, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed_at")
      .eq("user_id", userId)
      .eq("gym_id", resolvedGymId)
      .eq("completed", true)
      .gte("week_number", fromWeek)
      .order("week_number", { ascending: false });

    const logs = (logsRaw ?? []) as Array<{
      week_number: number;
      day_name: string;
      exercise_name: string;
      actual_weight: number;
      actual_reps: number | string;
      prescribed_weight: number | null;
      prescribed_reps: number | string | null;
      completed_at: string | null;
    }>;

    if (logs.length === 0) {
      return { success: true, message: "Not enough training history to make recommendations yet.", data: { recommendations: [] } };
    }

    const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const parseReps = (value: number | string | null | undefined) => {
      if (typeof value === "number") return value;
      const match = String(value ?? "").match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    const sessionMap = new Map<string, {
      week_number: number;
      day_name: string;
      exercise_name: string;
      hit_all_reps: boolean;
      actual_weights: number[];
      prescribed_weights: number[];
    }>();
    for (const log of logs) {
      const sessionKey = `${log.week_number}::${log.day_name}::${log.exercise_name}`;
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          week_number: log.week_number,
          day_name: log.day_name,
          exercise_name: log.exercise_name,
          hit_all_reps: true,
          actual_weights: [],
          prescribed_weights: [],
        });
      }

      const session = sessionMap.get(sessionKey)!;
      const actualReps = parseReps(log.actual_reps);
      const prescribedReps = log.prescribed_reps == null ? null : parseReps(log.prescribed_reps);
      if (typeof log.actual_weight === "number") session.actual_weights.push(log.actual_weight);
      if (typeof log.prescribed_weight === "number") session.prescribed_weights.push(log.prescribed_weight);
      if (prescribedReps !== null && actualReps < prescribedReps) {
        session.hit_all_reps = false;
      }
    }

    interface Recommendation {
      exercise_name: string;
      type: "increase" | "deload" | "stale";
      status_label: string;
      message: string;
      suggested_increment?: number;
      streak_count?: number;
      last_seen_week?: number;
      weeks_since_last_seen?: number;
    }

    const recommendations: Recommendation[] = [];
    const byExercise = new Map<string, Array<{ week_number: number; day_name: string; hit_all_reps: boolean }>>();
    Array.from(sessionMap.values()).forEach((session) => {
      const sessions = byExercise.get(session.exercise_name) ?? [];
      sessions.push({
        week_number: session.week_number,
        day_name: session.day_name,
        hit_all_reps: session.hit_all_reps,
      });
      byExercise.set(session.exercise_name, sessions);
    });

    const allExercises = Array.from(byExercise.keys());

    for (const ex of allExercises) {
      const sessions = (byExercise.get(ex) ?? []).sort((a, b) => {
        if (a.week_number !== b.week_number) return b.week_number - a.week_number;
        return dayOrder.indexOf(b.day_name) - dayOrder.indexOf(a.day_name);
      });
      const latest = sessions[0];
      if (!latest) continue;

      const weeksSinceLastSeen = currentWeek - latest.week_number;
      if (weeksSinceLastSeen >= 2) {
        recommendations.push({
          exercise_name: ex,
          type: "stale",
          status_label: "Stale",
          message: `${ex} hasn't been logged in ${weeksSinceLastSeen} weeks. Consider adding it back or removing it from the program.`,
          last_seen_week: latest.week_number,
          weeks_since_last_seen: weeksSinceLastSeen,
        });
        continue;
      }

      let consecutiveHits = 0;
      let consecutiveMisses = 0;
      for (const session of sessions) {
        if (session.hit_all_reps) {
          if (consecutiveMisses > 0) break;
          consecutiveHits += 1;
        } else {
          if (consecutiveHits > 0) break;
          consecutiveMisses += 1;
        }
      }

      if (consecutiveHits >= 3) {
        recommendations.push({
          exercise_name: ex,
          type: "increase",
          status_label: "Ready to level up",
          message: `${ex}: Hit all prescribed reps for ${consecutiveHits} straight sessions. Ready to add 5 lbs.`,
          suggested_increment: 5,
          streak_count: consecutiveHits,
          last_seen_week: latest.week_number,
        });
      } else if (consecutiveMisses >= 2) {
        recommendations.push({
          exercise_name: ex,
          type: "deload",
          status_label: "Check load",
          message: `${ex}: Missed prescribed reps for ${consecutiveMisses} straight sessions. Consider a deload or form check before increasing weight.`,
          streak_count: consecutiveMisses,
          last_seen_week: latest.week_number,
        });
      }
    }

    if (recommendations.length === 0) {
      return {
        success: true,
        message: `No overload recommendations right now. Keep training and check back after a couple more sessions.`,
        data: { recommendations: [], exercises_analyzed: allExercises.length },
      };
    }

    const lines = recommendations.map((r) => {
      const icon = r.type === "increase" ? "📈" : r.type === "deload" ? "⚠️" : "💤";
      return `${icon} ${r.message}`;
    });

    return {
      success: true,
      message: `Overload recommendations (last ${safeLookbackWeeks} weeks):\n\n${lines.join("\n\n")}`,
      data: {
        recommendations,
        recommendations_by_exercise: Object.fromEntries(
          recommendations.map((recommendation) => [
            recommendation.exercise_name.toLowerCase(),
            recommendation,
          ])
        ),
        exercises_analyzed: allExercises.length,
        lookback_weeks: safeLookbackWeeks,
        current_week: currentWeek,
      },
    };
  }

  async function compare_weeks(week1?: number, week2?: number, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found for user.");
    }

    const currentWeek = await resolveCurrentWeek();
    const w1 = week1 ?? currentWeek;
    const w2 = week2 ?? Math.max(1, currentWeek - 1);

    if (w1 === w2) {
      throw AppError.invalidArgs("week1 and week2 must be different.");
    }

    // Fetch logs for both weeks in parallel
    const [logs1Result, logs2Result, completions1Result, completions2Result] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("day_name, exercise_name, actual_weight, actual_reps, completed")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", w1)
        .eq("completed", true),
      supabase
        .from("workout_logs")
        .select("day_name, exercise_name, actual_weight, actual_reps, completed")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", w2)
        .eq("completed", true),
      supabase
        .from("workout_completions")
        .select("day_name")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", w1),
      supabase
        .from("workout_completions")
        .select("day_name")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", w2),
    ]);

    const logs1 = (logs1Result.data ?? []) as Array<{ day_name: string; exercise_name: string; actual_weight: number; actual_reps: number | string; completed: boolean }>;
    const logs2 = (logs2Result.data ?? []) as Array<{ day_name: string; exercise_name: string; actual_weight: number; actual_reps: number | string; completed: boolean }>;

    function calcVolume(logs: typeof logs1): number {
      return logs.reduce((sum, log) => {
        const reps = typeof log.actual_reps === "number" ? log.actual_reps : 0;
        return sum + (log.actual_weight ?? 0) * reps;
      }, 0);
    }

    function groupByDay(logs: typeof logs1): Record<string, { sets: number; volume: number }> {
      const map: Record<string, { sets: number; volume: number }> = {};
      for (const log of logs) {
        if (!map[log.day_name]) map[log.day_name] = { sets: 0, volume: 0 };
        map[log.day_name].sets += 1;
        const reps = typeof log.actual_reps === "number" ? log.actual_reps : 0;
        map[log.day_name].volume += (log.actual_weight ?? 0) * reps;
      }
      return map;
    }

    const sets1 = logs1.length;
    const sets2 = logs2.length;
    const vol1 = calcVolume(logs1);
    const vol2 = calcVolume(logs2);
    const setsDelta = sets1 - sets2;
    const volDeltaPct = vol2 > 0 ? Math.round(((vol1 - vol2) / vol2) * 100) : null;

    const completedDays1 = (completions1Result.data ?? []).map((c: any) => c.day_name as string);
    const completedDays2 = (completions2Result.data ?? []).map((c: any) => c.day_name as string);

    const dayGroups1 = groupByDay(logs1);
    const dayGroups2 = groupByDay(logs2);
    const allDays = [...new Set([...Object.keys(dayGroups1), ...Object.keys(dayGroups2)])].sort();

    const byDay: Record<string, { week1_sets: number; week2_sets: number; week1_volume: number; week2_volume: number }> = {};
    for (const day of allDays) {
      byDay[day] = {
        week1_sets: dayGroups1[day]?.sets ?? 0,
        week2_sets: dayGroups2[day]?.sets ?? 0,
        week1_volume: dayGroups1[day]?.volume ?? 0,
        week2_volume: dayGroups2[day]?.volume ?? 0,
      };
    }

    // Build human-readable summary
    const setsDir = setsDelta > 0 ? `+${setsDelta} more` : setsDelta < 0 ? `${setsDelta} fewer` : "same";
    const volDir = volDeltaPct !== null
      ? volDeltaPct > 0 ? `+${volDeltaPct}% more` : volDeltaPct < 0 ? `${volDeltaPct}% less` : "same"
      : "volume not comparable (no data)";

    const summary = [
      `Week ${w1} vs Week ${w2}:`,
      `  Sets: ${sets1} vs ${sets2} (${setsDir} sets this week)`,
      `  Volume: ${vol1.toLocaleString()} vs ${vol2.toLocaleString()} lbs total (${volDir} volume)`,
      `  Workouts completed: ${completedDays1.length} vs ${completedDays2.length} days`,
    ].join("\n");

    return {
      success: true,
      message: summary,
      data: {
        week1: w1,
        week2: w2,
        week1_sets: sets1,
        week2_sets: sets2,
        sets_delta: setsDelta,
        week1_volume_lbs: vol1,
        week2_volume_lbs: vol2,
        volume_delta_pct: volDeltaPct,
        week1_completed_days: completedDays1,
        week2_completed_days: completedDays2,
        by_day: byDay,
      },
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
    compare_weeks,
    get_overload_recommendations,
    get_training_history_summary,
    // Expose helpers for other tool modules
    getMyGyms,
    resolveGymId,
  };
}
