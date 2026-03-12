import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { normalizeExerciseName, getAllCanonicalNames } from "./exercise-normalizer.js";
import type { createQueryTools } from "./tools/queries.js";
import type { createActionTools } from "./tools/actions.js";
import type { createContextTools } from "./tools/context.js";
import type { createNaturalLanguageTools } from "./tools/natural-language.js";
import type { createGenerationTools } from "./tools/generation.js";

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

export function registerTools(
  server: McpServer,
  queries: ReturnType<typeof createQueryTools>,
  actions: ReturnType<typeof createActionTools>,
  context: ReturnType<typeof createContextTools>,
  nlTools: ReturnType<typeof createNaturalLanguageTools>,
  generation: ReturnType<typeof createGenerationTools>
) {
  // ── Read-only query tools ────────────────────────────────

  server.tool(
    "get_profile",
    "Get the user's profile including goals, schedule, and equipment",
    {},
    async () => {
      const result = await queries.get_profile();
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_maxes",
    "Get all current 1RM (one-rep max) records",
    {},
    async () => {
      const result = await queries.get_maxes();
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_max_history",
    "Get weight progression history for a specific lift",
    {
      exercise_name: z
        .string()
        .describe('Exercise name (e.g. "Bench Press", "Back Squat")'),
    },
    async ({ exercise_name }) => {
      const result = await queries.get_max_history(exercise_name);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "list_gyms",
    "List all gyms the user belongs to — returns gym IDs, names, and roles",
    {},
    async () => {
      const result = await queries.list_gyms();
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    }
  );

  server.tool(
    "get_todays_workout",
    "Get prescribed exercises with resolved weights for any week+day. Returns exercise_index, name, sets, reps, weight_lbs (resolved from 1RM percentages), max_1rm, and percentages for each exercise. Defaults to current week + today.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      day_name: z.string().optional().describe('Day name (e.g. "Monday"). Defaults to today.'),
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
    },
    async ({ gym_id, day_name, week_number }) => {
      const result = await queries.get_todays_workout(gym_id, day_name, week_number);
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    }
  );

  server.tool(
    "get_weekly_workout",
    "Get all 7 days for a week with resolved weights. Returns each day's focus, exercises (with exercise_index, weight_lbs), and total volume.",
    {
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ week_number, gym_id }) => {
      const result = await queries.get_weekly_workout(week_number, gym_id);
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    }
  );

  server.tool(
    "get_program_overview",
    "High-level view of the full program — total weeks, each week's daily focus/theme, volume per week, and which week is current. Like a table of contents for the training plan.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ gym_id }) => {
      const result = await queries.get_program_overview(gym_id);
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    }
  );

  server.tool(
    "get_program_progression",
    "Show how a specific lift progresses across all weeks — percentages, resolved weights, sets/reps per week. Use to preview upcoming intensity or compare training phases.",
    {
      exercise_name: z.string().describe('Exercise name (e.g. "Bench Press")'),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ exercise_name, gym_id }) => {
      const result = await queries.get_program_progression(exercise_name, gym_id);
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    }
  );

  server.tool(
    "get_workout_logs",
    "Get completed sets for a given week and optional day",
    {
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current week)"),
      day_name: z.string().optional().describe('Day name (e.g. "Monday")'),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ week_number, day_name, gym_id }) => {
      const result = await queries.get_workout_logs(week_number, day_name, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_recent_sessions",
    "Get the last N workout sessions grouped by day",
    {
      limit: z.number().int().min(1).max(20).optional().describe("Number of sessions (default 4)"),
    },
    async ({ limit }) => {
      const result = await queries.get_recent_sessions(limit ?? 4);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_stats",
    "Get total sets completed and weeks active",
    {},
    async () => {
      const result = await queries.get_stats();
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  // ── Write tools ──────────────────────────────────────────

  server.tool(
    "log_set",
    "Log a single set completion for a specific exercise",
    {
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
    async (params) => {
      const result = await actions.log_set(params);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "mark_workout_complete",
    "Mark an entire workout day as done",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
      day_name: z.string().optional().describe("Day name (defaults to today)"),
    },
    async ({ gym_id, week_number, day_name }) => {
      const result = await actions.mark_workout_complete(gym_id, week_number, day_name);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "log_workout_summary",
    "Log an entire workout in one call. Supports prescribed weights, optional week/day auto-resolution, and optional workout completion.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
      day_name: z.string().optional().describe("Day name (defaults to today)"),
      exercises: z.array(workoutSummaryExerciseSchema).min(1).describe("Exercises to log for the workout"),
      mark_complete: z.boolean().optional().describe("Also mark the workout complete after logging all sets"),
    },
    async (params) => {
      const result = await nlTools.log_workout_summary(params);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "update_max",
    "Set a new 1RM record for an exercise",
    {
      exercise_name: z.string().describe("Exercise name"),
      weight_lbs: z.number().int().min(0).max(9999).describe("New 1RM weight in lbs"),
    },
    async ({ exercise_name, weight_lbs }) => {
      const result = await actions.update_max(exercise_name, weight_lbs);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "delete_max",
    "Remove all 1RM records for an exercise",
    {
      exercise_name: z.string().describe("Exercise name to delete records for"),
    },
    async ({ exercise_name }) => {
      const result = await actions.delete_max(exercise_name);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "save_workout_program",
    "Save a weekly workout program (structured JSON with 7 days)",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      week_number: z.number().int().min(1).describe("Week number to save"),
      program_data: z.record(z.any()).describe("Program data: { Monday: { focus, exercises[] }, ... }"),
      ai_generated: z.boolean().optional().describe("Whether this was AI-generated"),
      ai_notes: z.string().optional().describe("Notes about the generation"),
    },
    async ({ gym_id, week_number, program_data, ai_generated, ai_notes }) => {
      const result = await actions.save_workout_program(
        gym_id,
        week_number,
        program_data,
        ai_generated,
        ai_notes
      );
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  // ── Context bundle ───────────────────────────────────────

  server.tool(
    "get_streak",
    "Get the user's current workout streak (consecutive weeks with at least one completed workout), their longest streak, and which weeks they've been active.",
    {},
    async () => {
      const result = await context.get_streak();
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_context_bundle",
    "Get compressed user state for agent context window (<500 tokens)",
    {},
    async () => {
      const result = await context.get_context_bundle();
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  // ── Events ───────────────────────────────────────────────

  server.tool(
    "get_pending_events",
    "Get unprocessed events for the user (PRs, completions, etc.)",
    {
      limit: z.number().int().min(1).max(50).optional().describe("Max events to return (default 10)"),
    },
    async ({ limit }) => {
      const result = await actions.get_pending_events(limit ?? 10);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  // ── Natural language logging ─────────────────────────────

  server.tool(
    "log_exercise",
    "Log an exercise from structured params (agent extracts from natural language). Handles fuzzy matching and set expansion.",
    {
      exercise_name: z.string().describe('Exercise name (e.g. "Bench Press")'),
      sets: z.number().int().min(1).describe("Number of sets"),
      reps: repsSchema.describe('Reps per set (number or "AMRAP")'),
      weight_lbs: z.number().min(0).optional().describe("Weight in lbs"),
      notes: z.string().optional().describe("Optional notes"),
      percentage_of_max: z.number().min(0).max(100).optional().describe("If set, resolves weight from 1RM percentage"),
    },
    async (params) => {
      const result = await nlTools.log_exercise(params);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  // ── AI generation ────────────────────────────────────────

  server.tool(
    "get_prompt_template",
    "Fetch the workout generation prompt template from the database",
    {
      template_name: z.string().optional().describe('Template name (default "multi_week_workout_generator")'),
    },
    async ({ template_name }) => {
      const result = await generation.get_prompt_template(
        template_name ?? "multi_week_workout_generator"
      );
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "generate_workout_program",
    "Save a generated workout program (agent provides the structured JSON after generating it in conversation)",
    {
      start_week: z.number().int().min(1).describe("Starting week number"),
      week_count: z.number().int().min(1).max(12).describe("Number of weeks"),
      program: z
        .record(z.record(z.any()))
        .describe("Program data: { week1: { Monday: { focus, exercises[] }, ... }, week2: ... }"),
      ai_notes: z.string().optional().describe("Notes about the generation"),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ start_week, week_count, program, ai_notes, gym_id }) => {
      const result = await generation.generate_workout_program(
        start_week,
        week_count,
        program,
        ai_notes,
        gym_id
      );
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "delete_set",
    "Delete a specific logged set for an exercise. Use when the user wants to undo or remove a set they logged by mistake.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
      day_name: z.string().optional().describe("Day name (defaults to today)"),
      exercise_name: z.string().describe("Exercise name (will be normalized)"),
      set_index: z.number().int().min(0).describe("0-based set index to delete"),
    },
    async ({ gym_id, week_number, day_name, exercise_name, set_index }) => {
      const result = await actions.delete_set(gym_id, week_number, day_name, exercise_name, set_index);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "correct_set",
    "Correct weight or reps on an already-logged set. Use when the user logged the wrong weight or rep count.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      week_number: z.number().int().min(1).optional().describe("Week number (defaults to current)"),
      day_name: z.string().optional().describe("Day name (defaults to today)"),
      exercise_name: z.string().describe("Exercise name (will be normalized)"),
      set_index: z.number().int().min(0).describe("0-based set index to correct"),
      new_weight: z.number().min(0).describe("Corrected weight in lbs"),
      new_reps: repsSchema.describe("Corrected reps (number or AMRAP)"),
    },
    async ({ gym_id, week_number, day_name, exercise_name, set_index, new_weight, new_reps }) => {
      const result = await actions.correct_set(gym_id, week_number, day_name, exercise_name, set_index, new_weight, new_reps);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "log_missed_day",
    "Log a workout day as intentionally missed/skipped. Differentiates 'not logged yet' from 'intentionally skipped' — adaptive program generation uses this to understand why days were missed. Common reasons: injury, travel, illness, rest, life.",
    {
      day_name: z.string().optional().describe("Day name (e.g. 'Monday'). Defaults to today."),
      week_number: z.number().int().min(1).optional().describe("Week number. Defaults to current week."),
      reason: z.string().optional().describe("Why the day was missed: 'injury', 'travel', 'illness', 'rest', 'life', or free text."),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ day_name, week_number, reason, gym_id }) => {
      const result = await actions.log_missed_day(day_name, week_number, reason, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_missed_days",
    "Get a list of workout days that were logged as intentionally missed. Optionally filter by week. Used by adaptive program generation to understand training history.",
    {
      week_number: z.number().int().min(1).optional().describe("Filter to a specific week number. Omit for all weeks."),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ week_number, gym_id }) => {
      const result = await actions.get_missed_days(week_number, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "check_workout_reminder",
    "Check if a workout reminder should fire for today. If the user has a scheduled workout, hasn't logged any sets, and the current time is past the threshold hour (default 4 PM MT), emits a swoltracker.workout_reminder event that get_pending_events will surface. Safe to call repeatedly — deduplicates reminders. Use on heartbeat to proactively nudge the user.",
    {
      threshold_hour: z.number().int().min(0).max(23).optional().describe("Hour of day (MT, 24h) after which a reminder fires if no sets logged. Default: 16 (4 PM)"),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ threshold_hour, gym_id }) => {
      const result = await actions.check_workout_reminder(threshold_hour, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "generate_weekly_summary",
    "Generate an end-of-week recap for a given week. Returns workouts completed vs scheduled, missed days, total sets, total volume (lbs lifted), and any PRs set that week. Defaults to current week.",
    {
      week_number: z.number().int().min(1).optional().describe("Week number to summarize (defaults to current week)"),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ week_number, gym_id }) => {
      const result = await actions.generate_weekly_summary(week_number, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "get_overload_recommendations",
    "Analyze recent training history and return progressive overload recommendations. Flags exercises where the user has: (1) hit all prescribed reps for 2+ weeks → ready to increase weight, (2) missed prescribed reps for 2+ weeks → consider deload, (3) not logged in 2+ weeks → stale. Call this before generating a new program or during weekly check-ins.",
    {
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
      lookback_weeks: z.number().int().min(1).max(12).optional().describe("How many weeks to look back (default 4)"),
    },
    async ({ gym_id, lookback_weeks }) => {
      const result = await queries.get_overload_recommendations(gym_id, lookback_weeks);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "compare_weeks",
    "Compare workout data between two weeks. Shows sets, volume (lbs lifted), and day-by-day breakdown. Defaults to current week vs previous week.",
    {
      week1: z.number().int().min(1).optional().describe("First week number (defaults to current week)"),
      week2: z.number().int().min(1).optional().describe("Second week number to compare against (defaults to current - 1)"),
      gym_id: z.string().uuid().optional().describe("Gym ID (defaults to first gym)"),
    },
    async ({ week1, week2, gym_id }) => {
      const result = await queries.compare_weeks(week1, week2, gym_id);
      return { content: [{ type: "text", text: result.message }] };
    }
  );

  server.tool(
    "normalize_exercise_name",
    "Resolve a user-provided exercise name to its canonical form. Use before logging, querying maxes, or comparing exercise names.",
    {
      exercise_name: z.string().describe("Raw exercise name from user input"),
    },
    async ({ exercise_name }) => {
      const canonical = normalizeExerciseName(exercise_name);
      const matched = canonical !== exercise_name.trim();
      return {
        content: [{
          type: "text",
          text: matched
            ? `"${exercise_name}" → "${canonical}"`
            : `"${exercise_name}" is already canonical (or no match found — stored as-is)`,
        }],
      };
    }
  );

  server.tool(
    "list_canonical_exercises",
    "List all known canonical exercise names. Useful for finding the right name before logging or setting a max.",
    {},
    async () => {
      const names = getAllCanonicalNames();
      return {
        content: [{
          type: "text",
          text: `${names.length} canonical exercises:\n${names.join("\n")}`,
        }],
      };
    }
  );
}
