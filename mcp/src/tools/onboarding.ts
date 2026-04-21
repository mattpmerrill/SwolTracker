import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@bot-native/sdk";
import type { ToolResult } from "../types.js";

export interface UpdateProfileParams {
  display_name?: string;
  gender?: string;
  age?: number;
  weight_lbs?: number;
  fitness_goals?: string[];
  workout_days?: string[];
  workout_duration?: string;
  workout_location?: string;
  program_start_date?: string;
}

export interface CompleteOnboardingParams extends UpdateProfileParams {
  equipment?: string[];
}

const REQUIRED_FIELDS: Array<keyof CompleteOnboardingParams> = [
  "display_name",
  "gender",
  "age",
  "weight_lbs",
  "fitness_goals",
  "workout_days",
  "workout_duration",
  "workout_location",
];

function validatePartial(p: UpdateProfileParams) {
  if (p.display_name !== undefined && (typeof p.display_name !== "string" || p.display_name.trim().length === 0)) {
    throw AppError.invalidArgs("display_name must be a non-empty string");
  }
  if (p.gender !== undefined && (typeof p.gender !== "string" || p.gender.trim().length === 0)) {
    throw AppError.invalidArgs("gender must be a non-empty string");
  }
  if (p.age !== undefined && (!Number.isFinite(p.age) || p.age <= 0 || p.age > 120)) {
    throw AppError.invalidArgs("age must be a positive number ≤ 120");
  }
  if (p.weight_lbs !== undefined && (!Number.isFinite(p.weight_lbs) || p.weight_lbs <= 0 || p.weight_lbs > 1000)) {
    throw AppError.invalidArgs("weight_lbs must be a positive number ≤ 1000");
  }
  if (p.fitness_goals !== undefined && (!Array.isArray(p.fitness_goals) || p.fitness_goals.length === 0)) {
    throw AppError.invalidArgs("fitness_goals must be a non-empty array");
  }
  if (p.workout_days !== undefined && (!Array.isArray(p.workout_days) || p.workout_days.length === 0)) {
    throw AppError.invalidArgs("workout_days must be a non-empty array");
  }
  if (p.workout_duration !== undefined && (typeof p.workout_duration !== "string" || p.workout_duration.trim().length === 0)) {
    throw AppError.invalidArgs("workout_duration must be a non-empty string");
  }
  if (p.workout_location !== undefined && (typeof p.workout_location !== "string" || p.workout_location.trim().length === 0)) {
    throw AppError.invalidArgs("workout_location must be a non-empty string");
  }
  if (p.program_start_date !== undefined) {
    if (typeof p.program_start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.program_start_date)) {
      throw AppError.invalidArgs("program_start_date must be a YYYY-MM-DD date string");
    }
  }
}

