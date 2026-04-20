/**
 * Adapter that wraps SwolTracker's existing tool factories as SDK `DefinedTool`s.
 *
 * Design: each execute constructs the needed tool factories per-request from
 * `supabase` + `ctx.request.identity.userId`. This keeps the 30+ existing tool
 * bodies untouched — they stay as factory-bound closures — while letting the
 * SDK own protocol dispatch, schema validation, and transport.
 *
 * For tools that currently serialize `result.data` as the MCP text payload,
 * we set `message = JSON.stringify(data)` so the SDK's text-only renderer
 * preserves the pre-adapter wire behavior.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createBotNativeApp,
  defineTool,
  type BotNativeApp,
  type DefinedTool,
  type AppToolResult,
  type AppToolError,
  type AppToolErrorCode,
} from "@bot-native/sdk";
import { createEventEmitter } from "./bot-native-shim.js";
import { createQueryTools } from "./tools/queries.js";
import { createActionTools } from "./tools/actions.js";
import { createContextTools } from "./tools/context.js";
import { createNaturalLanguageTools } from "./tools/natural-language.js";
import { createGenerationTools } from "./tools/generation.js";
import { createCoachingTools } from "./tools/coaching.js";
import { normalizeExerciseName, getAllCanonicalNames } from "./exercise-normalizer.js";

const repsSchema = z.union([z.number().int().min(0), z.string()]);
const weightSchema = z.union([z.number().min(0), z.literal("prescribed")]);
const workoutSummaryExerciseSchema = z.object({
  exercise_name: z.string().describe("Exercise name"),
  sets: z.number().int().min(1).optional().describe("Number of sets. Defaults to the programmed set count when matched."),
  reps: repsSchema.describe("Reps completed (number or 'AMRAP')"),
  weight_lbs: weightSchema.optional().describe('Weight in lbs, or "prescribed" to use the programmed weight'),
  notes: z.string().optional().describe("Optional notes"),
  percentage_of_max: z.number().min(0).max(100).optional().describe("Optional percentage-of-max fallback for weight resolution"),
});

type ToolKit = {
  queries: ReturnType<typeof createQueryTools>;
  actions: ReturnType<typeof createActionTools>;
  context: ReturnType<typeof createContextTools>;
  nlTools: ReturnType<typeof createNaturalLanguageTools>;
  generation: ReturnType<typeof createGenerationTools>;
  coaching: ReturnType<typeof createCoachingTools>;
};

function buildToolKit(supabase: SupabaseClient, userId: string): ToolKit {
  const events = createEventEmitter(supabase, "swoltracker");
  const queries = createQueryTools(supabase, userId);
  const actions = createActionTools(supabase, userId, events, queries);
  const context = createContextTools(supabase, userId, queries);
  const nlTools = createNaturalLanguageTools(supabase, userId, queries, actions);
  const generation = createGenerationTools(supabase, userId, queries, actions);
  const coaching = createCoachingTools(supabase, userId);
  return { queries, actions, context, nlTools, generation, coaching };
}

type LegacyResult = { success: boolean; message: string; data?: unknown };

/**
 * Best-effort code inference for legacy `{success: false, message}` results
 * that haven't been migrated to throw `AppError` yet. Conservative — falls
 * back to `internal` on anything ambiguous. Tools with a clear failure mode
 * should throw `AppError.notFound()` / `.invalidArgs()` / etc. directly
 * instead of relying on this.
 */
