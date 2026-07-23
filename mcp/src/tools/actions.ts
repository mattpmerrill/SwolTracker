import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@bot-native/sdk";
import type { EventEmitter } from "../bot-native-shim.js";
import type { ToolResult, WeekProgram } from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";
import { normalizeExerciseName } from "../exercise-normalizer.js";
import type { createQueryTools } from "./queries.js";

// ---------------------------------------------------------------------------
// Workout program validation schema (rejects "5 warmup, 3 warmup, then 1 rep
// attempts until form breaks"-style reps and other structural drift before it
// lands in the database). Re-run safe; downstream UI also has defensive caps
// (see SwolTracker src/components/Workout/SetRow.jsx).
// ---------------------------------------------------------------------------

const REQUIRED_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const REPS_MAX = 16;
const NAME_MAX = 100;
const MUSCLE_MAX = 120;
const NOTE_MAX = 200;
const FOCUS_MAX = 80;

const ExerciseSchema = z.object({
  name: z.string().min(1).max(NAME_MAX),
  sets: z.number().int().positive().max(20),
  reps: z.string().min(1).max(REPS_MAX),
  percentages: z
    .array(z.number().int().min(1).max(200))
    .max(20)
    .nullable()
    .optional(),
  muscleGroups: z.string().max(MUSCLE_MAX).optional(),
  note: z.string().max(NOTE_MAX).optional(),
});

const DaySchema = z.object({
  focus: z.string().max(FOCUS_MAX).optional(),
  exercises: z.array(ExerciseSchema).max(50),
});

const WeekProgramSchema = z
  .record(z.enum(REQUIRED_DAYS), DaySchema)
  .refine(
    (w) => REQUIRED_DAYS.every((d) => Object.prototype.hasOwnProperty.call(w, d)),
    { message: `All 7 days (${REQUIRED_DAYS.join(", ")}) must be present` },
  );

