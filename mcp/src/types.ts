/** Profile from the `profiles` table */
export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  avatar_url: string | null;
  group_name: string | null;
  program_start_date: string | null;
  gender: string | null;
  age: string | null;
  weight_lbs: string | null;
  workout_location: string | null;
  fitness_goals: string[] | null;
  workout_days: string[] | null;
  workout_duration: string | null;
  created_at: string;
}

/** Row from `current_user_maxes` view */
export interface CurrentMax {
  user_id: string;
  exercise_name: string;
  weight_lbs: number;
}

/** Row from `user_maxes` table (history) */
export interface MaxRecord {
  id: string;
  user_id: string;
  exercise_name: string;
  weight_lbs: number;
  recorded_at: string;
}

/** A single exercise in a day's program */
export interface ProgramExercise {
  name: string;
  muscleGroups?: string[];
  sets: number;
  reps: number | string;
  percentages?: number[];
}

/** A single day in the workout program */
export interface ProgramDay {
  focus: string;
  exercises: ProgramExercise[];
}

/** Full week program — 7 days keyed by day name */
export type WeekProgram = Record<string, ProgramDay>;

/** Row from `workout_programs` table */
export interface WorkoutProgramRow {
  id: string;
  gym_id: string;
  week_number: number;
  program_data: WeekProgram;
  created_by: string;
  ai_generated: boolean;
  ai_notes: string | null;
  created_at: string;
}

/** Row from `workout_logs` table */
export interface WorkoutLog {
  id: string;
  user_id: string;
  gym_id: string;
  week_number: number;
  day_name: string;
  exercise_index: number;
  set_index: number;
  exercise_name: string;
  prescribed_weight: number | null;
  prescribed_reps: number | string | null;
  actual_weight: number | null;
  actual_reps: number | string | null;
  completed: boolean;
  completed_at: string;
}

/** Row from `workout_completions` table */
export interface WorkoutCompletion {
  id: string;
  user_id: string;
  gym_id: string;
  week_number: number;
  day_name: string;
  completed_at: string;
}

/** Gym membership joined with gym info */
export interface Gym {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  role: string;
}

/** Grouped recent session */
export interface RecentSession {
  week_number: number;
  day_name: string;
  completed_at: string;
  exercises: {
    exercise_name: string;
    prescribed_weight: number | null;
    prescribed_reps: number | string | null;
    actual_weight: number | null;
    actual_reps: number | string | null;
  }[];
}

/** User stats */
export interface UserStats {
  totalSets: number;
  weeksActive: number;
}

/** Standard tool result */
export interface ToolResult {
  success: boolean;
  message: string;
  data: Record<string, unknown>;
}
