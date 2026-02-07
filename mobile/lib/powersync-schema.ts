import { column, Schema, Table } from '@powersync/common';

const profiles = new Table({
  // id is implicit (text primary key)
  email: column.text,
  name: column.text,
  avatar: column.text,
  avatar_url: column.text,
  gender: column.text,
  age: column.integer,
  weight_lbs: column.real,
  workout_location: column.text,
  fitness_goals: column.text, // JSON array stored as text
  workout_days: column.text, // JSON array stored as text
  workout_duration: column.text,
  program_start_date: column.text,
  group_name: column.text,
  onboarding_completed: column.integer, // boolean as 0/1
  created_at: column.text,
  updated_at: column.text,
});

const gyms = new Table({
  name: column.text,
  invite_code: column.text,
  created_by: column.text,
  created_at: column.text,
});

const gym_members = new Table({
  gym_id: column.text,
  user_id: column.text,
  role: column.text,
  joined_at: column.text,
});

const gym_equipment = new Table({
  gym_id: column.text,
  name: column.text,
  created_at: column.text,
});

const user_maxes = new Table({
  user_id: column.text,
  exercise_name: column.text,
  weight_lbs: column.real,
  recorded_at: column.text,
  notes: column.text,
});

const workout_programs = new Table({
  gym_id: column.text,
  created_by: column.text,
  week_number: column.integer,
  program_data: column.text, // JSONB stored as text
  ai_generated: column.integer, // boolean as 0/1
  ai_notes: column.text,
  created_at: column.text,
});

const workout_logs = new Table({
  user_id: column.text,
  gym_id: column.text,
  program_id: column.text,
  week_number: column.integer,
  day_name: column.text,
  exercise_index: column.integer,
  set_index: column.integer,
  exercise_name: column.text,
  prescribed_weight: column.real,
  prescribed_reps: column.text,
  actual_weight: column.real,
  actual_reps: column.integer,
  completed: column.integer, // boolean as 0/1
  completed_at: column.text,
  notes: column.text,
});

const workout_completions = new Table({
  user_id: column.text,
  gym_id: column.text,
  week_number: column.integer,
  day_name: column.text,
  completed_at: column.text,
});

const buddy_requests = new Table({
  sender_id: column.text,
  receiver_id: column.text,
  status: column.text,
  created_at: column.text,
  updated_at: column.text,
});

export const powersyncSchema = new Schema({
  profiles,
  gyms,
  gym_members,
  gym_equipment,
  user_maxes,
  workout_programs,
  workout_logs,
  workout_completions,
  buddy_requests,
});
