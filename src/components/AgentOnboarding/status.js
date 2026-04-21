/**
 * Client-side mirror of the MCP `get_onboarding_status` tool logic. Kept in
 * sync with mcp/src/tools/onboarding.ts so the shell and the agent compute
 * the same missing-fields list.
 */

export const REQUIRED_FIELDS = [
  'display_name',
  'gender',
  'age',
  'weight_lbs',
  'fitness_goals',
  'workout_days',
  'workout_duration',
  'workout_location',
];

export const FIELD_LABELS = {
  display_name: 'Name',
  gender: 'Gender',
  age: 'Age',
  weight_lbs: 'Weight',
  fitness_goals: 'Fitness goals',
  workout_days: 'Workout days',
  workout_duration: 'Workout duration',
  workout_location: 'Workout location',
  program_start_date: 'Start date',
};

const isEmpty = (v) => {
  if (Array.isArray(v)) return v.length === 0;
  return v === null || v === undefined || v === '';
};

export function computeMissingFields(profile) {
  if (!profile) return [...REQUIRED_FIELDS];
  return REQUIRED_FIELDS.filter((f) => isEmpty(profile[f]));
}

export function canComplete(profile, equipment) {
  if (!profile) return false;
  if (computeMissingFields(profile).length > 0) return false;
  return Array.isArray(equipment) && equipment.length > 0;
}

export function isOnboardingDone(profile) {
  return !!profile?.onboarding_completed;
}
