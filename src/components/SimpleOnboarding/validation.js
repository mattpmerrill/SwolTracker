/**
 * Pure per-screen validation for the 4-screen simplified onboarding.
 * Kept in its own module so the hook and the tests share one source of truth.
 */

export const SCREEN_ORDER = ['basics', 'training', 'equipment', 'dates'];

export function canProceed(screen, fields) {
  switch (screen) {
    case 'basics':
      return (
        typeof fields.displayName === 'string' && fields.displayName.trim().length > 0 &&
        fields.gender !== '' && fields.gender != null &&
        fields.age > 0 &&
        fields.weight > 0
      );
    case 'training':
      return (
        Array.isArray(fields.fitnessGoals) && fields.fitnessGoals.length > 0 &&
        Array.isArray(fields.workoutDays) && fields.workoutDays.length > 0 &&
        fields.workoutDuration !== '' && fields.workoutDuration != null
      );
    case 'equipment':
      return (
        fields.workoutLocation !== '' && fields.workoutLocation != null &&
        Array.isArray(fields.equipment) && fields.equipment.length > 0
      );
    case 'dates':
      return fields.programStartDate !== '' && fields.programStartDate != null;
    default:
      return false;
  }
}

export function compileData(fields) {
  return {
    displayName: fields.displayName,
    gender: fields.gender,
    age: fields.age,
    weightLbs: fields.weight,
    fitnessGoals: fields.fitnessGoals,
    workoutDays: fields.workoutDays,
    workoutDuration: fields.workoutDuration,
    workoutLocation: fields.workoutLocation,
    equipment: fields.equipment,
    programStartDate: fields.programStartDate,
  };
}
