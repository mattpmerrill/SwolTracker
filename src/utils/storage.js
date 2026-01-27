/**
 * Storage abstraction layer for cross-platform compatibility
 * This module provides a unified interface for persistent storage
 * that can be adapted for web (localStorage) or mobile (AsyncStorage)
 */

const STORAGE_KEYS = {
  PROFILES: 'swoltracker-profiles',
  EQUIPMENT: 'swoltracker-equipment',
  EXERCISE_LOG: 'swoltracker-log',
  WORKOUT_PROGRAM: 'swoltracker-program',
  PROGRAM_START_DATE: 'swoltracker-startdate',
  CURRENT_USER: 'swoltracker-currentuser',
  COMPLETED_WORKOUTS: 'swoltracker-completed-workouts',
};

/**
 * Check if localStorage is available
 * @returns {boolean}
 */
const isLocalStorageAvailable = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get an item from storage
 * @param {string} key - Storage key
 * @returns {any|null} Parsed value or null
 */
export const getItem = (key) => {
  if (!isLocalStorageAvailable()) return null;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error reading ${key} from storage:`, error);
    return null;
  }
};

/**
 * Set an item in storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be JSON stringified)
 * @returns {boolean} Success status
 */
export const setItem = (key, value) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing ${key} to storage:`, error);
    return false;
  }
};

/**
 * Remove an item from storage
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
export const removeItem = (key) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing ${key} from storage:`, error);
    return false;
  }
};

/**
 * Get a string item from storage (no JSON parsing)
 * @param {string} key - Storage key
 * @returns {string|null}
 */
export const getString = (key) => {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Error reading ${key} from storage:`, error);
    return null;
  }
};

/**
 * Set a string item in storage (no JSON stringification)
 * @param {string} key - Storage key
 * @param {string} value - String value to store
 * @returns {boolean} Success status
 */
export const setString = (key, value) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Error writing ${key} to storage:`, error);
    return false;
  }
};

// App-specific storage functions

/**
 * Load all SwolTracker data from storage
 * @returns {Object} Object containing all stored data
 */
export const loadAllData = () => {
  return {
    profiles: getItem(STORAGE_KEYS.PROFILES),
    equipment: getItem(STORAGE_KEYS.EQUIPMENT),
    exerciseLog: getItem(STORAGE_KEYS.EXERCISE_LOG),
    workoutProgram: getItem(STORAGE_KEYS.WORKOUT_PROGRAM),
    programStartDate: getString(STORAGE_KEYS.PROGRAM_START_DATE),
    currentUser: getString(STORAGE_KEYS.CURRENT_USER),
    completedWorkouts: getItem(STORAGE_KEYS.COMPLETED_WORKOUTS),
  };
};

/**
 * Save all SwolTracker data to storage
 * @param {Object} data - Object containing all data to save
 */
export const saveAllData = (data) => {
  if (data.profiles !== undefined) setItem(STORAGE_KEYS.PROFILES, data.profiles);
  if (data.equipment !== undefined) setItem(STORAGE_KEYS.EQUIPMENT, data.equipment);
  if (data.exerciseLog !== undefined) setItem(STORAGE_KEYS.EXERCISE_LOG, data.exerciseLog);
  if (data.workoutProgram !== undefined) setItem(STORAGE_KEYS.WORKOUT_PROGRAM, data.workoutProgram);
  if (data.programStartDate !== undefined) setString(STORAGE_KEYS.PROGRAM_START_DATE, data.programStartDate);
  if (data.currentUser !== undefined) setString(STORAGE_KEYS.CURRENT_USER, data.currentUser);
  if (data.completedWorkouts !== undefined) setItem(STORAGE_KEYS.COMPLETED_WORKOUTS, data.completedWorkouts);
};

/**
 * Clear all SwolTracker data from storage
 */
export const clearAllData = () => {
  Object.values(STORAGE_KEYS).forEach(key => removeItem(key));
};

export { STORAGE_KEYS };
