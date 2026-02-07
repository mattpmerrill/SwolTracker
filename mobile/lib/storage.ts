import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'swoltracker' });

export const STORAGE_KEYS = {
  PROFILES: 'swoltracker-profiles',
  EQUIPMENT: 'swoltracker-equipment',
  EXERCISE_LOG: 'swoltracker-log',
  WORKOUT_PROGRAM: 'swoltracker-program',
  PROGRAM_START_DATE: 'swoltracker-startdate',
  CURRENT_USER: 'swoltracker-currentuser',
  COMPLETED_WORKOUTS: 'swoltracker-completed-workouts',
} as const;

export const getItem = (key: string): any | null => {
  try {
    const value = mmkv.getString(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const setItem = (key: string, value: any): boolean => {
  try {
    mmkv.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const removeItem = (key: string): boolean => {
  try {
    mmkv.delete(key);
    return true;
  } catch {
    return false;
  }
};

export const getString = (key: string): string | null => {
  try {
    return mmkv.getString(key) ?? null;
  } catch {
    return null;
  }
};

export const setString = (key: string, value: string): boolean => {
  try {
    mmkv.set(key, value);
    return true;
  } catch {
    return false;
  }
};

export const loadAllData = () => ({
  profiles: getItem(STORAGE_KEYS.PROFILES),
  equipment: getItem(STORAGE_KEYS.EQUIPMENT),
  exerciseLog: getItem(STORAGE_KEYS.EXERCISE_LOG),
  workoutProgram: getItem(STORAGE_KEYS.WORKOUT_PROGRAM),
  programStartDate: getString(STORAGE_KEYS.PROGRAM_START_DATE),
  currentUser: getString(STORAGE_KEYS.CURRENT_USER),
  completedWorkouts: getItem(STORAGE_KEYS.COMPLETED_WORKOUTS),
});

export const saveAllData = (data: Record<string, any>) => {
  if (data.profiles !== undefined) setItem(STORAGE_KEYS.PROFILES, data.profiles);
  if (data.equipment !== undefined) setItem(STORAGE_KEYS.EQUIPMENT, data.equipment);
  if (data.exerciseLog !== undefined) setItem(STORAGE_KEYS.EXERCISE_LOG, data.exerciseLog);
  if (data.workoutProgram !== undefined) setItem(STORAGE_KEYS.WORKOUT_PROGRAM, data.workoutProgram);
  if (data.programStartDate !== undefined) setString(STORAGE_KEYS.PROGRAM_START_DATE, data.programStartDate);
  if (data.currentUser !== undefined) setString(STORAGE_KEYS.CURRENT_USER, data.currentUser);
  if (data.completedWorkouts !== undefined) setItem(STORAGE_KEYS.COMPLETED_WORKOUTS, data.completedWorkouts);
};

export const clearAllData = () => {
  Object.values(STORAGE_KEYS).forEach(key => removeItem(key));
};
