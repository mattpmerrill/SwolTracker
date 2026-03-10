import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
}
