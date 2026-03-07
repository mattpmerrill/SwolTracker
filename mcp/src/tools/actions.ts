import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventEmitter } from "../bot-native-shim.js";
import type { ToolResult, WeekProgram } from "../types.js";
import { getCurrentWeek, getTodayName } from "../week-calc.js";
import type { createQueryTools } from "./queries.js";

interface LogSetParams {
  gym_id: string;
  week_number: number;
  day_name: string;
  exercise_index: number;
  set_index: number;
  exercise_name: string;
  actual_weight: number;
  actual_reps: number | string;
  prescribed_weight?: number;
  prescribed_reps?: number | string;
}

export function createActionTools(
  supabase: SupabaseClient,
  userId: string,
  events: EventEmitter,
  queries: ReturnType<typeof createQueryTools>
) {
  async function log_set(params: LogSetParams): Promise<ToolResult> {
    const { data, error } = await supabase
      .from("workout_logs")
      .upsert(
        {
          user_id: userId,
          gym_id: params.gym_id,
          week_number: params.week_number,
          day_name: params.day_name,
          exercise_index: params.exercise_index,
          set_index: params.set_index,
          exercise_name: params.exercise_name,
          prescribed_weight: params.prescribed_weight ?? params.actual_weight,
          prescribed_reps: params.prescribed_reps ?? params.actual_reps,
          actual_weight: params.actual_weight,
          actual_reps: params.actual_reps,
          completed: true,
        },
        {
          onConflict:
            "user_id,gym_id,week_number,day_name,exercise_index,set_index",
        }
      )
      .select()
      .single();

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
      data: { log: data },
    };
  }

  async function mark_workout_complete(
    gymId?: string,
    weekNumber?: number,
    dayName?: string
  ): Promise<ToolResult> {
    const resolvedGymId = await queries.resolveGymId(gymId);
    if (!resolvedGymId) {
      return { success: false, message: "No gym found.", data: {} };
    }

    let week = weekNumber;
    if (!week) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("program_start_date")
        .eq("id", userId)
        .single();
      week = getCurrentWeek(profile?.program_start_date ?? null);
    }

    const day = dayName ?? getTodayName();

    const { data, error } = await supabase
      .from("workout_completions")
      .upsert(
        {
          user_id: userId,
          gym_id: resolvedGymId,
          week_number: week,
          day_name: day,
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

    // Emit workout_completed event (Step 4)
    try {
      // Count sets logged for this day
      const { data: logs } = await supabase
        .from("workout_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("gym_id", resolvedGymId)
        .eq("week_number", week)
        .eq("day_name", day)
        .eq("completed", true);

      await events.emit("swoltracker.workout_completed", userId, {
        day_name: day,
        week_number: week,
        total_sets: logs?.length ?? 0,
      });
    } catch {
      // Event emission is best-effort; don't fail the action
    }

    return {
      success: true,
      message: `${day} (Week ${week}) marked complete!`,
      data: { completion: data },
    };
  }

  async function update_max(
    exerciseName: string,
    weightLbs: number
  ): Promise<ToolResult> {
    // Check for PR before inserting (Step 4)
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

    // Emit PR event if new weight > old (Step 4)
    const isPR = weightLbs > oldMax && oldMax > 0;
    if (isPR) {
      try {
        await events.emit("swoltracker.pr_detected", userId, {
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
      return { success: false, message: "No gym found.", data: {} };
    }

    const { data, error } = await supabase
      .from("workout_programs")
      .upsert(
        {
          gym_id: resolvedGymId,
          week_number: weekNumber,
          program_data: programData as WeekProgram,
          created_by: userId,
          ai_generated: aiGenerated ?? false,
          ai_notes: aiNotes ?? null,
        }
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

    return {
      success: true,
      message: `Week ${weekNumber} program saved.`,
      data: { program: data },
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

    // Mark events as processed
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

  return {
    log_set,
    mark_workout_complete,
    update_max,
    delete_max,
    save_workout_program,
    get_pending_events,
  };
}
