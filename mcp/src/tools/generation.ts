import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@bot-native/sdk";
import type { ToolResult, WeekProgram, WorkoutProgramRow } from "../types.js";
import type { createQueryTools } from "./queries.js";
import type { createActionTools } from "./actions.js";

const REQUIRED_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export interface LlmCallResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

export type LlmCaller = (args: {
  systemPrompt: string;
  userPrompt: string;
  requestType?: string;
}) => Promise<LlmCallResult>;

function stripJsonFences(text: string): string {
  let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

export function createGenerationTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>,
  actions: ReturnType<typeof createActionTools>,
  callLlm?: LlmCaller
) {
  async function get_prompt_template(
    templateName: string
  ): Promise<ToolResult> {
    const { data, error } = await supabase
      .from("prompt_templates")
      .select("template")
      .eq("name", templateName)
      .single();

    if (error || !data) {
      return {
        success: false,
        message: `Template "${templateName}" not found.`,
        data: {},
      };
    }

    return {
      success: true,
      message: data.template,
      data: { template_name: templateName, template_text: data.template },
    };
  }

  async function generate_workout_program(
    startWeek: number,
    weekCount: number,
    program: Record<string, Record<string, unknown>>,
    aiNotes?: string,
    gymId?: string
  ): Promise<ToolResult> {
    for (let i = 1; i <= weekCount; i++) {
      const weekKey = `week${i}`;
      const weekData = program[weekKey];
      if (!weekData) {
        return {
          success: false,
          message: `Missing ${weekKey} in program data.`,
          data: {},
        };
      }
      for (const day of REQUIRED_DAYS) {
        if (!weekData[day]) {
          return {
            success: false,
            message: `Missing ${day} in ${weekKey}.`,
            data: {},
          };
        }
      }
    }

    const savedWeeks: number[] = [];
    for (let i = 1; i <= weekCount; i++) {
      const weekKey = `week${i}`;
      const targetWeek = startWeek + (i - 1);
      const result = await actions.save_workout_program(
        gymId,
        targetWeek,
        program[weekKey],
        true,
        aiNotes
      );
      if (!result.success) {
        return {
          success: false,
          message: `Failed to save week ${targetWeek}: ${result.message}`,
          data: { saved_weeks: savedWeeks },
        };
      }
      savedWeeks.push(targetWeek);
    }

    return {
      success: true,
      message: `Saved ${weekCount} week(s) starting from Week ${startWeek}.`,
      data: { saved_weeks: savedWeeks, start_week: startWeek, week_count: weekCount },
    };
  }

  async function rebuild_week_for_constraints(
    week: number,
    constraints: string,
    gymId?: string
  ): Promise<ToolResult> {
    if (!Number.isInteger(week) || week < 1) {
      throw AppError.invalidArgs("week must be a positive integer.");
    }
    if (typeof constraints !== "string" || constraints.trim().length === 0) {
      throw AppError.invalidArgs("constraints must be a non-empty string.");
    }
    if (constraints.length > 1000) {
      throw AppError.invalidArgs("constraints must be 1000 characters or fewer.");
    }
    if (!callLlm) {
      throw AppError.invalidArgs(
        "rebuild_week_for_constraints is not available: server LLM caller not configured."
      );
    }

    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) throw AppError.notFound("No gym found.");

    const { data: programRow } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("gym_id", resolvedGymId)
      .eq("week_number", week)
      .single();

    if (!programRow) {
      throw AppError.notFound(`No program found for Week ${week}.`);
    }

    const currentWeek: WeekProgram = (programRow as WorkoutProgramRow).program_data;

    const { data: templateRow } = await supabase
      .from("prompt_templates")
      .select("template")
      .eq("name", "multi_week_workout_generator")
      .single();

    const systemPrompt =
      (templateRow as { template?: string } | null)?.template ||
      "You are an elite strength and conditioning coach. Return one workout week as JSON.";

    const userPrompt = [
      `Rebuild a single workout week (Week ${week}) to satisfy the following constraints:`,
      "",
      `CONSTRAINTS: ${constraints.trim()}`,
      "",
      "CURRENT WEEK (to modify):",
      JSON.stringify(currentWeek, null, 2),
      "",
      "Return JSON ONLY in this exact shape — a single week keyed by day, no wrapper object:",
      '{ "Monday": { "focus": "...", "exercises": [...] }, "Tuesday": {...}, ... "Sunday": {...} }',
      "",
      "All seven days (Monday–Sunday) must be present. Preserve the overall training intent of the week while satisfying the constraints. Do not wrap the response in 'week1' or any other outer key.",
    ].join("\n");

    const llmResult = await callLlm({ systemPrompt, userPrompt, requestType: "weekly" });

    const cleaned = stripJsonFences(llmResult.content || "");
    if (!cleaned) {
      throw AppError.invalidArgs("LLM returned an empty response.");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw AppError.invalidArgs(
        `LLM response was not valid JSON: ${(e as Error).message}`
      );
    }

    // Accept either { Monday: ..., ... } or { week1: { Monday: ..., ... } }
    let weekData: Record<string, unknown> = parsed;
    const keys = Object.keys(parsed);
    if (keys.length === 1 && /^week\d+$/i.test(keys[0])) {
      weekData = parsed[keys[0]] as Record<string, unknown>;
    }

    for (const day of REQUIRED_DAYS) {
      if (!weekData[day]) {
        throw AppError.invalidArgs(`LLM response missing ${day}.`);
      }
    }

    const aiNotes = `Rebuilt for: ${constraints.trim()}`;
    const saveResult = await actions.save_workout_program(
      resolvedGymId,
      week,
      weekData,
      true,
      aiNotes
    );
    if (!saveResult.success) {
      return {
        success: false,
        message: `Failed to save rebuilt week ${week}: ${saveResult.message}`,
        data: {},
      };
    }

    return {
      success: true,
      message: `Rebuilt Week ${week} for: ${constraints.trim()}.`,
      data: {
        week_number: week,
        gym_id: resolvedGymId,
        constraints: constraints.trim(),
        model: llmResult.model,
        usage: llmResult.usage,
      },
    };
  }

  return { get_prompt_template, generate_workout_program, rebuild_week_for_constraints };
}
