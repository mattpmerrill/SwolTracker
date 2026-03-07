import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolResult } from "../types.js";
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

export function createGenerationTools(
  supabase: SupabaseClient,
  userId: string,
  queries: ReturnType<typeof createQueryTools>,
  actions: ReturnType<typeof createActionTools>
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
    // Validate structure: each weekN key must have all 7 days
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

    // Save each week
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

  return { get_prompt_template, generate_workout_program };
}
