// Context modules for buildContextBundleFromModules.
// Each module knows how to load its slice of SwolTracker state and
// summarize it in a few sentences. The SDK's bundle builder handles
// priority ordering and token-budget trimming.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextModule } from "@bot-native/sdk";
import { getCurrentWeek, getTodayName } from "./week-calc.js";
import type { CurrentMax, ProgramDay, WorkoutProgramRow } from "./types.js";

export interface ContextDeps {
  supabase: SupabaseClient;
  userId: string;
}

// ── Shared helpers ─────────────────────────────────────────

async function resolveGymId(deps: ContextDeps): Promise<string | null> {
  const { data } = await deps.supabase
    .from("gym_members")
    .select("gym_id")
    .eq("user_id", deps.userId)
    .limit(1);
  return data?.[0]?.gym_id ?? null;
}

async function resolveCurrentWeek(deps: ContextDeps): Promise<number> {
  const { data } = await deps.supabase
    .from("profiles")
    .select("program_start_date")
    .eq("id", deps.userId)
    .single();
  return getCurrentWeek(data?.program_start_date ?? null);
}

// ── P10: Current program (today's workout) ────────────────

const currentProgramModule: ContextModule<ContextDeps> = {
  key: "current_program",
  priority: 10,
  async load(deps) {
    const gymId = await resolveGymId(deps);
    if (!gymId) return { available: false };

    const week = await resolveCurrentWeek(deps);
    const day = getTodayName();

    const { data: programRow } = await deps.supabase
      .from("workout_programs")
      .select("program_data")
      .eq("gym_id", gymId)
      .eq("week_number", week)
      .single();

    if (!programRow) return { available: false, week, day };

    const program = (programRow as Pick<WorkoutProgramRow, "program_data">).program_data;
    const today: ProgramDay | undefined = program[day];
    if (!today) return { available: true, week, day, rest_day: true };

    return {
      available: true,
      week,
      day,
      focus: today.focus,
      exercise_count: today.exercises.length,
      exercises: today.exercises.map((ex: any) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
      })),
    };
  },
  summarize(data) {
    if (!data.available) return "No active program yet.";
    if (data.rest_day) return `Today (Week ${data.week}, ${data.day}) is a rest day.`;
    return `Today: Week ${data.week} ${data.day} — ${data.focus}, ${data.exercise_count} exercises.`;
  },
};

// ── P9: Recent logs (last 7 days) ──────────────────────────

const recentLogsModule: ContextModule<ContextDeps> = {
  key: "recent_logs",
  priority: 9,
  async load(deps) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data } = await deps.supabase
      .from("workout_logs")
      .select("exercise_name, actual_weight, actual_reps, completed_at, day_name, week_number")
      .eq("user_id", deps.userId)
      .eq("completed", true)
      .gte("completed_at", sevenDaysAgo.toISOString())
      .order("completed_at", { ascending: false })
      .limit(200);

    const logs = (data ?? []) as Array<{
      exercise_name: string;
      actual_weight: number;
      actual_reps: number | string;
      completed_at: string;
      day_name: string;
      week_number: number;
    }>;

    const sessionKeys = new Set(logs.map((l) => `${l.week_number}::${l.day_name}`));
    const exerciseCounts = new Map<string, number>();
    for (const log of logs) {
      exerciseCounts.set(log.exercise_name, (exerciseCounts.get(log.exercise_name) ?? 0) + 1);
    }

    return {
      session_count: sessionKeys.size,
      set_count: logs.length,
      top_exercises: Array.from(exerciseCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, sets]) => ({ name, sets })),
    };
  },
  summarize(data) {
    if (data.set_count === 0) return "No training activity in the last 7 days.";
    const top = (data.top_exercises as Array<{ name: string; sets: number }>)
      .slice(0, 3)
      .map((e) => `${e.name}×${e.sets}`)
      .join(", ");
    return `Last 7 days: ${data.session_count} sessions, ${data.set_count} sets. Top: ${top}.`;
  },
};

// ── P8: Maxes ─────────────────────────────────────────────

const maxesModule: ContextModule<ContextDeps> = {
  key: "maxes",
  priority: 8,
  async load(deps) {
    const { data } = await deps.supabase
      .from("current_user_maxes")
      .select("exercise_name, weight_lbs")
      .eq("user_id", deps.userId);

    const maxes: Record<string, number> = {};
    (data as CurrentMax[] | null)?.forEach((m) => {
      maxes[m.exercise_name] = m.weight_lbs;
    });

    const sorted = Object.entries(maxes).sort(([, a], [, b]) => b - a);
    return {
      count: sorted.length,
      top: sorted.slice(0, 5).map(([name, weight]) => ({ name, weight })),
    };
  },
  summarize(data) {
    if (data.count === 0) return "No 1RM records yet.";
    const top = (data.top as Array<{ name: string; weight: number }>)
      .slice(0, 3)
      .map((m) => `${m.name} ${m.weight}lb`)
      .join(", ");
    return `${data.count} 1RMs on file. Top: ${top}.`;
  },
};

// ── P7: Streak ────────────────────────────────────────────