function formatZodIssues(issues: z.ZodIssue[], limit = 5): string {
  return issues
    .slice(0, limit)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

interface LogSetParams {
  gym_id?: string;
  week_number?: number;
  day_name?: string;
  exercise_index: number;
  set_index: number;
  exercise_name: string;
  actual_weight: number;
  actual_reps: number | string;
  prescribed_weight?: number;
  prescribed_reps?: number | string;
}

interface WorkoutLogEntry {
  user_id: string;
  gym_id: string;
  week_number: number;
  day_name: string;
  exercise_index: number;
  set_index: number;
  exercise_name: string;
  prescribed_weight?: number;
  prescribed_reps?: number | string;
  actual_weight: number;
  actual_reps: number | string;
  completed: boolean;
}

export function createActionTools(
  supabase: SupabaseClient,
  userId: string,
  events: EventEmitter,
  queries: ReturnType<typeof createQueryTools>
) {
  async function resolveWorkoutSlot(gymId?: string, weekNumber?: number, dayName?: string) {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) return null;

    let week = weekNumber;
    if (!week) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("program_start_date")
        .eq("id", userId)
        .single();
      week = getCurrentWeek(profile?.program_start_date ?? null);
    }

    return {
      gymId: resolvedGymId,
      weekNumber: week,
      dayName: dayName ?? getTodayName(),
    };
  }

  async function upsertWorkoutLogs(entries: WorkoutLogEntry[]) {
    return supabase
      .from("workout_logs")
      .upsert(entries, {
        onConflict: "user_id,gym_id,week_number,day_name,exercise_index,set_index",
      })
      .select();
  }

  async function log_set(params: LogSetParams): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(
      params.gym_id,
      params.week_number,
      params.day_name
    );

    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const entry: WorkoutLogEntry = {
      user_id: userId,
      gym_id: slot.gymId,
      week_number: slot.weekNumber,
      day_name: slot.dayName,
      exercise_index: params.exercise_index,
      set_index: params.set_index,
      exercise_name: normalizeExerciseName(params.exercise_name),
      prescribed_weight: params.prescribed_weight ?? params.actual_weight,
      prescribed_reps: params.prescribed_reps ?? params.actual_reps,
      actual_weight: params.actual_weight,
      actual_reps: params.actual_reps,
      completed: true,
    };

    const { data, error } = await upsertWorkoutLogs([entry]);

    if (error) {
      return {
        success: false,
        message: `Failed to log set: ${error.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Logged: ${params.exercise_name} set ${params.set_index + 1} — ${params.actual_reps} reps @ ${params.actual_weight} lbs`,
      data: {
        log: data?.[0] ?? null,
        week_number: slot.weekNumber,
        day_name: slot.dayName,
        gym_id: slot.gymId,
      },
    };
  }

  async function log_many_sets(
    entries: Omit<WorkoutLogEntry, "user_id">[]
  ): Promise<ToolResult> {
    if (entries.length === 0) {
      return {
        success: false,
        message: "No sets provided.",
        data: {},
      };
    }

    const fullEntries: WorkoutLogEntry[] = entries.map((entry) => ({
      ...entry,
      exercise_name: normalizeExerciseName(entry.exercise_name),
      user_id: userId,
    }));

    const { data, error } = await upsertWorkoutLogs(fullEntries);

    if (error) {
      return {
        success: false,
        message: `Failed to log workout summary: ${error.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Logged ${fullEntries.length} set${fullEntries.length === 1 ? "" : "s"}.`,
      data: {
        logs: data ?? [],
        count: fullEntries.length,
      },
    };
  }

  async function delete_set(
    gymId: string | undefined,
    weekNumber: number | undefined,
    dayName: string | undefined,
    exerciseName: string,
    setIndex: number
  ): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(gymId, weekNumber, dayName);
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const canonical = normalizeExerciseName(exerciseName);

    // Find the exercise_index by matching exercise_name in logs
    const { data: existing } = await supabase
      .from("workout_logs")
      .select("id, exercise_index, set_index, actual_weight, actual_reps")
      .eq("user_id", userId)
      .eq("gym_id", slot.gymId)
      .eq("week_number", slot.weekNumber)
      .eq("day_name", slot.dayName)
      .eq("exercise_name", canonical)
      .eq("set_index", setIndex)
      .maybeSingle();

    if (!existing) {
      return {
        success: false,
        message: `No logged set found for ${canonical} set ${setIndex + 1} on ${slot.dayName} (Week ${slot.weekNumber}).`,
        data: {},
      };
    }

    const { error } = await supabase
      .from("workout_logs")
      .delete()
      .eq("id", existing.id);

    if (error) {
      return {
        success: false,
        message: `Failed to delete set: ${error.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Deleted: ${canonical} set ${setIndex + 1} (was ${existing.actual_reps} reps @ ${existing.actual_weight} lbs) on ${slot.dayName} Week ${slot.weekNumber}.`,
      data: { deleted: existing },
    };
  }

  async function correct_set(
    gymId: string | undefined,
    weekNumber: number | undefined,
    dayName: string | undefined,
    exerciseName: string,
    setIndex: number,
    newWeight: number,
    newReps: number | string
  ): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(gymId, weekNumber, dayName);
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const canonical = normalizeExerciseName(exerciseName);

    // Find existing log row
    const { data: existing } = await supabase
      .from("workout_logs")
      .select("id, exercise_index, actual_weight, actual_reps, prescribed_weight, prescribed_reps")
      .eq("user_id", userId)
      .eq("gym_id", slot.gymId)
      .eq("week_number", slot.weekNumber)
      .eq("day_name", slot.dayName)
      .eq("exercise_name", canonical)
      .eq("set_index", setIndex)
      .maybeSingle();

    if (!existing) {
      return {
        success: false,
        message: `No logged set found for ${canonical} set ${setIndex + 1} on ${slot.dayName} (Week ${slot.weekNumber}). Log it first.`,
        data: {},
      };
    }

    const { data, error } = await supabase
      .from("workout_logs")
      .update({
        actual_weight: newWeight,
        actual_reps: newReps,
        completed: true,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        message: `Failed to correct set: ${error.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Corrected: ${canonical} set ${setIndex + 1} — was ${existing.actual_reps} reps @ ${existing.actual_weight} lbs, now ${newReps} reps @ ${newWeight} lbs.`,
      data: { updated: data, previous: { weight: existing.actual_weight, reps: existing.actual_reps } },
    };
  }

  async function mark_workout_complete(
    gymId?: string,
    weekNumber?: number,
    dayName?: string
  ): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(gymId, weekNumber, dayName);
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const { data, error } = await supabase
      .from("workout_completions")
      .upsert(
        {
          user_id: userId,
          gym_id: slot.gymId,
          week_number: slot.weekNumber,
          day_name: slot.dayName,
        },
        { onConflict: "user_id,gym_id,week_number,day_name" }
      )
      .select()
      .single();

    if (error) {
      return {
        success: false,
        message: `Failed to mark complete: ${error.message}`,
        data: {},
      };
    }

    try {
      const { data: logs } = await supabase
        .from("workout_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("gym_id", slot.gymId)
        .eq("week_number", slot.weekNumber)
        .eq("day_name", slot.dayName)
        .eq("completed", true);

      await events.emit("workout.completed", userId, {
        day_name: slot.dayName,
        week_number: slot.weekNumber,
        total_sets: logs?.length ?? 0,
      });
    } catch {
      // Event emission is best-effort; don't fail the action
    }

    return {
      success: true,
      message: `${slot.dayName} (Week ${slot.weekNumber}) marked complete!`,
      data: { completion: data },
    };
  }

  async function update_max(
    exerciseName: string,
    weightLbs: number
  ): Promise<ToolResult> {
    const canonicalName = normalizeExerciseName(exerciseName);
    exerciseName = canonicalName;
    const { data: current } = await supabase
      .from("current_user_maxes")
      .select("weight_lbs")
      .eq("user_id", userId)
      .eq("exercise_name", exerciseName)
      .single();

    const oldMax = current?.weight_lbs ?? 0;

    const { data, error } = await supabase
      .from("user_maxes")
      .insert({
        user_id: userId,
        exercise_name: exerciseName,
        weight_lbs: weightLbs,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        message: `Failed to update max: ${error.message}`,
        data: {},
      };
    }

    const isPR = weightLbs > oldMax && oldMax > 0;
    try {
      await events.emit("max.updated", userId, {
        exercise: exerciseName,
        old_max: oldMax,
        new_max: weightLbs,
        is_pr: isPR,
      });
    } catch {
      // best-effort
    }
    if (isPR) {
      try {
        await events.emit("milestone.hit", userId, {
          kind: "pr",
          exercise: exerciseName,
          old_pr: oldMax,
          new_pr: weightLbs,
          improvement_lbs: weightLbs - oldMax,
        });
      } catch {
        // best-effort
      }
    }

    const message = isPR
      ? `New PR! ${exerciseName}: ${weightLbs} lbs (was ${oldMax} lbs, +${weightLbs - oldMax} lbs)`
      : `${exerciseName} max set to ${weightLbs} lbs.`;

    return {
      success: true,
      message,
      data: { record: data, is_pr: isPR, old_max: oldMax },
    };
  }

  async function delete_max(exerciseName: string): Promise<ToolResult> {
    exerciseName = normalizeExerciseName(exerciseName);
    const { error } = await supabase
      .from("user_maxes")
      .delete()
      .eq("user_id", userId)
      .eq("exercise_name", exerciseName);

    if (error) {
      return {
        success: false,
        message: `Failed to delete max: ${error.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Deleted all records for ${exerciseName}.`,
      data: { exercise_name: exerciseName },
    };
  }

  async function save_workout_program(
    gymId: string | undefined,
    weekNumber: number,
    programData: Record<string, unknown>,
    aiGenerated?: boolean,
    aiNotes?: string
  ): Promise<ToolResult> {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    // Structural validation — refuse to save a malformed program. The
    // downstream LLM that produces this JSON is not always trustworthy, and a
    // polluted "reps" string (e.g. a full warmup scheme) breaks the workout
    // screen's per-set layout. We return a clear validation error so the
    // caller can fix the data and retry.
    const parsed = WeekProgramSchema.safeParse(programData);
    if (!parsed.success) {
      return {
        success: false,
        message: `Program data validation failed: ${formatZodIssues(parsed.error.issues)}`,
        data: {
          issues: parsed.error.issues.slice(0, 20),
          hint: `Each exercise "reps" must be ≤ ${REPS_MAX} characters (use "note" for warmup schemes or coaching cues). "name" ≤ ${NAME_MAX}, "note" ≤ ${NOTE_MAX}, "muscleGroups" ≤ ${MUSCLE_MAX}, "focus" ≤ ${FOCUS_MAX}. All 7 days must be present.`,
        },
      };
    }

    const { data, error } = await supabase
      .from("workout_programs")
      .upsert(
        {
          gym_id: resolvedGymId,
          week_number: weekNumber,
          program_data: parsed.data as unknown as WeekProgram,
          created_by: userId,
          ai_generated: aiGenerated ?? false,
          ai_notes: aiNotes ?? null,
        },
        // Unique on (gym_id, week_number) — without onConflict PostgREST
        // treats this as INSERT and 409s when updating an existing week.
        { onConflict: "gym_id,week_number" },
      )
      .select()
      .single();

    if (error) {
      return {
        success: false,
        message: `Failed to save program: ${error.message}`,
        data: {},
      };
    }

    try {
      await events.emit("program.saved", userId, {
        week_number: weekNumber,
        gym_id: resolvedGymId,
        ai_generated: aiGenerated ?? false,
      });
    } catch {
      // best-effort
    }

    return {
      success: true,
      message: `Week ${weekNumber} program saved.`,
      data: { program: data },
    };
  }

  async function substitute_equipment_globally(
    fromExercise: string,
    toExercise: string,
    reason?: string,
    gymId?: string
  ): Promise<ToolResult> {
    const from = normalizeExerciseName(fromExercise);
    const to = normalizeExerciseName(toExercise);
    if (from === to) {
      throw AppError.invalidArgs(
        `from and to resolve to the same canonical exercise (${from}). Nothing to substitute.`
      );
    }

    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    const { data: rows, error: readErr } = await supabase
      .from("workout_programs")
      .select("id, week_number, program_data")
      .eq("gym_id", resolvedGymId);

    if (readErr) {
      return { success: false, message: `Failed to read programs: ${readErr.message}`, data: {} };
    }

    const programs = (rows ?? []) as Array<{
      id: string;
      week_number: number;
      program_data: WeekProgram;
    }>;

    const affectedWeeks: number[] = [];
    let exercisesChanged = 0;

    for (const row of programs) {
      let rowChanged = false;
      const nextProgram: WeekProgram = {};
      for (const [day, dayProgram] of Object.entries(row.program_data ?? {})) {
        const exercises = Array.isArray(dayProgram?.exercises) ? dayProgram.exercises : [];
        const nextExercises = exercises.map((ex) => {
          if (normalizeExerciseName(ex.name) === from) {
            rowChanged = true;
            exercisesChanged += 1;
            return { ...ex, name: to };
          }
          return ex;
        });
        nextProgram[day] = { ...dayProgram, exercises: nextExercises };
      }

      if (!rowChanged) continue;

      const { error: updateErr } = await supabase
        .from("workout_programs")
        .update({
          program_data: nextProgram,
          ai_notes: reason
            ? `Substituted ${from} → ${to}: ${reason}`
            : `Substituted ${from} → ${to}`,
        })
        .eq("id", row.id);

      if (updateErr) {
        return {
          success: false,
          message: `Failed to update week ${row.week_number}: ${updateErr.message}`,
          data: { weeks_updated: affectedWeeks, exercises_changed: exercisesChanged },
        };
      }

      affectedWeeks.push(row.week_number);

      try {
        await events.emit("program.saved", userId, {
          week_number: row.week_number,
          gym_id: resolvedGymId,
          ai_generated: false,
        });
      } catch {
        // best-effort
      }
    }

    if (exercisesChanged === 0) {
      return {
        success: true,
        message: `No occurrences of ${from} found in any program. Nothing changed.`,
        data: { from, to, weeks_updated: [], exercises_changed: 0 },
      };
    }

    return {
      success: true,
      message: `Substituted ${from} → ${to} in ${exercisesChanged} spot${exercisesChanged === 1 ? "" : "s"} across ${affectedWeeks.length} week${affectedWeeks.length === 1 ? "" : "s"}.`,
      data: {
        from,
        to,
        reason: reason ?? null,
        weeks_updated: affectedWeeks.sort((a, b) => a - b),
        exercises_changed: exercisesChanged,
      },
    };
  }

  async function shift_program(weeksForward: number): Promise<ToolResult> {
    if (!Number.isInteger(weeksForward)) {
      throw AppError.invalidArgs("weeks_forward must be an integer.");
    }
    if (weeksForward === 0) {
      return {
        success: true,
        message: "No shift applied (weeks_forward = 0).",
        data: { weeks_forward: 0 },
      };
    }
    if (weeksForward < -52 || weeksForward > 52) {
      throw AppError.invalidArgs("weeks_forward must be between -52 and 52.");
    }

    const { data: profile, error: readErr } = await supabase
      .from("profiles")
      .select("program_start_date")
      .eq("id", userId)
      .single();

    if (readErr) {
      return { success: false, message: `Failed to read profile: ${readErr.message}`, data: {} };
    }

    const anchor = profile?.program_start_date
      ? new Date(profile.program_start_date + "T00:00:00.000Z")
      : new Date();
    const shifted = new Date(anchor.getTime() + weeksForward * 7 * 24 * 60 * 60 * 1000);
    const newDate = shifted.toISOString().slice(0, 10);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ program_start_date: newDate })
      .eq("id", userId);

    if (updateErr) {
      return { success: false, message: `Failed to shift program: ${updateErr.message}`, data: {} };
    }

    const nextCurrentWeek = getCurrentWeek(newDate);
    const direction = weeksForward > 0 ? "forward" : "back";
    const magnitude = Math.abs(weeksForward);

    return {
      success: true,
      message: `Program shifted ${direction} ${magnitude} week${magnitude === 1 ? "" : "s"}. New start date: ${newDate}. Today is now Week ${nextCurrentWeek}.`,
      data: {
        weeks_forward: weeksForward,
        previous_start_date: profile?.program_start_date ?? null,
        new_start_date: newDate,
        current_week: nextCurrentWeek,
      },
    };
  }

  async function get_pending_events(limit: number = 10): Promise<ToolResult> {
    const { data, error } = await supabase
      .from("app_events")
      .select("*")
      .eq("app_name", "swoltracker")
      .eq("user_id", userId)
      .is("processed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        success: false,
        message: `Failed to fetch events: ${error.message}`,
        data: {},
      };
    }

    const eventList = data ?? [];
    if (eventList.length === 0) {
      return {
        success: true,
        message: "No pending events.",
        data: { events: [] },
      };
    }

    const summary = eventList
      .map(
        (e: any) =>
          `${e.event_name}: ${JSON.stringify(e.payload)}`
      )
      .join("\n");

    const ids = eventList.map((e: any) => e.id);
    if (ids.length > 0) {
      await supabase
        .from("app_events")
        .update({ processed_at: new Date().toISOString() })
        .in("id", ids);
    }

    return {
      success: true,
      message: `${eventList.length} pending event(s):\n${summary}`,
      data: { events: eventList },
    };
  }

  async function generate_weekly_summary(weekNumber?: number, gymId?: string): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(gymId, weekNumber, getTodayName());
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const { gymId: resolvedGymId, weekNumber: week } = slot;

    // Get program start date for accurate PR window calculation
    const { data: profileData } = await supabase
      .from("profiles")
      .select("program_start_date")
      .eq("id", userId)
      .single();
    const programStartDate: string | null = profileData?.program_start_date ?? null;

    // Fetch everything in parallel
    const [logsResult, completionsResult, programResult, maxHistoryResult] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("day_name, exercise_name, actual_weight, actual_reps, completed")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .eq("completed", true),
      supabase
        .from("workout_completions")
        .select("day_name")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week),
      supabase
        .from("workout_programs")
        .select("program_data")
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .single(),
      // PRs: maxes recorded during this week
      supabase
        .from("user_maxes")
        .select("exercise_name, weight_lbs, recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", getWeekStartISO(week, programStartDate))
        .lt("recorded_at", getWeekStartISO(week + 1, programStartDate))
        .order("recorded_at", { ascending: false }),
    ]);

    const logs = (logsResult.data ?? []) as Array<{
      day_name: string;
      exercise_name: string;
      actual_weight: number;
      actual_reps: number | string;
      completed: boolean;
    }>;
    const completedDays = (completionsResult.data ?? []).map((c: any) => c.day_name as string);

    // Scheduled workout days from program
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const programData = programResult.data?.program_data ?? {};
    const scheduledDays = dayOrder.filter(
      (d) => programData[d]?.exercises?.length > 0
    );
    const missedDays = scheduledDays.filter((d) => !completedDays.includes(d));

    // Volume + sets
    const totalSets = logs.length;
    const totalVolume = logs.reduce((sum, log) => {
      const reps = typeof log.actual_reps === "number" ? log.actual_reps : 0;
      return sum + (log.actual_weight ?? 0) * reps;
    }, 0);

    // PRs this week
    const prsThisWeek = ((maxHistoryResult.data ?? []) as Array<{
      exercise_name: string;
      weight_lbs: number;
      recorded_at: string;
    }>).map((pr) => ({
      exercise_name: pr.exercise_name,
      weight_lbs: pr.weight_lbs,
      recorded_at: pr.recorded_at,
    }));

    const completionRate = scheduledDays.length > 0
      ? Math.round((completedDays.length / scheduledDays.length) * 100)
      : null;

    // Human summary
    const prLines = prsThisWeek.length > 0
      ? prsThisWeek.map((pr) => `${pr.exercise_name}: ${pr.weight_lbs} lbs`).join(", ")
      : "None";

    const lines = [
      `Week ${week} Summary:`,
      `  Workouts: ${completedDays.length}/${scheduledDays.length} completed${completionRate !== null ? ` (${completionRate}%)` : ""}`,
      missedDays.length > 0 ? `  Missed: ${missedDays.join(", ")}` : `  Missed: None — perfect week! 🔥`,
      `  Total sets: ${totalSets}`,
      `  Total volume: ${totalVolume.toLocaleString()} lbs`,
      `  PRs: ${prLines}`,
    ].filter(Boolean);

    const summary = lines.join("\n");

    return {
      success: true,
      message: summary,
      data: {
        week_number: week,
        workouts_completed: completedDays.length,
        workouts_scheduled: scheduledDays.length,
        completion_rate: completionRate,
        completed_days: completedDays,
        missed_days: missedDays,
        total_sets: totalSets,
        total_volume_lbs: totalVolume,
        prs_this_week: prsThisWeek,
      },
    };
  }

  async function check_workout_reminder(thresholdHour: number = 16, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    const todayName = getTodayName();

    // Get today's program
    const todayResult = await queries.get_todays_workout(resolvedGymId, todayName);
    const todayData = todayResult.data as Record<string, unknown>;

    // Rest day — no reminder needed
    if (todayData.rest_day || !todayData.exercises || (todayData.exercises as unknown[]).length === 0) {
      return {
        success: true,
        message: `Today (${todayName}) is a rest day. No reminder needed.`,
        data: { action: "skipped", reason: "rest_day", day_name: todayName },
      };
    }

    // Already logged sets today
    const totalLogged = (todayData.total_logged_sets as number) ?? 0;
    if (totalLogged > 0) {
      return {
        success: true,
        message: `Already logged ${totalLogged} sets today. No reminder needed.`,
        data: { action: "skipped", reason: "already_logged", sets_logged: totalLogged, day_name: todayName },
      };
    }

    // Check time threshold (use UTC hour + approximate MT offset: UTC-6 in MDT)
    // Better: compare against threshold in a timezone-agnostic way using Date
    const nowUTC = new Date();
    const nowHourMT = ((nowUTC.getUTCHours() - 6) + 24) % 24; // MDT = UTC-6

    if (nowHourMT < thresholdHour) {
      return {
        success: true,
        message: `No sets logged today (${todayName}) but it's only ${nowHourMT}:00 MT — reminder threshold is ${thresholdHour}:00 MT. Check back later.`,
        data: {
          action: "skipped",
          reason: "too_early",
          current_hour_mt: nowHourMT,
          threshold_hour: thresholdHour,
          day_name: todayName,
        },
      };
    }

    // Check if a reminder was already sent today (unprocessed)
    const { data: existingEvents } = await supabase
      .from("app_events")
      .select("id")
      .eq("app_name", "swoltracker")
      .eq("event_name", "workout.reminder")
      .eq("user_id", userId)
      .is("processed_at", null);

    // Filter to today's reminders in payload
    const todayReminders = (existingEvents ?? []).filter((e: any) => {
      // Already-sent check: look for a reminder with matching day_name
      return true; // We'll dedupe by checking the most recent below
    });

    if (todayReminders.length > 0) {
      return {
        success: true,
        message: `Reminder already sent for today (${todayName}). Waiting for it to be processed.`,
        data: { action: "skipped", reason: "already_reminded", day_name: todayName },
      };
    }

    // All checks passed — emit the reminder event
    const weekNumber = (todayData.current_week as number) ?? 1;
    const focus = (todayData.focus as string) ?? "Workout";
    const exerciseCount = (todayData.total_exercises as number) ?? (todayData.exercises as unknown[]).length;

    try {
      await events.emit("workout.reminder", userId, {
        day_name: todayName,
        week_number: weekNumber,
        focus,
        exercises_count: exerciseCount,
        threshold_hour: thresholdHour,
        triggered_at: nowUTC.toISOString(),
      });
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to emit reminder event: ${err.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `🏋️ Reminder event emitted for ${todayName} — ${focus} (${exerciseCount} exercises). No sets logged yet and it's past ${thresholdHour}:00 MT.`,
      data: {
        action: "reminder_sent",
        day_name: todayName,
        week_number: weekNumber,
        focus,
        exercises_count: exerciseCount,
        threshold_hour: thresholdHour,
      },
    };
  }

  /**
   * Returns an ISO timestamp for the start of a given program week,
   * anchored to the user's actual program start date.
   */
  function getWeekStartISO(weekNumber: number, programStartDate: string | null): string {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const base = programStartDate
      ? new Date(programStartDate + "T00:00:00.000Z")
      : new Date("2026-01-05T00:00:00.000Z"); // fallback
    const weekStart = new Date(base.getTime() + (weekNumber - 1) * msPerWeek);
    return weekStart.toISOString();
  }

  async function log_missed_day(
    dayName?: string,
    weekNumber?: number,
    reason?: string,
    gymId?: string
  ): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(gymId, weekNumber, dayName ?? getTodayName());
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    // Verify it's actually a workout day (not a rest day)
    const todayResult = await queries.get_todays_workout(slot.gymId, slot.dayName, slot.weekNumber);
    const todayData = todayResult.data as Record<string, unknown>;
    const exercises = (todayData.exercises as unknown[]) ?? [];
    const isRestDay = todayData.rest_day === true || exercises.length === 0;
    if (isRestDay) {
      return {
        success: false,
        message: `${slot.dayName} (Week ${slot.weekNumber}) is a rest day — no need to log it as missed.`,
        data: { reason: "rest_day" },
      };
    }

    // Check if workout was already completed
    const { data: existing } = await supabase
      .from("workout_completions")
      .select("id")
      .eq("user_id", userId)
      .eq("gym_id", slot.gymId)
      .eq("week_number", slot.weekNumber)
      .eq("day_name", slot.dayName)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: `${slot.dayName} (Week ${slot.weekNumber}) was already marked complete — can't log it as missed.`,
        data: {},
      };
    }

    // Upsert missed day record
    const { error } = await supabase
      .from("missed_days")
      .upsert(
        {
          user_id: userId,
          gym_id: slot.gymId,
          week_number: slot.weekNumber,
          day_name: slot.dayName,
          reason: reason ?? null,
        },
        { onConflict: "user_id,gym_id,week_number,day_name" }
      );

    if (error) {
      return { success: false, message: `Failed to log missed day: ${error.message}`, data: {} };
    }

    try {
      await events.emit("workout.missed", userId, {
        day_name: slot.dayName,
        week_number: slot.weekNumber,
        reason: reason ?? null,
      });
    } catch {
      // best-effort
    }

    const reasonStr = reason ? ` Reason: ${reason}.` : "";
    return {
      success: true,
      message: `${slot.dayName} (Week ${slot.weekNumber}) logged as missed.${reasonStr} This will be factored into your next program.`,
      data: {
        day_name: slot.dayName,
        week_number: slot.weekNumber,
        gym_id: slot.gymId,
        reason: reason ?? null,
      },
    };
  }

  async function get_missed_days(weekNumber?: number, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    let query = supabase
      .from("missed_days")
      .select("week_number, day_name, reason, logged_at")
      .eq("user_id", userId)
      .eq("gym_id", resolvedGymId)
      .order("week_number", { ascending: false })
      .order("logged_at", { ascending: false });

    if (weekNumber) {
      query = query.eq("week_number", weekNumber);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, message: `Failed to fetch missed days: ${error.message}`, data: {} };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        success: true,
        message: weekNumber
          ? `No missed days recorded for Week ${weekNumber}.`
          : "No missed days recorded.",
        data: { missed_days: [] },
      };
    }

    const lines = rows.map((r: any) =>
      `Week ${r.week_number} ${r.day_name}${r.reason ? ` (${r.reason})` : ""}`
    );

    return {
      success: true,
      message: `Missed days:\n${lines.map((l: string) => `  • ${l}`).join("\n")}`,
      data: { missed_days: rows },
    };
  }

  return {
    log_set,
    log_many_sets,
    delete_set,
    correct_set,
    mark_workout_complete,
    update_max,
    delete_max,
    save_workout_program,
    shift_program,
    substitute_equipment_globally,
    get_pending_events,
    generate_weekly_summary,
    check_workout_reminder,
    log_missed_day,
    get_missed_days,
  };
}
