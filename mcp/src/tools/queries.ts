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
  WorkoutBlockScoreRow,
} from "../types.js";
import { resolveUserClock, weekWindowFor, type UserClock } from "../user-clock.js";
import {
  classifySet,
  consecutiveOutcomeStreak,
  parsePrescription,
  sessionOutcome,
  sessionRepsLabel,
  type LoggedSetOutcome,
} from "../../../shared/set-outcome.js";
import {
  bestPreviousScore,
  formatBlockScore,
  getDayBlocks,
  type WorkoutBlock,
} from "../../../shared/workout-blocks.js";

const BLOCK_SCORE_COLUMNS =
  "gym_id, week_number, day_name, block_id, benchmark, score_type, rounds, reps, time_seconds, capped, note";

/** A stored score as the API returns it: the row fields plus a display string. */
function presentBlockScore(row: WorkoutBlockScoreRow) {
  return {
    week_number: row.week_number,
    day_name: row.day_name,
    score_type: row.score_type,
    rounds: row.rounds,
    reps: row.reps,
    time_seconds: row.time_seconds,
    capped: row.capped,
    note: row.note,
    display: formatBlockScore(row),
  };
}

/** Block definition as the API returns it. Scores are added by callers that have them. */
function presentBlock(block: WorkoutBlock) {
  return {
    id: block.id,
    type: block.type,
    title: block.title,
    time_cap_min: block.time_cap_min,
    exercise_indexes: block.exercise_indexes,
    rounds: block.rounds ?? null,
    benchmark: block.benchmark ?? null,
    notes: block.notes ?? null,
  };
}

function blockHeadline(block: WorkoutBlock): string {
  const kind = block.type === "amrap" ? "AMRAP" : "For Time";
  const rounds = block.rounds ? `, ${block.rounds} rounds` : "";
  return `${block.title} (${kind}${rounds}, ${block.time_cap_min} min cap)`;
}