export function createOnboardingTools(supabase: SupabaseClient, userId: string) {
  async function get_onboarding_status(): Promise<ToolResult> {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "display_name, gender, age, weight_lbs, fitness_goals, workout_days, workout_duration, workout_location, program_start_date, onboarding_completed, onboarding_completed_at"
      )
      .eq("id", userId)
      .single();

    if (error) {
      return { success: false, message: `Failed to load profile: ${error.message}`, data: {} };
    }

    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = (profile as any)?.[f];
      if (Array.isArray(v)) return v.length === 0;
      return v === null || v === undefined || v === "";
    });

    const { data: equipRows } = await supabase
      .from("gym_equipment")
      .select("name, gym_id, gym_members!inner(user_id)")
      .eq("gym_members.user_id", userId);
    const equipment = (equipRows ?? []).map((r: any) => r.name);

    return {
      success: true,
      message: profile?.onboarding_completed
        ? "Onboarding already complete."
        : missing.length === 0
          ? "All required fields set — ready to complete onboarding."
          : `Missing required fields: ${missing.join(", ")}`,
      data: {
        onboarding_completed: !!profile?.onboarding_completed,
        onboarding_completed_at: profile?.onboarding_completed_at ?? null,
        profile: profile ?? null,
        equipment,
        missing_fields: missing,
        ready_to_complete: !profile?.onboarding_completed && missing.length === 0,
      },
    };
  }

  async function update_profile(params: UpdateProfileParams): Promise<ToolResult> {
    validatePartial(params);

    const updates: Record<string, unknown> = {};
    if (params.display_name !== undefined) updates.display_name = params.display_name.trim();
    if (params.gender !== undefined) updates.gender = params.gender.trim();
    if (params.age !== undefined) updates.age = params.age;
    if (params.weight_lbs !== undefined) updates.weight_lbs = params.weight_lbs;
    if (params.fitness_goals !== undefined) updates.fitness_goals = params.fitness_goals;
    if (params.workout_days !== undefined) updates.workout_days = params.workout_days;
    if (params.workout_duration !== undefined) updates.workout_duration = params.workout_duration.trim();
    if (params.workout_location !== undefined) updates.workout_location = params.workout_location.trim();
    if (params.program_start_date !== undefined) updates.program_start_date = params.program_start_date;

    if (Object.keys(updates).length === 0) {
      throw AppError.invalidArgs("Provide at least one field to update");
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select(
        "display_name, gender, age, weight_lbs, fitness_goals, workout_days, workout_duration, workout_location, program_start_date"
      )
      .single();

    if (error) {
      return { success: false, message: `Failed to update profile: ${error.message}`, data: {} };
    }

    const updatedKeys = Object.keys(updates).filter((k) => k !== "updated_at");
    return {
      success: true,
      message: `Updated ${updatedKeys.length} field${updatedKeys.length === 1 ? "" : "s"}: ${updatedKeys.join(", ")}`,
      data: {
        profile: data,
        updated_fields: updatedKeys,
      },
    };
  }

  async function complete_onboarding(params: CompleteOnboardingParams = {}): Promise<ToolResult> {
    validatePartial(params);
    if (params.equipment !== undefined && (!Array.isArray(params.equipment) || params.equipment.length === 0)) {
      throw AppError.invalidArgs("equipment must be a non-empty array");
    }

    const { data: current, error: fetchError } = await supabase
      .from("profiles")
      .select(
        "display_name, gender, age, weight_lbs, fitness_goals, workout_days, workout_duration, workout_location, program_start_date, onboarding_completed"
      )
      .eq("id", userId)
      .single();

    if (fetchError) {
      return { success: false, message: `Failed to load profile: ${fetchError.message}`, data: {} };
    }

    const merged = {
      display_name: params.display_name ?? current?.display_name,
      gender: params.gender ?? current?.gender,
      age: params.age ?? current?.age,
      weight_lbs: params.weight_lbs ?? current?.weight_lbs,
      fitness_goals: params.fitness_goals ?? current?.fitness_goals,
      workout_days: params.workout_days ?? current?.workout_days,
      workout_duration: params.workout_duration ?? current?.workout_duration,
      workout_location: params.workout_location ?? current?.workout_location,
      program_start_date:
        params.program_start_date ??
        current?.program_start_date ??
        new Date().toISOString().split("T")[0],
    };

    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = (merged as any)[f];
      if (Array.isArray(v)) return v.length === 0;
      return v === null || v === undefined || v === "";
    });

    if (missing.length > 0) {
      throw AppError.invalidArgs(
        `Cannot complete onboarding — missing required fields: ${missing.join(
          ", "
        )}. Call update_profile first or pass them in this call.`
      );
    }

    let equipment = params.equipment;
    if (!equipment) {
      const { data: equipRows } = await supabase
        .from("gym_equipment")
        .select("name, gym_id, gym_members!inner(user_id)")
        .eq("gym_members.user_id", userId);
      equipment = (equipRows ?? []).map((r: any) => r.name);
      if (equipment.length === 0) {
        throw AppError.invalidArgs(
          "Cannot complete onboarding — no equipment configured. Pass `equipment` in this call."
        );
      }
    }

    const { error: rpcError } = await supabase.rpc("complete_onboarding", {
      p_user_id: userId,
      p_display_name: merged.display_name,
      p_gender: merged.gender,
      p_age: merged.age,
      p_weight_lbs: merged.weight_lbs,
      p_fitness_goals: merged.fitness_goals,
      p_workout_days: merged.workout_days,
      p_workout_duration: merged.workout_duration,
      p_workout_location: merged.workout_location,
      p_equipment: equipment,
      p_program_start_date: merged.program_start_date,
    });

    if (rpcError) {
      return { success: false, message: `Failed to complete onboarding: ${rpcError.message}`, data: {} };
    }

    return {
      success: true,
      message: `Onboarding complete for ${merged.display_name}.`,
      data: {
        onboarding_completed: true,
        profile: merged,
        equipment,
      },
    };
  }

  return {
    get_onboarding_status,
    update_profile,
    complete_onboarding,
  };
}
