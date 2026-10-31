import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@bot-native/sdk";
import type { EventEmitter } from "../bot-native-shim.js";
import type { ProgramDay, ToolResult, WeekProgram, WorkoutBlockScoreRow } from "../types.js";
import { resolveUserClock } from "../user-clock.js";
import { normalizeExerciseName } from "../exercise-normalizer.js";
import { findEstimatedPrs } from "../e1rm.js";
import {
  BLOCK_ID_RE,
  BLOCK_NOTES_MAX,
  BLOCK_TIME_CAP_MAX_MIN,
  BLOCK_TITLE_MAX,
  amrapMovementTotals,
  bestPreviousScore,
  compareBlockScores,
  formatBlockScore,
  getDayBlocks,
  isValidBlockScore,
  type BlockScore,
} from "../../../shared/workout-blocks.js";
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
const NOTE_MAX = 500;
const FOCUS_MAX = 80;
const COACH_NOTES_MAX = 1500;
const WEIGHT_MAX = 2000;

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
  // z.object strips unknown keys, so a field missing here is silently dropped
  // on save. enrichExercises reads weight_lbs for prescribed loads (e.g. 95 lb
  // cleans in an AMRAP), and it was being stripped before this was listed.
  weight_lbs: z.number().nonnegative().max(WEIGHT_MAX).optional(),
  note: z.string().max(NOTE_MAX).optional(),
});

const BlockSchema = z.object({
  id: z.string().regex(BLOCK_ID_RE, "must be 1-32 chars of a-z, 0-9 and -"),
  type: z.enum(["amrap", "for_time"]),
  title: z.string().min(1).max(BLOCK_TITLE_MAX),
  time_cap_min: z.number().int().min(1).max(BLOCK_TIME_CAP_MAX_MIN),
  exercise_indexes: z.array(z.number().int().min(0)).min(1).max(50),
  rounds: z.number().int().min(1).max(100).optional(),
  benchmark: z.string().regex(BLOCK_ID_RE, "must be 1-32 chars of a-z, 0-9 and -").optional(),
  notes: z.string().max(BLOCK_NOTES_MAX).optional(),
});

// Blocks reference exercises by position, so the day is the unit that can be
// checked: a per-block schema cannot see how many exercises there are.
// Exported so the check-in endpoint can run a model-drafted day through the same check, and store the
// parsed (unknown keys stripped) form, before the user is ever asked to approve it.
export const ProgramDaySchema = z
  .object({
    focus: z.string().max(FOCUS_MAX).optional(),
    coach_notes: z.string().max(COACH_NOTES_MAX).optional(),
    exercises: z.array(ExerciseSchema).max(50),
    blocks: z.array(BlockSchema).max(10).optional(),
  })
  .superRefine((day, ctx) => {
    const owner = new Map<number, string>();
    const ids = new Set<string>();
    (day.blocks ?? []).forEach((block, b) => {
      if (ids.has(block.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", b, "id"], message: `duplicate block id "${block.id}"` });
      }
      ids.add(block.id);
      if (block.rounds !== undefined && block.type !== "for_time") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", b, "rounds"], message: "rounds is for_time only" });
      }
      const seen = new Set<number>();
      for (const index of block.exercise_indexes) {
        const path = ["blocks", b, "exercise_indexes"];
        if (index >= day.exercises.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `index ${index} is past the end of exercises (${day.exercises.length})`,
          });
        } else if (seen.has(index)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `index ${index} listed twice` });
        } else if (owner.has(index)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `index ${index} is already in block "${owner.get(index)}"` });
        }
        seen.add(index);
        if (!owner.has(index)) owner.set(index, block.id);
      }
    });
  });

const WeekProgramSchema = z
  .record(z.enum(REQUIRED_DAYS), ProgramDaySchema)
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

/**
 * Structural equality for JSON values, independent of object key order. Used to detect that a
 * stored program day no longer matches the draft it was proposed against. `null` and `undefined`
 * are the same value, and an object key holding `undefined` counts as absent, so a day that is
 * missing from the stored week equals a draft `before` of `null`. Jsonb round-trips drop
 * `undefined`, which is why a plain `===` or `JSON.stringify` compare would give false conflicts.
 */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!jsonEqual(left[key], right[key])) return false;
  }
  return true;
}

/**
 * One day of a multi-day edit. `before` is the stored day the edit was drafted against; null or
 * omitted means the day must be absent from the stored week, so an existing day is then skipped as
 * changed_since_draft. update_program_day ignores `before`.
 */
interface ProgramDayEdit {
  before?: unknown;
  after: unknown;
}