export function createQueryTools(supabase: SupabaseClient, userId: string) {
  function describeWeek(clock: UserClock, weekNumber: number) {
    const { range_label, ...fields } = weekWindowFor(clock, weekNumber);
    return { fields, label: `Week ${weekNumber} (${range_label})` };
  }

  // ── Helpers ──────────────────────────────────────────────

  // "First gym" must be deterministic: oldest membership first, gym_id as the tie-breaker.
  async function getMyGyms(): Promise<Gym[]> {
    const { data } = await supabase
      .from("gym_members")
      .select(
        `gym_id, role, gyms (id, name, invite_code, created_by)`
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .order("gym_id", { ascending: true });

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

  function isGymWriter(role?: string | null): boolean {
    return role === "owner" || role === "leader";
  }

  /** Membership + owner/leader. Members can log sets; they cannot overwrite the shared program. */
  async function resolveWritableGymId(gymId?: string): Promise<string | null> {
    const gyms = await getMyGyms();
    const writable = gyms.filter((g) => isGymWriter(g.role));
    if (!gymId) return writable[0]?.id ?? null;
    return writable.find((g) => g.id === gymId)?.id ?? null;
  }

  async function resolveLeaderProgramGym(): Promise<{ id: string; name: string } | null> {
    // Same pick as the web bootstrap: get_leader_gym_id (accepted member → leader's
    // oldest owned gym). Service role passes _require_self. A miss is not a member.
    const { data, error } = await supabase.rpc("get_leader_gym_id", { p_member_id: userId });
    if (error || data == null || data === "") return null;
    const id = String(data);
    const { data: gym } = await supabase.from("gyms").select("id, name").eq("id", id).maybeSingle();
    const name = (gym as { name?: string } | null)?.name;
    return { id, name: name && name.length > 0 ? name : "the leader's gym" };
  }

  async function resolveCurrentWeek(): Promise<number> {
    return (await resolveUserClock(supabase, userId)).currentWeek;
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
    const nameLc = exerciseName.toLowerCase().trim();
    // Exact key first — program names often match maxes keys that are NOT
    // the canonical alias (e.g. "Incline Bench Press", "Pendlay Rows").
    const exactKey = Object.keys(maxes).find(
      (key) => key.toLowerCase().trim() === nameLc
    );
    if (exactKey) return maxes[exactKey];

    const canonical = normalizeExerciseName(exerciseName).toLowerCase();
    const byCanon = Object.keys(maxes).find(
      (key) => normalizeExerciseName(key).toLowerCase() === canonical
    );
    return byCanon ? maxes[byCanon] : null;
  }

  function enrichExercises(
    exercises: ProgramExercise[],
    maxes: Record<string, number>,
    blocks: WorkoutBlock[] = []
  ) {
    const blockOfIndex = new Map<number, string>();
    for (const block of blocks) {
      for (const index of block.exercise_indexes) blockOfIndex.set(index, block.id);
    }
    return exercises.map((ex, i) => {
      const max1RM = resolveMaxForExercise(ex.name, maxes);
      let weight_lbs: number | null = null;

      if (ex.percentages && ex.percentages.length > 0 && max1RM) {
        const maxPct = Math.max(...ex.percentages);
        weight_lbs = roundToNearestFive((maxPct / 100) * max1RM);
      } else if (typeof ex.weight_lbs === "number") {
        weight_lbs = ex.weight_lbs;
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
        note: ex.note ?? null,
        block_id: blockOfIndex.get(i) ?? null,
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

    const primary = gyms[0];
    const leader = await resolveLeaderProgramGym();
    const lines = gyms.map(
      (g, i) => `${i + 1}. ${g.name} (${g.id}) — role: ${g.role}`
    );
    // A group member logs to their own gym and follows the leader's program
    // (web bootstrap: gyms[0] for logs, get_leader_gym_id for the program).
    // Do not claim "exactly one gym" in that case — the program is not theirs.
    const directive = leader
      ? `Use gym "${primary.name}" (${primary.id}) for logging. Omit gym_id in tool calls and it is used automatically. You follow the leader's program at gym "${leader.name}" (${leader.id}).`
      : `Use gym "${primary.name}" (${primary.id}) for everything. Omit gym_id in tool calls and it is used automatically.${gyms.length === 1 ? " You have exactly one gym." : ""}`;
    return {
      success: true,
      message: `${directive}\nYour gyms:\n${lines.join("\n")}`,
      data: {
        gyms: gyms.map((g) => ({
          id: g.id,
          name: g.name,
          role: g.role,
          primary: g.id === primary.id,
        })),
      },
    };
  }

  /** The user's scores up to `week`: this week's for display, earlier ones for "the number to beat". */
  async function loadBlockScores(week: number): Promise<WorkoutBlockScoreRow[]> {
    const { data } = await supabase
      .from("workout_block_scores")
      .select(BLOCK_SCORE_COLUMNS)
      .eq("user_id", userId)
      .lte("week_number", week);
    return (data as WorkoutBlockScoreRow[] | null) ?? [];
  }

  async function get_todays_workout(gymId?: string, dayName?: string, weekNumber?: number): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const clock = await resolveUserClock(supabase, userId);
    const week = weekNumber ?? clock.currentWeek;
    const day = dayName ?? clock.dayName;
    const { fields: weekFields, label: weekLabel } = describeWeek(clock, week);

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", week)
      .single();

    if (!programRow) {
      return {
        success: true,
        message: `No program found for ${weekLabel}. Generate one first.`,
        data: { current_week: week, day_name: day, gym_id: resolvedGymId, ...weekFields },
      };
    }

    const program = (programRow as WorkoutProgramRow).program_data;
    const today: ProgramDay | undefined = program[day];

    if (!today) {
      return {
        success: true,
        message: `${day} is a rest day (${weekLabel}).`,
        data: { current_week: week, day_name: day, rest_day: true, gym_id: resolvedGymId, ...weekFields },
      };
    }

    const dayBlocks = getDayBlocks(today);
    const blockScoreRows = dayBlocks.length > 0 ? await loadBlockScores(week) : [];

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
        .select("id, completed_at, completion_type, logged_sets, planned_sets")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .eq("day_name", day)
        .maybeSingle(),
    ]);

    const logs = (logsResult.data as Array<Pick<WorkoutLog, "exercise_index" | "set_index" | "exercise_name" | "actual_weight" | "actual_reps" | "prescribed_weight" | "prescribed_reps" | "completed" | "completed_at">> | null) ?? [];
    const enrichedExercises = enrichExercises(today.exercises, maxes, dayBlocks).map((ex) => {
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
    const dayCompletionType = completionResult.data?.completion_type ?? null;
    const dayLoggedSets = completionResult.data?.logged_sets ?? totalLoggedSets;
    const dayPlannedSets = completionResult.data?.planned_sets ?? totalPrescribedSets;

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

    const blocks = dayBlocks.map((block) => {
      const mine = blockScoreRows.find(
        (r) =>
          r.week_number === week &&
          r.day_name === day &&
          r.block_id === block.id &&
          r.gym_id === resolvedGymId
      );
      const previous = bestPreviousScore(blockScoreRows, block.benchmark, block.type, week);
      return {
        ...presentBlock(block),
        score: mine ? presentBlockScore(mine) : null,
        best_previous: previous ? presentBlockScore(previous) : null,
      };
    });

    const blockLines = blocks.map((b, i) => {
      const movements = dayBlocks[i].exercise_indexes.map((n) => n + 1).join(", ");
      const score = b.score ? ` — score: ${b.score.display}` : "";
      const beat = !b.score && b.best_previous ? ` — number to beat: ${b.best_previous.display} (Week ${b.best_previous.week_number})` : "";
      return `  Block ${blockHeadline(dayBlocks[i])}: movements ${movements}${score}${beat}`;
    });
    const notesBlock = today.coach_notes ? `\nCoach's notes: ${today.coach_notes}` : "";

    const statusLine = dayCompleted
      ? (dayCompletionType === "partial"
        ? `\nStatus: partial (${dayLoggedSets}/${dayPlannedSets} programmed sets logged)`
        : `\nStatus: complete (${totalLoggedSets}/${totalPrescribedSets} programmed sets logged)`)
      : totalLoggedSets > 0
        ? `\nStatus: in progress (${totalLoggedSets}/${totalPrescribedSets} programmed sets logged)`
        : "";

    return {
      success: true,
      message: `${weekLabel}, ${day} — ${today.focus}:${notesBlock}\n${exerciseLines.join("\n")}${blockLines.length > 0 ? `\n${blockLines.join("\n")}` : ""}${statusLine}`,
      data: {
        current_week: week,
        day_name: day,
        focus: today.focus,
        coach_notes: today.coach_notes ?? null,
        blocks,
        exercises: enrichedExercises,
        gym_id: resolvedGymId,
        day_completed: dayCompleted,
        day_completed_at: completionResult.data?.completed_at ?? null,
        completion_type: dayCompletionType,
        logged_sets: dayLoggedSets,
        planned_sets: dayPlannedSets,
        completed_exercises: completedExercises,
        total_exercises: enrichedExercises.length,
        total_logged_sets: totalLoggedSets,
        total_prescribed_sets: totalPrescribedSets,
        ad_hoc_logs: adHocLogs,
        ...weekFields,
      },
    };
  }

  async function get_weekly_workout(weekNumber?: number, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const clock = await resolveUserClock(supabase, userId);
    const week = weekNumber ?? clock.currentWeek;
    const { fields: weekFields, label: weekLabel } = describeWeek(clock, week);

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", week)
      .single();

    if (!programRow) {
      return {
        success: true,
        message: `No program found for ${weekLabel}.`,
        data: { gym_id: resolvedGymId, ...weekFields },
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

      const dayBlocks = getDayBlocks(day);
      const enriched = enrichExercises(day.exercises, maxes, dayBlocks);
      const daySets = enriched.reduce((sum, ex) => sum + ex.sets, 0);
      totalSets += daySets;

      days[dayName] = {
        focus: day.focus,
        coach_notes: day.coach_notes ?? null,
        blocks: dayBlocks.map(presentBlock),
        exercises: enriched,
        total_sets: daySets,
      };
      lines.push(`  ${dayName}: ${day.focus} — ${enriched.length} exercises, ${daySets} sets`);
    }

    return {
      success: true,
      message: `${weekLabel} (${totalSets} total sets):\n${lines.join("\n")}`,
      data: { total_sets: totalSets, days, gym_id: resolvedGymId, ...weekFields },
    };
  }

  async function get_program_overview(gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found for user.", data: {} };
    }

    const clock = await resolveUserClock(supabase, userId);
    const currentWeek = clock.currentWeek;
    const { fields: weekFields, label: weekLabel } = describeWeek(clock, currentWeek);

    const { data: rows } = await supabase
      .from("workout_programs")
      .select("week_number, program_data, ai_notes")
      .eq("gym_id", resolvedGymId)
      .order("week_number", { ascending: true });

    const programs = (rows as WorkoutProgramRow[] | null) ?? [];
    if (programs.length === 0) {
      return {
        success: true,
        message: `No programs found. Currently ${weekLabel}.`,
        data: { current_week: currentWeek, total_weeks: 0, weeks: [], gym_id: resolvedGymId, ...weekFields },
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
      message: `Program overview (${programs.length} weeks, currently ${weekLabel}):\n${lines.join("\n")}`,
      data: {
        current_week: currentWeek,
        total_weeks: programs.length,
        weeks,
        gym_id: resolvedGymId,
        ...weekFields,
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

    const clock = await resolveUserClock(supabase, userId);
    const week = weekNumber ?? clock.currentWeek;
    const { fields: weekFields, label: weekLabel } = describeWeek(clock, week);

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
    const summary = `${weekLabel}${dayName ? `, ${dayName}` : ""}: ${completedSets} sets completed across ${new Set(logs.map((l) => l.exercise_name)).size} exercises.`;

    return {
      success: true,
      message: summary,
      data: { ...weekFields, day_name: dayName ?? null, logs },
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

    const [profileResult, maxesResult, logsResult, completionsResult, missedDaysResult, programsResult, sessionNotesResult, blockScoresResult] =
      await Promise.all([
        get_profile(),
        get_maxes(),
        supabase
          .from("workout_logs")
          .select("week_number, day_name, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed, completed_at")
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
        supabase
          .from("session_notes")
          .select("week_number, day_name, label, text")
          .eq("user_id", userId)
          .gte("week_number", fromWeek)
          .order("week_number", { ascending: false }),
        supabase
          .from("workout_block_scores")
          .select(BLOCK_SCORE_COLUMNS)
          .eq("user_id", userId)
          .eq("gym_id", resolvedGymId)
          .gte("week_number", fromWeek)
          .order("week_number", { ascending: false }),
      ]);

    const profile = profileResult.data as Record<string, unknown>;
    const maxes = (maxesResult.data as any)?.maxes ?? {};
    const logs = (logsResult.data ?? []) as Array<{
      week_number: number; day_name: string; exercise_name: string;
      actual_weight: number | null; actual_reps: number | string | null;
      prescribed_weight: number | null; prescribed_reps: number | string | null;
      completed?: boolean | null;
      completed_at: string | null;
    }>;
    const completions = (completionsResult.data ?? []) as Array<{ week_number: number; day_name: string }>;
    const missedDays = (missedDaysResult.data ?? []) as Array<{ week_number: number; day_name: string; reason: string | null }>;
    const programs = (programsResult.data ?? []) as Array<{ week_number: number; program_data: Record<string, any>; ai_notes: string | null }>;
    const sessionNotes = (sessionNotesResult.data ?? []) as Array<{ week_number: number; day_name: string; label: string | null; text: string }>;

    const blockScores = ((blockScoresResult.data ?? []) as WorkoutBlockScoreRow[]).map((row) => {
      const program = programs.find((p) => p.week_number === row.week_number);
      const title =
        getDayBlocks(program?.program_data?.[row.day_name]).find((b) => b.id === row.block_id)?.title ?? row.block_id;
      return { ...presentBlockScore(row), block_id: row.block_id, title, benchmark: row.benchmark };
    });

    const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const measuredRepCount = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
      return null;
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
        outcome: LoggedSetOutcome;
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
      set_outcomes: LoggedSetOutcome[];
      sets_logged: number;
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
          set_outcomes: [],
          sets_logged: 0,
          completed_at: log.completed_at,
        });
      }

      const session = sessionMap.get(sessionKey)!;
      const prescription = parsePrescription(log.prescribed_reps);
      const measuredActual = measuredRepCount(log.actual_reps);
      if (typeof log.actual_weight === "number") session.actual_weights.push(log.actual_weight);
      if (typeof log.prescribed_weight === "number") session.prescribed_weights.push(log.prescribed_weight);
      if (measuredActual != null) session.actual_reps.push(measuredActual);
      if (prescription.kind === "reps") session.prescribed_reps.push(prescription.count);
      session.set_outcomes.push(classifySet({
        actual_reps: log.actual_reps,
        prescribed_reps: log.prescribed_reps,
        completed: log.completed,
      }));
      session.sets_logged += 1;
    }

    Array.from(sessionMap.values())
      .sort((a, b) => {
        if (a.week_number !== b.week_number) return b.week_number - a.week_number;
        return dayOrder.indexOf(a.day_name) - dayOrder.indexOf(b.day_name);
      })
      .forEach((session) => {
        const summary = weekSummaries[session.week_number];
        if (!summary) return;
        const outcome = sessionOutcome(session.set_outcomes);
        if (outcome === "not_logged") return;

        summary.exercise_sessions.push({
          day_name: session.day_name,
          exercise_name: session.exercise_name,
          sets_logged: session.sets_logged,
          avg_actual_weight: average(session.actual_weights),
          avg_prescribed_weight: average(session.prescribed_weights),
          avg_actual_reps: average(session.actual_reps),
          prescribed_reps: session.prescribed_reps[0] ?? null,
          hit_all_reps: outcome === "hit",
          outcome,
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
        .slice()
        .sort((a, b) => {
          const wa = a.avg_actual_weight || a.avg_prescribed_weight || 0;
          const wb = b.avg_actual_weight || b.avg_prescribed_weight || 0;
          if (wb !== wa) return wb - wa;
          return b.sets_logged - a.sets_logged;
        })
        .slice(0, 4)
        .map((session) => {
          const targetWeight = session.avg_actual_weight || session.avg_prescribed_weight || 0;
          return `    - ${session.day_name} ${session.exercise_name}: ${session.sets_logged} sets @ ~${targetWeight} lbs, ${sessionRepsLabel(session.outcome)}`;
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
      ...(sessionNotes.length > 0
        ? ["", "Session notes:", ...sessionNotes.map((n) => `  - Week ${n.week_number} ${n.day_name}: ${n.text}`)]
        : []),
      ...(blockScores.length > 0
        ? ["", "Block scores:", ...blockScores.map((b) => `  - Week ${b.week_number} ${b.day_name} ${b.title}: ${b.display}`)]
        : []),
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
        session_notes: sessionNotes,
        block_scores: blockScores,
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
      .select("week_number, day_name, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed, completed_at")
      .eq("user_id", userId)
      .eq("gym_id", resolvedGymId)
      .eq("completed", true)
      .gte("week_number", fromWeek)
      .order("week_number", { ascending: false });

    const logs = (logsRaw ?? []) as Array<{
      week_number: number;
      day_name: string;
      exercise_name: string;
      actual_weight: number | null;
      actual_reps: number | string | null;
      prescribed_weight: number | null;
      prescribed_reps: number | string | null;
      completed?: boolean | null;
      completed_at: string | null;
    }>;

    if (logs.length === 0) {
      return { success: true, message: "Not enough training history to make recommendations yet.", data: { recommendations: [] } };
    }

    const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const sessionMap = new Map<string, {
      week_number: number;
      day_name: string;
      exercise_name: string;
      set_outcomes: LoggedSetOutcome[];
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
          set_outcomes: [],
          actual_weights: [],
          prescribed_weights: [],
        });
      }

      const session = sessionMap.get(sessionKey)!;
      if (typeof log.actual_weight === "number") session.actual_weights.push(log.actual_weight);
      if (typeof log.prescribed_weight === "number") session.prescribed_weights.push(log.prescribed_weight);
      session.set_outcomes.push(classifySet({
        actual_reps: log.actual_reps,
        prescribed_reps: log.prescribed_reps,
        completed: log.completed,
      }));
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
    const byExercise = new Map<string, Array<{ week_number: number; day_name: string; outcome: LoggedSetOutcome; hasWeight: boolean }>>();
    Array.from(sessionMap.values()).forEach((session) => {
      const outcome = sessionOutcome(session.set_outcomes);
      if (outcome === "not_logged") return;
      const sessions = byExercise.get(session.exercise_name) ?? [];
      sessions.push({
        week_number: session.week_number,
        day_name: session.day_name,
        outcome,
        hasWeight: session.actual_weights.some((w) => w > 0) || session.prescribed_weights.some((w) => w > 0),
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

      const { consecutiveHits, consecutiveMisses } = consecutiveOutcomeStreak(sessions);

      const isBodyweight = !latest.hasWeight;
      if (consecutiveHits >= 3) {
        recommendations.push({
          exercise_name: ex,
          type: "increase",
          status_label: "Ready to level up",
          message: isBodyweight
            ? `${ex}: Hit all prescribed reps for ${consecutiveHits} straight sessions. Ready to add 2 reps.`
            : `${ex}: Hit all prescribed reps for ${consecutiveHits} straight sessions. Ready to add 5 lbs.`,
          suggested_increment: isBodyweight ? 2 : 5,
          streak_count: consecutiveHits,
          last_seen_week: latest.week_number,
        });
      } else if (consecutiveMisses >= 2) {
        recommendations.push({
          exercise_name: ex,
          type: "deload",
          status_label: "Check load",
          message: isBodyweight
            ? `${ex}: Missed prescribed reps for ${consecutiveMisses} straight sessions. Consider fewer reps or an easier variation.`
            : `${ex}: Missed prescribed reps for ${consecutiveMisses} straight sessions. Consider a deload or form check before increasing weight.`,
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
    resolveWritableGymId,
    resolveLeaderProgramGym,
    getUserMaxes,
    enrichExercises,
  };
}