const streakModule: ContextModule<ContextDeps> = {
  key: "streak",
  priority: 7,
  async load(deps) {
    const gymId = await resolveGymId(deps);
    if (!gymId) return { current: 0, longest: 0 };

    const { data } = await deps.supabase
      .from("workout_completions")
      .select("week_number")
      .eq("user_id", deps.userId)
      .eq("gym_id", gymId)
      .order("week_number", { ascending: true });

    const weeks = [...new Set((data ?? []).map((c: any) => c.week_number as number))].sort(
      (a, b) => a - b
    );
    if (weeks.length === 0) return { current: 0, longest: 0 };

    let longest = 1;
    let run = 1;
    for (let i = 1; i < weeks.length; i++) {
      if (weeks[i] === weeks[i - 1] + 1) {
        run++;
        longest = Math.max(longest, run);
      } else {
        run = 1;
      }
    }

    const currentWeek = getCurrentWeek(null);
    const weekSet = new Set(weeks);
    let current = 0;
    for (let w = currentWeek; w >= 1; w--) {
      if (weekSet.has(w)) current++;
      else break;
    }

    return { current, longest };
  },
  summarize(data) {
    if (data.current === 0) return `No active streak (longest: ${data.longest}w).`;
    return `${data.current}-week streak 🔥 (longest: ${data.longest}w).`;
  },
};

// ── P6: Unread coach notes ─────────────────────────────────

const unreadCoachNotesModule: ContextModule<ContextDeps> = {
  key: "unread_coach_notes",
  priority: 6,
  async load(deps) {
    const { data } = await deps.supabase.rpc("get_unread_user_messages", {
      p_user_id: deps.userId,
      p_limit: 10,
    });
    const messages = (data ?? []) as Array<{ content: string; message_created_at: string }>;
    return {
      count: messages.length,
      latest_preview: messages[0]?.content?.slice(0, 120) ?? null,
    };
  },
  summarize(data) {
    if (data.count === 0) return "No unread user notes.";
    return `${data.count} unread user note${data.count === 1 ? "" : "s"}. Latest: "${data.latest_preview}"`;
  },
};

// ── P5: Gym equipment ──────────────────────────────────────

const gymEquipmentModule: ContextModule<ContextDeps> = {
  key: "gym_equipment",
  priority: 5,
  async load(deps) {
    const gymId = await resolveGymId(deps);
    if (!gymId) return { items: [] };

    const { data } = await deps.supabase
      .from("gym_equipment")
      .select("name")
      .eq("gym_id", gymId);

    return { items: (data ?? []).map((e: any) => e.name as string) };
  },
  summarize(data) {
    const items = data.items as string[];
    if (items.length === 0) return "No equipment registered for gym.";
    return `Equipment: ${items.slice(0, 10).join(", ")}${items.length > 10 ? `, +${items.length - 10} more` : ""}.`;
  },
};

// ── P4: Upcoming deload ───────────────────────────────────

const upcomingDeloadModule: ContextModule<ContextDeps> = {
  key: "upcoming_deload",
  priority: 4,
  async load(deps) {
    // Synthesize from workout_logs: any exercise the user has missed reps on
    // for 2+ consecutive sessions is a deload candidate. Mirrors the
    // get_overload_recommendations heuristic.
    const gymId = await resolveGymId(deps);
    if (!gymId) return { candidates: [] };

    const currentWeek = await resolveCurrentWeek(deps);
    const fromWeek = Math.max(1, currentWeek - 3);

    const { data } = await deps.supabase
      .from("workout_logs")
      .select("week_number, day_name, exercise_name, actual_reps, prescribed_reps")
      .eq("user_id", deps.userId)
      .eq("gym_id", gymId)
      .eq("completed", true)
      .gte("week_number", fromWeek)
      .order("week_number", { ascending: false });

    const logs = (data ?? []) as Array<{
      week_number: number;
      day_name: string;
      exercise_name: string;
      actual_reps: number | string;
      prescribed_reps: number | string | null;
    }>;

    const parseReps = (v: number | string | null | undefined) => {
      if (typeof v === "number") return v;
      const match = String(v ?? "").match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    // Aggregate per (exercise, session) whether all prescribed reps were hit.
    const sessionMap = new Map<string, { week: number; day: string; hit: boolean }>();
    for (const log of logs) {
      const key = `${log.exercise_name}::${log.week_number}::${log.day_name}`;
      const prev = sessionMap.get(key) ?? { week: log.week_number, day: log.day_name, hit: true };
      const actual = parseReps(log.actual_reps);
      const prescribed = log.prescribed_reps == null ? null : parseReps(log.prescribed_reps);
      if (prescribed !== null && actual < prescribed) prev.hit = false;
      sessionMap.set(key, prev);
    }

    const byExercise = new Map<string, Array<{ week: number; day: string; hit: boolean }>>();
    for (const [key, session] of sessionMap) {
      const [exName] = key.split("::");
      const arr = byExercise.get(exName) ?? [];
      arr.push(session);
      byExercise.set(exName, arr);
    }

    const candidates: string[] = [];
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (const [ex, sessions] of byExercise) {
      const sorted = sessions.sort((a, b) => {
        if (a.week !== b.week) return b.week - a.week;
        return dayOrder.indexOf(b.day) - dayOrder.indexOf(a.day);
      });
      let misses = 0;
      for (const s of sorted) {
        if (s.hit) break;
        misses += 1;
      }
      if (misses >= 2) candidates.push(ex);
    }

    return { candidates };
  },
  summarize(data) {
    const candidates = data.candidates as string[];
    if (candidates.length === 0) return "No deload recommended right now.";
    return `Deload candidates: ${candidates.slice(0, 3).join(", ")}${candidates.length > 3 ? `, +${candidates.length - 3}` : ""}.`;
  },
};

// ── Factory ────────────────────────────────────────────────

export function createContextModules(): Array<ContextModule<ContextDeps>> {
  return [
    currentProgramModule,
    recentLogsModule,
    maxesModule,
    streakModule,
    unreadCoachNotesModule,
    gymEquipmentModule,
    upcomingDeloadModule,
  ];
}