export function inferLegacyErrorCode(message: string): AppToolErrorCode {
  const msg = message.toLowerCase();
  if (/\bnot found\b|\bno\s+\w+\s+found\b|doesn'?t exist/.test(msg)) return "not_found";
  if (/\bpermission\b|\bforbidden\b|\bnot allowed\b|\bunauthorized\b/.test(msg)) return "forbidden";
  if (/\brate limit|too many\b/.test(msg)) return "rate_limited";
  if (/\balready\b|\bduplicate\b|\bconflict\b/.test(msg)) return "conflict";
  if (/\bmust be\b|\binvalid\b|\brequired\b|\bcannot be\b/.test(msg)) return "invalid_args";
  return "internal";
}

const RETRYABLE_BY_CODE: Record<AppToolErrorCode, boolean> = {
  not_found: false,
  forbidden: false,
  invalid_args: false,
  conflict: false,
  rate_limited: true,
  internal: true,
};

export function legacyErrorEnvelope(message: string): AppToolError {
  const code = inferLegacyErrorCode(message);
  return { code, message, retryable: RETRYABLE_BY_CODE[code] };
}

function toAppResult(r: LegacyResult): AppToolResult {
  const base: AppToolResult = {
    ok: r.success,
    message: r.message,
    data: (r.data ?? {}) as Record<string, unknown>,
  };
  return r.success ? base : { ...base, error: legacyErrorEnvelope(r.message) };
}

/** For tools whose wire format is the JSON-stringified `data` payload. */
function toAppResultAsJson(r: LegacyResult): AppToolResult {
  const base: AppToolResult = {
    ok: r.success,
    message: JSON.stringify(r.data ?? {}),
    data: (r.data ?? {}) as Record<string, unknown>,
  };
  return r.success ? base : { ...base, error: legacyErrorEnvelope(r.message) };
}

export function buildApp(supabase: SupabaseClient): BotNativeApp {
  const withKit = <P>(
    fn: (kit: ToolKit, params: P) => Promise<LegacyResult>,
    wrap: (r: LegacyResult) => AppToolResult = toAppResult
  ) => {
    return async (params: P, ctx: { request: { identity: { userId: string } } }) => {
      const kit = buildToolKit(supabase, ctx.request.identity.userId);
      return wrap(await fn(kit, params));
    };
  };

  const tools: Array<DefinedTool<any>> = [
    // ── Read-only query tools ────────────────────────────────
    defineTool({
      name: "get_profile",
      description: "Get the user's profile including goals, schedule, and equipment",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => kit.queries.get_profile()),
    }),
    defineTool({
      name: "get_maxes",
      description: "Get all current 1RM (one-rep max) records",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => kit.queries.get_maxes()),
    }),
    defineTool({
      name: "get_max_history",
      description: "Get weight progression history for a specific lift",
      category: "query",
      schema: {
        exercise_name: z.string().describe('Exercise name (e.g. "Bench Press", "Back Squat")'),
      },
      execute: withKit(async (kit, p: { exercise_name: string }) => kit.queries.get_max_history(p.exercise_name)),
    }),
    defineTool({
      name: "list_gyms",
      description: "List all gyms the user belongs to — returns gym IDs, names, and roles",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => {
        const gyms = await kit.queries.list_gyms!();
        // list_gyms wire format is JSON-stringified data
        return gyms;
      }, toAppResultAsJson),
    }),
    defineTool({
      name: "get_todays_workout",
      description: "Get prescribed exercises with resolved weights for any week+day. Returns exercise_index, name, sets, reps, weight_lbs (resolved from 1RM percentages), max_1rm, and percentages for each exercise. Defaults to current week + today.",
      category: "query",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        day_name: z.string().optional().describe('Day name (e.g. "Monday"). Defaults to today.'),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
      },
      execute: withKit(
        async (kit, p: { gym_id?: string; day_name?: string; week_number?: number }) =>
          kit.queries.get_todays_workout(p.gym_id, p.day_name, p.week_number),
        toAppResultAsJson
      ),
    }),
    defineTool({
      name: "get_weekly_workout",
      description: "Get all 7 days for a week with resolved weights. Returns each day's focus, exercises (with exercise_index, weight_lbs), and total volume.",
      category: "query",
      schema: {
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(
        async (kit, p: { week_number?: number; gym_id?: string }) =>
          kit.queries.get_weekly_workout(p.week_number, p.gym_id),
        toAppResultAsJson
      ),
    }),
    defineTool({
      name: "get_program_overview",
      description: "High-level view of the full program — total weeks, each week's daily focus/theme, volume per week, and which week is current. Like a table of contents for the training plan.",
      category: "query",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(
        async (kit, p: { gym_id?: string }) => kit.queries.get_program_overview(p.gym_id),
        toAppResultAsJson
      ),
    }),
    defineTool({
      name: "get_program_progression",
      description: "Show how a specific lift progresses across all weeks — percentages, resolved weights, sets/reps per week. Use to preview upcoming intensity or compare training phases.",
      category: "query",
      schema: {
        exercise_name: z.string().describe('Exercise name (e.g. "Bench Press")'),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(
        async (kit, p: { exercise_name: string; gym_id?: string }) =>
          kit.queries.get_program_progression(p.exercise_name, p.gym_id),
        toAppResultAsJson
      ),
    }),
    defineTool({
      name: "get_workout_logs",
      description: "Get completed sets for a given week and optional day",
      category: "query",
      schema: {
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
        day_name: z.string().optional().describe('Day name (e.g. "Monday")'),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: { week_number?: number; day_name?: string; gym_id?: string }) =>
        kit.queries.get_workout_logs(p.week_number, p.day_name, p.gym_id)),
    }),
    defineTool({
      name: "get_recent_sessions",
      description: "Get the last N workout sessions grouped by day",
      category: "query",
      schema: {
        limit: z.number().int().min(1).max(20).optional().describe("Number of sessions (default 4)"),
      },
      execute: withKit(async (kit, p: { limit?: number }) => kit.queries.get_recent_sessions(p.limit ?? 4)),
    }),
    defineTool({
      name: "get_stats",
      description: "Get total sets completed and weeks active",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => kit.queries.get_stats()),
    }),

    // ── Write tools ──────────────────────────────────────────
    defineTool({
      name: "log_set",
      description: "Log a single set completion for a specific exercise",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
        day_name: z.string().optional().describe('Day name (e.g. "Monday"). Defaults to today.'),
        exercise_index: z.number().int().min(0).describe("Exercise index in the day's program"),
        set_index: z.number().int().min(0).describe("Set index within the exercise"),
        exercise_name: z.string().describe("Exercise name"),
        actual_weight: z.number().min(0).describe("Weight used (lbs)"),
        actual_reps: repsSchema.describe("Reps completed (number or 'AMRAP')"),
        prescribed_weight: z.number().min(0).optional().describe("Prescribed weight (lbs)"),
        prescribed_reps: repsSchema.optional().describe("Prescribed reps"),
      },
      execute: withKit(async (kit, p: any) => kit.actions.log_set(p)),
    }),
    defineTool({
      name: "mark_workout_complete",
      description: "Mark an entire workout day as done",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
        day_name: z.string().optional().describe("Day name (defaults to today)"),
      },
      execute: withKit(async (kit, p: { gym_id?: string; week_number?: number; day_name?: string }) =>
        kit.actions.mark_workout_complete(p.gym_id, p.week_number, p.day_name)),
    }),
    defineTool({
      name: "log_workout_summary",
      description: "Log an entire workout in one call. Supports prescribed weights, optional week/day auto-resolution, and optional workout completion.",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
        day_name: z.string().optional().describe("Day name (defaults to today)"),
        exercises: z.array(workoutSummaryExerciseSchema).min(1).describe("Exercises to log for the workout"),
        mark_complete: z.boolean().optional().describe("Also mark the workout complete after logging all sets"),
      },
      execute: withKit(async (kit, p: any) => kit.nlTools.log_workout_summary(p)),
    }),
    defineTool({
      name: "update_max",
      description: "Set a new 1RM record for an exercise",
      category: "action",
      schema: {
        exercise_name: z.string().describe("Exercise name"),
        weight_lbs: z.number().int().min(0).max(9999).describe("New 1RM weight in lbs"),
      },
      execute: withKit(async (kit, p: { exercise_name: string; weight_lbs: number }) =>
        kit.actions.update_max(p.exercise_name, p.weight_lbs)),
    }),
    defineTool({
      name: "delete_max",
      description: "Remove all 1RM records for an exercise",
      category: "action",
      schema: {
        exercise_name: z.string().describe("Exercise name to delete records for"),
      },
      execute: withKit(async (kit, p: { exercise_name: string }) => kit.actions.delete_max(p.exercise_name)),
    }),
    defineTool({
      name: "save_workout_program",
      description: "Save a weekly workout program (structured JSON with 7 days)",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).describe("Week number to save"),
        program_data: z.record(z.any()).describe("Program data: { Monday: { focus, exercises[] }, ... }"),
        ai_generated: z.boolean().optional().describe("Whether this was AI-generated"),
        ai_notes: z.string().optional().describe("Notes about the generation"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.actions.save_workout_program(p.gym_id, p.week_number, p.program_data, p.ai_generated, p.ai_notes)),
    }),

    // ── Context bundle ───────────────────────────────────────
    defineTool({
      name: "get_streak",
      description: "Get the user's current workout streak (consecutive weeks with at least one completed workout), their longest streak, and which weeks they've been active.",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => kit.context.get_streak()),
    }),
    defineTool({
      name: "get_context_bundle",
      description: "Get compressed user state for agent context window (<500 tokens)",
      category: "query",
      schema: {},
      execute: withKit(async (kit) => kit.context.get_context_bundle()),
    }),

    // ── Events ───────────────────────────────────────────────
    defineTool({
      name: "get_pending_events",
      description: "Get unprocessed events for the user (PRs, completions, etc.)",
      category: "query",
      schema: {
        limit: z.number().int().min(1).max(50).optional().describe("Max events to return (default 10)"),
      },
      execute: withKit(async (kit, p: { limit?: number }) => kit.actions.get_pending_events(p.limit ?? 10)),
    }),

    // ── Natural language logging ─────────────────────────────
    defineTool({
      name: "log_exercise",
      description: "Log an exercise from structured params (agent extracts from natural language). Handles fuzzy matching and set expansion.",
      category: "action",
      schema: {
        exercise_name: z.string().describe('Exercise name (e.g. "Bench Press")'),
        sets: z.number().int().min(1).describe("Number of sets"),
        reps: repsSchema.describe('Reps per set (number or "AMRAP")'),
        weight_lbs: z.number().min(0).optional().describe("Weight in lbs"),
        notes: z.string().optional().describe("Optional notes"),
        percentage_of_max: z.number().min(0).max(100).optional().describe("If set, resolves weight from 1RM percentage"),
      },
      execute: withKit(async (kit, p: any) => kit.nlTools.log_exercise(p)),
    }),

    // ── AI generation ────────────────────────────────────────
    defineTool({
      name: "get_prompt_template",
      description: "Fetch the workout generation prompt template from the database",
      category: "query",
      schema: {
        template_name: z.string().optional().describe('Template name (default "multi_week_workout_generator")'),
      },
      execute: withKit(async (kit, p: { template_name?: string }) =>
        kit.generation.get_prompt_template(p.template_name ?? "multi_week_workout_generator")),
    }),
    defineTool({
      name: "generate_workout_program",
      description: "Save a generated workout program (agent provides the structured JSON after generating it in conversation)",
      category: "action",
      schema: {
        start_week: z.number().int().min(1).describe("Starting week number"),
        week_count: z.number().int().min(1).max(12).describe("Number of weeks"),
        program: z.record(z.record(z.any())).describe("Program data: { week1: { Monday: { focus, exercises[] }, ... }, week2: ... }"),
        ai_notes: z.string().optional().describe("Notes about the generation"),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.generation.generate_workout_program(p.start_week, p.week_count, p.program, p.ai_notes, p.gym_id)),
    }),
    defineTool({
      name: "delete_set",
      description: "Delete a specific logged set for an exercise. Use when the user wants to undo or remove a set they logged by mistake.",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
        day_name: z.string().optional().describe("Day name (defaults to today)"),
        exercise_name: z.string().describe("Exercise name (will be normalized)"),
        set_index: z.number().int().min(0).describe("0-based set index to delete"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.actions.delete_set(p.gym_id, p.week_number, p.day_name, p.exercise_name, p.set_index)),
    }),
    defineTool({
      name: "correct_set",
      description: "Correct weight or reps on an already-logged set. Use when the user logged the wrong weight or rep count.",
      category: "action",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
        day_name: z.string().optional().describe("Day name (defaults to today)"),
        exercise_name: z.string().describe("Exercise name (will be normalized)"),
        set_index: z.number().int().min(0).describe("0-based set index to correct"),
        new_weight: z.number().min(0).describe("Corrected weight in lbs"),
        new_reps: repsSchema.describe("Corrected reps (number or AMRAP)"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.actions.correct_set(p.gym_id, p.week_number, p.day_name, p.exercise_name, p.set_index, p.new_weight, p.new_reps)),
    }),
    defineTool({
      name: "log_missed_day",
      description: "Log a workout day as intentionally missed/skipped. Differentiates 'not logged yet' from 'intentionally skipped' — adaptive program generation uses this to understand why days were missed. Common reasons: injury, travel, illness, rest, life.",
      category: "action",
      schema: {
        day_name: z.string().optional().describe("Day name (e.g. 'Monday'). Defaults to today."),
        week_number: z.number().int().min(1).optional().describe("Week number. Defaults to current week."),
        reason: z.string().optional().describe("Why the day was missed: 'injury', 'travel', 'illness', 'rest', 'life', or free text."),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.actions.log_missed_day(p.day_name, p.week_number, p.reason, p.gym_id)),
    }),
    defineTool({
      name: "get_missed_days",
      description: "Get a list of workout days that were logged as intentionally missed. Optionally filter by week. Used by adaptive program generation to understand training history.",
      category: "query",
      schema: {
        week_number: z.number().int().min(1).optional().describe("Filter to a specific week number. Omit for all weeks."),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: { week_number?: number; gym_id?: string }) =>
        kit.actions.get_missed_days(p.week_number, p.gym_id)),
    }),
    defineTool({
      name: "check_workout_reminder",
      description: "Check if a workout reminder should fire for today. If the user has a scheduled workout, hasn't logged any sets, and the current time is past the threshold hour (default 4 PM MT), emits a swoltracker.workout_reminder event that get_pending_events will surface. Safe to call repeatedly — deduplicates reminders. Use on heartbeat to proactively nudge the user.",
      category: "query",
      schema: {
        threshold_hour: z.number().int().min(0).max(23).optional().describe("Hour of day (MT, 24h) after which a reminder fires if no sets logged. Default: 16 (4 PM)"),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: { threshold_hour?: number; gym_id?: string }) =>
        kit.actions.check_workout_reminder(p.threshold_hour, p.gym_id)),
    }),
    defineTool({
      name: "generate_weekly_summary",
      description: "Generate an end-of-week recap for a given week. Returns workouts completed vs scheduled, missed days, total sets, total volume (lbs lifted), and any PRs set that week. Defaults to current week.",
      category: "query",
      schema: {
        week_number: z.number().int().min(1).optional().describe("Week number to summarize (defaults to current week)"),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: { week_number?: number; gym_id?: string }) =>
        kit.actions.generate_weekly_summary(p.week_number, p.gym_id)),
    }),
    defineTool({
      name: "get_training_history_summary",
      description: "Returns a rich training history summary for the last N weeks — completions, missed days with reasons, exercise performance (sets, avg weight, hit/missed reps), and current 1RMs. Call this BEFORE generating a new program so the AI has full context for adaptive programming. Also includes the recommended next week number.",
      category: "query",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        lookback_weeks: z.number().int().min(1).max(12).optional().describe("How many weeks to look back (default 4)"),
      },
      execute: withKit(async (kit, p: { gym_id?: string; lookback_weeks?: number }) =>
        kit.queries.get_training_history_summary(p.gym_id, p.lookback_weeks)),
    }),
    defineTool({
      name: "get_overload_recommendations",
      description: "Analyze recent training history and return progressive overload recommendations. Flags exercises where the user has: (1) hit all prescribed reps for 3+ straight sessions → ready to increase weight, (2) missed prescribed reps for 2+ straight sessions → consider deload, (3) not logged in 2+ weeks → stale. Call this before generating a new program or during weekly check-ins.",
      category: "query",
      schema: {
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
        lookback_weeks: z.number().int().min(1).max(12).optional().describe("How many weeks to look back (default 4)"),
      },
      execute: withKit(async (kit, p: { gym_id?: string; lookback_weeks?: number }) =>
        kit.queries.get_overload_recommendations(p.gym_id, p.lookback_weeks)),
    }),
    defineTool({
      name: "compare_weeks",
      description: "Compare workout data between two weeks. Shows sets, volume (lbs lifted), and day-by-day breakdown. Defaults to current week vs previous week.",
      category: "query",
      schema: {
        week1: z.number().int().min(1).optional().describe("First week number (defaults to current week)"),
        week2: z.number().int().min(1).optional().describe("Second week number to compare against (defaults to current - 1)"),
        gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      },
      execute: withKit(async (kit, p: { week1?: number; week2?: number; gym_id?: string }) =>
        kit.queries.compare_weeks(p.week1, p.week2, p.gym_id)),
    }),

    // ── Exercise name utilities ──────────────────────────────
    defineTool({
      name: "normalize_exercise_name",
      description: "Resolve a user-provided exercise name to its canonical form. Use before logging, querying maxes, or comparing exercise names.",
      category: "meta",
      schema: {
        exercise_name: z.string().describe("Raw exercise name from user input"),
      },
      execute: async (p: { exercise_name: string }): Promise<AppToolResult> => {
        const canonical = normalizeExerciseName(p.exercise_name);
        const matched = canonical !== p.exercise_name.trim();
        return {
          ok: true,
          message: matched
            ? `"${p.exercise_name}" → "${canonical}"`
            : `"${p.exercise_name}" is already canonical (or no match found — stored as-is)`,
          data: { canonical, matched },
        };
      },
    }),
    defineTool({
      name: "list_canonical_exercises",
      description: "List all known canonical exercise names. Useful for finding the right name before logging or setting a max.",
      category: "meta",
      schema: {},
      execute: async (): Promise<AppToolResult> => {
        const names = getAllCanonicalNames();
        return {
          ok: true,
          message: `${names.length} canonical exercises:\n${names.join("\n")}`,
          data: { names, count: names.length },
        };
      },
    }),

    // ── Coaching & messaging tools ──────────────────────────
    defineTool({
      name: "send_coach_message",
      description: "Send a message to the user. Use for weekly reviews, program update notes, milestone celebrations, or general chat responses. The message appears in the user's agent chat panel.",
      category: "action",
      schema: {
        content: z.string().min(1).max(5000).describe("Message content"),
        message_type: z.enum(["chat", "weekly_review", "program_update", "milestone"]).default("chat").describe("Type of message: chat (default), weekly_review (weekly analysis), program_update (workout changes), milestone (achievement)"),
        week_number: z.number().int().min(1).optional().describe("Week number this note relates to (optional)"),
        metadata: z.record(z.unknown()).optional().describe("Optional structured data (e.g. program changes)"),
      },
      execute: withKit(async (kit, p: any) =>
        kit.coaching.send_coach_message(p.content, p.message_type, p.week_number, p.metadata)),
    }),
    defineTool({
      name: "get_user_messages",
      description: "Check for unread messages from the user. Call this periodically or before composing a response to see what the user has said.",
      category: "query",
      schema: {
        limit: z.number().int().min(1).max(50).default(10).optional().describe("Max messages to return (default 10)"),
      },
      execute: withKit(async (kit, p: { limit?: number }) => kit.coaching.get_user_messages(p.limit)),
    }),
    defineTool({
      name: "get_conversation_history",
      description: "Get the full conversation history between you and the user. Includes both user messages and your previous responses. Useful for maintaining context across sessions.",
      category: "query",
      schema: {
        limit: z.number().int().min(1).max(100).default(50).optional().describe("Max messages to return (default 50)"),
      },
      execute: withKit(async (kit, p: { limit?: number }) => kit.coaching.get_conversation_history(p.limit)),
    }),
  ];

  return createBotNativeApp({
    manifest: {
      name: "swoltracker",
      version: "0.1.0",
      displayName: "SwolTracker",
      description: "Workout tracking and AI coaching for agents and humans.",
      author: "SwolTracker",
      skillFile: "SKILL.md",
      entrypoint: "dist/server.js",
      events: [],
    },
    tools,
  });
}
