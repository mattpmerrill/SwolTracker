import { db } from '../lib/supabase';
import { validate, maxWeightSchema } from '../lib/validation';
import { findMaxKey } from '../utils/workout';

/**
 * Maxes + exercise swap side-effects. Maxes state lives on the user's
 * profile entry; we mutate it via setProfiles(currentUser → maxes).
 */
export function useMaxesActions({
  currentUser,
  profiles,
  setProfiles,
  workoutProgram,
  setWorkoutProgram,
  currentWeek,
  currentDay,
  gymId,
  clearSwap,
  toast,
  setEditingMax,
  setNewLiftName,
  setNewLiftWeight,
  setShowAddLift,
  setActiveTab,
}) {
  const user = profiles[currentUser];

  const updateMax = async (lift, value) => {
    const weight = Math.max(0, Math.min(9999, parseInt(value) || 0));
    setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [lift]: weight } } }));
    setEditingMax(null);
    await db.updateMax(currentUser, lift, weight);
  };

  const addNewLift = async (newLiftName, newLiftWeight) => {
    const { success, data: validated, error } = validate(maxWeightSchema, {
      exerciseName: newLiftName,
      weight: parseInt(newLiftWeight) || 0,
    });
    if (!success) { toast.error(error); return; }
    setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [validated.exerciseName]: validated.weight } } }));
    setNewLiftName(''); setNewLiftWeight(''); setShowAddLift(false);
    await db.updateMax(currentUser, validated.exerciseName, validated.weight);
  };

  const openQuickAddMax = (exerciseName) => {
    const maxKey = findMaxKey(exerciseName, user?.maxes || {});
    setNewLiftName(maxKey || exerciseName);
    setNewLiftWeight('');
    setShowAddLift(true);
    setActiveTab('maxes');
  };

  const acceptSwap = async (exerciseIndex, alternative) => {
    const updatedDayWorkout = { ...workoutProgram[currentWeek][currentDay] };
    const updatedExercises = [...updatedDayWorkout.exercises];
    updatedExercises[exerciseIndex] = alternative;
    updatedDayWorkout.exercises = updatedExercises;
    const updatedWeekProgram = { ...workoutProgram[currentWeek], [currentDay]: updatedDayWorkout };
    setWorkoutProgram((prev) => ({ ...prev, [currentWeek]: updatedWeekProgram }));
    if (gymId) await db.saveWorkoutProgram(gymId, currentWeek, updatedWeekProgram, currentUser, false);
    clearSwap();
    toast.success(`Swapped to ${alternative.name}`);
  };

  const deleteLift = async (lift) => {
    const newMaxes = { ...profiles[currentUser].maxes };
    delete newMaxes[lift];
    setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: newMaxes } }));
    await db.deleteMax(currentUser, lift);
  };

  return { updateMax, addNewLift, openQuickAddMax, acceptSwap, deleteLift };
}