type SkippedDay = { day: string; reason: "changed_since_draft" | "already_logged" };

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

interface LogBlockScoreParams {
  gym_id?: string;
  week_number?: number;
  day_name?: string;
  block_id: string;
  rounds?: number;
  reps?: number;
  time_seconds?: number;
  capped?: boolean;
  note?: string;
}

const BLOCK_SCORE_NOTE_MAX = 280;

interface WorkoutLogEntry {
  user_id: string;
  gym_id: string;
  week_number: number;
  day_name: string;
  exercise_index: number;
  set_index: number;
  exercise_name: string;
  prescribed_weight?: number | null;
  prescribed_reps?: number | string;
  // null for work with no measured load or count (bodyweight, For Time movements)
  actual_weight: number | null;
  actual_reps: number | string | null;
  completed: boolean;
}

export function createActionTools(
  supabase: SupabaseClient,
  userId: string,
  events: EventEmitter,
  queries: ReturnType<typeof createQueryTools>
) {
  async function requireWritableGym(gymId?: string): Promise<string> {
    const writableId = await queries.resolveWritableGymId(gymId);
    if (writableId) return writableId;
    const memberGym = await queries.resolveGymId(gymId);
    if (memberGym) {
      throw AppError.forbidden("Only the gym owner can save a workout program.");
    }
    throw AppError.notFound("No gym found.");
  }

  async function resolveWorkoutSlot(gymId?: string, weekNumber?: number, dayName?: string) {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) return null;

    const clock = !weekNumber || !dayName ? await resolveUserClock(supabase, userId) : null;
    return {
      gymId: resolvedGymId,
      weekNumber: weekNumber ?? clock!.currentWeek,
      dayName: dayName ?? clock!.dayName,
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

  /**
   * Members log under their own gym but follow the leader's program, so the
   * block is looked up in the leader's program first, then the caller's own.
   */
  async function findDayProgram(
    ownGymId: string,
    weekNumber: number,
    dayName: string
  ): Promise<ProgramDay | null> {
    const leader = await queries.resolveLeaderProgramGym();
    const candidates = [...new Set([leader?.id, ownGymId].filter((id): id is string => Boolean(id)))];
    for (const gymId of candidates) {
      const { data } = await supabase
        .from("workout_programs")
        .select("program_data")
        .eq("gym_id", gymId)
        .eq("week_number", weekNumber)
        .single();
      const day = (data as { program_data?: WeekProgram } | null)?.program_data?.[dayName];
      if (day) return day;
    }
    return null;
  }

  async function log_block_score(params: LogBlockScoreParams): Promise<ToolResult> {
    const slot = await resolveWorkoutSlot(params.gym_id, params.week_number, params.day_name);
    if (!slot) {
      throw AppError.notFound("No gym found.");
    }

    const day = await findDayProgram(slot.gymId, slot.weekNumber, slot.dayName);
    if (!day) {
      throw AppError.notFound(`No program found for ${slot.dayName} of Week ${slot.weekNumber}.`);
    }

    const blocks = getDayBlocks(day);
    const block = blocks.find((b) => b.id === params.block_id);
    if (!block) {
      const known = blocks.map((b) => b.id).join(", ") || "none";
      throw AppError.notFound(
        `No block "${params.block_id}" on ${slot.dayName} of Week ${slot.weekNumber}. Blocks that day: ${known}.`
      );
    }

    if (params.note !== undefined && params.note.length > BLOCK_SCORE_NOTE_MAX) {
      throw AppError.invalidArgs(`note must be ${BLOCK_SCORE_NOTE_MAX} characters or fewer.`);
    }

    // The tool accepts a loose superset of fields; keep only the ones that mean
    // something for this block type so the row always satisfies the table CHECK.
    const capped = block.type === "for_time" && params.capped === true;
    const score: BlockScore = {
      score_type: block.type,
      rounds: params.rounds ?? null,
      reps: params.reps ?? (block.type === "amrap" ? 0 : null),
      time_seconds: params.time_seconds ?? null,
      capped,
    };
    if (!isValidBlockScore(block.type, { ...score, capped: params.capped ?? false })) {
      throw AppError.invalidArgs(
        block.type === "amrap"
          ? "An AMRAP score needs rounds (and optionally extra reps); time_seconds and capped do not apply."
          : "A For Time score needs time_seconds, or capped=true with the rounds and/or reps completed."
      );
    }
    if (capped) score.time_seconds = null;
    if (block.type === "for_time" && !capped) {
      score.rounds = null;
      score.reps = null;
    }

    // Read earlier scores before writing, so this score can never be its own "previous".
    const { data: priorRows } = block.benchmark
      ? await supabase
          .from("workout_block_scores")
          .select("week_number, day_name, block_id, benchmark, score_type, rounds, reps, time_seconds, capped, note")
          .eq("user_id", userId)
          .eq("benchmark", block.benchmark)
          .lt("week_number", slot.weekNumber)
      : { data: [] };
    const previous = bestPreviousScore(
      (priorRows ?? []) as Array<WorkoutBlockScoreRow>,
      block.benchmark,
      block.type,
      slot.weekNumber
    );
    const beat = previous !== null && compareBlockScores(score, previous) > 0;

    const row = {
      user_id: userId,
      gym_id: slot.gymId,
      week_number: slot.weekNumber,
      day_name: slot.dayName,
      block_id: block.id,
      benchmark: block.benchmark ?? null,
      score_type: score.score_type,
      rounds: score.rounds,
      reps: score.reps,
      time_seconds: score.time_seconds,
      capped: score.capped,
      note: params.note ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: scoreError } = await supabase
      .from("workout_block_scores")
      .upsert(row, { onConflict: "user_id,gym_id,week_number,day_name,block_id" })
      .select()
      .single();
    if (scoreError) {
      return { success: false, message: `Failed to save block score: ${scoreError.message}`, data: {} };
    }

    // Completion and streaks count workout_logs rows, so each block movement
    // gets a set-0 row. AMRAP splits the score into per-movement reps; For
    // Time has no per-movement count, so reps stay null (done, unmeasured).
    const maxes = await queries.getUserMaxes();
    const exercises = queries.enrichExercises(day.exercises ?? [], maxes, blocks);
    const totals =
      block.type === "amrap"
        ? amrapMovementTotals(block, day.exercises ?? [], score.rounds ?? 0, score.reps ?? 0)
        : {};
    const logEntries: WorkoutLogEntry[] = block.exercise_indexes.map((index) => {
      const exercise = exercises[index];
      return {
        user_id: userId,
        gym_id: slot.gymId,
        week_number: slot.weekNumber,
        day_name: slot.dayName,
        exercise_index: index,
        set_index: 0,
        exercise_name: normalizeExerciseName(exercise.name),
        prescribed_weight: exercise.weight_lbs,
        prescribed_reps: exercise.reps,
        actual_weight: exercise.weight_lbs,
        actual_reps: totals[index] ?? null,
        completed: true,
      };
    });
    const { error: logError } = await upsertWorkoutLogs(logEntries);

    const display = formatBlockScore(score);
    const previousView = previous
      ? {
          week_number: previous.week_number,
          day_name: previous.day_name,
          rounds: previous.rounds,
          reps: previous.reps,
          time_seconds: previous.time_seconds,
          capped: previous.capped,
          display: formatBlockScore(previous),
        }
      : null;
    const versus = previousView
      ? beat
        ? ` New best! Previous: ${previousView.display} (Week ${previousView.week_number}).`
        : ` Number to beat: ${previousView.display} (Week ${previousView.week_number}).`
      : "";

    return {
      success: true,
      message:
        `Logged ${block.title}: ${display}.${versus}` +
        (logError
          ? ` The score is saved, but the movement sets failed to log: ${logError.message}`
          : ""),
      data: {
        score: { ...(saved as object), display },
        block_id: block.id,
        previous_best: previousView,
        beat,
        movements_logged: logError ? 0 : logEntries.length,
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
    dayName?: string,
    completionType: "full" | "partial" = "full",
    loggedSets?: number,
    plannedSets?: number
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
          completion_type: completionType,
          logged_sets: loggedSets ?? null,
          planned_sets: plannedSets ?? null,
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
        completion_type: completionType,
      });
    } catch {
      // Event emission is best-effort; don't fail the action
    }

    const label = completionType === "partial" ? "marked partial" : "marked complete";
    return {
      success: true,
      message: `${slot.dayName} (Week ${slot.weekNumber}) ${label}!`,
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
    const resolvedGymId = await requireWritableGym(gymId);

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
          hint: `Each exercise "reps" must be ≤ ${REPS_MAX} characters (use "note" for warmup schemes or coaching cues). "name" ≤ ${NAME_MAX}, "note" ≤ ${NOTE_MAX}, "muscleGroups" ≤ ${MUSCLE_MAX}, "focus" ≤ ${FOCUS_MAX}, day "coach_notes" ≤ ${COACH_NOTES_MAX}. A block's "exercise_indexes" are positions in that day's exercises, each in at most one block. All 7 days must be present.`,
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

  // Shared body of update_program_day and apply_program_days. It delegates the write to
  // save_workout_program so the gym write check, WeekProgramSchema/DaySchema validation and the
  // upsert stay in one place, and it saves once for the whole set of days.
  // `guarded` turns on the two checks a stale draft needs: the stored day must still equal `before`,
  // and the day must have no completed sets. Direct chat edits (update_program_day) run unguarded.
  async function editProgramDays(
    weekNumber: number,
    edits: Record<string, ProgramDayEdit>,
    note: string,
    opts: { gymId?: string; guarded: boolean }
  ): Promise<{ gymId: string; applied: string[]; skipped: SkippedDay[]; save: ToolResult | null }> {
    // A group member owns a personal gym too, so requireWritableGym alone would let them edit a
    // program they do not follow. Joining a group adds no gym_members row in the leader's gym,
    // so the leader's program has to be checked explicitly.
    const leader = await queries.resolveLeaderProgramGym();
    if (leader && (!opts.gymId || opts.gymId === leader.id)) {
      throw AppError.forbidden(`You follow ${leader.name}'s program. Only the group leader can change it.`);
    }
    const resolvedGymId = await requireWritableGym(opts.gymId);

    const clock = await resolveUserClock(supabase, userId);
    if (weekNumber < clock.currentWeek) {
      throw AppError.invalidArgs(
        `Week ${weekNumber} is in the past and locked. Only Week ${clock.currentWeek} and later can be edited.`
      );
    }

    const dayNames = Object.keys(edits);
    if (dayNames.length === 0) {
      throw AppError.invalidArgs("At least one day is required.");
    }
    for (const dayName of dayNames) {
      if (!(REQUIRED_DAYS as readonly string[]).includes(dayName)) {
        throw AppError.invalidArgs(`dayName must be one of: ${REQUIRED_DAYS.join(", ")}.`);
      }
    }

    for (const dayName of dayNames) {
      const edit = edits[dayName];
      if (edit === null || typeof edit !== "object") {
        throw AppError.invalidArgs(`${dayName} must be an object with an "after" day.`);
      }
    }

    const failed = (message: string, skipped: SkippedDay[] = []) => ({
      gymId: resolvedGymId,
      applied: [],
      skipped,
      save: { success: false, message, data: {} } as ToolResult,
    });

    const { data: existing, error: readErr } = await supabase
      .from("workout_programs")
      .select("program_data")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", weekNumber)
      .maybeSingle();

    if (readErr) {
      return failed(`Failed to read program: ${readErr.message}`);
    }
    if (!existing) {
      // Creating a week is a bigger decision than editing a day; keep it out of this path.
      throw AppError.notFound(`No program for week ${weekNumber}.`);
    }

    const stored = ((existing as { program_data: Record<string, unknown> }).program_data ?? {}) as Record<
      string,
      unknown
    >;
    const skipped: SkippedDay[] = [];
    let candidates = dayNames;

    if (opts.guarded) {
      candidates = [];
      for (const dayName of dayNames) {
        if (jsonEqual(stored[dayName], edits[dayName].before)) candidates.push(dayName);
        else skipped.push({ day: dayName, reason: "changed_since_draft" });
      }

      // Logs are keyed by the program gym for an owner, the same gym id log_set resolves. One
      // query covers every remaining day; `completed` rows mean the user started that day.
      if (candidates.length > 0) {
        const { data: logged, error: logErr } = await supabase
          .from("workout_logs")
          .select("day_name")
          .eq("user_id", userId)
          .eq("gym_id", resolvedGymId)
          .eq("week_number", weekNumber)
          .in("day_name", candidates)
          .eq("completed", true);
        if (logErr) {
          return failed(`Failed to check logged sets: ${logErr.message}`, skipped);
        }
        const started = new Set(((logged ?? []) as Array<{ day_name: string }>).map((r) => r.day_name));
        const stillOpen: string[] = [];
        for (const dayName of candidates) {
          if (started.has(dayName)) skipped.push({ day: dayName, reason: "already_logged" });
          else stillOpen.push(dayName);
        }
        candidates = stillOpen;
      }
    }

    if (candidates.length === 0) {
      return { gymId: resolvedGymId, applied: [], skipped, save: null };
    }

    const merged: Record<string, unknown> = { ...stored };
    for (const dayName of candidates) merged[dayName] = edits[dayName].after;

    const save = await save_workout_program(resolvedGymId, weekNumber, merged, true, note);
    return { gymId: resolvedGymId, applied: save.success ? candidates : [], skipped, save };
  }

  // Edits exactly one day of an existing week, on Chad's chat path. No draft exists, so there is
  // no conflict check and no logged-sets guard; the user confirmed the edit in the chat itself.
  async function update_program_day(
    weekNumber: number,
    dayName: string,
    dayData: unknown,
    gymId?: string
  ): Promise<ToolResult> {
    const { save } = await editProgramDays(weekNumber, { [dayName]: { after: dayData } }, "Edited by Chad", {
      gymId,
      guarded: false,
    });
    // Unguarded, so there is always something to save or a read failure to report.
    return save!;
  }

  // Applies a reviewed draft: several days of one week in a single save. Each day carries the
  // `before` it was drafted against. A day is skipped, not failed, when the stored day has since
  // changed or the user already completed sets on it, so one stale day never blocks the rest.
  // Not an MCP tool; the check-in worker reaches it through buildToolKit.
  async function apply_program_days(
    weekNumber: number,
    days: Record<string, ProgramDayEdit>,
    note: string,
    gymId?: string
  ): Promise<ToolResult> {
    const { gymId: resolvedGymId, applied, skipped, save } = await editProgramDays(weekNumber, days, note, {
      gymId,
      guarded: true,
    });
    const data = { applied, skipped, gym_id: resolvedGymId, week_number: weekNumber };

    if (save && !save.success) {
      return { success: false, message: save.message, data: { ...save.data, ...data } };
    }

    const parts: string[] = [];
    if (applied.length > 0) parts.push(`Applied ${applied.join(", ")}`);
    if (skipped.length > 0) parts.push(`Skipped ${skipped.map((s) => `${s.day} (${s.reason})`).join(", ")}`);
    return {
      success: true,
      message: `Week ${weekNumber}: ${parts.join(". ")}.`,
      data,
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

    const resolvedGymId = await requireWritableGym(gymId);

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
    const slot = await resolveWorkoutSlot(gymId, weekNumber);
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
    const [logsResult, completionsResult, programResult, maxHistoryResult, currentMaxesResult] = await Promise.all([
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
      // Baseline for estimated-1RM PRs (same rule as the web PR moment)
      supabase
        .from("current_user_maxes")
        .select("exercise_name, weight_lbs")
        .eq("user_id", userId),
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

    // Estimated-1RM PRs: best set this week vs the recorded max. Lifts already
    // saved as a new max this week are covered by prsThisWeek, so skip them.
    const currentMaxes: Record<string, number> = {};
    for (const m of (currentMaxesResult.data ?? []) as Array<{ exercise_name: string; weight_lbs: number }>) {
      currentMaxes[m.exercise_name] = m.weight_lbs;
    }
    const savedThisWeek = new Set(prsThisWeek.map((pr) => pr.exercise_name));
    const estimatedPrs = findEstimatedPrs(logs, currentMaxes).filter(
      (pr) => !savedThisWeek.has(pr.exercise_name)
    );

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
      estimatedPrs.length > 0
        ? `  Estimated PRs (not saved yet): ${estimatedPrs
            .map((pr) => `${pr.exercise_name} ~${pr.estimated_max_lbs} lbs (+${pr.gain_lbs}, from ${pr.from_set.weight_lbs}x${pr.from_set.reps})`)
            .join(", ")}`
        : null,
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
        estimated_prs: estimatedPrs,
      },
    };
  }

  async function check_workout_reminder(thresholdHour: number = 16, gymId?: string): Promise<ToolResult> {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      throw AppError.notFound("No gym found.");
    }

    const clock = await resolveUserClock(supabase, userId);
    const todayName = clock.dayName;

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

    // Threshold is a wall-clock hour in the user's zone, not UTC-6. MDT/MST
    // both shift, and a hardcoded offset was already wrong half the year.
    const nowHour = clock.hour;

    if (nowHour < thresholdHour) {
      return {
        success: true,
        message: `No sets logged today (${todayName}) but it's only ${nowHour}:00 in ${clock.timeZone} — reminder threshold is ${thresholdHour}:00. Check back later.`,
        data: {
          action: "skipped",
          reason: "too_early",
          current_hour_mt: nowHour,
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
        triggered_at: new Date().toISOString(),
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
      message: `🏋️ Reminder event emitted for ${todayName} — ${focus} (${exerciseCount} exercises). No sets logged yet and it's past ${thresholdHour}:00 in ${clock.timeZone}.`,
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
    const slot = await resolveWorkoutSlot(gymId, weekNumber, dayName);
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
    log_block_score,
    log_many_sets,
    delete_set,
    correct_set,
    mark_workout_complete,
    update_max,
    delete_max,
    save_workout_program,
    update_program_day,
    apply_program_days,
    substitute_equipment_globally,
    get_pending_events,
    generate_weekly_summary,
    check_workout_reminder,
    log_missed_day,
    get_missed_days,
  };
}
